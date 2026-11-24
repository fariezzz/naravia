import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleApiError, jsonError, readJson } from '@/lib/http';
import { cleanStoryOutput, streamLLMResponse } from '@/lib/llm';
import { enforceRateLimit } from '@/lib/rateLimit';
import { loadStoryGenerationBundle } from '@/lib/storyHelpers';
import { buildStoryRewriteMessages, RewriteAction } from '@/lib/storyPrompt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_ACTIONS: RewriteAction[] = ['expand', 'rewrite', 'tighten', 'dialogue', 'custom'];

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string; chapterId: string }> }
) {
  try {
    const user = await requireUser(req);
    enforceRateLimit(`story-rewrite:${user.id}`, 45, 60 * 60_000);

    const { id: storyId, chapterId } = await context.params;
    const body = await readJson(req);

    const selectedText = String(body.selectedText || '').trim();
    if (!selectedText) return jsonError('Pilih teks yang ingin disunting terlebih dahulu.', 400);
    if (selectedText.length > 6000) return jsonError('Teks yang disorot terlalu panjang (maks. 6.000 karakter).', 400);

    const action = VALID_ACTIONS.includes(body.action) ? (body.action as RewriteAction) : 'rewrite';
    const customInstruction = String(body.customInstruction || '').trim().slice(0, 500);
    const beforeContext = String(body.beforeContext || '').slice(-1000);
    const afterContext = String(body.afterContext || '').slice(0, 800);

    const bundle = await loadStoryGenerationBundle({ userId: user.id, storyId, chapterId, beat: selectedText });
    const messages = buildStoryRewriteMessages({
      story: bundle.story,
      cast: bundle.cast,
      lore: bundle.lore,
      chapterTitle: bundle.currentChapter.title,
      selectedText,
      beforeContext,
      afterContext,
      action,
      customInstruction,
    });

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
          const gen = streamLLMResponse(messages, {
            userId: user.id,
            storyId: bundle.story.id,
            temperature: 0.78,
            maxTokens: action === 'expand' ? 3000 : 2400,
            actionType: 'story_rewrite',
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

          const cleaned = cleanStoryOutput(rawAccumulated);
          sendEvent('done', { rewrittenText: cleaned });
        } catch (err) {
          sendEvent('error', {
            message: err instanceof Error ? err.message : 'Gagal menyunting teks terpilih.',
          });
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
    return handleApiError(err, 'Gagal memulai penyuntingan teks.');
  }
}
