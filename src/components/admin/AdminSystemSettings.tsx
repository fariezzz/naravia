'use client';

import React, { useEffect, useState } from 'react';
import { Save, Search, Trash2, Zap } from 'lucide-react';
import { PROVIDER_PRESETS } from './providerPresets';
import {
  Alerts,
  apiJson,
  cardClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from './ui';

type Settings = Record<string, string>;

const SECRET_KEYS = [
  'llm_api_key',
  'fallback_llm_api_key',
  'research_llm_api_key',
  'embedding_api_key',
  'search_api_key',
];

export default function AdminSystemSettings() {
  const [settings, setSettings] = useState<Settings>({});
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  // Kunci API hanya dikirim jika admin mengetik nilai baru
  const [secrets, setSecrets] = useState<Settings>({});
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const applyResponse = (data: { settings: Settings; encryptionEnabled?: boolean }) => {
    setSettings(data.settings);
    if (typeof data.encryptionEnabled === 'boolean') setEncryptionEnabled(data.encryptionEnabled);
    setSecrets({});
  };

  useEffect(() => {
    apiJson<{ settings: Settings }>('/api/admin/settings')
      .then(applyResponse)
      .catch((err) => setError(err instanceof Error ? err.message : 'Gagal memuat setelan sistem.'))
      .finally(() => setLoading(false));
  }, []);

  const set = (key: string, value: string) => setSettings((s) => ({ ...s, [key]: value }));

  const buildPayload = () => {
    const payload: Settings = { ...settings };
    for (const key of SECRET_KEYS) {
      delete payload[key];
      delete payload[`has_${key}`];
      if (secrets[key]) payload[key] = secrets[key];
    }
    return payload;
  };

  const run = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      const message = await fn();
      if (message) setNotice(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Permintaan gagal.');
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const data = await apiJson<{ settings: Settings }>('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(buildPayload()),
    });
    applyResponse(data);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    run('save', async () => {
      await save();
      return 'Setelan sistem tersimpan dan berlaku untuk seluruh pengguna.';
    });
  };

  const handleClearSecret = (key: string) =>
    run(`clear-${key}`, async () => {
      const data = await apiJson<{ settings: Settings }>('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ clear_keys: [key] }),
      });
      applyResponse(data);
      return 'Kunci API dihapus.';
    });

  const handleFetchModels = () =>
    run('models', async () => {
      const data = await apiJson<{ models: string[] }>('/api/admin/settings', {
        method: 'POST',
        body: JSON.stringify({ action: 'fetch_models', baseUrl: settings.llm_base_url, apiKey: secrets.llm_api_key || '' }),
      });
      setModels(data.models || []);
      return `Berhasil memuat ${data.models?.length || 0} model.`;
    });

  const handleTestConnection = () =>
    run('test', async () => {
      await save();
      const data = await apiJson<{ reply: string; modelUsed: string }>('/api/admin/settings', {
        method: 'POST',
        body: JSON.stringify({ action: 'test_connection' }),
      });
      return `Koneksi berhasil (${data.modelUsed}): "${data.reply}"`;
    });

  const handleTestSearch = () =>
    run('search', async () => {
      await save();
      const data = await apiJson<{ info?: string; provider: string; sources: string[] }>('/api/admin/settings', {
        method: 'POST',
        body: JSON.stringify({ action: 'test_search' }),
      });
      if (data.info) return data.info;
      return `Pencarian via ${data.provider} berhasil. ${data.sources.length} sumber ditemukan: ${data.sources.slice(0, 3).join(' | ')}`;
    });

  const handleCleanupAll = () =>
    run('cleanup', async () => {
      const data = await apiJson<{ deletedCount: number }>('/api/admin/settings', {
        method: 'POST',
        body: JSON.stringify({ action: 'cleanup_all_assets' }),
      });
      return `${data.deletedCount} file unggahan yatim dihapus dari server.`;
    });

  if (loading) return <p className="text-xs text-slate-400">Memuat setelan sistem...</p>;

  const secretInput = (key: string, label: string, placeholder: string, disabled = false) => (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className={labelClass.replace(' mb-1', '')}>{label}</label>
        {settings[`has_${key}`] === 'true' && (
          <button
            type="button"
            onClick={() => handleClearSecret(key)}
            disabled={busy !== null}
            className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline"
          >
            Hapus Kunci
          </button>
        )}
      </div>
      <input
        type="password"
        autoComplete="off"
        disabled={disabled}
        value={secrets[key] || ''}
        onChange={(e) => setSecrets((s) => ({ ...s, [key]: e.target.value }))}
        placeholder={settings[`has_${key}`] === 'true' ? `Tersimpan: ${settings[key]} (isi untuk mengganti)` : placeholder}
        className={inputClass}
      />
    </div>
  );

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <Alerts error={error} notice={notice} />

      <section className={`${cardClass} p-5 space-y-4`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Provider Model Chat</h2>
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                  encryptionEnabled
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                }`}
                title={
                  encryptionEnabled
                    ? 'API key di database terenkripsi AES-256-GCM.'
                    : 'Atur SETTINGS_ENCRYPTION_KEY di environment untuk mengenkripsi API key di database.'
                }
              >
                {encryptionEnabled ? 'Kunci Terenkripsi AES-256' : 'Enkripsi DB Nonaktif'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Dipakai oleh seluruh pengguna. Kunci API tidak pernah ditampilkan utuh di browser.
            </p>
          </div>
          <button type="button" onClick={handleTestConnection} disabled={busy !== null} className={secondaryButtonClass}>
            <Zap className="w-3.5 h-3.5" />
            <span>{busy === 'test' ? 'Menguji...' : 'Tes Koneksi AI'}</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {PROVIDER_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setSettings((s) => ({ ...s, provider: p.provider, llm_base_url: p.baseUrl, model: p.defaultModel }))}
              className="h-7 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-[11px] font-medium text-slate-700 dark:text-slate-300"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className={labelClass}>Base URL Endpoint</label>
            <input value={settings.llm_base_url || ''} onChange={(e) => set('llm_base_url', e.target.value)} className={`${inputClass} font-mono`} />
          </div>
          <div>
            <label className={labelClass}>Format Protokol API</label>
            <select value={settings.provider || 'auto'} onChange={(e) => set('provider', e.target.value)} className={inputClass}>
              <option value="auto">Deteksi Otomatis</option>
              <option value="openai_compatible">OpenAI-Compatible</option>
              <option value="google">Google Native API</option>
              <option value="ollama">Ollama Native API</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={labelClass.replace(' mb-1', '')}>Model Chat</label>
              <button type="button" onClick={handleFetchModels} disabled={busy !== null} className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                {busy === 'models' ? 'Memuat...' : 'Muat Daftar Model'}
              </button>
            </div>
            <input list="admin-models" value={settings.model || ''} onChange={(e) => set('model', e.target.value)} className={`${inputClass} font-mono`} />
            <datalist id="admin-models">
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          {secretInput('llm_api_key', 'API Key Chat', 'Kosongkan untuk server lokal tanpa autentikasi')}
        </div>
      </section>

      <section className={`${cardClass} p-5 space-y-4`}>
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Provider Cadangan (Auto-Fallback)</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Opsional. Dipakai otomatis bila provider utama mengalami rate-limit (429), timeout, atau error jaringan.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Model Cadangan</label>
            <input
              list="admin-models"
              value={settings.fallback_model || ''}
              onChange={(e) => set('fallback_model', e.target.value)}
              placeholder="Contoh: gemini-2.5-flash"
              className={`${inputClass} font-mono`}
            />
          </div>
          <div>
            <label className={labelClass}>Base URL Cadangan</label>
            <input
              value={settings.fallback_llm_base_url || ''}
              onChange={(e) => set('fallback_llm_base_url', e.target.value)}
              placeholder="Kosong = sama dengan URL utama"
              className={`${inputClass} font-mono`}
            />
          </div>
          {secretInput('fallback_llm_api_key', 'API Key Cadangan', 'Kosong = pakai API Key utama (jika URL sama)')}
        </div>
      </section>

      <section className={`${cardClass} p-5 space-y-4`}>
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Model Khusus Riset & Verifikasi Fakta</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Opsional. Kolom kosong memakai provider chat di atas.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Model Riset</label>
            <input list="admin-models" value={settings.research_model || ''} onChange={(e) => set('research_model', e.target.value)} placeholder={settings.model} className={`${inputClass} font-mono`} />
          </div>
          <div>
            <label className={labelClass}>Base URL Riset</label>
            <input value={settings.research_llm_base_url || ''} onChange={(e) => set('research_llm_base_url', e.target.value)} placeholder={settings.llm_base_url} className={`${inputClass} font-mono`} />
          </div>
          {secretInput('research_llm_api_key', 'API Key Riset', 'Sama dengan API Key chat')}
        </div>
      </section>

      <section className={`${cardClass} p-5 space-y-4`}>
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Embedding Memori Semantik</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Opsional. Mengaktifkan pencarian memori berbasis kemiripan makna (cosine similarity / pgvector). Tanpa ini, Naravia memakai peringkat relevansi leksikal bawaan.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Model Embedding</label>
            <input
              value={settings.embedding_model || ''}
              onChange={(e) => set('embedding_model', e.target.value)}
              placeholder="text-embedding-3-small / text-embedding-004"
              className={`${inputClass} font-mono`}
            />
          </div>
          <div>
            <label className={labelClass}>Base URL Embedding</label>
            <input
              value={settings.embedding_base_url || ''}
              onChange={(e) => set('embedding_base_url', e.target.value)}
              placeholder={settings.llm_base_url || 'Sama dengan Base URL chat'}
              className={`${inputClass} font-mono`}
            />
          </div>
          {secretInput('embedding_api_key', 'API Key Embedding', 'Sama dengan API Key chat')}
        </div>
      </section>

      <section className={`${cardClass} p-5 space-y-4`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Pencarian Web untuk Riset</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">"Pengetahuan Model" berarti riset tanpa browsing web.</p>
          </div>
          <button type="button" onClick={handleTestSearch} disabled={busy !== null} className={secondaryButtonClass}>
            <Search className="w-3.5 h-3.5" />
            <span>{busy === 'search' ? 'Menguji...' : 'Tes Pencarian Web'}</span>
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Penyedia Pencarian</label>
            <select value={settings.search_provider || 'model'} onChange={(e) => set('search_provider', e.target.value)} className={inputClass}>
              <option value="model">Pengetahuan Model</option>
              <option value="tavily">Tavily Search API</option>
              <option value="brave">Brave Search API</option>
            </select>
          </div>
          {secretInput('search_api_key', 'API Key Pencarian', 'API Key Tavily atau Brave', settings.search_provider === 'model')}
        </div>
      </section>

      <section className={`${cardClass} p-5 space-y-4`}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Akses & Kuota</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Pendaftaran Akun Baru</label>
            <select value={settings.registration_mode || 'open'} onChange={(e) => set('registration_mode', e.target.value)} className={inputClass}>
              <option value="open">Terbuka untuk Umum</option>
              <option value="closed">Ditutup (Hanya Dibuat Admin)</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Kuota Token Harian Bawaan per Pengguna</label>
            <input
              type="number"
              min="0"
              step="1000"
              value={settings.default_daily_token_budget || ''}
              onChange={(e) => set('default_daily_token_budget', e.target.value)}
              placeholder="0 = tanpa batas"
              className={inputClass}
            />
            <p className="text-[11px] text-slate-400 mt-1">Bisa diganti per akun di tab Pengguna. Admin tidak dibatasi.</p>
          </div>
        </div>
      </section>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3">
        <button type="button" onClick={handleCleanupAll} disabled={busy !== null} className={secondaryButtonClass}>
          <Trash2 className="w-3.5 h-3.5" />
          <span>{busy === 'cleanup' ? 'Membersihkan...' : 'Bersihkan Semua Unggahan Yatim'}</span>
        </button>
        <button type="submit" disabled={busy !== null} className={primaryButtonClass}>
          <Save className="w-3.5 h-3.5" />
          <span>{busy === 'save' ? 'Menyimpan...' : 'Simpan Setelan Sistem'}</span>
        </button>
      </div>
    </form>
  );
}
