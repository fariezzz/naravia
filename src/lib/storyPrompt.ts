import type {
  CharacterRow,
  StoryCastRow,
  StoryChapterRow,
  StoryPov,
  StoryRow,
  StoryTone,
} from './db';
import { parseJsonSafe } from './format';
import { estimateTokens } from './llm/cleaner';
import type { LLMMessage } from './llm/types';
import type { ActiveLoreResult } from './lore';
import {
  getStoryMaxTokens,
  STORY_GENRES,
  STORY_LENGTH_PRESETS,
  STORY_POVS,
  STORY_TONES,
} from './storyConstants';

export { getStoryMaxTokens, STORY_GENRES, STORY_LENGTH_PRESETS, STORY_POVS, STORY_TONES };

/**
 * Membersihkan placeholder gaya roleplay (`{{char}}` / `{{user}}`) dari deskripsi
 * karakter Naravia agar tidak bocor mentah ke dalam prosa novel.
 */
export function sanitizeCharacterBioForStory(text: string | null | undefined, charName: string): string {
  if (!text) return '';
  return text
    .replace(/\{\{char\}\}/gi, charName.trim() || 'tokoh ini')
    .replace(/\{\{user\}\}/gi, 'rekan atau orang di sekitarnya')
    .trim();
}

export function buildCharacterCastBio(character: Pick<CharacterRow, 'name' | 'tagline' | 'description' | 'personality' | 'speaking_style'>): string {
  const parts: string[] = [];
  if (character.tagline) parts.push(sanitizeCharacterBioForStory(character.tagline, character.name));
  if (character.description) parts.push(sanitizeCharacterBioForStory(character.description, character.name));
  if (character.personality) parts.push(`Kepribadian: ${sanitizeCharacterBioForStory(character.personality, character.name)}`);
  if (character.speaking_style) parts.push(`Gaya bicara: ${sanitizeCharacterBioForStory(character.speaking_style, character.name)}`);
  return parts.join('\n').trim();
}

export interface StoryPromptInput {
  story: StoryRow;
  cast: StoryCastRow[];
  lore: ActiveLoreResult;
  previousChapters: Array<Pick<StoryChapterRow, 'chapter_number' | 'title' | 'summary' | 'content'>>;
  currentChapter: Pick<StoryChapterRow, 'chapter_number' | 'title' | 'outline_notes' | 'content'>;
  beat?: string;
  isRetry?: boolean;
}

/**
 * Fallback ringkasan jika sebuah bab belum memiliki ringkasan AI/manual:
 * untuk bab panjang, gabungkan awal + akhir bab agar AI tetap tahu peristiwa pembuka
 * sekaligus klimaks/kondisi akhir bab tersebut.
 */
export function buildChapterFallbackRecap(content: string | null | undefined): string {
  const clean = (content || '').trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  if (clean.length <= 720) return clean;
  const head = clean.slice(0, 340).trimEnd();
  const tail = clean.slice(-340).trimStart();
  return `${head} [...] ${tail}`;
}

/**
 * Mengambil 2–3 paragraf terakhir dari bab sebelumnya agar pembukaan bab baru
 * menyambung mulus dengan adegan akhir bab sebelumnya.
 */
export function extractChapterEndingTail(content: string | null | undefined, maxChars = 1600): string {
  const full = (content || '').trim();
  if (!full) return '';
  if (full.length <= maxChars) return full;

  const paragraphs = full
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length > 1) {
    const picked: string[] = [];
    let used = 0;
    for (let i = paragraphs.length - 1; i >= 0 && picked.length < 3; i--) {
      const p = paragraphs[i];
      if (picked.length > 0 && used + p.length + 2 > maxChars) break;
      picked.unshift(p);
      used += p.length + 2;
    }
    if (picked.length > 0) return picked.join('\n\n');
  }

  return full.slice(-maxChars).trim();
}

export function buildStorySystemPrompt(input: StoryPromptInput): string {
  const { story, cast, lore, previousChapters, currentChapter } = input;
  const povInfo = STORY_POVS.find((p) => p.value === story.pov) || STORY_POVS[0];
  const toneInfo = STORY_TONES.find((t) => t.value === story.tone) || STORY_TONES[0];
  const lengthInfo = STORY_LENGTH_PRESETS.find((l) => l.value === story.length_preset) || STORY_LENGTH_PRESETS[1];

  const sections: string[] = [];

  sections.push(
    `PERAN & ATURAN PENULISAN NOVEL (WAJIB DIIKUTI):
1. Kamu adalah novelis profesional dan rekan penulis (co-author) yang menulis prosa fiksi sastra dalam Bahasa Indonesia yang alami, hidup, dan memikat.
2. Kamu BUKAN chatbot dan BUKAN satu tokoh yang sedang mengobrol dengan pengguna. Tugasmu adalah menulis narasi dan dialog seluruh tokoh di dalam novel secara mengalir.
3. Tulis LANGSUNG isi prosa cerita. DILARANG menulis pembuka atau komentar asisten (seperti "Tentu, ini kelanjutannya:", "Berikut adegannya:", atau catatan penutup), DILARANG menuliskan label pembicara format naskah drama seperti "Nama:", dan DILARANG mengulang kalimat terakhir yang sudah ada di naskah.
4. Gunakan tanda petik ("...") untuk dialog antar tokoh yang menyatu alami dengan paragraf narasi.
5. Sudut Pandang (POV): ${povInfo.label} — ${povInfo.description}
6. Gaya Prosa & Atmosfer: ${toneInfo.label} — ${toneInfo.description}
7. Target Panjang: ${lengthInfo.instruction}
8. Jaga konsistensi nama tokoh, lokasi, detail fisik, serta kesinambungan emosi dari kalimat sebelumnya.`
  );

  const bibleLines: string[] = [
    `ALKITAB CERITA (STORY BIBLE):`,
    `- Judul Novel: ${story.title}`,
    `- Genre: ${story.genre || 'Bebas'}`,
  ];
  const tags = parseJsonSafe<string[]>(story.tags, []);
  if (tags.length > 0) bibleLines.push(`- Tema/Tag: ${tags.join(', ')}`);
  if (story.synopsis?.trim()) bibleLines.push(`- Premis & Sinopsis:\n${story.synopsis.trim()}`);
  if (story.writing_style_notes?.trim()) {
    bibleLines.push(`- Catatan Gaya Penulis:\n${story.writing_style_notes.trim()}`);
  }
  sections.push(bibleLines.join('\n'));

  if (cast.length > 0) {
    const roleLabel: Record<string, string> = {
      protagonis: 'Protagonis',
      antagonis: 'Antagonis',
      pendukung: 'Pendukung',
    };
    const castLines: string[] = ['DAFTAR PEMERAN (CAST):'];
    for (const member of cast) {
      const bio = sanitizeCharacterBioForStory(member.bio, member.name);
      const roleText = roleLabel[member.role_in_story] || 'Tokoh';
      castLines.push(`- ${member.name} (${roleText})`);
      if (bio) castLines.push(`  Profil: ${bio.replace(/\n+/g, ' | ').slice(0, 600)}`);
      if (member.current_state?.trim()) {
        castLines.push(`  Kondisi Terkini di Cerita: ${member.current_state.trim()}`);
      }
    }
    sections.push(castLines.join('\n'));
  }

  if (lore.world) {
    const worldLines: string[] = [
      `DUNIA & LORE (${lore.world.name}):`,
      `- Deskripsi Dunia: ${lore.world.description || '-'}`,
    ];
    if (lore.world.rules) worldLines.push(`- Aturan Dunia: ${lore.world.rules}`);
    if (lore.matchedEntries.length > 0) {
      worldLines.push('- Entri Lorebook Terdeteksi (Relevan dengan Adegan Saat Ini):');
      for (const entry of lore.matchedEntries) {
        worldLines.push(`  * [${entry.title || entry.keywords.join(', ')}]: ${entry.content}`);
      }
    }
    sections.push(worldLines.join('\n'));
  }

  if (previousChapters.length > 0) {
    const recapLines: string[] = ['RINGKASAN BAB SEBELUMNYA (MEMORI ALUR):'];
    for (const ch of previousChapters) {
      const recap = ch.summary?.trim() ? ch.summary.trim() : buildChapterFallbackRecap(ch.content);
      if (recap) {
        recapLines.push(`- Bab ${ch.chapter_number} (${ch.title}): ${recap}`);
      }
    }
    if (recapLines.length > 1) {
      sections.push(recapLines.join('\n'));
    }
  }

  const chapterMeta: string[] = [`BAB AKTIF SAAT INI: Bab ${currentChapter.chapter_number} — ${currentChapter.title}`];
  if (currentChapter.outline_notes?.trim()) {
    chapterMeta.push(`Rencana / Kerangka Bab Ini: ${currentChapter.outline_notes.trim()}`);
  }
  sections.push(chapterMeta.join('\n'));

  if (story.authors_note?.trim()) {
    sections.push(`CATATAN SUTRADARA (AUTHOR'S NOTE — PRIORITAS TINGGI):\n${story.authors_note.trim()}`);
  }

  return sections.join('\n\n');
}

/**
 * Mengambil bagian ekor naskah bab aktif dengan batas karakter agar tetap hemat token
 * sambil menjaga batas paragraf tetap utuh.
 */
export function sliceRecentManuscript(content: string, maxChars = 7500): { text: string; truncated: boolean } {
  const full = (content || '').trim();
  if (full.length <= maxChars) return { text: full, truncated: false };
  const tail = full.slice(-maxChars);
  const firstBreak = tail.indexOf('\n\n');
  if (firstBreak > 0 && firstBreak < 1200) {
    return { text: tail.slice(firstBreak + 2).trim(), truncated: true };
  }
  return { text: tail.trim(), truncated: true };
}

export function buildStoryContinueMessages(input: StoryPromptInput): {
  messages: LLMMessage[];
  systemPrompt: string;
  manuscriptTruncated: boolean;
  includesPreviousEndingTail: boolean;
  estimatedPromptTokens: number;
} {
  const systemPrompt = buildStorySystemPrompt(input);
  const { text: recentManuscript, truncated } = sliceRecentManuscript(input.currentChapter.content || '');
  const beat = (input.beat || '').trim();

  // Saat bab aktif masih kosong atau baru mulai (< 900 karakter), sertakan 2–3 paragraf terakhir
  // dari bab tepat sebelumnya agar transisi adegan antar bab benar-benar menyambung mulus.
  const immediatePrev =
    input.previousChapters.length > 0 ? input.previousChapters[input.previousChapters.length - 1] : null;
  const prevEndingTail =
    recentManuscript.length < 900 && immediatePrev?.content?.trim()
      ? extractChapterEndingTail(immediatePrev.content, 1600)
      : '';
  const includesPreviousEndingTail = Boolean(prevEndingTail);

  const userParts: string[] = [];
  if (prevEndingTail && immediatePrev) {
    userParts.push(
      `[AKHIR BAB SEBELUMNYA — Bab ${immediatePrev.chapter_number}: "${immediatePrev.title}" (JADIKAN PENGHUBUNG TRANSISI)]\n${prevEndingTail}`
    );
  }

  if (recentManuscript) {
    userParts.push(
      truncated
        ? `[POTONGAN TERAKHIR NASKAH BAB ${input.currentChapter.chapter_number} — "${input.currentChapter.title}"]\n${recentManuscript}`
        : `[NASKAH BAB ${input.currentChapter.chapter_number} — "${input.currentChapter.title}" SEJAUH INI]\n${recentManuscript}`
    );
  } else {
    userParts.push(
      `[NASKAH BAB ${input.currentChapter.chapter_number} — "${input.currentChapter.title}" MASIH KOSONG]\nTulis paragraf pembuka bab ini secara memikat${
        includesPreviousEndingTail ? ' yang menyambung mulus dari akhir bab sebelumnya' : ' agar pembaca langsung masuk ke dalam adegan'
      }.`
    );
  }

  if (beat) {
    userParts.push(`[ARAHAN ADEGAN BERIKUTNYA DARI PENULIS]\n${beat}`);
  } else if (recentManuscript) {
    userParts.push(
      '[INSTRUKSI]\nLanjutkan prosa secara mulus tepat dari titik akhir naskah di atas. Jangan mengulang kalimat terakhir.'
    );
  }

  if (input.isRetry) {
    userParts.push(
      '[CATATAN VARIASI]\nTawarkan sudut pandang penceritaan, detail adegan, atau ritme kalimat yang segar dan berbeda dari kemungkinan sebelumnya, namun tetap setia pada alur dan gaya cerita.'
    );
  }

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userParts.join('\n\n') },
  ];

  const estimatedPromptTokens = estimateTokens(messages.map((m) => m.content).join('\n'));
  return {
    messages,
    systemPrompt,
    manuscriptTruncated: truncated,
    includesPreviousEndingTail,
    estimatedPromptTokens,
  };
}

export function buildStoryIdeasMessages(input: StoryPromptInput): LLMMessage[] {
  const systemPrompt = buildStorySystemPrompt(input);
  const { text: recentManuscript } = sliceRecentManuscript(input.currentChapter.content || '', 4500);
  const immediatePrev =
    input.previousChapters.length > 0 ? input.previousChapters[input.previousChapters.length - 1] : null;
  const prevEndingTail =
    recentManuscript.length < 600 && immediatePrev?.content?.trim()
      ? extractChapterEndingTail(immediatePrev.content, 1200)
      : '';

  const contextSection = recentManuscript
    ? `Berdasarkan akhir naskah bab "${input.currentChapter.title}" berikut, berikan 3 opsi kelanjutan adegan dalam JSON:\n\n${recentManuscript}`
    : prevEndingTail && immediatePrev
      ? `Bab "${input.currentChapter.title}" masih kosong. Berikut akhir Bab ${immediatePrev.chapter_number} ("${immediatePrev.title}"):\n\n${prevEndingTail}\n\nBerikan 3 opsi adegan pembuka Bab ${input.currentChapter.chapter_number} yang menyambung mulus dalam JSON.`
      : `Bab "${input.currentChapter.title}" masih kosong. Berikan 3 opsi adegan pembuka yang kuat dalam JSON.`;

  return [
    {
      role: 'system',
      content: `${systemPrompt}\n\nTUGAS KHUSUS: Kamu diminta menyarankan 3 opsi arah kelanjutan adegan yang menarik dan berbeda satu sama lain. Kembalikan HANYA JSON valid dengan format:
{
  "ideas": [
    { "label": "Konflik / Ketegangan", "title": "Judul singkat 3-6 kata", "beat": "Deskripsi arahan adegan 1-2 kalimat konkret yang siap dieksekusi." },
    { "label": "Misteri / Kejutan", "title": "...", "beat": "..." },
    { "label": "Emosional / Karakter", "title": "...", "beat": "..." }
  ]
}`,
    },
    {
      role: 'user',
      content: contextSection,
    },
  ];
}

export type RewriteAction = 'expand' | 'rewrite' | 'tighten' | 'dialogue' | 'custom';

export function buildStoryRewriteMessages(params: {
  story: StoryRow;
  cast: StoryCastRow[];
  lore: ActiveLoreResult;
  chapterTitle: string;
  selectedText: string;
  beforeContext: string;
  afterContext: string;
  action: RewriteAction;
  customInstruction?: string;
}): LLMMessage[] {
  const povInfo = STORY_POVS.find((p) => p.value === params.story.pov) || STORY_POVS[0];
  const toneInfo = STORY_TONES.find((t) => t.value === params.story.tone) || STORY_TONES[0];

  const actionPrompts: Record<RewriteAction, string> = {
    expand: 'Perkaya teks terpilih dengan detail indrawi, emosi batin, dan atmosfer yang lebih hidup tanpa mengubah inti peristiwanya.',
    rewrite: `Tulis ulang teks terpilih agar lebih mengalir, tajam, dan selaras dengan gaya ${toneInfo.label} serta sudut pandang ${povInfo.label}.`,
    tighten: 'Ringkas dan padatkan teks terpilih agar lebih bertenaga, efisien, dan bebas pengulangan tanpa kehilangan makna pentingnya.',
    dialogue: 'Olahlah bagian terpilih agar lebih hidup dengan dialog antar tokoh yang alami dan ekspresif, tetap menyatu dalam prosa novel.',
    custom: (params.customInstruction || 'Perbaiki dan haluskan teks terpilih agar terasa seperti prosa novel profesional.').trim(),
  };

  return [
    {
      role: 'system',
      content: `Kamu adalah editor sastra dan novelis profesional Bahasa Indonesia.
Novel: "${params.story.title}" (${params.story.genre}) | Bab: "${params.chapterTitle}"
POV: ${povInfo.label} | Gaya: ${toneInfo.label}
ATURAN KETAT: Kembalikan HANYA teks pengganti untuk bagian yang disorot. Jangan sertakan penjelasan, tanda kutip pembungkus, komentar editor, maupun teks sebelum/sesudahnya.`,
    },
    {
      role: 'user',
      content: [
        params.beforeContext ? `[KONTEKS SEBELUMNYA]\n${params.beforeContext.slice(-800)}` : '',
        `[TEKS YANG HARUS DISUNTING]\n${params.selectedText}`,
        params.afterContext ? `[KONTEKS SESUDAHNYA]\n${params.afterContext.slice(0, 600)}` : '',
        `[INSTRUKSI PENYUNTINGAN]\n${actionPrompts[params.action]}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
}

export function buildStoryBrainstormMessages(params: {
  premise: string;
  genre?: string;
  tone?: string;
  pov?: string;
  castNames?: string[];
  castProfiles?: Array<{ name: string; role?: string; bio?: string }>;
  protagonistPersona?: { name: string; bio?: string } | null;
  worldName?: string;
}): LLMMessage[] {
  const personaRule = params.protagonistPersona?.name
    ? `\nATURAN TOKOH UTAMA (WAJIB): Gunakan "${params.protagonistPersona.name}" sebagai tokoh utama (protagonis) dalam sinopsis, kerangka bab, dan paragraf pembuka. JANGAN mengarang nama protagonis pengganti.${
        params.protagonistPersona.bio ? `\nProfil ${params.protagonistPersona.name}: ${params.protagonistPersona.bio}` : ''
      }`
    : '';

  const castLines =
    params.castProfiles && params.castProfiles.length > 0
      ? `Pemeran Terlibat (WAJIB dilibatkan sesuai peran):\n${params.castProfiles
          .map(
            (c) =>
              `- ${c.name}${c.role ? ` (${c.role})` : ''}${c.bio ? `: ${c.bio.replace(/\s+/g, ' ').slice(0, 240)}` : ''}`
          )
          .join('\n')}`
      : params.castNames && params.castNames.length > 0
        ? `Pemeran Terlibat (WAJIB digunakan namanya): ${params.castNames.join(', ')}`
        : '';

  return [
    {
      role: 'system',
      content: `Kamu adalah perancang konsep novel profesional Bahasa Indonesia.
Berdasarkan ide singkat pengguna, rancang konsep novel yang memikat dan koheren.${personaRule}
Kembalikan HANYA JSON valid tanpa markdown fence dengan struktur:
{
  "title": "Judul novel yang kuat dan puitis",
  "synopsis": "Sinopsis 1 paragraf menarik (3-5 kalimat)",
  "genre": "Salah satu: Fantasi, Misteri, Romansa, Fiksi Ilmiah, Slice of Life, Drama, Petualangan, Horor & Gelap, Sejarah, Bebas",
  "tags": ["tag1", "tag2", "tag3"],
  "authors_note": "Catatan suasana dan arah gaya penulisan singkat",
  "chapters": [
    { "title": "Judul Bab 1", "outline_notes": "Ringkasan rencana adegan bab 1 (2 kalimat)" },
    { "title": "Judul Bab 2", "outline_notes": "Ringkasan rencana adegan bab 2 (2 kalimat)" },
    { "title": "Judul Bab 3", "outline_notes": "Ringkasan rencana adegan bab 3 (2 kalimat)" }
  ],
  "opening_paragraph": "Satu paragraf pembuka Bab 1 yang langsung memikat pembaca (120-200 kata)."
}`,
    },
    {
      role: 'user',
      content: [
        `Ide / Premis: ${params.premise.trim()}`,
        params.genre ? `Preferensi Genre: ${params.genre}` : '',
        params.tone ? `Gaya Prosa: ${params.tone}` : '',
        params.pov ? `Sudut Pandang: ${params.pov}` : '',
        params.worldName ? `Dunia Tertaut: ${params.worldName}` : '',
        castLines,
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];
}

export function buildStorySummaryMessages(chapter: Pick<StoryChapterRow, 'chapter_number' | 'title' | 'content'>): LLMMessage[] {
  return [
    {
      role: 'system',
      content:
        'Ringkas isi bab novel berikut secara padat dalam 3-5 kalimat Bahasa Indonesia untuk memori penulisan bab berikutnya. Catat peristiwa kunci, keputusan tokoh, rahasia yang terungkap, dan kondisi akhir tokoh. Tulis langsung ringkasannya tanpa pembuka.',
    },
    {
      role: 'user',
      content: `Bab ${chapter.chapter_number}: ${chapter.title}\n\n${(chapter.content || '').slice(0, 14000)}`,
    },
  ];
}

export function buildChatToStoryMessages(params: {
  chatTitle: string;
  characterName: string;
  characterDescription: string;
  userName: string;
  transcript: string;
  pov?: StoryPov;
  tone?: StoryTone;
}): LLMMessage[] {
  const povInfo = STORY_POVS.find((p) => p.value === (params.pov || 'third_limited')) || STORY_POVS[0];
  const toneInfo = STORY_TONES.find((t) => t.value === (params.tone || 'sinematik')) || STORY_TONES[0];

  return [
    {
      role: 'system',
      content: `Kamu adalah novelis profesional Bahasa Indonesia yang mengadaptasi transkrip roleplay menjadi Bab 1 sebuah novel sastra.
ATURAN:
1. Ubah dialog dan aksi dari transkrip menjadi prosa novel yang mulus, hidup, dan menyatu (BUKAN format log chat).
2. Gunakan sudut pandang ${povInfo.label} dan gaya ${toneInfo.label}.
3. Kembalikan HANYA JSON valid dengan struktur:
{
  "title": "Judul novel yang cocok dan memikat",
  "synopsis": "Sinopsis 2-3 kalimat berdasarkan adegan",
  "genre": "Fantasi | Misteri | Romansa | Fiksi Ilmiah | Slice of Life | Drama | Petualangan | Horor & Gelap | Sejarah | Bebas",
  "chapter_title": "Judul Bab 1",
  "chapter_content": "Prosa novel lengkap Bab 1 (minimal 350 kata, pisahkan paragraf dengan \\n\\n)"
}`,
    },
    {
      role: 'user',
      content: `Judul Percakapan: ${params.chatTitle}
Tokoh Utama: ${params.characterName}
Deskripsi Singkat: ${sanitizeCharacterBioForStory(params.characterDescription, params.characterName).slice(0, 600)}
Lawan Interaksi: ${params.userName}

Transkrip Percakapan:
${params.transcript.slice(0, 10000)}`,
    },
  ];
}

// ===================== Ekspor Naskah Novel =====================

export function buildStoryMarkdown(
  story: Pick<StoryRow, 'title' | 'synopsis' | 'genre'>,
  chapters: Array<Pick<StoryChapterRow, 'chapter_number' | 'title' | 'content'>>
): string {
  const lines: string[] = [`# ${story.title}`, ''];
  if (story.genre) lines.push(`*Genre: ${story.genre}*`, '');
  if (story.synopsis?.trim()) {
    lines.push(`> ${story.synopsis.trim().replace(/\n+/g, '\n> ')}`, '');
  }
  lines.push('---', '');

  for (const ch of chapters) {
    lines.push(`## Bab ${ch.chapter_number}: ${ch.title}`, '');
    lines.push((ch.content || '').trim() || '*(Bab ini belum memiliki isi)*', '');
  }

  return `${lines.join('\n').trim()}\n`;
}

export function buildStoryPlainText(
  story: Pick<StoryRow, 'title' | 'synopsis' | 'genre'>,
  chapters: Array<Pick<StoryChapterRow, 'chapter_number' | 'title' | 'content'>>
): string {
  const lines: string[] = [story.title.toUpperCase(), '='.repeat(Math.min(60, Math.max(12, story.title.length))), ''];
  if (story.genre) lines.push(`Genre: ${story.genre}`);
  if (story.synopsis?.trim()) lines.push('', story.synopsis.trim());
  lines.push('');

  for (const ch of chapters) {
    lines.push('', `--- BAB ${ch.chapter_number}: ${ch.title} ---`, '');
    lines.push((ch.content || '').trim() || '(Belum ada isi)');
  }

  return `${lines.join('\n').trim()}\n`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildStoryPrintableHtml(
  story: Pick<StoryRow, 'title' | 'synopsis' | 'genre'>,
  authorName: string,
  chapters: Array<Pick<StoryChapterRow, 'chapter_number' | 'title' | 'content'>>
): string {
  const tocItems = chapters
    .map((ch) => `<li><a href="#bab-${ch.chapter_number}">Bab ${ch.chapter_number}: ${escapeHtml(ch.title)}</a></li>`)
    .join('\n');

  const chapterHtml = chapters
    .map((ch) => {
      const paragraphs = (ch.content || '')
        .trim()
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br />')}</p>`)
        .join('\n');
      return `<section class="chapter" id="bab-${ch.chapter_number}">
        <p class="chapter-kicker">Bab ${ch.chapter_number}</p>
        <h2>${escapeHtml(ch.title)}</h2>
        ${paragraphs || '<p class="empty"><em>Bab ini belum memiliki isi.</em></p>'}
      </section>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(story.title)} — Naravia</title>
  <style>
    @page { margin: 22mm 20mm; }
    body { font-family: Georgia, 'Times New Roman', serif; color: #1e293b; background: #fcfbf9; margin: 0; padding: 32px 20px; line-height: 1.85; font-size: 17px; }
    main { max-width: 680px; margin: 0 auto; }
    .cover { text-align: center; padding: 64px 0 48px; border-bottom: 1px solid #e2e8f0; page-break-after: always; }
    .genre { font-family: system-ui, sans-serif; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #6366f1; margin-bottom: 14px; }
    h1 { font-size: 2.4rem; line-height: 1.2; margin: 0 0 12px; color: #0f172a; }
    .author { font-size: 0.95rem; color: #64748b; margin-bottom: 24px; }
    .synopsis { font-style: italic; color: #475569; max-width: 540px; margin: 0 auto; }
    .toc { padding: 32px 0; border-bottom: 1px solid #e2e8f0; page-break-after: always; }
    .toc h3 { font-family: system-ui, sans-serif; font-size: 13px; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; }
    .toc ol { padding-left: 20px; }
    .toc a { color: #1e293b; text-decoration: none; }
    .chapter { padding-top: 40px; page-break-before: always; }
    .chapter-kicker { font-family: system-ui, sans-serif; font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: #6366f1; margin: 0; }
    .chapter h2 { font-size: 1.7rem; margin: 6px 0 24px; color: #0f172a; }
    .chapter p { margin: 0 0 1.15em; text-align: justify; }
    .empty { color: #94a3b8; }
    .print-bar { position: fixed; top: 16px; right: 16px; }
    .print-bar button { font-family: system-ui, sans-serif; font-size: 13px; font-weight: 600; background: #0f172a; color: #fff; border: none; border-radius: 8px; padding: 8px 14px; cursor: pointer; }
    @media print { body { background: #fff; padding: 0; } .print-bar { display: none; } }
  </style>
</head>
<body>
  <div class="print-bar"><button onclick="window.print()">Cetak / Simpan PDF</button></div>
  <main>
    <header class="cover">
      ${story.genre ? `<p class="genre">${escapeHtml(story.genre)}</p>` : ''}
      <h1>${escapeHtml(story.title)}</h1>
      <p class="author">Ditulis oleh ${escapeHtml(authorName || 'Penulis Naravia')}</p>
      ${story.synopsis?.trim() ? `<p class="synopsis">${escapeHtml(story.synopsis.trim())}</p>` : ''}
    </header>
    ${chapters.length > 1 ? `<nav class="toc"><h3>Daftar Isi</h3><ol>${tocItems}</ol></nav>` : ''}
    ${chapterHtml}
  </main>
</body>
</html>`;
}
