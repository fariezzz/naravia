import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { StoryRevisionRow, queryOne, withTransaction } from '@/lib/db';
import { parseJsonSafe } from '@/lib/format';
import { handleApiError, readJson } from '@/lib/http';
import { newId } from '@/lib/ids';
import { cleanStoryOutput, countWords, streamLLMResponse } from '@/lib/llm';
import { enforceRateLimit } from '@/lib/rateLimit';
import { formatStoryRevision, loadStoryGenerationBundle, triggerBackgroundChapterSummaries } from '@/lib/storyHelpers';
import { buildStoryContinueMessages, getStoryMaxTokens } from '@/lib/storyPrompt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function joinBaseAndProse(base: string, prose: string): string {
  const b = (base || '').trimEnd();
  const p = (prose || '').trimStart();
  if (!b) return p;
  if (!p) return b;
  return `${b}\n\n${p}`;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string; chapterId: string }> }
) {
  try {
    const user = await requireUser(req);
    enforceRateLimit(`story-generate:${user.id}`, 45, 60 * 60_000);

    const { id: storyId, chapterId } = await context.params;
    const body = await readJson(req);
    const beat = String(body.beat || '').trim().slice(0, 1200);
    const mode = body.mode === 'retry' ? 'retry' : 'continue';
    // Terima naskah terbaru dari editor bila pengguna baru saja mengetik sebelum klik Lanjutkan
    const draftContentOverride = body.content !== undefined ? String(body.content) : null;

    const bundle = await loadStoryGenerationBundle({ userId: user.id, storyId, chapterId, beat });
    // Ringkas otomatis bab-bab sebelumnya di latar belakang bila belum punya ringkasan (tanpa menunda streaming)
    if (bundle.previousChapters.length > 0) {
      triggerBackgroundChapterSummaries(user.id, bundle.story.id, bundle.previousChapters);
    }
    const latestRevision = await queryOne<StoryRevisionRow>(
      'SELECT * FROM story_revisions WHERE chapter_id = $1 ORDER BY created_at DESC LIMIT 1',
      [chapterId]
    );

    // Tentukan naskah dasar sebelum blok baru ditambahkan
    let baseContent = draftContentOverride !== null ? draftContentOverride : bundle.currentChapter.content || '';
    let reuseRevision: StoryRevisionRow | null = null;

    if (mode === 'retry' && latestRevision && latestRevision.kind === 'append_variants') {
      baseContent = latestRevision.base_content || '';
      reuseRevision = latestRevision;
    }

    const effectiveChapter = {
      ...bundle.currentChapter,
      content: baseContent,
    };

    const built = buildStoryContinueMessages({
      story: bundle.story,
      cast: bundle.cast,
      lore: bundle.lore,
      previousChapters: bundle.previousChapters,
      currentChapter: effectiveChapter,
      beat,
      isRetry: mode === 'retry',
    });

    const baseTemp = Number(bundle.story.temperature) || 0.85;
    const temperature = mode === 'retry' ? Math.min(1.2, baseTemp + 0.08) : baseTemp;
    const maxTokens = getStoryMaxTokens(bundle.story.length_preset);

    const encoder = new TextEncoder();
    const abortController = new AbortController();
    req.signal.addEventListener('abort', () => abortController.abort());

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, payload: unknown) => {
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
          } catch {}
        };

        let rawAccumulated = '';
        try {
          sendEvent('meta', {
            baseContent,
            matchedLore: bundle.lore.matchedEntries.map((l) => l.title),
            estimatedPromptTokens: built.estimatedPromptTokens,
          });

          const gen = streamLLMResponse(built.messages, {
            userId: user.id,
            storyId: bundle.story.id,
            temperature,
            maxTokens,
            actionType: 'story_write',
            outputMode: 'story',
            signal: abortController.signal,
          });

          while (true) {
            const step = await gen.next();
            if (step.done) break;
            if (step.value) {
              rawAccumulated += step.value;
              sendEvent('chunk', { text: step.value });
            }
          }

          const cleanedProse = cleanStoryOutput(rawAccumulated);
          if (!cleanedProse) {
            sendEvent('error', { message: 'Model tidak menghasilkan teks prosa. Silakan coba lagi.' });
            controller.close();
            return;
          }

          const nextFullContent = joinBaseAndProse(baseContent, cleanedProse);
          const nextWordCount = countWords(nextFullContent);
          let savedRevision: StoryRevisionRow | null = null;

          await withTransaction(async (client) => {
            if (reuseRevision) {
              const prevVariants = parseJsonSafe<string[]>(reuseRevision.variants, []);
              const nextVariants = [...prevVariants, cleanedProse].slice(-8);
              const activeIdx = nextVariants.length - 1;
              await client.query(
                `UPDATE story_revisions SET variants = $1, active_index = $2 WHERE id = $3`,
                [JSON.stringify(nextVariants), activeIdx, reuseRevision.id]
              );
              savedRevision = {
                ...reuseRevision,
                variants: JSON.stringify(nextVariants),
                active_index: activeIdx,
              };
            } else {
              const revId = newId('rev');
              const variantsJson = JSON.stringify([cleanedProse]);
              await client.query(
                `INSERT INTO story_revisions (id, chapter_id, kind, base_content, variants, active_index)
                 VALUES ($1, $2, 'append_variants', $3, $4, 0)`,
                [revId, chapterId, baseContent, variantsJson]
              );
              // Pangkas revisi lama agar maksimal 15 per bab
              await client.query(
                `DELETE FROM story_revisions
                 WHERE chapter_id = $1
                   AND id NOT IN (
                     SELECT id FROM story_revisions WHERE chapter_id = $1 ORDER BY created_at DESC LIMIT 15
                   )`,
                [chapterId]
              );
              savedRevision = {
                id: revId,
                chapter_id: chapterId,
                kind: 'append_variants',
                base_content: baseContent,
                variants: variantsJson,
                active_index: 0,
                created_at: new Date().toISOString(),
              };
            }

            await client.query(
              `UPDATE story_chapters SET content = $1, word_count = $2, updated_at = now()
               WHERE id = $3 AND story_id = $4`,
              [nextFullContent, nextWordCount, chapterId, bundle.story.id]
            );
            await client.query('UPDATE stories SET updated_at = now() WHERE id = $1', [bundle.story.id]);
          });

          sendEvent('done', {
            prose: cleanedProse,
            content: nextFullContent,
            word_count: nextWordCount,
            revision: formatStoryRevision(savedRevision),
          });
        } catch (err) {
          const isAborted = abortController.signal.aborted || (err instanceof Error && err.name === 'AbortError');
          if (isAborted && rawAccumulated.trim()) {
            const partial = cleanStoryOutput(rawAccumulated);
            const nextFullContent = joinBaseAndProse(baseContent, partial);
            sendEvent('done', {
              prose: partial,
              content: nextFullContent,
              word_count: countWords(nextFullContent),
              aborted: true,
              revision: null,
            });
          } else {
            sendEvent('error', {
              message: err instanceof Error ? err.message : 'Gagal menghasilkan lanjutan cerita.',
            });
          }
        } finally {
          try {
            controller.close();
          } catch {}
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    return handleApiError(err, 'Gagal memulai penulisan cerita.');
  }
}
