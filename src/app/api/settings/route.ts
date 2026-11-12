import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { getDb, getSettingsMap, updateSettingsMap } from '@/lib/db';
import { generateLLMResponse } from '@/lib/llm';
import { cleanupOrphanedUploads } from '@/lib/assets';

export async function GET() {
  try {
    const settings = getSettingsMap();
    const rawKey =
      settings.llm_api_key ||
      settings.google_api_key ||
      process.env.LLM_API_KEY ||
      process.env.GOOGLE_AI_STUDIO_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      '';
    const hasKey = Boolean(rawKey.trim());

    const resolvedBaseUrl =
      settings.llm_base_url ||
      process.env.LLM_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      'https://generativelanguage.googleapis.com/v1beta';

    return NextResponse.json({
      settings: {
        ...settings,
        llm_base_url: resolvedBaseUrl,
        has_api_key: hasKey ? 'true' : 'false',
        llm_api_key_masked: hasKey ? maskKey(rawKey) : '',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memuat pengaturan.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function maskKey(k: string): string {
  const trimmed = k.trim();
  if (trimmed.length <= 8) return '••••••••';
  return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`;
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const allowedKeys = [
      'provider',
      'llm_base_url',
      'llm_api_key',
      'model',
      'google_api_key',
      'ollama_base_url',
      'ollama_model',
      'ollama_api_key',
      'temperature',
      'max_tokens',
      'default_reply_style',
      'history_limit',
      'auto_summarize_threshold',
      'auto_extract_memory',
      'daily_token_budget',
      'search_provider',
      'search_api_key',
    ];

    const updates: Record<string, string> = {};
    const keyFields = new Set(['llm_api_key', 'google_api_key', 'search_api_key', 'ollama_api_key']);

    for (const key of allowedKeys) {
      if (body[key] !== undefined) {
        const val = String(body[key]).trim();
        if (keyFields.has(key)) {
          // Jangan timpa kunci API yang sudah tersimpan jika kolom dikirim kosong atau masih bermasker (kecuali user eksplisit meminta hapus dengan clear_api_key)
          if (val.includes('••••') || (val === '' && !body.clear_api_key)) {
            continue;
          }
        }
        updates[key] = val;
      }
    }

    if (updates.temperature !== undefined && (!updates.temperature || isNaN(Number(updates.temperature)))) {
      updates.temperature = '0.9';
    }
    if (updates.max_tokens !== undefined && (!updates.max_tokens || isNaN(Number(updates.max_tokens)))) {
      updates.max_tokens = '1024';
    }
    if (updates.history_limit !== undefined && (!updates.history_limit || isNaN(Number(updates.history_limit)))) {
      updates.history_limit = '20';
    }

    // Jaga sinkronisasi backward-compatibility hanya jika llm_api_key benar-benar diubah
    if (updates.llm_api_key !== undefined) {
      updates.google_api_key = updates.llm_api_key;
    }

    updateSettingsMap(updates);

    if (updates.llm_base_url !== undefined) {
      syncEnvLocalKey('LLM_BASE_URL', updates.llm_base_url);
      process.env.LLM_BASE_URL = updates.llm_base_url;
    }
    if (updates.llm_api_key !== undefined) {
      syncEnvLocalKey('LLM_API_KEY', updates.llm_api_key);
      syncEnvLocalKey('GOOGLE_AI_STUDIO_API_KEY', updates.llm_api_key);
      process.env.LLM_API_KEY = updates.llm_api_key;
      process.env.GOOGLE_AI_STUDIO_API_KEY = updates.llm_api_key;
    }
    if (updates.model !== undefined) {
      syncEnvLocalKey('LLM_MODEL', updates.model);
      process.env.LLM_MODEL = updates.model;
    }

    const latest = getSettingsMap();
    const rawKey =
      latest.llm_api_key ||
      latest.google_api_key ||
      process.env.LLM_API_KEY ||
      process.env.GOOGLE_AI_STUDIO_API_KEY ||
      '';
    const hasKey = Boolean(rawKey.trim());

    return NextResponse.json({
      settings: {
        ...latest,
        has_api_key: hasKey ? 'true' : 'false',
        llm_api_key_masked: hasKey ? maskKey(rawKey) : '',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === 'fetch_models') {
      const currentSettings = getSettingsMap();
      const rawBaseUrl = String(
        body.baseUrl ||
          currentSettings.llm_base_url ||
          process.env.LLM_BASE_URL ||
          ''
      )
        .trim()
        .replace(/\/+$/, '');

      if (!rawBaseUrl) {
        return NextResponse.json({ error: 'Base URL belum diisi.' }, { status: 400 });
      }

      const rawKey =
        body.apiKey && !String(body.apiKey).includes('••••')
          ? String(body.apiKey).trim()
          : currentSettings.llm_api_key ||
            currentSettings.google_api_key ||
            process.env.LLM_API_KEY ||
            process.env.GOOGLE_AI_STUDIO_API_KEY ||
            '';

      let modelsEndpoint = rawBaseUrl;
      if (!modelsEndpoint.endsWith('/models')) {
        if (modelsEndpoint.endsWith('/v1') || modelsEndpoint.endsWith('/openai')) {
          modelsEndpoint = `${modelsEndpoint}/models`;
        } else {
          modelsEndpoint = `${modelsEndpoint}/v1/models`;
        }
      }

      const headers: Record<string, string> = {};
      if (rawKey) headers['Authorization'] = `Bearer ${rawKey}`;

      const res = await fetch(modelsEndpoint, { headers });
      if (!res.ok) {
        return NextResponse.json(
          { error: `Gagal memuat daftar model dari ${modelsEndpoint} (${res.status}).` },
          { status: 400 }
        );
      }

      const data = await res.json();
      const list = Array.isArray(data?.data)
        ? data.data.map((m: { id?: string; name?: string }) => m.id || m.name).filter(Boolean)
        : Array.isArray(data?.models)
        ? data.models.map((m: { name?: string; id?: string }) => (m.name || m.id || '').replace(/^models\//, '')).filter(Boolean)
        : [];

      return NextResponse.json({ models: list });
    }

    if (body.action === 'test_connection') {
      const res = await generateLLMResponse(
        [
          { role: 'system', content: 'Balas dengan satu kalimat singkat dalam Bahasa Indonesia.' },
          { role: 'user', content: 'Tes koneksi Naravia. Apakah kamu siap?' },
        ],
        {
          temperature: 0.5,
          maxTokens: 80,
          actionType: 'preview',
        }
      );

      return NextResponse.json({
        success: true,
        reply: res.text,
        modelUsed: res.modelUsed,
        providerUsed: res.providerUsed,
      });
    }

    if (body.action === 'reset_all') {
      const db = getDb();
      db.exec(`
        DELETE FROM messages;
        DELETE FROM chats;
        DELETE FROM group_messages;
        DELETE FROM group_chat_members;
        DELETE FROM group_chats;
        DELETE FROM memories;
        DELETE FROM lore_entries;
        DELETE FROM worlds;
        DELETE FROM characters;
        DELETE FROM token_usage;
      `);
      // Bersihkan seluruh file upload yang tidak lagi terikat ke entitas database aktif
      cleanupOrphanedUploads();
      return NextResponse.json({ success: true });
    }

    if (body.action === 'cleanup_assets') {
      const deletedCount = cleanupOrphanedUploads();
      return NextResponse.json({ success: true, deletedCount });
    }

    return NextResponse.json({ error: 'Aksi tidak dikenali.' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal menjalankan aksi pengaturan.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function syncEnvLocalKey(key: string, value: string) {
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    let content = '';
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf8');
    }
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content = `${content.trim()}\n${key}=${value}\n`.trimStart();
    }
    fs.writeFileSync(envPath, content, 'utf8');
  } catch {
    // Abaikan jika gagal menulis .env.local
  }
}
