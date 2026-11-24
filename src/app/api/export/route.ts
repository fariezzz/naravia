import { NextRequest, NextResponse } from 'next/server';
import { assertAvatarOwnership } from '@/lib/assets';
import { requireUser } from '@/lib/auth';
import { query, withTransaction } from '@/lib/db';
import { stripOwner } from '@/lib/format';
import { getClientIp, handleApiError, jsonError, readJson } from '@/lib/http';
import { newId } from '@/lib/ids';
import { sanitizeMemoryForClient } from '@/lib/memories';
import { enforceRateLimit } from '@/lib/rateLimit';
import { logAudit } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_RESTORE_ITEMS = 5000;

function ensureJsonText(val: unknown, fallback = '[]'): string {
  if (typeof val === 'string') return val;
  if (val === undefined || val === null) return fallback;
  try {
    return JSON.stringify(val);
  } catch {
    return fallback;
  }
}

// Unduh salinan seluruh data milik akun ini dalam format JSON (pengganti cadangan file database)
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    enforceRateLimit(`export:${user.id}`, 10, 60 * 60_000);

    const [
      characters,
      worlds,
      lore,
      personas,
      chats,
      messages,
      memories,
      groupChats,
      groupMembers,
      groupMessages,
      stories,
      storyCast,
      storyChapters,
    ] = await Promise.all([
      query('SELECT * FROM characters WHERE user_id = $1 ORDER BY created_at ASC', [user.id]),
      query('SELECT * FROM worlds WHERE user_id = $1 ORDER BY created_at ASC', [user.id]),
      query(
        `SELECT l.* FROM lore_entries l JOIN worlds w ON w.id = l.world_id WHERE w.user_id = $1 ORDER BY l.created_at ASC`,
        [user.id]
      ),
      query('SELECT * FROM user_personas WHERE user_id = $1 ORDER BY created_at ASC', [user.id]),
      query('SELECT * FROM chats WHERE user_id = $1 ORDER BY created_at ASC', [user.id]),
      query(
        `SELECT m.* FROM messages m JOIN chats c ON c.id = m.chat_id WHERE c.user_id = $1 ORDER BY m.created_at ASC`,
        [user.id]
      ),
      query('SELECT * FROM memories WHERE user_id = $1 ORDER BY created_at ASC', [user.id]),
      query('SELECT * FROM group_chats WHERE user_id = $1 ORDER BY created_at ASC', [user.id]),
      query(
        `SELECT gm.* FROM group_chat_members gm JOIN group_chats g ON g.id = gm.group_chat_id WHERE g.user_id = $1`,
        [user.id]
      ),
      query(
        `SELECT gm.* FROM group_messages gm JOIN group_chats g ON g.id = gm.group_chat_id
         WHERE g.user_id = $1 ORDER BY gm.created_at ASC`,
        [user.id]
      ),
      query('SELECT * FROM stories WHERE user_id = $1 ORDER BY created_at ASC', [user.id]),
      query(
        `SELECT sc.* FROM story_cast sc JOIN stories s ON s.id = sc.story_id WHERE s.user_id = $1 ORDER BY sc.sort_order ASC`,
        [user.id]
      ),
      query(
        `SELECT ch.* FROM story_chapters ch JOIN stories s ON s.id = ch.story_id WHERE s.user_id = $1 ORDER BY ch.chapter_number ASC, ch.created_at ASC`,
        [user.id]
      ),
    ]);

    const payload = {
      format: 'naravia-export',
      version: 2,
      exported_at: new Date().toISOString(),
      account: { email: user.email, display_name: user.display_name },
      characters: characters.map(stripOwner),
      worlds: worlds.map(stripOwner),
      lore_entries: lore,
      personas: personas.map(stripOwner),
      chats: chats.map(stripOwner),
      messages,
      memories: memories.map(sanitizeMemoryForClient),
      group_chats: groupChats.map(stripOwner),
      group_chat_members: groupMembers,
      group_messages: groupMessages,
      stories: stories.map(stripOwner),
      story_cast: storyCast,
      story_chapters: storyChapters,
    };

    await logAudit({ userId: user.id, actorEmail: user.email, action: 'ekspor_data', ip: getClientIp(req) });

    const dateStr = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="naravia-data-${dateStr}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return handleApiError(err, 'Gagal mengekspor data.');
  }
}

/**
 * Memulihkan (restore/import) file cadangan `naravia-export` JSON ke akun pengguna saat ini.
 * Seluruh ID dibuat ulang dengan pemetaan relasi penuh agar aman terhadap bentrok ID
 * dan tidak pernah menimpa data milik akun lain.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    enforceRateLimit(`restore:${user.id}`, 5, 60 * 60_000);

    const body = await readJson(req);
    if (!body || body.format !== 'naravia-export') {
      return jsonError('Format berkas tidak dikenali. Pilih berkas JSON hasil Ekspor Data Naravia.', 400);
    }

    const worldsIn = Array.isArray(body.worlds) ? body.worlds.slice(0, 200) : [];
    const loreIn = Array.isArray(body.lore_entries) ? body.lore_entries.slice(0, 2000) : [];
    const personasIn = Array.isArray(body.personas) ? body.personas.slice(0, 100) : [];
    const charactersIn = Array.isArray(body.characters) ? body.characters.slice(0, 500) : [];
    const chatsIn = Array.isArray(body.chats) ? body.chats.slice(0, 1000) : [];
    const messagesIn = Array.isArray(body.messages) ? body.messages.slice(0, MAX_RESTORE_ITEMS) : [];
    const memoriesIn = Array.isArray(body.memories) ? body.memories.slice(0, 2000) : [];
    const groupChatsIn = Array.isArray(body.group_chats) ? body.group_chats.slice(0, 200) : [];
    const groupMembersIn = Array.isArray(body.group_chat_members) ? body.group_chat_members.slice(0, 2000) : [];
    const groupMessagesIn = Array.isArray(body.group_messages) ? body.group_messages.slice(0, MAX_RESTORE_ITEMS) : [];
    const storiesIn = Array.isArray(body.stories) ? body.stories.slice(0, 200) : [];
    const storyCastIn = Array.isArray(body.story_cast) ? body.story_cast.slice(0, 2000) : [];
    const storyChaptersIn = Array.isArray(body.story_chapters) ? body.story_chapters.slice(0, 3000) : [];

    // Validasi avatar & sampul sebelum masuk transaksi
    const safeCharAvatars = new Map<number, string>();
    for (let i = 0; i < charactersIn.length; i++) {
      safeCharAvatars.set(i, await assertAvatarOwnership(charactersIn[i]?.avatar, user.id));
    }
    const safePersonaAvatars = new Map<number, string>();
    for (let i = 0; i < personasIn.length; i++) {
      safePersonaAvatars.set(i, await assertAvatarOwnership(personasIn[i]?.avatar, user.id));
    }
    const safeStoryCovers = new Map<number, string>();
    for (let i = 0; i < storiesIn.length; i++) {
      safeStoryCovers.set(i, await assertAvatarOwnership(storiesIn[i]?.cover_image, user.id));
    }

    const restored = await withTransaction(async (client) => {
      const worldMap = new Map<string, string>();
      const personaMap = new Map<string, string>();
      const charMap = new Map<string, string>();
      const chatMap = new Map<string, string>();
      const msgMap = new Map<string, string>();
      const groupMap = new Map<string, string>();
      const storyMap = new Map<string, string>();

      const counts = {
        worlds: 0,
        lore_entries: 0,
        personas: 0,
        characters: 0,
        chats: 0,
        messages: 0,
        memories: 0,
        group_chats: 0,
        group_messages: 0,
        stories: 0,
        story_chapters: 0,
      };

      for (const w of worldsIn) {
        if (!w?.name) continue;
        const nid = newId('wld');
        if (w.id) worldMap.set(String(w.id), nid);
        await client.query(
          `INSERT INTO worlds (id, user_id, name, description, rules, places, factions, timeline)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            nid,
            user.id,
            String(w.name).slice(0, 120),
            String(w.description || ''),
            String(w.rules || ''),
            ensureJsonText(w.places, '[]'),
            ensureJsonText(w.factions, '[]'),
            ensureJsonText(w.timeline, '[]'),
          ]
        );
        counts.worlds++;
      }

      for (const l of loreIn) {
        const mappedWorld = l?.world_id ? worldMap.get(String(l.world_id)) : null;
        if (!mappedWorld || !l?.content) continue;
        await client.query(
          `INSERT INTO lore_entries (id, world_id, title, keywords, content, enabled)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            newId('lore'),
            mappedWorld,
            String(l.title || '').slice(0, 160),
            ensureJsonText(l.keywords, '[]'),
            String(l.content),
            l.enabled === 0 || l.enabled === false ? 0 : 1,
          ]
        );
        counts.lore_entries++;
      }

      for (let i = 0; i < personasIn.length; i++) {
        const p = personasIn[i];
        if (!p?.display_name) continue;
        const nid = newId('per');
        if (p.id) personaMap.set(String(p.id), nid);
        await client.query(
          `INSERT INTO user_personas (id, user_id, display_name, avatar, description, likes, dislikes, is_default)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 0)`,
          [
            nid,
            user.id,
            String(p.display_name).slice(0, 80),
            safePersonaAvatars.get(i) || '',
            String(p.description || ''),
            String(p.likes || ''),
            String(p.dislikes || ''),
          ]
        );
        counts.personas++;
      }

      for (let i = 0; i < charactersIn.length; i++) {
        const c = charactersIn[i];
        if (!c?.name) continue;
        const nid = newId('char');
        if (c.id) charMap.set(String(c.id), nid);
        const mappedWorld = c.world_id ? worldMap.get(String(c.world_id)) || null : null;
        await client.query(
          `INSERT INTO characters (
             id, user_id, name, tagline, avatar, description, personality, speaking_style,
             scenario, greeting, example_dialogues, tags, research_notes, world_id,
             is_pinned, is_favorite, temperature_override, visibility
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'private')`,
          [
            nid,
            user.id,
            String(c.name).slice(0, 120),
            String(c.tagline || ''),
            safeCharAvatars.get(i) || '',
            String(c.description || ''),
            String(c.personality || ''),
            String(c.speaking_style || ''),
            String(c.scenario || ''),
            ensureJsonText(c.greeting, '[]'),
            ensureJsonText(c.example_dialogues, '[]'),
            ensureJsonText(c.tags, '[]'),
            typeof c.research_notes === 'string' ? c.research_notes : ensureJsonText(c.research_notes, ''),
            mappedWorld,
            c.is_pinned ? 1 : 0,
            c.is_favorite ? 1 : 0,
            c.temperature_override !== undefined && c.temperature_override !== null
              ? Number(c.temperature_override)
              : null,
          ]
        );
        counts.characters++;
      }

      for (const ch of chatsIn) {
        const mappedChar = ch?.character_id ? charMap.get(String(ch.character_id)) || null : null;
        if (!mappedChar && !ch?.character_snapshot) continue;
        const nid = newId('chat');
        if (ch.id) chatMap.set(String(ch.id), nid);
        const mappedPersona = ch.persona_id ? personaMap.get(String(ch.persona_id)) || null : null;
        await client.query(
          `INSERT INTO chats (
             id, user_id, character_id, character_snapshot, title, summary,
             temperature, max_tokens, reply_style, persona_id, persona_snapshot, use_latest_persona
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            nid,
            user.id,
            mappedChar,
            ch.character_snapshot ? String(ch.character_snapshot) : null,
            String(ch.title || 'Percakapan Dipulihkan').slice(0, 120),
            String(ch.summary || ''),
            ch.temperature !== undefined && ch.temperature !== null ? Number(ch.temperature) : null,
            ch.max_tokens !== undefined && ch.max_tokens !== null ? Number(ch.max_tokens) : null,
            String(ch.reply_style || 'sedang'),
            mappedPersona,
            ch.persona_snapshot ? String(ch.persona_snapshot) : null,
            ch.use_latest_persona === 0 || ch.use_latest_persona === false ? 0 : 1,
          ]
        );
        counts.chats++;
      }

      for (const m of messagesIn) {
        const mappedChat = m?.chat_id ? chatMap.get(String(m.chat_id)) : null;
        if (!mappedChat || !m?.content) continue;
        const nid = newId('msg');
        if (m.id) msgMap.set(String(m.id), nid);
        const createdAt = m.created_at && !Number.isNaN(Date.parse(String(m.created_at)))
          ? new Date(String(m.created_at)).toISOString()
          : new Date().toISOString();
        await client.query(
          `INSERT INTO messages (id, chat_id, role, content, alternatives, active_alt_index, is_pinned_memory, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            nid,
            mappedChat,
            m.role === 'user' ? 'user' : 'character',
            String(m.content),
            ensureJsonText(m.alternatives, JSON.stringify([String(m.content)])),
            Math.max(0, Number(m.active_alt_index || 0)),
            m.is_pinned_memory ? 1 : 0,
            createdAt,
          ]
        );
        counts.messages++;
      }

      for (const mem of memoriesIn) {
        if (!mem?.content) continue;
        const mappedChar = mem.character_id ? charMap.get(String(mem.character_id)) || null : null;
        const mappedChat = mem.source_chat_id ? chatMap.get(String(mem.source_chat_id)) || null : null;
        const mappedMsg = mem.source_message_id ? msgMap.get(String(mem.source_message_id)) || null : null;
        await client.query(
          `INSERT INTO memories (id, user_id, character_id, type, content, source_chat_id, source_message_id, is_auto)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            newId('mem'),
            user.id,
            mappedChar,
            mem.type === 'preference' ? 'preference' : mem.type === 'event' ? 'event' : 'fact',
            String(mem.content),
            mappedChat,
            mappedMsg,
            mem.is_auto ? 1 : 0,
          ]
        );
        counts.memories++;
      }

      for (const g of groupChatsIn) {
        if (!g?.title) continue;
        const nid = newId('grp');
        if (g.id) groupMap.set(String(g.id), nid);
        const mappedPersona = g.persona_id ? personaMap.get(String(g.persona_id)) || null : null;
        await client.query(
          `INSERT INTO group_chats (id, user_id, title, scenario, turn_mode, persona_id, temperature, max_tokens)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            nid,
            user.id,
            String(g.title).slice(0, 120),
            String(g.scenario || ''),
            String(g.turn_mode || 'auto'),
            mappedPersona,
            Number(g.temperature || 0.9),
            Number(g.max_tokens || 1024),
          ]
        );
        counts.group_chats++;
      }

      for (const gm of groupMembersIn) {
        const mappedGroup = gm?.group_chat_id ? groupMap.get(String(gm.group_chat_id)) : null;
        const mappedChar = gm?.character_id ? charMap.get(String(gm.character_id)) : null;
        if (!mappedGroup || !mappedChar) continue;
        await client.query(
          `INSERT INTO group_chat_members (group_chat_id, character_id, join_order)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [mappedGroup, mappedChar, Number(gm.join_order || 0)]
        );
      }

      for (const msg of groupMessagesIn) {
        const mappedGroup = msg?.group_chat_id ? groupMap.get(String(msg.group_chat_id)) : null;
        if (!mappedGroup || !msg?.content) continue;
        const mappedChar = msg.character_id ? charMap.get(String(msg.character_id)) || null : null;
        const createdAt = msg.created_at && !Number.isNaN(Date.parse(String(msg.created_at)))
          ? new Date(String(msg.created_at)).toISOString()
          : new Date().toISOString();
        await client.query(
          `INSERT INTO group_messages (id, group_chat_id, role, character_id, content, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            newId('gmsg'),
            mappedGroup,
            msg.role === 'user' ? 'user' : 'character',
            mappedChar,
            String(msg.content),
            createdAt,
          ]
        );
        counts.group_messages++;
      }

      for (let i = 0; i < storiesIn.length; i++) {
        const st = storiesIn[i];
        if (!st?.title) continue;
        const nid = newId('sty');
        if (st.id) storyMap.set(String(st.id), nid);
        const mappedWorld = st.world_id ? worldMap.get(String(st.world_id)) || null : null;
        await client.query(
          `INSERT INTO stories (
             id, user_id, title, synopsis, cover_image, genre, tags, world_id,
             pov, tone, writing_style_notes, authors_note, temperature, length_preset, status, visibility
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'private')`,
          [
            nid,
            user.id,
            String(st.title).slice(0, 140),
            String(st.synopsis || ''),
            safeStoryCovers.get(i) || '',
            String(st.genre || 'Bebas').slice(0, 40),
            ensureJsonText(st.tags, '[]'),
            mappedWorld,
            String(st.pov || 'third_limited'),
            String(st.tone || 'sinematik'),
            String(st.writing_style_notes || ''),
            String(st.authors_note || ''),
            Number(st.temperature || 0.85),
            String(st.length_preset || 'sedang'),
            st.status === 'completed' ? 'completed' : 'ongoing',
          ]
        );
        counts.stories++;
      }

      for (const sc of storyCastIn) {
        const mappedStory = sc?.story_id ? storyMap.get(String(sc.story_id)) : null;
        if (!mappedStory || !sc?.name) continue;
        const mappedChar = sc.character_id ? charMap.get(String(sc.character_id)) || null : null;
        await client.query(
          `INSERT INTO story_cast (id, story_id, character_id, character_snapshot, name, role_in_story, bio, current_state, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            newId('cst'),
            mappedStory,
            mappedChar,
            sc.character_snapshot ? String(sc.character_snapshot) : null,
            String(sc.name).slice(0, 80),
            String(sc.role_in_story || 'pendukung'),
            String(sc.bio || ''),
            String(sc.current_state || ''),
            Number(sc.sort_order || 0),
          ]
        );
      }

      for (const ch of storyChaptersIn) {
        const mappedStory = ch?.story_id ? storyMap.get(String(ch.story_id)) : null;
        if (!mappedStory) continue;
        const content = String(ch.content || '');
        const wc = ch.word_count !== undefined ? Number(ch.word_count) : content.trim().split(/\s+/).filter(Boolean).length;
        await client.query(
          `INSERT INTO story_chapters (id, story_id, chapter_number, title, content, summary, outline_notes, word_count, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            newId('chp'),
            mappedStory,
            Math.max(1, Number(ch.chapter_number || 1)),
            String(ch.title || 'Bab').slice(0, 140),
            content,
            String(ch.summary || ''),
            String(ch.outline_notes || ''),
            Math.max(0, wc),
            ch.status === 'done' ? 'done' : 'draft',
          ]
        );
        counts.story_chapters++;
      }

      return counts;
    });

    await logAudit({
      userId: user.id,
      actorEmail: user.email,
      action: 'pulihkan_cadangan_data',
      detail: `karakter=${restored.characters}, chat=${restored.chats}, pesan=${restored.messages}, cerita=${restored.stories}`,
      ip: getClientIp(req),
    });

    return NextResponse.json({ success: true, restored }, { status: 201 });
  } catch (err) {
    return handleApiError(err, 'Gagal memulihkan cadangan data.');
  }
}
