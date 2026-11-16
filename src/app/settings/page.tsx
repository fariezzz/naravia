'use client';

import React, { useEffect, useState } from 'react';
import {
  User,
  BarChart3,
  SlidersHorizontal,
  KeyRound,
  Database,
  Save,
  CheckCircle2,
  AlertCircle,
  Download,
  Trash2,
  Image as ImageIcon,
  Plus,
  Star,
  Sun,
  Moon,
} from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import CharacterAvatar from '@/components/CharacterAvatar';
import ImageCropModal from '@/components/ImageCropModal';
import AccountPanel from '@/components/AccountPanel';
import { useTheme } from '@/lib/ThemeContext';
import { getClientCache, setClientCache, invalidateClientCache } from '@/lib/clientCache';

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<'persona' | 'chat' | 'stats' | 'account' | 'data'>('persona');

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
        temperature: '0.9',
        max_tokens: '1024',
        default_reply_style: 'sedang',
        history_limit: '20',
        auto_summarize_threshold: '30',
        auto_extract_memory: 'true',
      }
    );
  });

  const [stats, setStats] = useState<any>(() => {
    return getClientCache<any>('settings_stats') || null;
  });
  const [loading, setLoading] = useState(() => {
    const cachedP = getClientCache<any[]>('settings_personas');
    return !cachedP || cachedP.length === 0;
  });
  const [saving, setSaving] = useState(false);
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
        setSettings((prev) => ({ ...prev, ...sData.settings }));
        setClientCache('settings_data', sData.settings);
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
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan pengaturan.');
      if (data.settings) {
        setSettings(data.settings);
        setClientCache('settings_data', data.settings);
        invalidateClientCache('chat_room_');
      }
      setNotice('Preferensi percakapan berhasil disimpan.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.');
    } finally {
      setSaving(false);
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
      invalidateClientCache();
      setNotice('Seluruh karakter, percakapan, dunia, dan memori milik akunmu telah dihapus.');
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
    { id: 'persona' as const, label: 'Persona', icon: User },
    { id: 'chat' as const, label: 'Preferensi Chat', icon: SlidersHorizontal },
    { id: 'stats' as const, label: 'Pemakaian Token', icon: BarChart3 },
    { id: 'account' as const, label: 'Akun', icon: KeyRound },
    { id: 'data' as const, label: 'Data', icon: Database },
  ];

  return (
    <div className="max-w-5xl w-full mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">Pengaturan</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Kelola persona, preferensi percakapan, pemakaian token, dan akunmu.
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

          {/* Tab 2: Preferensi Percakapan Pribadi */}
          {activeTab === 'chat' && (
            <div className="space-y-5">
            <form
              onSubmit={handleSaveSettings}
              className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-5 shadow-2xs"
            >
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Preferensi Percakapan</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Nilai bawaan untuk ruang chat baru. Setiap ruang chat tetap bisa diatur terpisah.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Temperature Bawaan</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="2"
                    value={settings.temperature ?? ''}
                    placeholder="0.9"
                    onChange={(e) => setSettings((s) => ({ ...s, temperature: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Max Tokens Balasan</label>
                  <input
                    type="number"
                    step="64"
                    min="64"
                    max="8192"
                    value={settings.max_tokens ?? ''}
                    placeholder="1024"
                    onChange={(e) => setSettings((s) => ({ ...s, max_tokens: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Gaya Balasan Bawaan</label>
                  <select
                    value={settings.default_reply_style || 'sedang'}
                    onChange={(e) => setSettings((s) => ({ ...s, default_reply_style: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-xs text-slate-900 dark:text-slate-100"
                  >
                    <option value="sedang">Sedang (1-2 Paragraf)</option>
                    <option value="pendek">Pendek (1-3 Kalimat)</option>
                    <option value="panjang">Panjang (Deskriptif)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Batas Riwayat Pesan</label>
                  <input
                    type="number"
                    min="4"
                    max="100"
                    value={settings.history_limit ?? ''}
                    placeholder="20"
                    onChange={(e) => setSettings((s) => ({ ...s, history_limit: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={settings.auto_extract_memory === 'true'}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, auto_extract_memory: e.target.checked ? 'true' : 'false' }))
                    }
                    className="rounded border-slate-300"
                  />
                  <span>Simpan Memori Jangka Panjang Otomatis</span>
                </label>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-9 px-5 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? 'Menyimpan...' : 'Simpan Preferensi'}</span>
                </button>
              </div>
            </form>

            {/* Tampilan: tema disimpan di perangkat ini lewat localStorage,
                jadi kartunya berdiri sendiri di luar form dan tidak perlu disimpan. */}
            <div className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-2xs">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Tampilan</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Pilihan tema berlaku untuk perangkat ini dan langsung tersimpan.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([
                  { nilai: 'light' as const, label: 'Mode Terang', ikon: Sun, keterangan: 'Latar putih, cocok untuk ruangan terang.' },
                  { nilai: 'dark' as const, label: 'Mode Gelap', ikon: Moon, keterangan: 'Latar gelap, lebih nyaman saat malam.' },
                ]).map((opsi) => {
                  const Ikon = opsi.ikon;
                  const aktif = theme === opsi.nilai;
                  return (
                    <button
                      key={opsi.nilai}
                      type="button"
                      onClick={() => setTheme(opsi.nilai)}
                      aria-pressed={aktif}
                      className={`text-left p-3.5 rounded-xl border transition-colors ${
                        aktif
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Ikon
                          className={`w-4 h-4 shrink-0 ${
                            opsi.nilai === 'dark' ? 'text-indigo-500' : 'text-amber-500'
                          }`}
                        />
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">{opsi.label}</span>
                        {aktif && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 ml-auto shrink-0" />}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                        {opsi.keterangan}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
            </div>
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
                  <span className="text-xs text-slate-500">Sisa Kuota Hari Ini</span>
                  {stats.summary.daily_budget > 0 ? (
                    <>
                      <p className="text-xl font-bold text-emerald-700 mt-1">
                        {Number(stats.summary.remaining_budget || 0).toLocaleString('id-ID')}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Dari batas {stats.summary.daily_budget.toLocaleString('id-ID')} token/hari, diperbarui tiap tengah malam
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xl font-bold text-emerald-700 mt-1">Tanpa Batas</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Akun ini tidak dibatasi kuota harian</p>
                    </>
                  )}
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

          {/* Tab 4: Akun & Keamanan */}
          {activeTab === 'account' && <AccountPanel />}

          {/* Tab 5: Ekspor & Hapus Data Milik Akun */}
          {activeTab === 'data' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Ekspor Data Akun</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Unduh salinan seluruh karakter, persona, percakapan, dunia, dan memori milikmu dalam format JSON.
                  </p>
                </div>
                <a
                  href="/api/export"
                  download
                  className="h-9 px-4 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh JSON</span>
                </a>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Bersihkan File Aset Gambar Yatim
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Hapus foto profil lama atau sisa unggahanmu yang sudah tidak dipakai karakter maupun persona.
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
                    Hapus Seluruh Data Akun
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Menghapus semua karakter, ruang chat, dunia, dan memori milik akunmu. Ekspor datamu terlebih dahulu.
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
        title="Hapus Seluruh Data Akunmu?"
        description="Seluruh karakter, riwayat percakapan, dunia, dan memori milikmu akan dihapus permanen. Akun dan persona tetap ada."
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
