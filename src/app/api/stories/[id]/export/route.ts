import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { StoryChapterRow, query } from '@/lib/db';
import { handleApiError } from '@/lib/http';
import {
  buildStoryMarkdown,
  buildStoryPlainText,
  buildStoryPrintableHtml,
} from '@/lib/storyPrompt';
import { requireVisibleStory } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeSlug(title: string): string {
  const s = (title || 'cerita')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || 'cerita-naravia';
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const user = await getSessionUser(req).catch(() => null);
    const story = await requireVisibleStory(user?.id || null, id);

    const chapters = await query<StoryChapterRow>(
      'SELECT * FROM story_chapters WHERE story_id = $1 ORDER BY chapter_number ASC, created_at ASC',
      [story.id]
    );

    const { searchParams } = new URL(req.url);
    const format = (searchParams.get('format') || 'md').toLowerCase();
    const slug = safeSlug(story.title);

    if (format === 'txt') {
      const content = buildStoryPlainText(story, chapters);
      return new NextResponse(content, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${slug}.txt"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (format === 'html') {
      const html = buildStoryPrintableHtml(story, story.creator_name, chapters);
      const inline = searchParams.get('inline') === '1';
      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${slug}.html"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const markdown = buildStoryMarkdown(story, chapters);
    return new NextResponse(markdown, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${slug}.md"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return handleApiError(err, 'Gagal mengekspor naskah cerita.');
  }
}
