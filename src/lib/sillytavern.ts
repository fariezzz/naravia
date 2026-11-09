import zlib from 'node:zlib';

export interface ImportedCharacterCard {
  name: string;
  tagline: string;
  description: string;
  personality: string;
  speaking_style: string;
  scenario: string;
  greeting: string[];
  example_dialogues: Array<{ user: string; char: string }>;
  tags: string[];
  research_notes: string;
}

/**
 * Mengurai blok contoh dialog format SillyTavern (<START>\n{{user}}: ...\n{{char}}: ...)
 */
export function parseSillyTavernMesExample(
  mesExample: string,
  charName: string,
  userName: string
): Array<{ user: string; char: string }> {
  if (!mesExample || !mesExample.trim()) return [];
  const replaced = replacePlaceholdersRaw(mesExample, charName, userName);
  const lines = replaced.split(/\r?\n/);

  const pairs: Array<{ user: string; char: string }> = [];
  let currentUser = '';
  let currentChar = '';

  const flushPair = () => {
    if (currentUser || currentChar) {
      pairs.push({ user: currentUser.trim(), char: currentChar.trim() });
      currentUser = '';
      currentChar = '';
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line === '<START>') {
      flushPair();
      continue;
    }

    const userPrefixRegex = new RegExp(`^(?:${escapeRegExp(userName)}|user|kamu|you)\\s*:\\s*(.*)$`, 'i');
    const charPrefixRegex = new RegExp(`^(?:${escapeRegExp(charName)}|char|character)\\s*:\\s*(.*)$`, 'i');

    const userMatch = line.match(userPrefixRegex);
    if (userMatch) {
      if (currentChar) flushPair();
      currentUser = userMatch[1];
      continue;
    }

    const charMatch = line.match(charPrefixRegex);
    if (charMatch) {
      currentChar = charMatch[1];
      flushPair();
      continue;
    }

    if (currentChar) {
      currentChar += `\n${line}`;
    } else if (currentUser) {
      currentUser += `\n${line}`;
    }
  }

  flushPair();
  return pairs.slice(0, 6);
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function replacePlaceholdersRaw(text: string, charName: string, userName: string): string {
  if (!text) return '';
  return text
    .replace(/\{\{char\}\}/gi, charName)
    .replace(/\{\{user\}\}/gi, userName)
    .replace(/<BOT>/gi, charName)
    .replace(/<USER>/gi, userName);
}

/**
 * Memetakan objek JSON kartu SillyTavern (V1 / V2 chara_card_v2) atau JSON Naravia ke struktur Naravia
 */
export function mapCardJsonToNaravia(rawJson: Record<string, any>, userName = 'Kamu'): ImportedCharacterCard {
  const data = rawJson?.data && typeof rawJson.data === 'object' ? rawJson.data : rawJson;
  const charName = String(data.name || rawJson.name || 'Karakter Impor').trim();

  const description = replacePlaceholdersRaw(String(data.description || ''), charName, userName).trim();
  const personality = replacePlaceholdersRaw(String(data.personality || ''), charName, userName).trim();
  const scenario = replacePlaceholdersRaw(String(data.scenario || ''), charName, userName).trim();
  const speakingStyle = replacePlaceholdersRaw(
    String(data.speaking_style || data.system_prompt || data.post_history_instructions || ''),
    charName,
    userName
  ).trim();

  const taglineRaw = String(data.tagline || data.creator_notes || '').trim();
  const tagline = taglineRaw
    ? replacePlaceholdersRaw(taglineRaw.split(/\r?\n/)[0].slice(0, 140), charName, userName)
    : description.split('.')[0]?.slice(0, 120) || `Karakter impor (${charName})`;

  const greetings: string[] = [];
  if (Array.isArray(data.greeting)) {
    for (const g of data.greeting) {
      const cleaned = replacePlaceholdersRaw(String(g || ''), charName, userName).trim();
      if (cleaned) greetings.push(cleaned);
    }
  }
  if (data.first_mes) {
    const first = replacePlaceholdersRaw(String(data.first_mes), charName, userName).trim();
    if (first && !greetings.includes(first)) greetings.push(first);
  }
  if (Array.isArray(data.alternate_greetings)) {
    for (const alt of data.alternate_greetings) {
      const cleaned = replacePlaceholdersRaw(String(alt || ''), charName, userName).trim();
      if (cleaned && !greetings.includes(cleaned)) greetings.push(cleaned);
    }
  }
  if (greetings.length === 0) {
    greetings.push(`Halo ${userName}, senang bertemu denganmu.`);
  }

  let exampleDialogues: Array<{ user: string; char: string }> = [];
  if (Array.isArray(data.example_dialogues)) {
    exampleDialogues = data.example_dialogues
      .map((d: any) => ({
        user: replacePlaceholdersRaw(String(d?.user || ''), charName, userName).trim(),
        char: replacePlaceholdersRaw(String(d?.char || ''), charName, userName).trim(),
      }))
      .filter((d: { user: string; char: string }) => d.user || d.char);
  } else if (typeof data.mes_example === 'string') {
    exampleDialogues = parseSillyTavernMesExample(data.mes_example, charName, userName);
  }

  const tags: string[] = Array.isArray(data.tags)
    ? data.tags.map((t: unknown) => String(t || '').trim()).filter(Boolean)
    : ['Impor SillyTavern'];

  return {
    name: charName,
    tagline,
    description,
    personality,
    speaking_style: speakingStyle || 'Mengikuti kepribadian dan contoh dialog karakter.',
    scenario,
    greeting: greetings,
    example_dialogues: exampleDialogues,
    tags,
    research_notes: JSON.stringify({
      mode: 'import',
      summary: 'Diimpor dari kartu karakter format standar (SillyTavern / Character Card V2). Placeholder {{char}} dan {{user}} telah disesuaikan.',
      sources: [data.creator ? `Kreator Kartu: ${data.creator}` : 'Impor File Kartu Karakter'],
      uncertainFields: [],
    }),
  };
}

/**
 * Mengekstrak metadata JSON karakter dari chunk tEXt / iTXt / zTXt pada file PNG SillyTavern
 */
export function extractCharacterJsonFromPng(buffer: Buffer): Record<string, any> {
  const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('File yang diunggah bukan gambar PNG yang valid.');
  }

  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (dataEnd > buffer.length) break;
    const chunkData = buffer.subarray(dataStart, dataEnd);

    if (type === 'tEXt') {
      const nullIndex = chunkData.indexOf(0);
      if (nullIndex !== -1) {
        const keyword = chunkData.subarray(0, nullIndex).toString('latin1').toLowerCase();
        const textVal = chunkData.subarray(nullIndex + 1).toString('latin1');
        if (keyword === 'chara' || keyword === 'ccv3') {
          const decoded = Buffer.from(textVal, 'base64').toString('utf8');
          return JSON.parse(decoded);
        }
      }
    } else if (type === 'zTXt') {
      const nullIndex = chunkData.indexOf(0);
      if (nullIndex !== -1) {
        const keyword = chunkData.subarray(0, nullIndex).toString('latin1').toLowerCase();
        if (keyword === 'chara' || keyword === 'ccv3') {
          const compressed = chunkData.subarray(nullIndex + 2);
          const inflated = zlib.inflateSync(compressed).toString('utf8');
          const decoded = Buffer.from(inflated, 'base64').toString('utf8');
          return JSON.parse(decoded);
        }
      }
    } else if (type === 'iTXt') {
      const nullIndex = chunkData.indexOf(0);
      if (nullIndex !== -1) {
        const keyword = chunkData.subarray(0, nullIndex).toString('utf8').toLowerCase();
        if (keyword === 'chara' || keyword === 'ccv3') {
          const rest = chunkData.subarray(nullIndex + 3);
          const lastNull = rest.lastIndexOf(0);
          const textVal = (lastNull !== -1 ? rest.subarray(lastNull + 1) : rest).toString('utf8');
          const decoded = Buffer.from(textVal.trim(), 'base64').toString('utf8');
          return JSON.parse(decoded);
        }
      }
    }

    if (type === 'IEND') break;
    offset = dataEnd + 4; // Lewati CRC 4 byte
  }

  throw new Error('Gambar PNG ini tidak mengandung metadata kartu karakter SillyTavern (chunk "chara" tidak ditemukan).');
}
