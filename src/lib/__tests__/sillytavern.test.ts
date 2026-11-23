import { describe, expect, it } from 'vitest';
import {
  buildSillyTavernCardV2,
  createFallbackCardPng,
  embedCharacterJsonInPng,
  extractCharacterJsonFromPng,
  mapCardJsonToNaravia,
} from '../sillytavern';

describe('SillyTavern V2 PNG & JSON export/import round-trip', () => {
  it('embeds and extracts character card V2 cleanly inside a PNG buffer', () => {
    const card = buildSillyTavernCardV2({
      name: 'Kana Valerius',
      tagline: 'Restorator artefak kuno',
      description: 'Seorang penyihir yang teliti memperbaiki relik tua.',
      personality: 'Tenang, analitis, sedikit sarkastik',
      speaking_style: 'Santai tetapi sopan',
      scenario: 'Di bengkel artefak saat hujan turun.',
      greeting: ['Selamat datang di bengkelku, {{user}}.', 'Oh, kau membawa artefak baru?'],
      example_dialogues: [{ user: 'Bisa perbaiki ini?', char: 'Tentu, letakkan di meja.' }],
      tags: ['Fantasi', 'Misteri'],
      creator_name: 'Tester',
    });

    const basePng = createFallbackCardPng();
    const cardPng = embedCharacterJsonInPng(basePng, card);
    const extracted = extractCharacterJsonFromPng(cardPng);

    expect(extracted.spec).toBe('chara_card_v2');
    expect(extracted.data.name).toBe('Kana Valerius');

    const imported = mapCardJsonToNaravia(extracted, 'Raka');
    expect(imported.name).toBe('Kana Valerius');
    expect(imported.greeting.length).toBe(2);
    expect(imported.greeting[0]).toContain('Raka');
    expect(imported.example_dialogues.length).toBe(1);
    expect(imported.tags).toEqual(['Fantasi', 'Misteri']);
  });
});
