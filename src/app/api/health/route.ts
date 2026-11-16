import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Dipakai healthcheck Docker; tidak membutuhkan login dan tidak mengembalikan data apa pun
export async function GET() {
  try {
    await queryOne('SELECT 1');
    return NextResponse.json({ status: 'ok' });
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 503 });
  }
}
