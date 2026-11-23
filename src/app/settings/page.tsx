'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Database,
  KeyRound,
  SlidersHorizontal,
  User,
} from 'lucide-react';
import AccountPanel from '@/components/AccountPanel';
import ConfirmModal from '@/components/ConfirmModal';
import ImageCropModal from '@/components/ImageCropModal';
import ChatPrefsTab from '@/components/settings/ChatPrefsTab';
import DataTab from '@/components/settings/DataTab';
import PersonaTab, { PersonaFormState } from '@/components/settings/PersonaTab';
import StatsTab from '@/components/settings/StatsTab';
import { getClientCache, invalidateClientCache, setClientCache } from '@/lib/clientCache';
import { useTheme } from '@/lib/ThemeContext';

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<'persona' | 'chat' | 'stats' | 'account' | 'data'>('persona');

  const [personas, setPersonas] = useState<any[]>(() => getClientCache<any[]>('settings_personas') || []);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(() => {
    const list = getClientCache<any[]>('settings_personas') || [];
    return list.find((p: any) => p.is_default)?.id || list[0]?.id || null;
  });
  const [isCreatingPersona, setIsCreatingPersona] = useState(false);

  const [persona, setPersona] = useState<PersonaFormState>(() => {
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

  const [settings, setSettings] = useState<Record<string, string>>(
    () =>
      getClientCache<Record<string, string>>('settings_data') || {
        temperature: '0.9',
        max_tokens: '1024',
        default_reply_style: 'sedang',
        history_limit: '20',
        auto_summarize_threshold: '30',
        auto_extract_memory: 'true',
      }
  );

  const [stats, setStats] = useState<any>(() => getClientCache<any>('settings_stats') || null);
  const [loading, setLoading] = useState(() => (getClientCache<any[]>('settings_personas') || []).length === 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resetModalOpen, setResetModalOpen] = useState(false);

  const loadAll = async (isBackground = false) => {
    if (!isBackground && (getClientCache<any[]>('settings_personas') || []).length === 0) setLoading(true);
    setError('');
    try {
      const [pRes, sRes, stRes] = await Promise.all([fetch('/api/persona'), fetch('/api/settings'), fetch('/api/stats')]);
      const [pData, sData, stData] = await Promise.all([pRes.json(), sRes.json(), stRes.json()]);

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
      if (!personas.length) setError(err instanceof Error ? err.message : 'Gagal memuat pengaturan.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll((getClientCache<any[]>('settings_personas') || []).length > 0);
  }, []);

  const handleSelectPersonaPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setCropImageSrc(reader.result);
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
      const res = await fetch('/api/persona', {
        method: isCreatingPersona ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(persona),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan persona.');

      if (Array.isArray(data.personas)) setPersonas(data.personas);
      if (data.persona) selectPersonaItem(data.persona);
      window.dispatchEvent(new Event('naravia-persona-updated'));
      setNotice(isCreatingPersona ? 'Persona baru berhasil ditambahkan.' : 'Persona pengguna berhasil diperbarui.');
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
      if (selectedPersonaId === id) setPersona((p) => ({ ...p, is_default: true }));
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
      const res = await fetch(`/api/persona?id=${encodeURIComponent(deletePersonaTarget)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus persona.');
      setDeletePersonaTarget(null);
      const list = Array.isArray(data.personas) ? data.personas : [];
      setPersonas(list);
      invalidateClientCache('settings_personas');
      invalidateClientCache('navbar_persona');
      if (list[0]) selectPersonaItem(list[0]);
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
    <div className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
      <header className="space-y-2">
        <h1 className="font-display text-3xl sm:text-4xl text-slate-900 dark:text-white">Pengaturan</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Kelola persona, preferensi percakapan, pemakaian token, dan akunmu.
        </p>
      </header>

      <div className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-1.5 inline-flex overflow-x-auto items-center gap-1 max-w-full">
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
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {loading ? (
        <div className="text-xs text-slate-400">Memuat pengaturan...</div>
      ) : (
        <>
          {activeTab === 'persona' && (
            <PersonaTab
              personas={personas}
              selectedPersonaId={selectedPersonaId}
              isCreatingPersona={isCreatingPersona}
              persona={persona}
              saving={saving}
              onStartCreate={startCreatePersona}
              onSelectPersona={selectPersonaItem}
              onSetDefault={handleSetDefaultPersona}
              onRequestDelete={setDeletePersonaTarget}
              onChangePersona={setPersona}
              onSelectPhoto={handleSelectPersonaPhoto}
              onSubmit={handleSavePersona}
            />
          )}

          {activeTab === 'chat' && (
            <ChatPrefsTab
              settings={settings}
              saving={saving}
              theme={theme}
              onChangeSettings={setSettings}
              onChangeTheme={setTheme}
              onSubmit={handleSaveSettings}
            />
          )}

          {activeTab === 'stats' && <StatsTab stats={stats} />}

          {activeTab === 'account' && <AccountPanel />}

          {activeTab === 'data' && (
            <DataTab
              saving={saving}
              onCleanupAssets={handleCleanupAssets}
              onOpenResetModal={() => setResetModalOpen(true)}
              onNotice={setNotice}
              onError={setError}
            />
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
