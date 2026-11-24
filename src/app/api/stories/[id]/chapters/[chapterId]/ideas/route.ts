import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleApiError, jsonError, readJson } from '@/lib/http';
import { generateLLMResponse } from '@/lib/llm';
import { enforceRateLimit } from '@/lib/rateLimit';
import { extractJsonObject, loadStoryGenerationBundle } from '@/lib/storyHelpers';
import { buildStoryIdeasMessages } from '@/lib/storyPrompt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string; chapterId: string }> }
) {
  try {
    const user = await requireUser(req);
    enforceRateLimit(`story-ideas:${user.id}`, 30, 60 * 60_000);

    const { id: storyId, chapterId } = await context.params;
    const body = await readJson(req);
    const contentOverride = body.content !== undefined ? String(body.content) : null;

    const bundle = await loadStoryGenerationBundle({ userId: user.id, storyId, chapterId });
    const currentChapter =
      contentOverride !== null ? { ...bundle.currentChapter, content: contentOverride } : bundle.currentChapter;

    const messages = buildStoryIdeasMessages({
      story: bundle.story,
      cast: bundle.cast,
      lore: bundle.lore,
      previousChapters: bundle.previousChapters,
      currentChapter,
    });

    const llmRes = await generateLLMResponse(messages, {
      userId: user.id,
      storyId: bundle.story.id,
      temperature: 0.9,
      maxTokens: 2400,
      actionType: 'story_outline',
      outputMode: 'raw',
      jsonMode: true,
    });

    const parsed = extractJsonObject<{
      ideas?: Array<{ label?: string; title?: string; beat?: string }>;
    }>(llmRes.text);

    const ideas = Array.isArray(parsed?.ideas)
      ? parsed.ideas
          .slice(0, 3)
          .map((item, idx) => ({
            label: String(item?.label || ['Konflik', 'Misteri', 'Emosional'][idx] || 'Arah Alur').slice(0, 40),
            title: String(item?.title || `Opsi ${idx + 1}`).slice(0, 90),
            beat: String(item?.beat || '').trim().slice(0, 400),
          }))
          .filter((item) => item.beat.length > 0)
      : [];

    if (ideas.length === 0) {
      return jsonError('AI belum berhasil merumuskan ide kelanjutan. Coba klik lagi.', 422);
    }

    return NextResponse.json({ ideas });
  } catch (err) {
    return handleApiError(err, 'Gagal menghasilkan ide kelanjutan cerita.');
  }
}
