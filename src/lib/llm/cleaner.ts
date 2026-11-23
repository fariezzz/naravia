export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function cleanCharacterOutput(raw: string, characterName?: string): string {
  if (!raw) return '';
  let text = raw.trim();

  // 1. Bersihkan blok berpikir internal jika model menyertakannya (<think>...</think>)
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // 2. Bersihkan kebocoran sintaks internal tool call model
  text = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '').trim();
  text = text.replace(/<tool_call>|<\/tool_call>/gi, '').trim();
  text = text.replace(/<function_call>[\s\S]*?<\/function_call>/gi, '').trim();
  text = text.replace(/<function_call>|<\/function_call>/gi, '').trim();
  text = text.replace(/<call:[\s\S]*?>[\s\S]*?<\/call:[\s\S]*?>/gi, '').trim();

  // 2b. Buang metadata dan transkrip percakapan yang dikarang model.
  text = text
    .replace(/^[ \t]*\*{0,2}(attachments?|lampiran)\*{0,2}[ \t]*:[ \t]*(none|null|nil|tidak ada|-)?[ \t]*$/gim, '')
    .trim();

  const labelPattern = /^[ \t]*\*{0,2}([\p{L}][\p{L}\p{M}\p{Zs}.'’-]{0,30}?)\*{0,2}[ \t]*:[ \t]+\S/u;
  const labelOf = (line: string): string | null => {
    const m = line.match(labelPattern);
    return m ? m[1].trim().toLowerCase() : null;
  };

  const lines = text.split('\n');
  const labeledIdx = lines.map((l, i) => (labelOf(l) ? i : -1)).filter((i) => i >= 0);
  const distinctLabels = new Set(labeledIdx.map((i) => labelOf(lines[i]) as string));

  // Dua giliran berlabel dengan dua nama berbeda menandakan transkrip, bukan satu balasan
  if (labeledIdx.length >= 2 && distinctLabels.size >= 2) {
    const charLabel = (characterName || '').trim().toLowerCase();
    let start: number | undefined = labeledIdx.find((i) => labelOf(lines[i]) === charLabel);

    if (start === undefined) {
      const sebelum = lines.slice(0, labeledIdx[0]).join('\n').trim();
      if (sebelum.length > 20) {
        text = sebelum;
      } else {
        start = labeledIdx[0];
      }
    }

    if (start !== undefined) {
      const ownLabel = labelOf(lines[start]) as string;
      let end = lines.length;
      for (const i of labeledIdx) {
        if (i > start && labelOf(lines[i]) !== ownLabel) {
          end = i;
          break;
        }
      }
      text = lines
        .slice(start, end)
        .map((l) => (labelOf(l) === ownLabel ? l.replace(/^[ \t]*\*{0,2}[^:]{1,32}\*{0,2}[ \t]*:[ \t]+/, '') : l))
        .join('\n')
        .trim();
    }
  }

  // 3. Bersihkan prefix nama karakter di awal teks (misal: "Eli Ayase: ...")
  if (characterName) {
    const escaped = characterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const prefixRegex = new RegExp(`^\\*{0,2}${escaped}\\*{0,2}\\s*:\\s*`, 'i');
    text = text.replace(prefixRegex, '').trim();
  }

  // 4. Ganti em-dash (—) dan en-dash (–) menjadi tanda baca alami
  text = text.replace(/\s*—\s*/g, ' - ').replace(/—/g, ' - ');
  text = text.replace(/\s*–\s*/g, ' - ');

  // 5. Deteksi dan potong glitch token / decoding breakdown acak
  if (text.includes('====') || text.includes('----')) {
    const splitIndex = text.search(/={4,}|-{4,}/);
    if (splitIndex > 0) {
      const candidate = text.slice(0, splitIndex).trim();
      if (candidate.length > 20) {
        text = candidate;
      }
    }
  }

  const cyrillicMatch = (text.match(/[\u0400-\u04FF]/g) || []).length;
  const arabicMatch = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const thaiMatch = (text.match(/[\u0E00-\u0E7F]/g) || []).length;
  const hangulMatch = (text.match(/[\uAC00-\uD7AF]/g) || []).length;
  const cjkMatch = (text.match(/[\u4E00-\u9FFF]/g) || []).length;

  const nonLatinScriptsPresent = [
    cyrillicMatch > 3,
    arabicMatch > 3,
    thaiMatch > 3,
    hangulMatch > 3,
    cjkMatch > 5,
  ].filter(Boolean).length;

  if (nonLatinScriptsPresent >= 2) {
    const paragraphs = text
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean);
    const validLatinParagraphs = paragraphs.filter((p) => {
      const latinCount = (p.match(/[a-zA-Z]/g) || []).length;
      const totalChars = p.length;
      return totalChars > 20 && latinCount / totalChars > 0.6;
    });

    if (validLatinParagraphs.length > 0) {
      text = validLatinParagraphs.join('\n\n');
    } else {
      text = '';
    }
  }

  return text.trim();
}
