import { describe, expect, it } from 'vitest';
import type { StoryCastRow, StoryRow } from '../db';
import {
  buildChapterFallbackRecap,
  buildStoryBrainstormMessages,
  buildStoryContinueMessages,
  buildStoryMarkdown,
  buildStoryPrintableHtml,
  buildStorySystemPrompt,
  sanitizeCharacterBioForStory,
  sliceRecentManuscript,
} from '../storyPrompt';

const MOCK_STORY: StoryRow = {
  id: 'sty_1',
  user_id: 'usr_1',
  title: 'Surat dari Stasiun Utara',
  synopsis: 'Seorang arsiparis menemukan surat misterius yang ditulis sepuluh tahun ke depan.',
  cover_image: '',
  genre: 'Misteri',
  tags: '["hujan","rahasia"]',
  world_id: 'wld_1',
  pov: 'third_limited',
  tone: 'kelam',
  writing_style_notes: 'Gunakan kalimat singkat saat ketegangan memuncak.',
  authors_note: 'Pertahankan suasana hujan malam dan rasa curiga.',
  temperature: 0.85,
  length_preset: 'sedang',
  status: 'ongoing',
  visibility: 'private',
  published_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const MOCK_CAST: StoryCastRow[] = [
  {
    id: 'cst_1',
    story_id: 'sty_1',
    character_id: 'chr_1',
    character_snapshot: null,
    name: 'Elara',
    role_in_story: 'protagonis',
    bio: '{{char}} adalah arsiparis teliti yang selalu menjaga jarak dari {{user}}.',
    current_state: 'Memegang kunci loker nomor 14 di tangan kiri.',
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z',
  },
];

describe('Storytelling prompt engine & exporters', () => {
  it('sanitizes {{char}} and {{user}} placeholders from imported character bios', () => {
    const out = sanitizeCharacterBioForStory('{{char}} tersenyum dingin kepada {{user}}.', 'Elara');
    expect(out).not.toContain('{{char}}');
    expect(out).not.toContain('{{user}}');
    expect(out).toContain('Elara');
  });

  it('assembles layered novel system prompt with cast, lore, previous summaries, and author note', () => {
    const prompt = buildStorySystemPrompt({
      story: MOCK_STORY,
      cast: MOCK_CAST,
      lore: {
        world: {
          id: 'wld_1',
          name: 'Kota Pelabuhan Lama',
          description: 'Kota berkabut yang dikelilingi jalur kereta tua.',
          rules: 'Jam malam berlaku pukul 23.00.',
          places: '[]',
          factions: '[]',
          timeline: '[]',
          created_at: '',
          updated_at: '',
        },
        matchedEntries: [
          {
            id: 'lor_1',
            title: 'Stasiun Utara',
            keywords: ['stasiun utara'],
            matchedKeywords: ['stasiun utara'],
            content: 'Stasiun yang ditutup sejak kabut hitam 1998.',
          },
        ],
      },
      previousChapters: [
        {
          chapter_number: 1,
          title: 'Loker Nomor Empat Belas',
          summary: 'Elara menemukan amplop berlilin biru dan kunci besi.',
          content: '',
        },
      ],
      currentChapter: {
        chapter_number: 2,
        title: 'Kereta Terakhir',
        outline_notes: 'Elara bertemu sosok berjas hujan di peron 3.',
        content: 'Lampu peron berkedip pelan.',
      },
    });

    expect(prompt).toContain('novelis profesional');
    expect(prompt).toContain('BUKAN chatbot');
    expect(prompt).toContain('Elara (Protagonis)');
    expect(prompt).not.toContain('{{char}}');
    expect(prompt).not.toContain('{{user}}');
    expect(prompt).toContain('Memegang kunci loker nomor 14');
    expect(prompt).toContain('Stasiun Utara');
    expect(prompt).toContain('Loker Nomor Empat Belas');
    expect(prompt).toContain('Pertahankan suasana hujan malam');
  });

  it('slices long manuscripts cleanly at paragraph boundaries', () => {
    const para = 'A'.repeat(200);
    const longText = Array.from({ length: 12 }, (_, i) => `Paragraf ${i + 1}: ${para}`).join('\n\n');
    const sliced = sliceRecentManuscript(longText, 900);
    expect(sliced.truncated).toBe(true);
    expect(sliced.text.length).toBeLessThanOrEqual(900);
    expect(sliced.text).toContain('Paragraf 12');
  });

  it('includes retry variation instructions and director beat in continue messages', () => {
    const built = buildStoryContinueMessages({
      story: MOCK_STORY,
      cast: MOCK_CAST,
      lore: { world: null, matchedEntries: [] },
      previousChapters: [],
      currentChapter: { chapter_number: 1, title: 'Awal', outline_notes: '', content: 'Hujan turun.' },
      beat: 'Sebuah peluit kereta terdengar dari kejauhan.',
      isRetry: true,
    });
    expect(built.messages).toHaveLength(2);
    expect(built.messages[1].content).toContain('peluit kereta');
    expect(built.messages[1].content).toContain('CATATAN VARIASI');
    expect(built.estimatedPromptTokens).toBeGreaterThan(20);
  });

  it('injects protagonist Persona rule into brainstorm messages when enabled', () => {
    const msgs = buildStoryBrainstormMessages({
      premise: 'Petualangan mencari kota hilang di balik kabut.',
      protagonistPersona: { name: 'Kiraya', bio: 'Suka kopi hitam dan peta kuno.' },
      castProfiles: [{ name: 'Elara', role: 'pendukung', bio: 'Arsiparis misterius.' }],
    });
    expect(msgs[0].content).toContain('ATURAN TOKOH UTAMA (WAJIB)');
    expect(msgs[0].content).toContain('Kiraya');
    expect(msgs[0].content).toContain('peta kuno');
    expect(msgs[1].content).toContain('Elara');
  });

  it('combines head and tail in fallback recap for unsummarized long chapters', () => {
    const longChapter = `ADEGAN PEMBUKA DI STASIUN. ${'kata '.repeat(220)}KLIMAKS AKHIR PINTU TERKUNCI.`;
    const recap = buildChapterFallbackRecap(longChapter);
    expect(recap).toContain('ADEGAN PEMBUKA DI STASIUN');
    expect(recap).toContain('[...]');
    expect(recap).toContain('KLIMAKS AKHIR PINTU TERKUNCI');
  });

  it('injects immediate previous chapter ending tail when opening a new chapter', () => {
    const built = buildStoryContinueMessages({
      story: MOCK_STORY,
      cast: MOCK_CAST,
      lore: { world: null, matchedEntries: [] },
      previousChapters: [
        {
          chapter_number: 4,
          title: 'Gerbang Besi',
          summary: 'Kiraya menemukan kunci perak.',
          content: 'Paragraf awal bab 4.\n\nParagraf penutup bab 4: Pintu besi itu terbuka pelan dan sesosok bayangan berdiri di baliknya.',
        },
      ],
      currentChapter: { chapter_number: 5, title: 'Di Balik Gerbang', outline_notes: '', content: '' },
    });
    expect(built.includesPreviousEndingTail).toBe(true);
    expect(built.messages[1].content).toContain('AKHIR BAB SEBELUMNYA');
    expect(built.messages[1].content).toContain('sesosok bayangan berdiri di baliknya');
  });

  it('exports Markdown and safely escapes HTML in printable book output', () => {
    const md = buildStoryMarkdown(MOCK_STORY, [
      { chapter_number: 1, title: 'Bab Awal', content: 'Hujan membasahi peron.' },
    ]);
    expect(md).toContain('# Surat dari Stasiun Utara');
    expect(md).toContain('## Bab 1: Bab Awal');

    const html = buildStoryPrintableHtml(
      { ...MOCK_STORY, title: 'Judul <script>alert(1)</script>' },
      'Penulis',
      [{ chapter_number: 1, title: 'Bab 1', content: 'Isi <b>aman</b>.' }]
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;aman&lt;/b&gt;');
  });
});
