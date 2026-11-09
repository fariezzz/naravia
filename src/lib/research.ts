import { getSettingsMap } from './db';
import { generateLLMResponse } from './llm';

export interface GeneratedCharacterDraft {
  name: string;
  tagline: string;
  description: string;
  personality: string;
  speaking_style: string;
  scenario: string;
  greeting: string[];
  example_dialogues: Array<{ user: string; char: string }>;
  tags: string[];
  research_notes: {
    mode: 'existing' | 'original' | 'manual_paste';
    summary: string;
    sources: string[];
    uncertainFields: string[];
  };
}

/**
 * Mencari referensi di web jika kunci API pencarian gratis (Tavily / Brave) tersedia.
 */
async function performOptionalWebSearch(query: string): Promise<{ snippets: string; sources: string[] }> {
  const settings = getSettingsMap();
  const provider = (settings.search_provider || 'model').toLowerCase();
  const apiKey = (
    settings.search_api_key ||
    process.env.TAVILY_API_KEY ||
    process.env.BRAVE_SEARCH_API_KEY ||
    ''
  ).trim();

  if (provider === 'model' || !apiKey) {
    return { snippets: '', sources: [] };
  }

  try {
    if (provider === 'tavily' || process.env.TAVILY_API_KEY) {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query: `${query} character wiki personality background quotes`,
          search_depth: 'basic',
          max_results: 5,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const results = Array.isArray(data.results) ? data.results : [];
        const sources = results.map((r: { title?: string; url?: string }) => `${r.title || 'Sumber'}: ${r.url || ''}`).filter(Boolean);
        const snippets = results
          .map((r: { title?: string; content?: string; url?: string }) => `[${r.title}] (${r.url})\n${r.content}`)
          .join('\n\n');
        return { snippets, sources };
      }
    } else if (provider === 'brave' || process.env.BRAVE_SEARCH_API_KEY) {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
        query + ' character wiki personality'
      )}&count=5`;
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'X-Subscription-Token': apiKey,
        },
      });
      if (res.ok) {
        const data = await res.json();
        const results = data?.web?.results || [];
        const sources = results.map((r: { title?: string; url?: string }) => `${r.title || 'Sumber'}: ${r.url || ''}`).filter(Boolean);
        const snippets = results
          .map((r: { title?: string; description?: string; url?: string }) => `[${r.title}] (${r.url})\n${r.description}`)
          .join('\n\n');
        return { snippets, sources };
      }
    }
  } catch {
    // Jika pencarian eksternal gagal, lanjutkan dengan pengetahuan model secara jujur
  }

  return { snippets: '', sources: [] };
}

/**
 * Mesin Pembuatan Karakter Otomatis (Bagian 11 Rencana Aplikasi):
 * 1. Menerima ide singkat (1-2 kalimat) dan opsional teks riset tempel manual.
 * 2. Menentukan apakah tokoh sudah ada (existing) atau orisinal (original).
 * 3. Melakukan riset (pengetahuan model / web search / teks tempel) dan menyusun seluruh kartu karakter.
 */
export async function generateCharacterFromIdea(params: {
  idea: string;
  manualResearchText?: string;
  characterTypeHint?: 'auto' | 'existing' | 'original';
}): Promise<GeneratedCharacterDraft> {
  const idea = params.idea.trim();
  const manualText = (params.manualResearchText || '').trim();

  if (!idea) {
    throw new Error('Tuliskan minimal satu kalimat ide karakter terlebih dahulu.');
  }

  let webSearchContext = '';
  let externalSources: string[] = [];

  if (!manualText && params.characterTypeHint !== 'original') {
    const searchRes = await performOptionalWebSearch(idea);
    webSearchContext = searchRes.snippets;
    externalSources = searchRes.sources;
  }

  const systemInstruction = `Kamu adalah perancang karakter roleplay profesional untuk aplikasi Naravia.
Tugasmu adalah meriset (jika karakter berasal dari karya fiksi/sejarah yang sudah ada) atau mengembangkan (jika karakter orisinal) berdasarkan ide singkat pengguna, kemudian menghasilkan JSON kartu karakter yang utuh, hidup, dan konsisten dalam Bahasa Indonesia.

ATURAN RISET & KEJUJURAN (SANGAT PENTING):
1. Tentukan dulu apakah ide merujuk pada tokoh yang sudah ada (anime, game, novel, film, sejarah) atau tokoh orisinal.
2. Jika tokoh sudah ada namun beberapa detail spesifik meragukan atau berasal dari ingatan model tanpa teks referensi langsung, cantumkan nama field tersebut di dalam array "uncertainFields" agar pengguna memeriksanya. Jangan mengarang fakta kanon palsu dengan klaim pasti.
3. Jika tokoh orisinal, kembangkan kepribadian, gaya bicara, dan skenario secara kreatif, utuh, dan logis tanpa mengarang sumber eksternal palsu.
4. Buat minimal 2 sapaan awal (greeting) yang berbeda situasi pembukanya agar pengguna bisa memilih saat mulai chat.
5. Buat 3 pasang contoh dialog (example_dialogues) yang benar-benar memamerkan ciri khas gaya bicara karakter tersebut.

FORMAT KELUARAN:
Kembalikan HANYA objek JSON valid (tanpa markdown code block di luar JSON jika memungkinkan) dengan struktur persis berikut:
{
  "name": "Nama karakter",
  "tagline": "Satu kalimat pengenal yang kuat dan spesifik",
  "description": "Deskripsi siapa karakter ini, latar belakang, dan perannya (2-4 kalimat)",
  "personality": "Sifat-sifat utama karakter yang memengaruhi perilakunya",
  "speaking_style": "Cara berbicara, pilihan kata, kata ganti (aku/saya/gue), dan gestur khas",
  "scenario": "Situasi awal dan latar tempat ketika percakapan dimulai",
  "greeting": [
    "Sapaan awal 1 (1-2 paragraf berisi suasana/tindakan dan kalimat pembuka karakter)",
    "Sapaan awal 2 (alternatif situasi pembuka yang berbeda)"
  ],
  "example_dialogues": [
    { "user": "Contoh ucapan pengguna 1", "char": "Contoh jawaban khas karakter 1" },
    { "user": "Contoh ucapan pengguna 2", "char": "Contoh jawaban khas karakter 2" },
    { "user": "Contoh ucapan pengguna 3", "char": "Contoh jawaban khas karakter 3" }
  ],
  "tags": ["Tag1", "Tag2", "Tag3"],
  "research_notes": {
    "mode": "existing | original | manual_paste",
    "summary": "Ringkasan poin hasil riset atau dasar pengembangan karakter",
    "sources": ["Daftar referensi karya/wiki/sumber pengetahuan"],
    "uncertainFields": ["Daftar field yang perlu diperiksa ulang oleh pengguna jika ada"]
  }
}`;

  const userPromptParts: string[] = [`IDE KARAKTER DARI PENGGUNA:\n"${idea}"`];
  if (params.characterTypeHint && params.characterTypeHint !== 'auto') {
    userPromptParts.push(
      `PETUNJUK JENIS KARAKTER: ${
        params.characterTypeHint === 'existing' ? 'Tokoh yang sudah ada (lakukan riset kanon)' : 'Karakter Orisinal'
      }`
    );
  }
  if (manualText) {
    userPromptParts.push(`TEKS RISET / REFERENSI TEMPEL MANUAL DARI PENGGUNA:\n${manualText.slice(0, 12000)}`);
  } else if (webSearchContext) {
    userPromptParts.push(`HASIL PENCARIAN WEB PENDUKUNG:\n${webSearchContext.slice(0, 8000)}`);
  }

  const llmRes = await generateLLMResponse(
    [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: userPromptParts.join('\n\n') },
    ],
    {
      temperature: 0.75,
      maxTokens: 4096,
      actionType: 'generate',
      jsonMode: true,
    }
  );

  const parsed = extractJsonObject(llmRes.text);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Gagal mengurai hasil pembuatan karakter otomatis dari model. Silakan coba kembali.');
  }

  const mode: 'existing' | 'original' | 'manual_paste' = manualText
    ? 'manual_paste'
    : parsed.research_notes?.mode === 'existing' || params.characterTypeHint === 'existing'
    ? 'existing'
    : 'original';

  const rawSources = Array.isArray(parsed.research_notes?.sources) ? parsed.research_notes.sources : [];
  const mergedSources = Array.from(new Set([...externalSources, ...rawSources])).filter(Boolean);
  if (mergedSources.length === 0) {
    mergedSources.push(
      mode === 'existing'
        ? 'Pengetahuan Model (Periksa kembali detail spesifik tokoh)'
        : mode === 'manual_paste'
        ? 'Teks Referensi Manual Pengguna'
        : 'Pengembangan Karakter Orisinal'
    );
  }

  const uncertainFields: string[] = Array.isArray(parsed.research_notes?.uncertainFields)
    ? parsed.research_notes.uncertainFields.map(String)
    : mode === 'existing' && externalSources.length === 0 && !manualText
    ? ['description', 'scenario']
    : [];

  return {
    name: String(parsed.name || 'Karakter Baru').trim(),
    tagline: String(parsed.tagline || '').trim(),
    description: String(parsed.description || '').trim(),
    personality: String(parsed.personality || '').trim(),
    speaking_style: String(parsed.speaking_style || '').trim(),
    scenario: String(parsed.scenario || '').trim(),
    greeting: Array.isArray(parsed.greeting) && parsed.greeting.length > 0
      ? parsed.greeting.map((g: unknown) => String(g || '').trim()).filter(Boolean)
      : ['Halo! Senang akhirnya bisa mengobrol denganmu.'],
    example_dialogues: Array.isArray(parsed.example_dialogues)
      ? parsed.example_dialogues
          .map((d: { user?: unknown; char?: unknown }) => ({
            user: String(d?.user || '').trim(),
            char: String(d?.char || '').trim(),
          }))
          .filter((d: { user: string; char: string }) => d.user || d.char)
      : [],
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.map((t: unknown) => String(t || '').trim()).filter(Boolean)
      : ['Karakter'],
    research_notes: {
      mode,
      summary: String(
        parsed.research_notes?.summary ||
          (mode === 'existing'
            ? 'Disusun berdasarkan pengetahuan karakter kanon. Tinjau kembali field yang ditandai sebelum menyimpan.'
            : 'Dikembangkan secara otomatis dari ide singkat pengguna.')
      ).trim(),
      sources: mergedSources,
      uncertainFields,
    },
  };
}

function extractJsonObject(text: string): Record<string, any> | null {
  if (!text) return null;
  // Bersihkan pagar markdown ```json ... ``` jika model menyertakannya
  let cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const tryParse = (candidate: string): Record<string, any> | null => {
    try {
      return JSON.parse(candidate);
    } catch {
      // Hapus trailing comma sebelum } atau ] yang sering dihasilkan LLM
      const withoutTrailingCommas = candidate.replace(/,\s*([}\]])/g, '$1');
      try {
        return JSON.parse(withoutTrailingCommas);
      } catch {
        return null;
      }
    }
  };

  const direct = tryParse(cleaned);
  if (direct && typeof direct === 'object') return direct;

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const sub = cleaned.slice(firstBrace, lastBrace + 1);
    const subParsed = tryParse(sub);
    if (subParsed && typeof subParsed === 'object') return subParsed;
  }

  // Fallback ekstraksi per-field dengan regex jika respons JSON terpotong di tengah jalan (truncated)
  if (firstBrace !== -1) {
    const partial = cleaned.slice(firstBrace);
    const extractStr = (key: string) => {
      const m = partial.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
      if (!m) return '';
      try {
        return JSON.parse(`"${m[1]}"`);
      } catch {
        return m[1];
      }
    };

    const name = extractStr('name');
    const description = extractStr('description');
    if (name && description) {
      return {
        name,
        tagline: extractStr('tagline'),
        description,
        personality: extractStr('personality'),
        speaking_style: extractStr('speaking_style'),
        scenario: extractStr('scenario'),
        greeting: [extractStr('greeting') || `Halo, aku ${name}.`].filter(Boolean),
        example_dialogues: [],
        tags: ['Karakter'],
        research_notes: {
          mode: 'original',
          summary: extractStr('summary') || 'Disusun dari ide singkat pengguna.',
          sources: [],
          uncertainFields: [],
        },
      };
    }
  }

  return null;
}
