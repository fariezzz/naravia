import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { MessageRow, query, queryOne, withTransaction } from '@/lib/db';
import { handleApiError, jsonError } from '@/lib/http';
import { newId } from '@/lib/ids';
import { countWords, generateLLMResponse } from '@/lib/llm';
import { enforceRateLimit } from '@/lib/rateLimit';
import { extractJsonObject, sanitizeGenre } from '@/lib/storyHelpers';
import { buildCharacterCastBio, buildChatToStoryMessages } from '@/lib/storyPrompt';
import { requireOwnedChat, resolveChatCharacter, resolveChatPersona } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    enforceRateLimit(`chat-to-story:${user.id}`, 10, 60 * 60_000);

    const { id: chatId } = await context.params;
    const chat = await requireOwnedChat(user.id, chatId);

    const [charResult, persona, messages] = await Promise.all([
      resolveChatCharacter(chat).catch(() => null),
      resolveChatPersona(user.id, chat),
      query<MessageRow>('SELECT * FROM messages WHERE chat_id = $1 ORDER BY created_at ASC', [chat.id]),
    ]);
    const character = charResult?.character || null;

    if (messages.length < 2) {
      return jsonError('Percakapan masih terlalu singkat untuk diadaptasi menjadi draf novel (minimal 2 pesan).', 400);
    }

    const charName = character?.name || 'Tokoh Utama';
    const userName = persona?.display_name?.trim() || user.display_name || 'Protagonis';
    const recentMsgs = messages.slice(-30);
    const transcript = recentMsgs
      .map((m) => `${m.role === 'character' ? charName : userName}: ${m.content.trim()}`)
      .join('\n\n');

    const llmRes = await generateLLMResponse(
      buildChatToStoryMessages({
        chatTitle: chat.title,
        characterName: charName,
        characterDescription: character?.description || character?.tagline || '',
        userName,
        transcript,
      }),
      {
        userId: user.id,
        chatId: chat.id,
        characterId: chat.character_id || null,
        temperature: 0.8,
        maxTokens: 4500,
        actionType: 'story_adapt',
        outputMode: 'raw',
        jsonMode: true,
      }
    );

    const parsed = extractJsonObject<{
      title?: string;
      synopsis?: string;
      genre?: string;
      chapter_title?: string;
      chapter_content?: string;
    }>(llmRes.text);

    const storyTitle = String(parsed?.title || chat.title || `Kisah ${charName}`).trim().slice(0, 140);
    const synopsis = String(parsed?.synopsis || chat.summary || '').trim().slice(0, 2500);
    const genre = sanitizeGenre(parsed?.genre || 'Drama');
    const chapterTitle = String(parsed?.chapter_title || 'Bab 1: Awal Pertemuan').trim().slice(0, 140);
    const chapterContent = String(parsed?.chapter_content || '').trim();

    if (!chapterContent) {
      return jsonError('AI belum berhasil mengadaptasi transkrip menjadi prosa novel. Silakan coba lagi.', 422);
    }

    const storyId = newId('sty');
    const chapterId = newId('chp');
    let worldId: string | null = null;
    if (character?.world_id) {
      const ownedWorld = await queryOne<{ id: string }>('SELECT id FROM worlds WHERE id = $1 AND user_id = $2', [
        character.world_id,
        user.id,
      ]);
      worldId = ownedWorld?.id || null;
    }

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO stories (
           id, user_id, title, synopsis, cover_image, genre, tags, world_id,
           pov, tone, writing_style_notes, authors_note, temperature, length_preset, status, visibility
         ) VALUES ($1,$2,$3,$4,'',$5,'[]',$6,'third_limited','sinematik','','',0.85,'sedang','ongoing','private')`,
        [storyId, user.id, storyTitle, synopsis, genre, worldId]
      );

      if (character) {
        const snapshot = JSON.stringify({
          id: character.id,
          name: character.name,
          avatar: character.avatar || '',
          tagline: character.tagline || '',
        });
        await client.query(
          `INSERT INTO story_cast (id, story_id, character_id, character_snapshot, name, role_in_story, bio, current_state, sort_order)
           VALUES ($1,$2,$3,$4,$5,'protagonis',$6,'',0)`,
          [
            newId('cst'),
            storyId,
            chat.character_id || null,
            snapshot,
            character.name,
            buildCharacterCastBio(character).slice(0, 2000),
          ]
        );
      }

      if (userName && userName.toLowerCase() !== 'kamu') {
        await client.query(
          `INSERT INTO story_cast (id, story_id, character_id, character_snapshot, name, role_in_story, bio, current_state, sort_order)
           VALUES ($1,$2,NULL,NULL,$3,'protagonis',$4,'',1)`,
          [newId('cst'), storyId, userName.slice(0, 80), (persona?.description || '').slice(0, 1000)]
        );
      }

      await client.query(
        `INSERT INTO story_chapters (id, story_id, chapter_number, title, content, outline_notes, word_count, status)
         VALUES ($1,$2,1,$3,$4,'Diadaptasi dari ruang percakapan Naravia',$5,'draft')`,
        [chapterId, storyId, chapterTitle, chapterContent, countWords(chapterContent)]
      );
    });

    return NextResponse.json({ story: { id: storyId, title: storyTitle } }, { status: 201 });
  } catch (err) {
    return handleApiError(err, 'Gagal mengadaptasi percakapan menjadi draf novel.');
  }
}
