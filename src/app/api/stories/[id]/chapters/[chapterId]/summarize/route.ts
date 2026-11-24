import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { StoryChapterRow, execute, queryOne } from '@/lib/db';
import { handleApiError, jsonError } from '@/lib/http';
import { generateLLMResponse } from '@/lib/llm';
import { enforceRateLimit } from '@/lib/rateLimit';
import { buildStorySummaryMessages } from '@/lib/storyPrompt';
import { requireOwnedStory } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string; chapterId: string }> }
) {
  try {
    const user = await requireUser(req);
    enforceRateLimit(`story-summary:${user.id}`, 30, 60 * 60_000);

    const { id: storyId, chapterId } = await context.params;
    const story = await requireOwnedStory(user.id, storyId);
    const chapter = await queryOne<StoryChapterRow>(
      'SELECT * FROM story_chapters WHERE id = $1 AND story_id = $2',
      [chapterId, story.id]
    );
    if (!chapter) return jsonError('Bab tidak ditemukan.', 404);
    if ((chapter.content || '').trim().length < 40) {
      return jsonError('Naskah bab masih terlalu singkat untuk diringkas.', 400);
    }

    const llmRes = await generateLLMResponse(buildStorySummaryMessages(chapter), {
      userId: user.id,
      storyId: story.id,
      temperature: 0.3,
      maxTokens: 1600,
      actionType: 'story_summary',
      outputMode: 'story',
    });

    const summary = (llmRes.text || '').trim().slice(0, 2500);
    await execute('UPDATE story_chapters SET summary = $1, updated_at = now() WHERE id = $2', [summary, chapter.id]);

    return NextResponse.json({ summary });
  } catch (err) {
    return handleApiError(err, 'Gagal meringkas bab.');
  }
}
