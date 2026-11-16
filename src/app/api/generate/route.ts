import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { buildCharacterSystemPrompt } from '@/lib/character';
import { CharacterRow } from '@/lib/db';
import { handleApiError, jsonError, readJson } from '@/lib/http';
import { cleanCharacterOutput, generateLLMResponse } from '@/lib/llm';
import { getRelevantLore } from '@/lib/lore';
import { sanitizeCharacterDraftFields } from '@/lib/metaFilter';
import { enforceLlmRateLimit, enforceRateLimit } from '@/lib/rateLimit';
import { generateCharacterFromIdea, reviseCharacterDraft, verifyResearchRevision } from '@/lib/research';
import { getDefaultPersona } from '@/lib/store';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await readJson(req);

    // Mode sanitize: bersihkan kalimat meta AI dari kolom personalisasi (tanpa LLM, tanpa menyimpan)
    if (body.mode === 'sanitize') {
      const fields = body.fields || {};
      const sanitized = sanitizeCharacterDraftFields({
        description: String(fields.description || ''),
        personality: String(fields.personality || ''),
        speaking_style: String(fields.speaking_style || ''),
        scenario: String(fields.scenario || ''),
      });
      return NextResponse.json({ fields: sanitized });
    }

    enforceLlmRateLimit(user.id);

    // Mode preview: obrolan singkat dengan draf karakter sebelum disimpan
    if (body.mode === 'preview') {
      const draft = body.character || {};
      const messages = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
      const persona = await getDefaultPersona(user.id);

      const tempCharRow: CharacterRow = {
        id: 'preview-char',
        name: String(draft.name || 'Karakter Pratinjau'),
        tagline: String(draft.tagline || ''),
        avatar: '',
        description: String(draft.description || ''),
        personality: String(draft.personality || ''),
        speaking_style: String(draft.speaking_style || ''),
        scenario: String(draft.scenario || ''),
        greeting: JSON.stringify(Array.isArray(draft.greeting) ? draft.greeting : []),
        example_dialogues: JSON.stringify(Array.isArray(draft.example_dialogues) ? draft.example_dialogues : []),
        tags: JSON.stringify(Array.isArray(draft.tags) ? draft.tags : []),
        research_notes: '',
        world_id: draft.world_id || null,
        is_pinned: 0,
        is_favorite: 0,
        temperature_override: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const recentText = messages.map((m: { content?: string }) => m.content || '').join('\n');
      const lore = await getRelevantLore(user.id, tempCharRow.world_id, recentText);
      const sysPrompt = buildCharacterSystemPrompt({
        character: tempCharRow,
        persona: persona || null,
        memories: [],
        lore,
        replyStyle: 'sedang',
      });

      const llmMessages = [
        { role: 'system' as const, content: sysPrompt },
        ...messages.map((m: { role: string; content: string }) => ({
          role: (m.role === 'character' ? 'assistant' : 'user') as 'user' | 'assistant',
          content: String(m.content || '').slice(0, 4000),
        })),
      ];

      const reply = await generateLLMResponse(llmMessages, {
        userId: user.id,
        temperature: 0.9,
        maxTokens: 600,
        actionType: 'preview',
      });
      return NextResponse.json({ reply: cleanCharacterOutput(reply.text, tempCharRow.name) });
    }

    // Riset memakan banyak token: batas tambahan per jam
    enforceRateLimit(`research:${user.id}`, 20, 60 * 60_000);

    // Mode revise: revisi riset dengan verifikasi fakta lebih dulu
    if (body.mode === 'revise') {
      const currentDraft = body.currentDraft;
      const revisionRequest = String(body.revisionRequest || '').trim().slice(0, 2000);
      if (!currentDraft || !revisionRequest) {
        return jsonError('Draf karakter saat ini dan instruksi revisi wajib disertakan.', 400);
      }
      const typeHint = body.characterTypeHint || currentDraft.research_notes?.mode || 'auto';

      const verification = await verifyResearchRevision({
        userId: user.id,
        characterName: currentDraft.name || 'Karakter',
        currentDraft,
        revisionRequest,
        characterTypeHint: typeHint,
      });
      const revisedDraft = await reviseCharacterDraft({
        userId: user.id,
        currentDraft,
        revisionRequest,
        verification,
        characterTypeHint: typeHint,
      });
      return NextResponse.json({ draft: revisedDraft, verification });
    }

    // Mode bawaan: buat karakter otomatis dari ide singkat
    const draft = await generateCharacterFromIdea({
      userId: user.id,
      idea: String(body.idea || '').slice(0, 2000),
      manualResearchText: String(body.manualResearchText || '').slice(0, 20000),
      characterTypeHint: body.characterTypeHint || 'auto',
    });
    return NextResponse.json({ draft });
  } catch (err) {
    return handleApiError(err, 'Gagal membuat draf karakter otomatis.', 400);
  }
}
