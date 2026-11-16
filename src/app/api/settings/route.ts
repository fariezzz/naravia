import { NextRequest, NextResponse } from 'next/server';
import { cleanupOrphanedUploads } from '@/lib/assets';
import { requireUser } from '@/lib/auth';
import { withTransaction } from '@/lib/db';
import { getClientIp, handleApiError, jsonError, readJson } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rateLimit';
import { USER_SETTING_DEFAULTS } from '@/lib/settingsKeys';
import {
  getEffectiveDailyBudget,
  getTodayTokenUsage,
  getUserSettings,
  logAudit,
  updateUserSettings,
} from '@/lib/store';

export const runtime = 'nodejs';

// Setelan pribadi pengguna (parameter percakapan). Setelan provider AI dikelola admin di /api/admin/settings.
function clampNumber(raw: unknown, min: number, max: number, fallback: string): string {
  const n = Number(raw);
  if (raw === '' || raw === null || raw === undefined || !Number.isFinite(n)) return fallback;
  return String(Math.min(max, Math.max(min, n)));
}

function clampInt(raw: unknown, min: number, max: number, fallback: string): string {
  return String(Math.round(Number(clampNumber(raw, min, max, fallback))));
}

function sanitizeUserSettings(body: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  if (body.temperature !== undefined) {
    out.temperature = clampNumber(body.temperature, 0, 2, USER_SETTING_DEFAULTS.temperature);
  }
  if (body.max_tokens !== undefined) {
    out.max_tokens = clampInt(body.max_tokens, 64, 8192, USER_SETTING_DEFAULTS.max_tokens);
  }
  if (body.history_limit !== undefined) {
    out.history_limit = clampInt(body.history_limit, 4, 100, USER_SETTING_DEFAULTS.history_limit);
  }
  if (body.auto_summarize_threshold !== undefined) {
    out.auto_summarize_threshold = clampInt(
      body.auto_summarize_threshold,
      16,
      500,
      USER_SETTING_DEFAULTS.auto_summarize_threshold
    );
  }
  if (body.default_reply_style !== undefined) {
    const style = String(body.default_reply_style);
    out.default_reply_style = ['pendek', 'sedang', 'panjang'].includes(style) ? style : 'sedang';
  }
  if (body.auto_extract_memory !== undefined) {
    out.auto_extract_memory = String(body.auto_extract_memory) === 'true' ? 'true' : 'false';
  }
  return out;
}

async function buildResponse(userId: string) {
  const [settings, budget, usage] = await Promise.all([
    getUserSettings(userId),
    getEffectiveDailyBudget(userId),
    getTodayTokenUsage(userId),
  ]);
  return NextResponse.json({
    settings,
    quota: {
      daily_budget: budget,
      today_used: usage.used,
      remaining: budget > 0 ? Math.max(0, budget - usage.used) : null,
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    return buildResponse(user.id);
  } catch (err) {
    return handleApiError(err, 'Gagal memuat pengaturan.');
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await readJson(req);
    await updateUserSettings(user.id, sanitizeUserSettings(body));
    return buildResponse(user.id);
  } catch (err) {
    return handleApiError(err, 'Gagal menyimpan pengaturan.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await readJson(req);

    // Hapus seluruh data milik akun ini saja. Riwayat token tetap disimpan agar kuota harian tidak bisa direset.
    if (body.action === 'reset_all') {
      enforceRateLimit(`reset-all:${user.id}`, 3, 60 * 60_000);
      await withTransaction(async (client) => {
        await client.query('DELETE FROM group_chats WHERE user_id = $1', [user.id]);
        await client.query('DELETE FROM chats WHERE user_id = $1', [user.id]);
        await client.query('DELETE FROM memories WHERE user_id = $1', [user.id]);
        await client.query('DELETE FROM characters WHERE user_id = $1', [user.id]);
        await client.query('DELETE FROM worlds WHERE user_id = $1', [user.id]);
      });
      const deletedFiles = await cleanupOrphanedUploads(user.id);
      await logAudit({
        userId: user.id,
        actorEmail: user.email,
        action: 'hapus_semua_data',
        detail: `${deletedFiles} file dibersihkan`,
        ip: getClientIp(req),
      });
      return NextResponse.json({ success: true });
    }

    if (body.action === 'cleanup_assets') {
      const deletedCount = await cleanupOrphanedUploads(user.id);
      return NextResponse.json({ success: true, deletedCount });
    }

    return jsonError('Aksi tidak dikenali.', 400);
  } catch (err) {
    return handleApiError(err, 'Gagal menjalankan aksi pengaturan.', 400);
  }
}
