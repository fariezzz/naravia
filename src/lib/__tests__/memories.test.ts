import { describe, expect, it } from 'vitest';
import type { MemoryRow } from '../db';
import { cosineSimilarity, rankMemories, tokenizeMemoryText } from '../memories';

function makeMemory(id: string, content: string, opts?: Partial<MemoryRow>): MemoryRow {
  return {
    id,
    character_id: 'c1',
    type: 'fact',
    content,
    source_chat_id: null,
    source_message_id: null,
    is_auto: 1,
    embedding: null,
    created_at: new Date().toISOString(),
    ...opts,
  };
}

describe('Hybrid semantic & lexical memory ranking', () => {
  it('computes cosine similarity accurately', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 5);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
    expect(cosineSimilarity([1, 2], [1])).toBe(0);
  });

  it('strips Indonesian stopwords when tokenizing', () => {
    const tokens = tokenizeMemoryText('Aku dan kamu suka minum kopi espresso di kafe Veloria');
    expect(tokens).not.toContain('aku');
    expect(tokens).not.toContain('dan');
    expect(tokens).toContain('kopi');
    expect(tokens).toContain('espresso');
    expect(tokens).toContain('veloria');
  });

  it('ranks lexically relevant older memory above irrelevant newer memory', () => {
    const oldDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const candidates = [
      makeMemory('irrelevant', 'Hari ini cuaca cerah sekali', { created_at: new Date().toISOString() }),
      makeMemory('relevant', 'Pengguna alergi kacang tanah dan sangat menyukai teh matcha', {
        created_at: oldDate,
      }),
    ];

    const res = rankMemories(candidates, 'Mau pesan kue kacang atau teh matcha?', null, 1);
    expect(res.mode).toBe('lexical');
    expect(res.memories[0].id).toBe('relevant');
  });

  it('uses semantic embedding cosine similarity when embeddings exist', () => {
    const candidates = [
      makeMemory('a', 'Suka mendaki gunung', { embedding: JSON.stringify([1, 0, 0]) }),
      makeMemory('b', 'Suka bermain piano klasik', { embedding: JSON.stringify([0, 1, 0]) }),
    ];

    const res = rankMemories(candidates, 'musik instrumen konser', [0.05, 0.99, 0], 1);
    expect(res.mode).toBe('semantic');
    expect(res.memories[0].id).toBe('b');
  });
});
