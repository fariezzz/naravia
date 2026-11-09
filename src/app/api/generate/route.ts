import { NextRequest, NextResponse } from 'next/server';
import { buildCharacterSystemPrompt } from '@/lib/character';
import { CharacterRow, getDefaultPersona } from '@/lib/db';
import { cleanCharacterOutput, generateLLMResponse } from '@/lib/llm';
import { getRelevantLore } from '@/lib/lore';
import { generateCharacterFromIdea } from '@/lib/research';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Mode 1: Pratinjau obrolan singkat dengan draf karakter sebelum disimpan (Bagian 8.5)
    if (body.mode === 'preview') {
      const draft = body.character || {};
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const persona = getDefaultPersona();

      const tempCharRow: CharacterRow = {
        id: 'preview-char',
        name: String(draft.name || 'Karakter Pratinjau'),
        tagline: String(draft.tagline || ''),
        avatar: String(draft.avatar || ''),
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
      const lore = getRelevantLore(tempCharRow.world_id, recentText);
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
          content: String(m.content || ''),
        })),
      ];

      const reply = await generateLLMResponse(llmMessages, {
        temperature: 0.9,
        maxTokens: 600,
        actionType: 'preview',
      });

      return NextResponse.json({
        reply: cleanCharacterOutput(reply.text, tempCharRow.name),
        modelUsed: reply.modelUsed,
      });
    }

    // Mode 2: Pembuatan Karakter Otomatis dari Ide Singkat (Bagian 11)
    const draft = await generateCharacterFromIdea({
      idea: String(body.idea || ''),
      manualResearchText: String(body.manualResearchText || ''),
      characterTypeHint: body.characterTypeHint || 'auto',
    });

    return NextResponse.json({ draft });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal membuat draf karakter otomatis.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
