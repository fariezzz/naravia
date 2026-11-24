import { describe, expect, it } from 'vitest';
import { cleanRawOutput, cleanStoryOutput, countWords } from '../llm/cleaner';

describe('Storytelling cleaner & word counter', () => {
  it('removes assistant preambles and think blocks while keeping story structure intact', () => {
    const raw = `<think>Merencanakan adegan hujan di stasiun...</think>
Tentu, berikut kelanjutan ceritanya:

Hujan mengguyur atap peron. Di atas meja kayu itu tergeletak secarik catatan:

Kepada: Elara
Dari: Penjaga Menara

---

Ia melipat kertas itu perlahan dan menatap lorong gelap.`;

    const cleaned = cleanStoryOutput(raw);
    expect(cleaned).not.toContain('<think>');
    expect(cleaned).not.toMatch(/Tentu, berikut/i);
    // Tidak boleh memotong teks bertitik dua maupun pemisah adegan ---
    expect(cleaned).toContain('Kepada: Elara');
    expect(cleaned).toContain('Dari: Penjaga Menara');
    expect(cleaned).toContain('---');
    expect(cleaned).toContain('Ia melipat kertas itu perlahan');
  });

  it('unwraps accidental markdown fences around prose', () => {
    const raw = '```markdown\nLangit senja memerah di atas pelabuhan.\n```';
    expect(cleanStoryOutput(raw)).toBe('Langit senja memerah di atas pelabuhan.');
  });

  it('cleanRawOutput keeps JSON intact while removing tool_call and think artifacts', () => {
    const raw = '<think>planning</think>{"title":"Menara Kaca","chapters":[{"title":"Bab 1"}]}';
    const cleaned = cleanRawOutput(raw);
    expect(JSON.parse(cleaned)).toEqual({ title: 'Menara Kaca', chapters: [{ title: 'Bab 1' }] });
  });

  it('countWords accurately counts multi-paragraph prose and handles empty strings', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n\n  ')).toBe(0);
    expect(countWords('Lampu peron berkedip.\n\nElara melangkah pelan.')).toBe(6);
  });
});
