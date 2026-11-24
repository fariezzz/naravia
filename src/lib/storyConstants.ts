import type { StoryLengthPreset, StoryPov, StoryTone } from './db';

export const STORY_GENRES = [
  'Fantasi',
  'Misteri',
  'Romansa',
  'Fiksi Ilmiah',
  'Slice of Life',
  'Drama',
  'Petualangan',
  'Horor & Gelap',
  'Sejarah',
  'Bebas',
] as const;

export const STORY_POVS: ReadonlyArray<{
  value: StoryPov;
  label: string;
  shortLabel: string;
  description: string;
  sample: string;
}> = [
  {
    value: 'third_limited',
    label: 'Orang Ketiga Terbatas (Dia)',
    shortLabel: 'Dia (Terbatas)',
    description: 'Fokus mengikuti sudut pandang dan batin satu tokoh utama secara dekat.',
    sample: 'Elara merapatkan mantelnya, merasakan getar dingin di ujung jarinya sebelum mengetuk pintu kayu itu.',
  },
  {
    value: 'first_person',
    label: 'Orang Pertama (Aku)',
    shortLabel: 'Aku',
    description: 'Intim dan personal; pembaca melihat seluruh peristiwa lewat mata tokoh utama.',
    sample: 'Aku merapatkan mantelku, menahan napas ketika lampu peron tiba-tiba berkedip lalu padam.',
  },
  {
    value: 'third_omniscient',
    label: 'Orang Ketiga Serba Tahu',
    shortLabel: 'Serba Tahu',
    description: 'Narator bebas berpindah menyelami pikiran berbagai tokoh dan gambaran besar dunia.',
    sample: 'Di balik jendela, Elara mengira ia sendirian; padahal dua lantai di bawahnya, Raka sedang mengunci pintu besi.',
  },
];

export const STORY_TONES: ReadonlyArray<{
  value: StoryTone;
  label: string;
  description: string;
  sample: string;
}> = [
  {
    value: 'sinematik',
    label: 'Sinematik',
    description: 'Visual tajam, gerak adegan hidup, tempo terasa seperti film.',
    sample: 'Rintik hujan memukul kaca jendela seperti ketukan jari tak sabar. Kilat menyambar, membelah bayangan di lorong.',
  },
  {
    value: 'puitis',
    label: 'Puitis & Liris',
    description: 'Kaya metafora, nuansa atmosferik, dan kedalaman rasa.',
    sample: 'Senja meluruh di atas atap-atap genting, meninggalkan warna tembaga yang pelan-pelan ditelan angin malam.',
  },
  {
    value: 'ringan',
    label: 'Ringan & Mengalir',
    description: 'Kalimat renyah, dialog alami, hangat, dan mudah diikuti.',
    sample: 'Kopi di cangkirnya sudah hampir dingin, tapi obrolan mereka di sudut kafe itu sama sekali belum menemukan titik koma.',
  },
  {
    value: 'kelam',
    label: 'Kelam & Mencekam',
    description: 'Atmosfer tegang, penuh rahasia, bayang-bayang, dan ketidakpastian.',
    sample: 'Tidak ada langkah kaki di tangga, namun bunyi engsel yang berderit pelan cukup membuat tengkuknya menegang.',
  },
  {
    value: 'klasik',
    label: 'Klasik & Sastra',
    description: 'Bertutur tenang, berwibawa, terstruktur, dan mendalam.',
    sample: 'Pada musim kemarau tahun itu, kota pelabuhan tersebut mulai melupakan nama-nama kapal yang pernah berlabuh di dermaganya.',
  },
];

export const STORY_LENGTH_PRESETS: ReadonlyArray<{
  value: StoryLengthPreset;
  label: string;
  instruction: string;
  maxTokens: number;
}> = [
  {
    value: 'pendek',
    label: 'Ringkas (1–2 paragraf)',
    instruction: 'Tulis sekitar 1 sampai 2 paragraf yang padat, hidup, dan langsung menggerakkan adegan (sekitar 120–220 kata).',
    maxTokens: 1600,
  },
  {
    value: 'sedang',
    label: 'Sedang (3–4 paragraf)',
    instruction: 'Tulis sekitar 3 sampai 4 paragraf prosa novel yang utuh dengan keseimbangan narasi, atmosfer, dan dialog alami (sekitar 280–450 kata).',
    maxTokens: 2400,
  },
  {
    value: 'panjang',
    label: 'Panjang (Adegan Utuh)',
    instruction: 'Tulis satu potongan adegan novel yang kaya, mendetail, dan menyeluruh sekitar 5 sampai 7 paragraf (sekitar 500–800 kata).',
    maxTokens: 3600,
  },
];

export function getStoryMaxTokens(preset?: string | null): number {
  const found = STORY_LENGTH_PRESETS.find((p) => p.value === preset);
  return found?.maxTokens ?? 2400;
}
