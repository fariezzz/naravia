import fs from 'node:fs';
import { NextResponse } from 'next/server';
import { getDb, getDbPath } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    // Pastikan WAL sudah di-checkpoint ke file database utama sebelum diunduh
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');

    const dbPath = getDbPath();
    if (!fs.existsSync(dbPath)) {
      return NextResponse.json({ error: 'File database tidak ditemukan.' }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(dbPath);
    const dateStr = new Date().toISOString().slice(0, 10);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.sqlite3',
        'Content-Disposition': `attachment; filename="naravia-backup-${dateStr}.db"`,
        'Content-Length': String(fileBuffer.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal mengunduh cadangan database.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
