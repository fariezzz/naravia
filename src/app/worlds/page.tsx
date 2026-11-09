'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Globe,
  Plus,
  Trash2,
  BookOpen,
  MapPin,
  Shield,
  Clock,
  Save,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import CharacterAvatar from '@/components/CharacterAvatar';
import { getClientCache, setClientCache } from '@/lib/clientCache';

export default function WorldsPage() {
  const [worlds, setWorlds] = useState<any[]>(() => {
    return getClientCache<any[]>('worlds_list') || [];
  });
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(() => {
    const cached = getClientCache<any[]>('worlds_list');
    return cached?.[0]?.id || null;
  });
  const [loading, setLoading] = useState(() => {
    const cached = getClientCache<any[]>('worlds_list');
    return !cached || cached.length === 0;
  });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Form Dunia
  const [isCreatingWorld, setIsCreatingWorld] = useState(false);
  const [worldName, setWorldName] = useState(() => {
    const cached = getClientCache<any[]>('worlds_list');
    return cached?.[0]?.name || '';
  });
  const [worldDesc, setWorldDesc] = useState(() => {
    const cached = getClientCache<any[]>('worlds_list');
    return cached?.[0]?.description || '';
  });
  const [worldRules, setWorldRules] = useState(() => {
    const cached = getClientCache<any[]>('worlds_list');
    return cached?.[0]?.rules || '';
  });
  const [places, setPlaces] = useState<Array<{ name: string; description: string }>>(() => {
    const cached = getClientCache<any[]>('worlds_list');
    return cached?.[0]?.places || [];
  });
  const [factions, setFactions] = useState<Array<{ name: string; description: string }>>(() => {
    const cached = getClientCache<any[]>('worlds_list');
    return cached?.[0]?.factions || [];
  });
  const [timeline, setTimeline] = useState<Array<{ era: string; event: string }>>(() => {
    const cached = getClientCache<any[]>('worlds_list');
    return cached?.[0]?.timeline || [];
  });
  const [savingWorld, setSavingWorld] = useState(false);

  // Form Entri Lorebook baru
  const [loreTitle, setLoreTitle] = useState('');
  const [loreKeywords, setLoreKeywords] = useState('');
  const [loreContent, setLoreContent] = useState('');
  const [addingLore, setAddingLore] = useState(false);

  const [deleteWorldTarget, setDeleteWorldTarget] = useState<string | null>(null);

  const loadWorlds = async (preferId?: string, isBackground = false) => {
    if (!isBackground) {
      const cached = getClientCache<any[]>('worlds_list');
      if (!cached || cached.length === 0) setLoading(true);
    }
    setError('');
    try {
      const res = await fetch('/api/worlds');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memuat dunia.');
      const list = data.worlds || [];
      setWorlds(list);
      setClientCache('worlds_list', list);

      const target = preferId
        ? list.find((w: any) => w.id === preferId)
        : list.find((w: any) => w.id === selectedWorldId) || list[0];

      if (target) {
        selectWorldForEdit(target);
      } else {
        setSelectedWorldId(null);
      }
    } catch (err) {
      if (!worlds.length) {
        setError(err instanceof Error ? err.message : 'Gagal memuat daftar dunia.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const hasCached = (getClientCache<any[]>('worlds_list') || []).length > 0;
    loadWorlds(undefined, hasCached);
  }, []);

  const selectWorldForEdit = (w: any) => {
    setIsCreatingWorld(false);
    setSelectedWorldId(w.id);
    setWorldName(w.name || '');
    setWorldDesc(w.description || '');
    setWorldRules(w.rules || '');
    setPlaces(Array.isArray(w.places) ? w.places : []);
    setFactions(Array.isArray(w.factions) ? w.factions : []);
    setTimeline(Array.isArray(w.timeline) ? w.timeline : []);
  };

  const startNewWorldForm = () => {
    setIsCreatingWorld(true);
    setSelectedWorldId(null);
    setWorldName('');
    setWorldDesc('');
    setWorldRules('');
    setPlaces([{ name: '', description: '' }]);
    setFactions([{ name: '', description: '' }]);
    setTimeline([{ era: '', event: '' }]);
  };

  const handleSaveWorld = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!worldName.trim()) {
      setError('Nama dunia wajib diisi.');
      return;
    }

    setSavingWorld(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        name: worldName.trim(),
        description: worldDesc.trim(),
        rules: worldRules.trim(),
        places: places.filter((p) => p.name.trim() || p.description.trim()),
        factions: factions.filter((f) => f.name.trim() || f.description.trim()),
        timeline: timeline.filter((t) => t.era.trim() || t.event.trim()),
      };

      const url = isCreatingWorld ? '/api/worlds' : `/api/worlds/${selectedWorldId}`;
      const method = isCreatingWorld ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan dunia.');

      setNotice('Data dunia berhasil disimpan.');
      await loadWorlds(data.world.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan dunia.');
    } finally {
      setSavingWorld(false);
    }
  };

  const handleConfirmDeleteWorld = async () => {
    if (!deleteWorldTarget) return;
    try {
      await fetch(`/api/worlds/${deleteWorldTarget}`, { method: 'DELETE' });
      setDeleteWorldTarget(null);
      await loadWorlds();
    } catch {
      setError('Gagal menghapus dunia.');
    }
  };

  const handleAddLoreEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorldId) return;
    if (!loreKeywords.trim() || !loreContent.trim()) {
      setError('Kata kunci pemicu dan isi penjelasan lore wajib diisi.');
      return;
    }

    setAddingLore(true);
    setError('');
    try {
      const res = await fetch('/api/lore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          world_id: selectedWorldId,
          title: loreTitle.trim() || loreKeywords.split(',')[0].trim(),
          keywords: loreKeywords
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean),
          content: loreContent.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menambah entri lorebook.');

      setLoreTitle('');
      setLoreKeywords('');
      setLoreContent('');
      await loadWorlds(selectedWorldId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menambah entri lore.');
    } finally {
      setAddingLore(false);
    }
  };

  const handleDeleteLoreEntry = async (loreId: string) => {
    if (!selectedWorldId) return;
    try {
      await fetch(`/api/lore?id=${encodeURIComponent(loreId)}`, { method: 'DELETE' });
      await loadWorlds(selectedWorldId);
    } catch {
      setError('Gagal menghapus entri lore.');
    }
  };

  const activeWorld = worlds.find((w) => w.id === selectedWorldId);

  return (
    <div className="max-w-6xl w-full mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Dunia & Lorebook</h1>
          <p className="text-xs text-slate-500">
            Atur latar dunia tempat karakter tinggal. Entri lorebook akan otomatis masuk ke konteks chat saat kata kuncinya disebut.
          </p>
        </div>

        <button
          type="button"
          onClick={startNewWorldForm}
          className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Buat Dunia Baru</span>
        </button>
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar Daftar Dunia */}
        <div className="space-y-2">
          {loading ? (
            <div className="text-xs text-slate-400 p-3">Memuat daftar dunia...</div>
          ) : worlds.length === 0 && !isCreatingWorld ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 text-xs text-slate-500">
              Belum ada dunia. Klik &ldquo;Buat Dunia Baru&rdquo; untuk memulai.
            </div>
          ) : (
            worlds.map((w) => {
              const active = !isCreatingWorld && w.id === selectedWorldId;
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => selectWorldForEdit(w)}
                  className={`w-full text-left p-3.5 rounded-2xl border transition-all ${
                    active
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold truncate">{w.name}</span>
                    <Globe className={`w-4 h-4 shrink-0 ${active ? 'text-indigo-300' : 'text-slate-400'}`} />
                  </div>
                  <p className={`text-[11px] line-clamp-2 mt-1 ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                    {w.description || 'Tanpa deskripsi'}
                  </p>
                  <div className={`mt-2 text-[10px] font-medium ${active ? 'text-indigo-200' : 'text-slate-400'}`}>
                    {w.lore_entries?.length || 0} Entri Lore • {w.characters?.length || 0} Karakter
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Area Detail Dunia & Lorebook */}
        <div className="lg:col-span-3 space-y-6">
          {(selectedWorldId || isCreatingWorld) && (
            <form
              onSubmit={handleSaveWorld}
              className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">
                  {isCreatingWorld ? 'Tambah Dunia Baru' : `Pengaturan Dunia: ${worldName}`}
                </h2>
                {!isCreatingWorld && selectedWorldId && (
                  <button
                    type="button"
                    onClick={() => setDeleteWorldTarget(selectedWorldId)}
                    className="h-8 px-3 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-medium inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Dunia</span>
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Dunia *
                </label>
                <input
                  type="text"
                  required
                  value={worldName}
                  onChange={(e) => setWorldName(e.target.value)}
                  placeholder="Contoh: Veloria - Kota Kabut & Menara Jam"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Deskripsi Umum Dunia
                  </label>
                  <textarea
                    rows={3}
                    value={worldDesc}
                    onChange={(e) => setWorldDesc(e.target.value)}
                    placeholder="Suasana, geografi, dan zaman dunia ini..."
                    className="w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Aturan Main / Hukum Dunia
                  </label>
                  <textarea
                    rows={3}
                    value={worldRules}
                    onChange={(e) => setWorldRules(e.target.value)}
                    placeholder="Batas sihir, teknologi, hukum sosial yang berlaku..."
                    className="w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-900"
                  />
                </div>
              </div>

              {/* Tempat, Faksi, dan Garis Waktu */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
                {/* Tempat */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800 inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Lokasi Penting</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setPlaces((p) => [...p, { name: '', description: '' }])}
                      className="text-[11px] font-medium text-indigo-600 hover:underline"
                    >
                      + Tambah
                    </button>
                  </div>
                  {places.map((pl, idx) => (
                    <div key={idx} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                      <input
                        type="text"
                        value={pl.name}
                        onChange={(e) => {
                          const v = e.target.value;
                          setPlaces((p) => p.map((item, i) => (i === idx ? { ...item, name: v } : item)));
                        }}
                        placeholder="Nama Lokasi"
                        className="w-full h-7 px-2 rounded border border-slate-200 bg-white text-xs"
                      />
                      <input
                        type="text"
                        value={pl.description}
                        onChange={(e) => {
                          const v = e.target.value;
                          setPlaces((p) =>
                            p.map((item, i) => (i === idx ? { ...item, description: v } : item))
                          );
                        }}
                        placeholder="Keterangan singkat"
                        className="w-full h-7 px-2 rounded border border-slate-200 bg-white text-xs"
                      />
                    </div>
                  ))}
                </div>

                {/* Faksi */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800 inline-flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5 text-teal-600" />
                      <span>Faksi & Kelompok</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setFactions((p) => [...p, { name: '', description: '' }])}
                      className="text-[11px] font-medium text-indigo-600 hover:underline"
                    >
                      + Tambah
                    </button>
                  </div>
                  {factions.map((fc, idx) => (
                    <div key={idx} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                      <input
                        type="text"
                        value={fc.name}
                        onChange={(e) => {
                          const v = e.target.value;
                          setFactions((p) => p.map((item, i) => (i === idx ? { ...item, name: v } : item)));
                        }}
                        placeholder="Nama Faksi"
                        className="w-full h-7 px-2 rounded border border-slate-200 bg-white text-xs"
                      />
                      <input
                        type="text"
                        value={fc.description}
                        onChange={(e) => {
                          const v = e.target.value;
                          setFactions((p) =>
                            p.map((item, i) => (i === idx ? { ...item, description: v } : item))
                          );
                        }}
                        placeholder="Peran faksi"
                        className="w-full h-7 px-2 rounded border border-slate-200 bg-white text-xs"
                      />
                    </div>
                  ))}
                </div>

                {/* Garis Waktu */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800 inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      <span>Garis Waktu</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setTimeline((p) => [...p, { era: '', event: '' }])}
                      className="text-[11px] font-medium text-indigo-600 hover:underline"
                    >
                      + Tambah
                    </button>
                  </div>
                  {timeline.map((tm, idx) => (
                    <div key={idx} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                      <input
                        type="text"
                        value={tm.era}
                        onChange={(e) => {
                          const v = e.target.value;
                          setTimeline((p) => p.map((item, i) => (i === idx ? { ...item, era: v } : item)));
                        }}
                        placeholder="Tahun / Era"
                        className="w-full h-7 px-2 rounded border border-slate-200 bg-white text-xs"
                      />
                      <input
                        type="text"
                        value={tm.event}
                        onChange={(e) => {
                          const v = e.target.value;
                          setTimeline((p) =>
                            p.map((item, i) => (i === idx ? { ...item, event: v } : item))
                          );
                        }}
                        placeholder="Peristiwa penting"
                        className="w-full h-7 px-2 rounded border border-slate-200 bg-white text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingWorld}
                  className="h-9 px-5 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingWorld ? 'Menyimpan...' : 'Simpan Dunia'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Daftar Entri Lorebook Berbasis Kata Kunci */}
          {!isCreatingWorld && activeWorld && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-2xs">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-indigo-600" />
                  <span>Entri Lorebook ({activeWorld.lore_entries?.length || 0})</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Entri di bawah hanya disuntikkan ke dalam prompt karakter saat salah satu kata kuncinya muncul di obrolan.
                </p>
              </div>

              <form
                onSubmit={handleAddLoreEntry}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Judul Entri Lore
                    </label>
                    <input
                      type="text"
                      value={loreTitle}
                      onChange={(e) => setLoreTitle(e.target.value)}
                      placeholder="Contoh: Menara Jam Agung"
                      className="w-full h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Kata Kunci Pemicu (Pisahkan dengan koma) *
                    </label>
                    <input
                      type="text"
                      required
                      value={loreKeywords}
                      onChange={(e) => setLoreKeywords(e.target.value)}
                      placeholder="menara jam, lonceng, dewan"
                      className="w-full h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Penjelasan Fakta Lore *
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={loreContent}
                    onChange={(e) => setLoreContent(e.target.value)}
                    placeholder="Tuliskan fakta spesifik yang harus diketahui karakter saat kata kunci di atas disebut..."
                    className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={addingLore}
                    className="h-8 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{addingLore ? 'Menambahkan...' : 'Tambah Entri Lore'}</span>
                  </button>
                </div>
              </form>

              <div className="space-y-2.5">
                {(activeWorld.lore_entries || []).map((entry: any) => (
                  <div
                    key={entry.id}
                    className="p-3.5 rounded-xl border border-slate-200 flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900">{entry.title}</span>
                        {(entry.keywords || []).map((kw: string) => (
                          <span
                            key={kw}
                            className="px-2 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200 text-[10px] font-medium"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed">{entry.content}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteLoreEntry(entry.id)}
                      className="text-slate-400 hover:text-rose-600 shrink-0"
                      title="Hapus Entri"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Karakter Penghuni Dunia Ini */}
              {activeWorld.characters?.length > 0 && (
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <h4 className="text-xs font-semibold text-slate-800">
                    Karakter di Dunia Ini ({activeWorld.characters.length})
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {activeWorld.characters.map((c: any) => (
                      <Link
                        key={c.id}
                        href={`/characters/${c.id}`}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 hover:border-indigo-300 flex items-center gap-2 text-xs font-medium text-slate-800"
                      >
                        <CharacterAvatar name={c.name} avatar={c.avatar} size="sm" />
                        <span>{c.name}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={Boolean(deleteWorldTarget)}
        title="Hapus Dunia & Lorebook?"
        description="Seluruh entri lore di dalam dunia ini akan dihapus. Karakter yang tinggal di dunia ini tidak akan terhapus."
        confirmLabel="Hapus Dunia"
        onConfirm={handleConfirmDeleteWorld}
        onCancel={() => setDeleteWorldTarget(null)}
      />
    </div>
  );
}
