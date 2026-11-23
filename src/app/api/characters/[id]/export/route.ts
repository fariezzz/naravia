import fs from 'node:fs';
import { NextRequest, NextResponse } from 'next/server';
import { resolveUploadFilePath, uploadFilenameFromUrl } from '@/lib/assets';
import { requireUser } from '@/lib/auth';
import { handleApiError, jsonError } from '@/lib/http';
import {
  buildSillyTavernCardV2,
  createFallbackCardPng,
  embedCharacterJsonInPng,
} from '@/lib/sillytavern';
import { requireVisibleCharacter } from '@/lib/store';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function safeSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'karakter'
  );
}

/**
 * Mengekspor karakter dalam format kartu SillyTavern V2 (`json` atau `png`).
 * Pemilik karakter selalu boleh mengekspor; karakter publik milik orang lain
 * hanya boleh diekspor bila pembuat mengaktifkan `allow_remix`.
 */
export async function GET(req: NextRequest, context: Ctx) {
  try {
    const user = await requireUser(req);
    const { id } = await context.params;
    const format = new URL(req.url).searchParams.get('format')?.toLowerCase() === 'png' ? 'png' : 'json';

    const character = await requireVisibleCharacter(user.id, id);
    const canExport = character.is_owner || Boolean((character as any).allow_remix);
    if (!canExport) {
      return jsonError('Pembuat karakter ini tidak mengizinkan ekspor/remix kartu karakter.', 403);
    }

    const card = buildSillyTavernCardV2({
      name: character.name,
      tagline: character.tagline,
      description: character.description,
      personality: character.personality,
      speaking_style: character.speaking_style,
      scenario: character.scenario,
      greeting: character.greeting,
      example_dialogues: character.example_dialogues,
      tags: character.tags,
      creator_name: character.creator_name,
    });

    const slug = safeSlug(character.name);

    if (format === 'json') {
      return new NextResponse(JSON.stringify(card, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${slug}-card-v2.json"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    // PNG: pakai avatar lokal bila file PNG, atau kanvas PNG cadangan bila format lain (webp/svg/kosong)
    let basePng: Buffer | null = null;
    const filename = uploadFilenameFromUrl(character.avatar);
    if (filename) {
      const fullPath = resolveUploadFilePath(filename);
      if (fullPath && fs.existsSync(fullPath)) {
        const raw = fs.readFileSync(fullPath);
        if (raw.length >= 8 && raw.subarray(0, 8).equals(PNG_SIG)) {
          basePng = raw;
        }
      }
    }
    if (!basePng) {
      basePng = createFallbackCardPng();
    }

    const pngCard = embedCharacterJsonInPng(basePng, card);
    return new NextResponse(new Uint8Array(pngCard), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="${slug}-card-v2.png"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return handleApiError(err, 'Gagal mengekspor kartu karakter.');
  }
}
