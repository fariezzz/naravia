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

// ===================== Ekspor Kartu SillyTavern V2 =====================

export interface ExportableCharacter {
  name: string;
  tagline?: string;
  description?: string;
  personality?: string;
  speaking_style?: string;
  scenario?: string;
  greeting?: string[] | string;
  example_dialogues?: Array<{ user: string; char: string }> | string;
  tags?: string[] | string;
  creator_name?: string;
}

function toArray<T>(val: T[] | string | undefined): T[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim()) {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [];
}

export function buildSillyTavernCardV2(character: ExportableCharacter) {
  const greetings = toArray<string>(character.greeting).map((g) => String(g || '').trim()).filter(Boolean);
  const examples = toArray<{ user?: string; char?: string }>(character.example_dialogues);
  const tags = toArray<string>(character.tags).map((t) => String(t || '').trim()).filter(Boolean);

  const mesExample = examples
    .filter((d) => d?.user || d?.char)
    .map((d) => `<START>\n{{user}}: ${String(d.user || '').trim()}\n{{char}}: ${String(d.char || '').trim()}`)
    .join('\n');

  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: character.name,
      description: character.description || '',
      personality: character.personality || '',
      scenario: character.scenario || '',
      first_mes: greetings[0] || `Halo {{user}}, senang bertemu denganmu.`,
      alternate_greetings: greetings.slice(1),
      mes_example: mesExample,
      creator_notes: character.tagline || '',
      system_prompt: character.speaking_style || '',
      post_history_instructions: '',
      tags,
      creator: character.creator_name || 'Naravia',
      character_version: '1.0',
      extensions: {
        naravia: {
          tagline: character.tagline || '',
          speaking_style: character.speaking_style || '',
        },
      },
    },
  };
}

// Tabel CRC-32 standar PNG (IEEE 802.3)
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/**
 * Menghasilkan gambar PNG polos 128x128 bernuansa indigo sebagai kanvas cadangan
 * bila avatar karakter belum berformat PNG.
 */
export function createFallbackCardPng(): Buffer {
  const width = 128;
  const height = 128;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rawRows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 3 + 1);
    rawRows[rowStart] = 0; // filter None
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * 3;
      const t = (x + y) / (width + height);
      rawRows[px] = Math.round(49 + t * 50); // R
      rawRows[px + 1] = Math.round(46 + t * 56); // G
      rawRows[px + 2] = Math.round(129 + t * 90); // B
    }
  }

  const idat = zlib.deflateSync(rawRows);
  return Buffer.concat([sig, makePngChunk('IHDR', ihdr), makePngChunk('IDAT', idat), makePngChunk('IEND', Buffer.alloc(0))]);
}

/**
 * Menyematkan payload JSON SillyTavern V2 (base64) ke dalam chunk tEXt `chara` file PNG.
 */
export function embedCharacterJsonInPng(pngBuffer: Buffer, cardJson: Record<string, any>): Buffer {
  const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (pngBuffer.length < 8 || !pngBuffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Buffer bukan PNG yang valid.');
  }

  const base64Payload = Buffer.from(JSON.stringify(cardJson), 'utf8').toString('base64');
  const charaChunk = makePngChunk('tEXt', Buffer.concat([Buffer.from('chara\0', 'latin1'), Buffer.from(base64Payload, 'latin1')]));

  const chunks: Buffer[] = [PNG_SIGNATURE];
  let inserted = false;
  let offset = 8;

  while (offset + 8 <= pngBuffer.length) {
    const length = pngBuffer.readUInt32BE(offset);
    const type = pngBuffer.subarray(offset + 4, offset + 8).toString('ascii');
    const chunkTotalEnd = offset + 12 + length;
    if (chunkTotalEnd > pngBuffer.length) break;

    const rawChunk = pngBuffer.subarray(offset, chunkTotalEnd);

    // Lewati chunk chara/ccv3 lama agar tidak ganda
    if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
      const data = pngBuffer.subarray(offset + 8, offset + 8 + length);
      const nullIdx = data.indexOf(0);
      if (nullIdx !== -1) {
        const kw = data.subarray(0, nullIdx).toString('latin1').toLowerCase();
        if (kw === 'chara' || kw === 'ccv3') {
          offset = chunkTotalEnd;
          continue;
        }
      }
    }

    if (type === 'IEND' && !inserted) {
      chunks.push(charaChunk);
      inserted = true;
    }
    chunks.push(rawChunk);
    offset = chunkTotalEnd;
    if (type === 'IEND') break;
  }

  if (!inserted) {
    chunks.push(charaChunk);
    chunks.push(makePngChunk('IEND', Buffer.alloc(0)));
  }

  return Buffer.concat(chunks);
}
