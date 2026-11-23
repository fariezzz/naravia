import { describe, expect, it } from 'vitest';
import type { LoreEntryRow } from '../db';
import { keywordMatchesText, matchLoreEntries } from '../lore';

function makeEntry(id: string, title: string, keywords: string[], content: string): LoreEntryRow {
  return {
    id,
    world_id: 'w1',
    title,
    keywords: JSON.stringify(keywords),
    content,
    enabled: 1,
    created_at: new Date().toISOString(),
  };
}

describe('Lorebook matching & budgeting', () => {
  it('respects Unicode word boundaries so short keywords do not false-match', () => {
    expect(keywordMatchesText('api', 'Mereka menyalakan api unggun di hutan.')).toBe(true);
    expect(keywordMatchesText('api', 'Tapi ruangan ini sudah sangat rapi.')).toBe(false);
    expect(keywordMatchesText('menara jam', 'Kita bertemu di dekat Menara Jam malam ini.')).toBe(true);
  });

  it('ranks entries with more keyword matches higher and respects maxEntries/maxChars', () => {
    const entries = [
      makeEntry('1', 'Satu Match', ['kota'], 'A'.repeat(200)),
      makeEntry('2', 'Dua Match', ['kota', 'menara jam'], 'B'.repeat(200)),
      makeEntry('3', 'Terlalu Panjang', ['kota'], 'C'.repeat(500)),
    ];

    const matched = matchLoreEntries(entries, 'Di tengah kota berdiri menara jam kuno.', {
      maxEntries: 2,
      maxChars: 450,
    });

    expect(matched.length).toBe(2);
    expect(matched[0].id).toBe('2');
    expect(matched[0].matchedKeywords).toEqual(['kota', 'menara jam']);
    expect(matched[1].id).toBe('1');
  });
});
