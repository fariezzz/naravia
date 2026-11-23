import { NextRequest, NextResponse } from 'next/server';
import { cleanupOrphanedUploads } from '@/lib/assets';
import { requireAdmin } from '@/lib/auth';
import { isSettingsEncryptionEnabled } from '@/lib/crypto';
import { getClientIp, handleApiError, jsonError, readJson } from '@/lib/http';
import { generateLLMResponse } from '@/lib/llm';
import { performOptionalWebSearch } from '@/lib/research';
import { maskSecret, SECRET_SETTING_KEYS, SYSTEM_SETTING_KEYS } from '@/lib/settingsKeys';
import { getSystemSettings, logAudit, updateSystemSettings } from '@/lib/store';

export const runtime = 'nodejs';

// Setelan global (provider AI, kunci API, pendaftaran, kuota bawaan). Khusus admin.
async function buildResponse() {
  const system = await getSystemSettings();
  const out: Record<string, string> = {};
  for (const key of SYSTEM_SETTING_KEYS) {
    const value = system[key] || '';
    if (SECRET_SETTING_KEYS.has(key)) {
      // Kunci API tidak pernah dikirim utuh ke browser, termasuk ke admin
      out[key] = maskSecret(value);
      out[`has_${key}`] = value.trim() ? 'true' : 'false';
    } else {
      out[key] = value;
    }
  }
  return NextResponse.json({ settings: out, encryptionEnabled: isSettingsEncryptionEnabled() });
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return buildResponse();
  } catch (err) {
    return handleApiError(err, 'Gagal memuat setelan sistem.');
  }
}

export async function PUT(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const body = await readJson(req);
    const updates: Record<string, string> = {};
    const clearKeys: string[] = Array.isArray(body.clear_keys) ? body.clear_keys.map(String) : [];

    for (const key of SYSTEM_SETTING_KEYS) {
      if (body[key] === undefined) continue;
      const val = String(body[key]).trim();
      if (SECRET_SETTING_KEYS.has(key)) {
        // Nilai bermasker atau kosong berarti "tidak diubah", kecuali diminta hapus lewat clear_keys
        if (val.includes('••••') || (val === '' && !clearKeys.includes(key))) continue;
      }
      updates[key] = val;
    }
    for (const key of clearKeys) {
      if (SECRET_SETTING_KEYS.has(key)) updates[key] = '';
    }

    if (updates.registration_mode !== undefined && !['open', 'closed'].includes(updates.registration_mode)) {
      updates.registration_mode = 'open';
    }
    if (updates.default_daily_token_budget !== undefined) {
      const n = Math.max(0, Math.round(Number(updates.default_daily_token_budget) || 0));
      updates.default_daily_token_budget = String(n);
    }
    if (updates.search_provider !== undefined && !['model', 'tavily', 'brave'].includes(updates.search_provider)) {
      updates.search_provider = 'model';
    }

    await updateSystemSettings(updates);
    await logAudit({
      userId: admin.id,
      actorEmail: admin.email,
      action: 'ubah_setelan_sistem',
      // Hanya nama kunci yang dicatat, bukan nilainya
      detail: Object.keys(updates).join(', '),
      ip: getClientIp(req),
    });
    return buildResponse();
  } catch (err) {
    return handleApiError(err, 'Gagal menyimpan setelan sistem.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const body = await readJson(req);
    const system = await getSystemSettings();

    if (body.action === 'fetch_models') {
      const rawBaseUrl = String(body.baseUrl || system.llm_base_url || '').trim().replace(/\/+$/, '');
      if (!rawBaseUrl) return jsonError('Base URL belum diisi.', 400);
      if (!/^https?:\/\//i.test(rawBaseUrl)) return jsonError('Base URL harus diawali http:// atau https://', 400);

      const rawKey =
        body.apiKey && !String(body.apiKey).includes('••••') ? String(body.apiKey).trim() : system.llm_api_key || '';

      let modelsEndpoint = rawBaseUrl;
      if (!modelsEndpoint.endsWith('/models')) {
        modelsEndpoint =
          modelsEndpoint.endsWith('/v1') || modelsEndpoint.endsWith('/openai')
            ? `${modelsEndpoint}/models`
            : `${modelsEndpoint}/v1/models`;
      }

      const headers: Record<string, string> = {};
      if (rawKey) headers.Authorization = `Bearer ${rawKey}`;
      const res = await fetch(modelsEndpoint, { headers, signal: AbortSignal.timeout(15000) });
      if (!res.ok) return jsonError(`Gagal memuat daftar model (${res.status}).`, 400);

      const data = await res.json();
      const list = Array.isArray(data?.data)
        ? data.data.map((m: { id?: string; name?: string }) => m.id || m.name).filter(Boolean)
        : Array.isArray(data?.models)
        ? data.models
            .map((m: { name?: string; id?: string }) => (m.name || m.id || '').replace(/^models\//, ''))
            .filter(Boolean)
        : [];
      return NextResponse.json({ models: list });
    }

    if (body.action === 'test_connection') {
      const res = await generateLLMResponse(
        [
          { role: 'system', content: 'Balas dengan satu kalimat singkat dalam Bahasa Indonesia.' },
          { role: 'user', content: 'Tes koneksi Naravia. Apakah kamu siap?' },
        ],
        { userId: admin.id, temperature: 0.5, maxTokens: 80, actionType: 'preview' }
      );
      return NextResponse.json({ success: true, reply: res.text, modelUsed: res.modelUsed, providerUsed: res.providerUsed });
    }

    if (body.action === 'test_search') {
      const query = String(body.query || 'Hatsune Miku karakter vocaloid').trim().slice(0, 200);
      const provider = (system.search_provider || 'model').toLowerCase();
      if (provider === 'model') {
        return NextResponse.json({
          success: true,
          provider,
          sources: [],
          info: 'Penyedia pencarian masih diatur ke "Pengetahuan Model" (tanpa web search eksternal). Pilih Tavily atau Brave dan isi API Key untuk menguji pencarian web asli.',
        });
      }
      const result = await performOptionalWebSearch(query);
      if (!result.snippets && result.sources.length === 0) {
        return jsonError(`Pencarian via ${provider} gagal atau tidak mengembalikan hasil. Periksa kembali API Key.`, 400);
      }
      return NextResponse.json({ success: true, provider, query, sources: result.sources });
    }

    // Pembersihan seluruh folder unggahan (termasuk file tanpa catatan pemilik)
    if (body.action === 'cleanup_all_assets') {
      const deletedCount = await cleanupOrphanedUploads();
      await logAudit({
        userId: admin.id,
        actorEmail: admin.email,
        action: 'bersihkan_aset_global',
        detail: `${deletedCount} file`,
        ip: getClientIp(req),
      });
      return NextResponse.json({ success: true, deletedCount });
    }

    return jsonError('Aksi tidak dikenali.', 400);
  } catch (err) {
    return handleApiError(err, 'Gagal menjalankan aksi setelan sistem.', 400);
  }
}
