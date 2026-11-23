import { describe, expect, it } from 'vitest';
import { cleanCharacterOutput, estimateTokens } from '../llm/cleaner';

describe('LLM output cleaner', () => {
  it('strips <think> and <tool_call> tags cleanly', () => {
    const raw = '<think>Memikirkan jawaban...</think>\n<tool_call>foo()</tool_call>\nHalo! Apa kabar hari ini?';
    expect(cleanCharacterOutput(raw, 'Kana')).toBe('Halo! Apa kabar hari ini?');
  });

  it('removes character name prefix at start of reply', () => {
    expect(cleanCharacterOutput('**Eli Ayase**: Selamat pagi semuanya!', 'Eli Ayase')).toBe(
      'Selamat pagi semuanya!'
    );
  });

  it('extracts only the character turn from fabricated multi-turn transcripts', () => {
    const raw = 'Kana: Selamat datang di bengkel.\nKamu: Terima kasih!\nKana: Ayo duduk.';
    expect(cleanCharacterOutput(raw, 'Kana')).toBe('Selamat datang di bengkel.');
  });

  it('replaces em-dashes and truncates decoding breakdown markers', () => {
    const raw = 'Dia menatap langit—tenang sekali.====broken_tokens_garbage';
    expect(cleanCharacterOutput(raw)).toBe('Dia menatap langit - tenang sekali.');
  });

  it('estimates token counts reasonably', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });
});
