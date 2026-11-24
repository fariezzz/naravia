import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleApiError, jsonError } from '@/lib/http';
import { loadStoryGenerationBundle } from '@/lib/storyHelpers';
import { buildStoryContinueMessages } from '@/lib/storyPrompt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id: storyId } = await context.params;
    const { searchParams } = new URL(req.url);
    const chapterId = (searchParams.get('chapterId') || '').trim();
    if (!chapterId) return jsonError('Parameter chapterId wajib disertakan.', 400);

    const bundle = await loadStoryGenerationBundle({ userId: user.id, storyId, chapterId });
    const built = buildStoryContinueMessages({
      story: bundle.story,
      cast: bundle.cast,
      lore: bundle.lore,
      previousChapters: bundle.previousChapters,
      currentChapter: bundle.currentChapter,
    });

    return NextResponse.json({
      context: {
        chapterNumber: bundle.currentChapter.chapter_number,
        chapterTitle: bundle.currentChapter.title,
        estimatedPromptTokens: built.estimatedPromptTokens,
        manuscriptTruncated: built.manuscriptTruncated,
        includesPreviousEndingTail: built.includesPreviousEndingTail,
        previousChaptersIncluded: bundle.previousChapters.map((ch) => ({
          chapter_number: ch.chapter_number,
          title: ch.title,
          hasSummary: Boolean(ch.summary?.trim()),
        })),
        castCount: bundle.cast.length,
        castNames: bundle.cast.map((c) => c.name),
        worldName: bundle.lore.world?.name || null,
        matchedLore: bundle.lore.matchedEntries.map((l) => ({
          id: l.id,
          title: l.title,
          matchedKeywords: l.matchedKeywords,
          contentPreview: l.content.slice(0, 140),
        })),
        hasAuthorsNote: Boolean(bundle.story.authors_note?.trim()),
        systemPromptPreview: built.systemPrompt.slice(0, 2200),
      },
    });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat inspektor konteks cerita.');
  }
}
