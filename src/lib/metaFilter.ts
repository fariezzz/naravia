/**
 * Penyaring kalimat meta AI pada kolom personalisasi karakter.
 * Membuang kalimat yang isinya proses berpikir/riset AI (bukan isi karakter),
 * bukan hanya mengandalkan prompt model.
 */

// Daftar pola frasa meta yang tidak boleh muncul di kolom personalisasi.
const META_PHRASE_PATTERNS: RegExp[] = [
  /bahan pencarian/i,
  /hasil pencarian/i,
  /pencarian web/i,
  /kartu (ini|karakter ini)/i,
  /karakterisasi roleplay/i,
  /versi roleplay(?! ini sendiri)/i,
  /pengguna (bisa|dapat) menjadi/i,
  /ditentukan selama roleplay/i,
  /selama roleplay(?!\w)/i,
  /tanpa menganggapnya sebagai fakta kanon/i,
  /belum memuat rincian/i,
  /informasi yang tersedia/i,
  /profil resmi lainnya/i,
  /mempertahankan fakta (tersebut|ini)/i,
  /mengembangkan karakterisasi/i,
  /hubungan dan perkembangan ceritanya/i,
  /sebagai fakta kanon/i,
  /roleplay tanpa/i,
  /bukan fakta kanon/i,
  /dasar pengembangan karakter/i,
  /catatan riset/i,
  /riset (mengonfirmasi|menunjukkan|mengungkapkan)/i,
];

// Label pembuka kolom yang harus dibuang dari awal teks, contoh: "Karakterisasi roleplay: ..."
const LEADING_LABEL_PATTERN =
  /^\s*(karakterisasi roleplay|deskripsi karakter|deskripsi|kepribadian (dan|&) sifat utama|kepribadian|gaya bicara|latar\s*\/?\s*skenario awal|skenario awal|latar belakang)\s*:\s*/i;

function normalizeWhitespace(s: string): string {
  return s
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g);
  if (!matches) return [text];
  return matches.map((s) => s.trim()).filter(Boolean);
}

export interface SanitizeResult {
  cleaned: string;
  removedCount: number;
  wasFullyStripped: boolean;
}

/**
 * Membersihkan satu kolom teks personalisasi dari kalimat meta AI.
 * Tidak boleh mengosongkan kolom: jika semua kalimat terdeteksi mengandung pola meta,
 * kalimat dengan jumlah kecocokan pola meta paling sedikit tetap dipertahankan
 * dan peringatan dicatat di log server.
 */
export function sanitizePersonalizationText(raw: string, fieldLabel?: string): SanitizeResult {
  if (!raw || !raw.trim()) {
    return { cleaned: '', removedCount: 0, wasFullyStripped: false };
  }

  // Ganti em dash dengan tanda hubung biasa sesuai aturan anti-slop aplikasi
  let text = raw.replace(/—/g, '-').replace(/–/g, '-').trim();

  // Buang label pembuka kolom di awal teks
  text = text.replace(LEADING_LABEL_PATTERN, '').trim();

  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return { cleaned: normalizeWhitespace(text), removedCount: 0, wasFullyStripped: false };
  }

  const scored = sentences.map((s) => ({
    text: s,
    metaHits: META_PHRASE_PATTERNS.reduce((acc, p) => acc + (p.test(s) ? 1 : 0), 0),
  }));

  const kept = scored.filter((s) => s.metaHits === 0).map((s) => s.text);
  const removedCount = scored.length - kept.length;

  if (kept.length > 0) {
    return {
      cleaned: normalizeWhitespace(kept.join(' ')),
      removedCount,
      wasFullyStripped: false,
    };
  }

  // Semua kalimat terbuang: pertahankan kalimat dengan skor meta paling rendah agar kolom tidak kosong
  const fallback = scored.slice().sort((a, b) => a.metaHits - b.metaHits)[0];
  console.warn(
    `[metaFilter] Semua kalimat pada kolom${fieldLabel ? ` "${fieldLabel}"` : ''} terdeteksi mengandung pola meta AI. ` +
      `Kalimat dengan skor meta terendah dipertahankan agar kolom tidak kosong: "${fallback.text}"`
  );

  return {
    cleaned: normalizeWhitespace(fallback.text),
    removedCount: scored.length - 1,
    wasFullyStripped: true,
  };
}

interface PersonalizationFields {
  description?: string;
  personality?: string;
  speaking_style?: string;
  scenario?: string;
}

const PERSONALIZATION_FIELD_LABELS: Record<keyof PersonalizationFields, string> = {
  description: 'Deskripsi Karakter',
  personality: 'Kepribadian & Sifat Utama',
  speaking_style: 'Gaya Bicara',
  scenario: 'Latar / Skenario Awal',
};

/**
 * Menjalankan penyaring kalimat meta ke seluruh kolom personalisasi sebuah draf karakter.
 * Dipakai di semua jalur yang menyimpan hasil riset/revisi riset.
 */
export function sanitizeCharacterDraftFields<T extends PersonalizationFields>(draft: T): T {
  const result: T = { ...draft };
  (Object.keys(PERSONALIZATION_FIELD_LABELS) as Array<keyof PersonalizationFields>).forEach((field) => {
    const val = draft[field];
    if (typeof val === 'string' && val.trim()) {
      const { cleaned } = sanitizePersonalizationText(val, PERSONALIZATION_FIELD_LABELS[field]);
      (result as any)[field] = cleaned;
    }
  });
  return result;
}
