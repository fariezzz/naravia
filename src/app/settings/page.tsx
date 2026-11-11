'use client';

import React, { useEffect, useState } from 'react';
import {
  User,
  Cpu,
  BarChart3,
  Database,
  Save,
  CheckCircle2,
  AlertCircle,
  Download,
  Trash2,
  Zap,
  Image as ImageIcon,
  Plus,
  Star,
} from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import CharacterAvatar from '@/components/CharacterAvatar';
import ImageCropModal from '@/components/ImageCropModal';
import { getClientCache, setClientCache, invalidateClientCache } from '@/lib/clientCache';

const PROVIDER_PRESETS = [
  {
    label: '9Router Lokal (Port 20128)',
    provider: 'openai_compatible',
    baseUrl: 'http://localhost:20128/v1',
    defaultModel: 'oc/deepseek-v4.1-flash-free',
  },
  {
    label: 'OpenRouter (OpenAI-Compatible)',
    provider: 'openai_compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'google/gemma-3-27b-it:free',
  },
  {
    label: 'Groq Cloud (OpenAI-Compatible)',
    provider: 'openai_compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
  },
  {
    label: 'DeepSeek API (OpenAI-Compatible)',
    provider: 'openai_compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
  },
  {
    label: 'Google AI Studio (Gemma / Gemini)',
    provider: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemma-4-26b-a4b-it',
  },
  {
    label: 'Ollama Lokal (Native / OpenAI)',
    provider: 'ollama',
    baseUrl: 'http://localhost:11434',
    defaultModel: 'gemma3:12b',
  },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'persona' | 'llm' | 'stats' | 'data'>('persona');

  const [personas, setPersonas] = useState<any[]>(() => {
    return getClientCache<any[]>('settings_personas') || [];
  });
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(() => {
    const list = getClientCache<any[]>('settings_personas') || [];
    return list.find((p: any) => p.is_default)?.id || list[0]?.id || null;
  });
  const [isCreatingPersona, setIsCreatingPersona] = useState(false);

  const [persona, setPersona] = useState(() => {
    const list = getClientCache<any[]>('settings_personas') || [];
    const activeP = list.find((p: any) => p.is_default) || list[0];
    return {
      id: activeP?.id || '',
      display_name: activeP?.display_name || '',
      avatar: activeP?.avatar || '',
      description: activeP?.description || '',
      likes: activeP?.likes || '',
      dislikes: activeP?.dislikes || '',
      is_default: Boolean(activeP?.is_default),
      applyToAllChats: false,
    };
  });

  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [deletePersonaTarget, setDeletePersonaTarget] = useState<string | null>(null);

  const [settings, setSettings] = useState<Record<string, string>>(() => {
    return (
      getClientCache<Record<string, string>>('settings_data') || {
        provider: 'auto',
        llm_base_url: 'https://generativelanguage.googleapis.com/v1beta',
        llm_api_key: '',
        model: 'gemma-4-26b-a4b-it',
        temperature: '0.9',
        max_tokens: '1024',
        history_limit: '20',
        auto_summarize_threshold: '30',
        auto_extract_memory: 'true',
        daily_token_budget: '1000000',
        search_provider: 'model',
        search_api_key: '',
      }
    );
  });

  const [stats, setStats] = useState<any>(() => {
    return getClientCache<any>('settings_stats') || null;
  });
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [loading, setLoading] = useState(() => {
    const cachedP = getClientCache<any[]>('settings_personas');
    return !cachedP || cachedP.length === 0;
  });
  const [saving, setSaving] = useState(false);
  const [testingConn, setTestingConn] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resetModalOpen, setResetModalOpen] = useState(false);

  const loadAll = async (isBackground = false) => {
    if (!isBackground) {
      const cachedP = getClientCache<any[]>('settings_personas');
      if (!cachedP || cachedP.length === 0) setLoading(true);
    }
    setError('');
    try {
      const [pRes, sRes, stRes] = await Promise.all([
        fetch('/api/persona'),
        fetch('/api/settings'),
        fetch('/api/stats'),
      ]);
      const pData = await pRes.json();
      const sData = await sRes.json();
      const stData = await stRes.json();

      const list = Array.isArray(pData.personas) ? pData.personas : pData.persona ? [pData.persona] : [];
      setPersonas(list);
      setClientCache('settings_personas', list);

      const activeP =
        list.find((item: any) => item.id === selectedPersonaId) ||
        list.find((item: any) => item.is_default) ||
        list[0];

      if (activeP) {
        setSelectedPersonaId(activeP.id);
        setIsCreatingPersona(false);
        setPersona({
          id: activeP.id,
          display_name: activeP.display_name || '',
          avatar: activeP.avatar || '',
          description: activeP.description || '',
          likes: activeP.likes || '',
          dislikes: activeP.dislikes || '',
          is_default: Boolean(activeP.is_default),
          applyToAllChats: false,
        });
      }

      if (sData.settings) {
        const sObj = {
          ...sData.settings,
          llm_base_url:
            sData.settings.llm_base_url ||
            'https://generativelanguage.googleapis.com/v1beta',
          llm_api_key: sData.settings.llm_api_key_masked || '',
        };
        setSettings((prev) => ({
          ...prev,
          ...sObj,
        }));
        setClientCache('settings_data', sObj);
      }

      if (stData.summary) {
        setStats(stData);
        setClientCache('settings_stats', stData);
      }
    } catch (err) {
      if (!personas.length) {
        setError(err instanceof Error ? err.message : 'Gagal memuat pengaturan.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const hasCached = (getClientCache<any[]>('settings_personas') || []).length > 0;
    loadAll(hasCached);
  }, []);

  const handleSelectPersonaPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCropImageSrc(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const selectPersonaItem = (p: any) => {
    setIsCreatingPersona(false);
    setSelectedPersonaId(p.id);
    setPersona({
      id: p.id,
      display_name: p.display_name || '',
      avatar: p.avatar || '',
      description: p.description || '',
      likes: p.likes || '',
      dislikes: p.dislikes || '',
      is_default: Boolean(p.is_default),
      applyToAllChats: false,
    });
    setError('');
    setNotice('');
  };

  const startCreatePersona = () => {
    setIsCreatingPersona(true);
    setSelectedPersonaId(null);
    setPersona({
      id: '',
      display_name: '',
      avatar: '',
      description: '',
      likes: '',
      dislikes: '',
      is_default: personas.length === 0,
      applyToAllChats: false,
    });
    setError('');
    setNotice('');
  };

  const handleConfirmCroppedPersonaPhoto = async (blob: Blob) => {
    setError('');
    setNotice('');
    try {
      const ext = blob.type === 'image/webp' ? '.webp' : '.png';
      const fd = new FormData();
      fd.append('file', new File([blob], `persona-${Date.now()}${ext}`, { type: blob.type || 'image/webp' }));
      if (persona.avatar && persona.avatar.startsWith('/uploads/')) {
        fd.append('previousAvatarUrl', persona.avatar);
      }
      const uploadRes = await fetch('/api/avatar', { method: 'POST', body: fd });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || 'Gagal mengunggah foto profil.');

      const nextPersona = { ...persona, avatar: uploadData.avatarUrl };
      setPersona(nextPersona);
      setCropImageSrc(null);

      if (!isCreatingPersona && nextPersona.id) {
        const saveRes = await fetch('/api/persona', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nextPersona),
        });
        const saveData = await saveRes.json();
        if (saveRes.ok && Array.isArray(saveData.personas)) {
          setPersonas(saveData.personas);
          window.dispatchEvent(new Event('naravia-persona-updated'));
          setNotice('Foto profil persona berhasil dipotong dan disimpan.');
        }
      } else {
        setNotice('Foto profil siap. Klik Simpan Persona Baru untuk menyelesaikan.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan foto profil.');
    }
  };

  const handleSavePersona = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!persona.display_name.trim()) {
      setError('Nama panggilan persona wajib diisi.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const method = isCreatingPersona ? 'POST' : 'PUT';
      const res = await fetch('/api/persona', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(persona),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan persona.');

      if (Array.isArray(data.personas)) {
        setPersonas(data.personas);
      }
      if (data.persona) {
        selectPersonaItem(data.persona);
      }
      window.dispatchEvent(new Event('naravia-persona-updated'));
      setNotice(
        isCreatingPersona
          ? 'Persona baru berhasil ditambahkan.'
          : 'Persona pengguna berhasil diperbarui.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan persona.');
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefaultPersona = async (id: string) => {
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/persona', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'set_default' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengatur persona utama.');
      if (Array.isArray(data.personas)) setPersonas(data.personas);
      if (selectedPersonaId === id) {
        setPersona((p) => ({ ...p, is_default: true }));
      }
      window.dispatchEvent(new Event('naravia-persona-updated'));
      setNotice('Persona utama (default) berhasil diubah.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengatur persona utama.');
    }
  };

  const handleDeletePersona = async () => {
    if (!deletePersonaTarget) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/persona?id=${encodeURIComponent(deletePersonaTarget)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus persona.');
      setDeletePersonaTarget(null);
      const list = Array.isArray(data.personas) ? data.personas : [];
      setPersonas(list);
      setClientCache('settings_personas', list);
      invalidateClientCache('settings_personas');
      invalidateClientCache('navbar_persona');
      if (list[0]) {
        selectPersonaItem(list[0]);
      }
      window.dispatchEvent(new Event('naravia-persona-updated'));
      setNotice('Persona berhasil dihapus.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus persona.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = { ...settings };
      delete payload.google_api_key;
      delete payload.ollama_api_key;

      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan pengaturan.');
      if (data.settings) {
        setSettings((prev) => ({
          ...prev,
          ...data.settings,
          llm_api_key: data.settings.llm_api_key_masked || prev.llm_api_key || '',
        }));
      }
      setNotice('Pengaturan Base URL, model, dan konteks berhasil disimpan.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.');
    } finally {
      setSaving(false);
    }
  };

  const handleFetchModels = async () => {
    setFetchingModels(true);
    setError('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'fetch_models',
          baseUrl: settings.llm_base_url,
          apiKey: settings.llm_api_key,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memuat daftar model.');
      const list = Array.isArray(data.models) ? data.models : [];
      setAvailableModels(list);
      if (list.length > 0 && !list.includes(settings.model)) {
        setNotice(`Berhasil memuat ${list.length} model dari endpoint. Pilih salah satu dari daftar.`);
      } else {
        setNotice(`Berhasil memuat ${list.length} model dari endpoint.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengambil daftar model.');
    } finally {
      setFetchingModels(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConn(true);
    setError('');
    setNotice('');
    try {
      const payload = { ...settings };
      delete payload.google_api_key;
      delete payload.ollama_api_key;

      const putRes = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const putData = await putRes.json();
      if (putData.settings) {
        setSettings((prev) => ({
          ...prev,
          ...putData.settings,
          llm_api_key: putData.settings.llm_api_key_masked || prev.llm_api_key || '',
        }));
      }

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_connection' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Koneksi ke penyedia model gagal.');
      setNotice(`Koneksi berhasil (${data.modelUsed}): "${data.reply}"`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menguji koneksi LLM.');
    } finally {
      setTestingConn(false);
    }
  };

  const handleResetAllData = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_all' }),
      });
      if (!res.ok) throw new Error('Gagal menghapus seluruh data.');
      setResetModalOpen(false);
      setNotice('Seluruh data percakapan, karakter, dan aset foto yang tidak terpakai telah dihapus.');
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mereset data.');
    } finally {
      setSaving(false);
    }
  };

  const handleCleanupAssets = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cleanup_assets' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal membersihkan aset.');
      setNotice(`Pembersihan selesai. ${data.deletedCount || 0} file gambar yatim berhasil dihapus.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membersihkan aset.');
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'persona' as const, label: 'Persona Kamu', icon: User },
    { id: 'llm' as const, label: 'Model AI & Konteks', icon: Cpu },
    { id: 'stats' as const, label: 'Statistik Token', icon: BarChart3 },
    { id: 'data' as const, label: 'Cadangan & Data', icon: Database },
  ];

  return (
    <div className="max-w-5xl w-full mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Pengaturan & Persona</h1>
        <p className="text-xs text-slate-500">
          Kelola identitas persona Anda, Base URL & API key berbagai provider AI, pantau pemakaian token, serta cadangkan file SQLite.
        </p>
      </div>

      {/* Navigasi Sub-Tab Satu Baris */}
      <div className="bg-white rounded-2xl border border-slate-200 p-1.5 flex overflow-x-auto items-center gap-1 max-w-full">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setActiveTab(t.id);
                setError('');
                setNotice('');
              }}
              className={`h-9 px-3.5 sm:px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors shrink-0 ${
                active
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {loading ? (
        <div className="text-xs text-slate-400">Memuat pengaturan...</div>
      ) : (
        <>
          {/* Tab 1: Multi-Persona Pengguna */}
          {activeTab === 'persona' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Daftar Semua Persona */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">
                    Daftar Persona ({personas.length})
                  </h2>
                  <button
                    type="button"
                    onClick={startCreatePersona}
                    className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Persona Baru</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {personas.map((p) => {
                    const active = !isCreatingPersona && p.id === selectedPersonaId;
                    return (
                      <div
                        key={p.id}
                        onClick={() => selectPersonaItem(p)}
                        className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                          active
                            ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <CharacterAvatar name={p.display_name} avatar={p.avatar} size="md" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-semibold truncate">{p.display_name}</p>
                              {p.is_default && (
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                    active
                                      ? 'bg-amber-400/20 text-amber-300'
                                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                                  }`}
                                >
                                  Utama
                                </span>
                              )}
                            </div>
                            <p
                              className={`text-[11px] truncate mt-0.5 ${
                                active ? 'text-slate-300' : 'text-slate-500'
                              }`}
                            >
                              {p.description || 'Tanpa deskripsi'}
                            </p>
                          </div>
                        </div>

                        {!p.is_default && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetDefaultPersona(p.id);
                            }}
                            title="Jadikan Persona Utama (Default)"
                            className={`w-7 h-7 rounded-lg inline-flex items-center justify-center shrink-0 ${
                              active
                                ? 'text-slate-300 hover:text-amber-300 hover:bg-white/10'
                                : 'text-slate-400 hover:text-amber-500 hover:bg-slate-100'
                            }`}
                          >
                            <Star className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Form Edit / Buat Persona */}
              <form
                onSubmit={handleSavePersona}
                className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-2xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      {isCreatingPersona
                        ? 'Buat Persona Baru'
                        : `Edit Persona: ${persona.display_name}`}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Anda dapat membuat banyak persona dan mengganti persona yang aktif di setiap ruang chat kapan saja.
                    </p>
                  </div>

                  {!isCreatingPersona && personas.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setDeletePersonaTarget(persona.id)}
                      className="h-8 px-3 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-medium inline-flex items-center gap-1 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus</span>
                    </button>
                  )}
                </div>

                {/* Bagian Foto Profil Lingkaran dengan Crop 1:1 */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 py-3 border-y border-slate-100">
                  <CharacterAvatar
                    name={persona.display_name || 'Kamu'}
                    avatar={persona.avatar}
                    size="xl"
                  />
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="h-9 px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer transition-colors">
                        <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Pilih & Crop Foto Profil</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleSelectPersonaPhoto}
                          className="hidden"
                        />
                      </label>
                      {persona.avatar && (
                        <button
                          type="button"
                          onClick={() => setPersona((p) => ({ ...p, avatar: '' }))}
                          className="h-9 px-3 rounded-xl border border-rose-200 hover:bg-rose-50 text-xs font-medium text-rose-600"
                        >
                          Hapus Foto
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Foto disesuaikan dengan rasio persegi 1:1 dan ditampilkan berbentuk lingkaran di navbar serta ruang chat.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nama Panggilan Persona *
                    </label>
                    <input
                      type="text"
                      required
                      value={persona.display_name}
                      onChange={(e) => setPersona((p) => ({ ...p, display_name: e.target.value }))}
                      placeholder="Contoh: Fariez / Detektif Alden"
                      className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900"
                    />
                  </div>

                  <div className="flex items-end pb-1.5">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={persona.is_default}
                        onChange={(e) =>
                          setPersona((p) => ({ ...p, is_default: e.target.checked }))
                        }
                        className="rounded border-slate-300"
                      />
                      <span>Jadikan sebagai Persona Utama (Default untuk chat baru)</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Deskripsi & Latar Belakang Persona
                  </label>
                  <textarea
                    rows={3}
                    value={persona.description}
                    onChange={(e) => setPersona((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Siapa persona ini, latar belakang, profesi, atau hubungannya dengan karakter..."
                    className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-900"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Hal yang Disukai
                    </label>
                    <input
                      type="text"
                      value={persona.likes}
                      onChange={(e) => setPersona((p) => ({ ...p, likes: e.target.value }))}
                      placeholder="Kopi hitam, diskusi logis, cerita misteri..."
                      className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Hal yang Tidak Disukai
                    </label>
                    <input
                      type="text"
                      value={persona.dislikes}
                      onChange={(e) => setPersona((p) => ({ ...p, dislikes: e.target.value }))}
                      placeholder="Basa-basi berulang, jawaban bertele-tele..."
                      className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-900"
                    />
                  </div>
                </div>

                {!isCreatingPersona && (
                  <label className="flex items-center gap-2 text-xs text-slate-700 pt-1">
                    <input
                      type="checkbox"
                      checked={persona.applyToAllChats}
                      onChange={(e) =>
                        setPersona((p) => ({ ...p, applyToAllChats: e.target.checked }))
                      }
                      className="rounded border-slate-300"
                    />
                    <span>Terapkan persona ini ke seluruh ruang chat yang sudah ada</span>
                  </label>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  {isCreatingPersona && (
                    <button
                      type="button"
                      onClick={() => {
                        if (personas[0]) selectPersonaItem(personas[0]);
                      }}
                      className="h-9 px-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Batal
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={saving}
                    className="h-9 px-5 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>
                      {saving
                        ? 'Menyimpan...'
                        : isCreatingPersona
                        ? 'Simpan Persona Baru'
                        : 'Simpan Perubahan Persona'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Tab 2: Pengaturan Universal LLM & Konteks */}
          {activeTab === 'llm' && (
            <form
              onSubmit={handleSaveSettings}
              className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5 shadow-2xs"
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Konfigurasi Universal Base URL & Model AI
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Mendukung segala jenis provider (OpenAI-Compatible, OpenRouter, Groq, DeepSeek, Chutes, Together, Google AI Studio, Ollama, LM Studio, dll).
                  </p>
                </div>
                <button
                  type="button"
                  disabled={testingConn}
                  onClick={handleTestConnection}
                  className="h-9 px-3.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{testingConn ? 'Menguji...' : 'Tes Koneksi AI'}</span>
                </button>
              </div>

              {/* Tombol Pintasan Preset Provider Populer */}
              <div className="space-y-1.5">
                <span className="block text-[11px] font-semibold text-slate-500">
                  Isi Cepat Base URL Populer (Atau ketik bebas di bawah):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {PROVIDER_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        setSettings((s) => ({
                          ...s,
                          provider: preset.provider,
                          llm_base_url: preset.baseUrl,
                          model: preset.defaultModel,
                        }))
                      }
                      className="h-7 px-2.5 rounded-lg border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40 text-[11px] font-medium text-slate-700 transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Base URL Endpoint Provider
                  </label>
                  <input
                    type="text"
                    value={settings.llm_base_url || ''}
                    onChange={(e) => setSettings((s) => ({ ...s, llm_base_url: e.target.value }))}
                    placeholder="Contoh: https://openrouter.ai/api/v1 atau https://api.openai.com/v1"
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-900 font-mono"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Bisa diisi URL endpoint OpenAI-compatible apa pun (<code>.../v1</code>), URL Google (<code>.../v1beta</code>), atau URL Ollama lokal.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Format Protokol API
                  </label>
                  <select
                    value={settings.provider || 'auto'}
                    onChange={(e) => setSettings((s) => ({ ...s, provider: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-900 bg-white"
                  >
                    <option value="auto">Deteksi Otomatis dari Base URL</option>
                    <option value="openai_compatible">OpenAI-Compatible (/v1/chat/completions)</option>
                    <option value="google">Google Native API (:generateContent)</option>
                    <option value="ollama">Ollama Native API (/api/chat)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Nama / ID Model
                    </label>
                    <button
                      type="button"
                      disabled={fetchingModels}
                      onClick={handleFetchModels}
                      className="text-[11px] font-semibold text-indigo-600 hover:underline"
                    >
                      {fetchingModels ? 'Memuat Model...' : 'Muat Daftar Model dari URL'}
                    </button>
                  </div>
                  <input
                    type="text"
                    list="provider-models-list"
                    value={settings.model || ''}
                    onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))}
                    placeholder="Contoh: oc/deepseek-v4.1-flash-free, gemma-4-26b-a4b-it..."
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-900 font-mono"
                  />
                  {availableModels.length > 0 && (
                    <>
                      <datalist id="provider-models-list">
                        {availableModels.map((m) => (
                          <option key={m} value={m} />
                        ))}
                      </datalist>
                      <select
                        value={availableModels.includes(settings.model) ? settings.model : ''}
                        onChange={(e) => {
                          if (e.target.value) {
                            setSettings((s) => ({ ...s, model: e.target.value }));
                          }
                        }}
                        className="mt-1.5 w-full h-8 px-2.5 rounded-lg border border-indigo-200 bg-indigo-50/40 text-xs text-slate-800 font-mono"
                      >
                        <option value="">-- Pilih dari {availableModels.length} model tersedia --</option>
                        {availableModels.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    API Key Provider (Opsional untuk server lokal tanpa auth)
                  </label>
                  <input
                    type="password"
                    value={settings.llm_api_key || ''}
                    onChange={(e) => setSettings((s) => ({ ...s, llm_api_key: e.target.value }))}
                    placeholder="Masukkan API Key provider Anda..."
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Temperature Default
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.1"
                    max="1.5"
                    value={settings.temperature || '0.9'}
                    onChange={(e) => setSettings((s) => ({ ...s, temperature: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Max Tokens Balasan
                  </label>
                  <input
                    type="number"
                    step="64"
                    min="128"
                    max="4096"
                    value={settings.max_tokens || '1024'}
                    onChange={(e) => setSettings((s) => ({ ...s, max_tokens: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Batas Riwayat Pesan (N Terakhir)
                  </label>
                  <input
                    type="number"
                    min="4"
                    max="100"
                    value={settings.history_limit || '20'}
                    onChange={(e) => setSettings((s) => ({ ...s, history_limit: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-900"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={settings.auto_extract_memory === 'true'}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        auto_extract_memory: e.target.checked ? 'true' : 'false',
                      }))
                    }
                    className="rounded border-slate-300"
                  />
                  <span>Ekstraksi Memori Jangka Panjang Otomatis dari Percakapan</span>
                </label>

                <button
                  type="submit"
                  disabled={saving}
                  className="h-9 px-5 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? 'Menyimpan...' : 'Simpan Pengaturan'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Tab 3: Statistik Pemakaian Token */}
          {activeTab === 'stats' && stats && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
                  <span className="text-xs text-slate-500">Pemakaian Token Hari Ini</span>
                  <p className="text-xl font-bold text-slate-900 mt-1">
                    {stats.summary.today_used.toLocaleString('id-ID')}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {stats.summary.today_calls} permintaan hari ini
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
                  <span className="text-xs text-slate-500">Perkiraan Sisa Kuota Harian</span>
                  <p className="text-xl font-bold text-emerald-700 mt-1">
                    {stats.summary.remaining_budget.toLocaleString('id-ID')}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Dari batas {stats.summary.daily_budget.toLocaleString('id-ID')} token/hari
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
                  <span className="text-xs text-slate-500">Total Akumulasi Token</span>
                  <p className="text-xl font-bold text-slate-900 mt-1">
                    {stats.summary.total_tokens.toLocaleString('id-ID')}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Masuk: {stats.summary.total_in.toLocaleString('id-ID')} • Keluar:{' '}
                    {stats.summary.total_out.toLocaleString('id-ID')}
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 shadow-2xs">
                <h3 className="text-sm font-semibold text-slate-900">
                  Pemakaian Token per Karakter
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 font-semibold">Karakter</th>
                        <th className="py-2 font-semibold">Panggilan</th>
                        <th className="py-2 font-semibold">Token Masuk</th>
                        <th className="py-2 font-semibold">Token Keluar</th>
                        <th className="py-2 font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(stats.byCharacter || []).map((row: any) => {
                        const tot = Number(row.tokens_in || 0) + Number(row.tokens_out || 0);
                        return (
                          <tr key={row.character_id}>
                            <td className="py-2.5 font-medium text-slate-900">
                              {row.character_name}
                            </td>
                            <td className="py-2.5 text-slate-600">{row.call_count}</td>
                            <td className="py-2.5 text-slate-600">
                              {Number(row.tokens_in || 0).toLocaleString('id-ID')}
                            </td>
                            <td className="py-2.5 text-slate-600">
                              {Number(row.tokens_out || 0).toLocaleString('id-ID')}
                            </td>
                            <td className="py-2.5 font-semibold text-slate-900">
                              {tot.toLocaleString('id-ID')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Cadangan Database SQLite & Hapus Data */}
          {activeTab === 'data' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Cadangkan Database Lokal (SQLite)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Unduh satu file utuh <code>naravia.db</code> (~150 KB) yang menyimpan seluruh karakter, percakapan, dunia, dan memori Anda.
                  </p>
                </div>
                <a
                  href="/api/backup"
                  download
                  className="h-9 px-4 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh File SQLite</span>
                </a>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Bersihkan File Aset Gambar Yatim
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Pindai folder <code>public/uploads/</code> dan hapus file foto profil lama atau sisa upload yang sudah tidak lagi terikat pada karakter maupun persona aktif.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleCleanupAssets}
                  className="h-9 px-4 rounded-xl border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors shadow-2xs"
                >
                  <Trash2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>Bersihkan Aset Yatim</span>
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-rose-200 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs">
                <div>
                  <h3 className="text-sm font-semibold text-rose-700">
                    Hapus Seluruh Data Aplikasi
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Menghapus semua karakter, ruang chat, dunia, dan memori dari database lokal. Cadangkan file SQLite Anda terlebih dahulu.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setResetModalOpen(true)}
                  className="h-9 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Semua Data</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmModal
        open={resetModalOpen}
        title="Hapus Seluruh Data Naravia?"
        description="Tindakan ini akan mengosongkan seluruh karakter, riwayat percakapan, dunia, dan memori secara permanen."
        confirmLabel="Ya, Hapus Semua"
        loading={saving}
        onConfirm={handleResetAllData}
        onCancel={() => setResetModalOpen(false)}
      />

      <ConfirmModal
        open={Boolean(deletePersonaTarget)}
        title="Hapus Persona Ini?"
        description="Persona yang dihapus tidak lagi tersedia. Ruang chat yang sebelumnya memakai persona ini akan otomatis beralih ke Persona Utama."
        confirmLabel="Hapus Persona"
        loading={saving}
        onConfirm={handleDeletePersona}
        onCancel={() => setDeletePersonaTarget(null)}
      />

      <ImageCropModal
        open={Boolean(cropImageSrc)}
        imageSrc={cropImageSrc}
        title="Crop Foto Profil Pengguna"
        onCancel={() => setCropImageSrc(null)}
        onConfirm={handleConfirmCroppedPersonaPhoto}
      />
    </div>
  );
}
