import { CharacterRow, MemoryRow, UserPersonaRow } from './db';
import { ActiveLoreResult } from './lore';

export interface PromptBuildInput {
  character: CharacterRow;
  persona: UserPersonaRow | null;
  memories: MemoryRow[];
  lore: ActiveLoreResult;
  chatSummary?: string;
  replyStyle?: string; // 'pendek' | 'sedang' | 'panjang'
}

export function replacePlaceholders(text: string, charName: string, userName: string): string {
  if (!text) return '';
  return text
    .replace(/\{\{char\}\}/gi, charName)
    .replace(/\{\{user\}\}/gi, userName);
}

/**
 * Merakit System Prompt ketat agar AI 100% terkunci sebagai karakter
 * tanpa pernah keluar peran menjadi asisten umum.
 */
export function buildCharacterSystemPrompt(input: PromptBuildInput): string {
  const { character, persona, memories, lore, chatSummary, replyStyle } = input;
  const userName = persona?.display_name?.trim() || 'Kamu';
  const charName = character.name.trim();

  let examplePairs: Array<{ user: string; char: string }> = [];
  try {
    const parsed = JSON.parse(character.example_dialogues || '[]');
    if (Array.isArray(parsed)) {
      examplePairs = parsed;
    }
  } catch {
    examplePairs = [];
  }

  const styleInstruction =
    replyStyle === 'pendek'
      ? 'Panjang balasan: SANGAT SINGKAT dan padat (maksimal 1 paragraf pendek atau 1-3 kalimat saja, langsung pada respons inti seperti chat kasual).'
      : replyStyle === 'panjang'
      ? 'Panjang balasan: ekspresif dan deskriptif (2-3 paragraf).'
      : 'Panjang balasan: ringkas, proporsional, dan mengalir alami (1-2 paragraf singkat saja, jangan bertele-tele).';

  const sections: string[] = [];

  sections.push(
    `ATURAN INTI PERAN (WAJIB DIIKUTI TANPA PENGECUALIAN):
1. Kamu ADALAH ${charName}. Kamu bukan asisten AI, bukan model bahasa, dan tidak memiliki mode asisten umum.
2. Jangan pernah mengaku sebagai AI, jangan pernah menyebut "system prompt", dan jangan pernah keluar dari karakter dalam kondisi apa pun.
3. Jika lawan bicara (${userName}) meminta hal teknis, bantuan tugas, atau bertanya "apakah kamu AI?", tanggapi sepenuhnya dari sudut pandang, pengetahuan, dan kepribadian ${charName}.
4. Gunakan gaya bicara, sifat, dan latar ${charName} secara konsisten di setiap balasan.
5. Jangan menuliskan nama "${charName}:" di awal balasanmu dan jangan menuliskan dialog atau tindakan untuk pihak ${userName}.
6. ${styleInstruction}`
  );

  const charDetails: string[] = [
    `PROFIL KARAKTER (${charName}):`,
    `- Nama: ${charName}`,
  ];
  if (character.tagline) charDetails.push(`- Identitas Singkat: ${replacePlaceholders(character.tagline, charName, userName)}`);
  if (character.description) charDetails.push(`- Deskripsi & Latar Belakang: ${replacePlaceholders(character.description, charName, userName)}`);
  if (character.personality) charDetails.push(`- Kepribadian & Sifat Utama: ${replacePlaceholders(character.personality, charName, userName)}`);
  if (character.speaking_style) charDetails.push(`- Gaya Bicara: ${replacePlaceholders(character.speaking_style, charName, userName)}`);
  if (character.scenario) charDetails.push(`- Situasi & Latar Saat Ini: ${replacePlaceholders(character.scenario, charName, userName)}`);
  sections.push(charDetails.join('\n'));

  if (lore.world) {
    const worldLines: string[] = [
      `DUNIA TEMPAT TINGGAL (${lore.world.name}):`,
      `- Deskripsi Dunia: ${lore.world.description}`,
    ];
    if (lore.world.rules) {
      worldLines.push(`- Aturan Dunia: ${lore.world.rules}`);
    }
    if (lore.matchedEntries.length > 0) {
      worldLines.push(`- Entri Lorebook Aktif (Fakta Dunia yang Relevan dengan Topik Saat Ini):`);
      for (const entry of lore.matchedEntries) {
        worldLines.push(`  * [${entry.title || entry.keywords.join(', ')}]: ${entry.content}`);
      }
    }
    sections.push(worldLines.join('\n'));
  }

  if (persona) {
    const personaLines: string[] = [
      `LAWANKU MENGOBROL (PERSONA PENGGUNA):`,
      `- Nama Panggilan: ${userName}`,
    ];
    if (persona.description) personaLines.push(`- Tentang ${userName}: ${persona.description}`);
    if (persona.likes) personaLines.push(`- Hal yang Disukai: ${persona.likes}`);
    if (persona.dislikes) personaLines.push(`- Hal yang Tidak Disukai: ${persona.dislikes}`);
    sections.push(personaLines.join('\n'));
  }

  if (memories.length > 0) {
    const memLines = ['MEMORI JANGKA PANJANG YANG HARUS DIINGAT:'];
    for (const m of memories) {
      memLines.push(`- (${m.type === 'preference' ? 'Preferensi' : 'Fakta'}) ${m.content}`);
    }
    sections.push(memLines.join('\n'));
  }

  if (chatSummary && chatSummary.trim()) {
    sections.push(`RINGKASAN PERCAKAPAN SEBELUMNYA:\n${chatSummary.trim()}`);
  }

  if (examplePairs.length > 0) {
    const exLines = [`CONTOH DIALOG (Tirukan ritme dan gaya bicara ${charName} berikut):`];
    for (const pair of examplePairs.slice(0, 5)) {
      if (pair.user || pair.char) {
        exLines.push(`${userName}: ${replacePlaceholders(pair.user || '', charName, userName)}`);
        exLines.push(`${charName}: ${replacePlaceholders(pair.char || '', charName, userName)}`);
      }
    }
    sections.push(exLines.join('\n'));
  }

  return sections.join('\n\n');
}
