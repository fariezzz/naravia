import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { queryOne, UserPersonaRow } from '@/lib/db';
import { handleApiError, jsonError, readJson } from '@/lib/http';
import { generateLLMResponse } from '@/lib/llm';
import { enforceRateLimit } from '@/lib/rateLimit';
import { buildPersonaCastBio, extractJsonObject, sanitizeGenre, sanitizeTags } from '@/lib/storyHelpers';
import { buildStoryBrainstormMessages } from '@/lib/storyPrompt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    enforceRateLimit(`story-brainstorm:${user.id}`, 15, 60 * 60_000);

    const body = await readJson(req);
    const premise = String(body.premise || '').trim();
    if (premise.length < 6) {
      return jsonError('Tuliskan ide atau premis singkat (minimal 6 karakter) terlebih dahulu.', 400);
    }

    let protagonistPersona: { name: string; bio?: string } | null = null;
    const personaId = body.personaId ? String(body.personaId).trim() : '';
    if (personaId) {
      const personaRow = await queryOne<UserPersonaRow>(
        'SELECT * FROM user_personas WHERE id = $1 AND user_id = $2',
        [personaId, user.id]
      );
      if (personaRow) {
        protagonistPersona = {
          name: personaRow.display_name,
          bio: buildPersonaCastBio(personaRow).slice(0, 600),
        };
      }
    }

    const castProfiles = Array.isArray(body.castProfiles)
      ? body.castProfiles
          .slice(0, 10)
          .map((c: any) => ({
            name: String(c?.name || '').trim().slice(0, 80),
            role: String(c?.role || '').trim().slice(0, 30),
            bio: String(c?.bio || '').trim().slice(0, 300),
          }))
          .filter((c: { name: string }) => c.name.length > 0)
      : undefined;

    const messages = buildStoryBrainstormMessages({
      premise: premise.slice(0, 1000),
      genre: body.genre ? String(body.genre) : undefined,
      tone: body.tone ? String(body.tone) : undefined,
      pov: body.pov ? String(body.pov) : undefined,
      castNames: Array.isArray(body.castNames) ? body.castNames.map(String).slice(0, 10) : undefined,
      castProfiles,
      protagonistPersona,
      worldName: body.worldName ? String(body.worldName) : undefined,
    });

    const llmRes = await generateLLMResponse(messages, {
      userId: user.id,
      temperature: 0.85,
      maxTokens: 4096,
      actionType: 'story_outline',
      outputMode: 'raw',
      jsonMode: true,
    });

    const parsed = extractJsonObject<{
      title?: string;
      synopsis?: string;
      genre?: string;
      tags?: string[];
      authors_note?: string;
      chapters?: Array<{ title?: string; outline_notes?: string }>;
      opening_paragraph?: string;
    }>(llmRes.text);

    if (!parsed?.title) {
      return jsonError('AI belum berhasil menyusun struktur konsep cerita secara lengkap. Coba klik Susun Konsep lagi.', 422);
    }

    const chapters = Array.isArray(parsed.chapters) && parsed.chapters.length > 0
      ? parsed.chapters.slice(0, 6).map((ch, idx) => ({
          title: String(ch?.title || `Bab ${idx + 1}`).trim().slice(0, 140),
          outline_notes: String(ch?.outline_notes || '').trim().slice(0, 1000),
        }))
      : [{ title: 'Bab 1: Permulaan', outline_notes: '' }];

    return NextResponse.json({
      concept: {
        title: String(parsed.title).trim().slice(0, 140),
        synopsis: String(parsed.synopsis || '').trim().slice(0, 2500),
        genre: sanitizeGenre(parsed.genre || body.genre),
        tags: sanitizeTags(parsed.tags),
        authors_note: String(parsed.authors_note || '').trim().slice(0, 1000),
        chapters,
        opening_paragraph: String(parsed.opening_paragraph || '').trim().slice(0, 4000),
      },
    });
  } catch (err) {
    return handleApiError(err, 'Gagal menyusun konsep cerita.');
  }
}
