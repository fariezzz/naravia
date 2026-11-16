import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { handleApiError } from '@/lib/http';
import { getSystemSettings } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Info publik minimal untuk halaman login/daftar (tanpa data sensitif)
export async function GET() {
  try {
    const [system, count] = await Promise.all([
      getSystemSettings(),
      queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM users'),
    ]);
    const hasUsers = Number(count?.cnt || 0) > 0;
    return NextResponse.json({
      registrationOpen: !hasUsers || system.registration_mode !== 'closed',
      needsFirstAdmin: !hasUsers,
    });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat konfigurasi.');
  }
}
