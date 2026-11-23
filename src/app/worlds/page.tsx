'use client';

import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Globe, Plus } from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import LorebookSection from '@/components/worlds/LorebookSection';
import WorldEditorForm from '@/components/worlds/WorldEditorForm';
import WorldsEmptyState from '@/components/worlds/WorldsEmptyState';
import { getClientCache, invalidateClientCache, setClientCache } from '@/lib/clientCache';

export default function WorldsPage() {
  const [worlds, setWorlds] = useState<any[]>(() => getClientCache<any[]>('worlds_list') || []);
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(
    () => getClientCache<any[]>('worlds_list')?.[0]?.id || null
  );
  const [loading, setLoading] = useState(() => (getClientCache<any[]>('worlds_list') || []).length === 0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [isCreatingWorld, setIsCreatingWorld] = useState(false);
  const [worldName, setWorldName] = useState(() => getClientCache<any[]>('worlds_list')?.[0]?.name || '');
  const [worldDesc, setWorldDesc] = useState(() => getClientCache<any[]>('worlds_list')?.[0]?.description || '');
  const [worldRules, setWorldRules] = useState(() => getClientCache<any[]>('worlds_list')?.[0]?.rules || '');
  const [places, setPlaces] = useState<Array<{ name: string; description: string }>>(
    () => getClientCache<any[]>('worlds_list')?.[0]?.places || []
  );
  const [factions, setFactions] = useState<Array<{ name: string; description: string }>>(
    () => getClientCache<any[]>('worlds_list')?.[0]?.factions || []
  );
  const [timeline, setTimeline] = useState<Array<{ era: string; event: string }>>(
    () => getClientCache<any[]>('worlds_list')?.[0]?.timeline || []
  );
  const [savingWorld, setSavingWorld] = useState(false);

  const [loreTitle, setLoreTitle] = useState('');
  const [loreKeywords, setLoreKeywords] = useState('');
  const [loreContent, setLoreContent] = useState('');
  const [addingLore, setAddingLore] = useState(false);
  const [deleteWorldTarget, setDeleteWorldTarget] = useState<string | null>(null);

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

  const loadWorlds = async (preferId?: string, isBackground = false) => {
    if (!isBackground && (getClientCache<any[]>('worlds_list') || []).length === 0) setLoading(true);
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
      if (target) selectWorldForEdit(target);
      else setSelectedWorldId(null);
    } catch (err) {
      if (!worlds.length) setError(err instanceof Error ? err.message : 'Gagal memuat daftar dunia.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorlds(undefined, (getClientCache<any[]>('worlds_list') || []).length > 0);
  }, []);

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
      const res = await fetch(url, {
        method: isCreatingWorld ? 'POST' : 'PUT',
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
      invalidateClientCache('worlds_list');
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
          keywords: loreKeywords.split(',').map((k) => k.trim()).filter(Boolean),
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
    <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-7">
      <header className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
        <div className="space-y-2.5">
          <h1 className="font-display text-3xl sm:text-4xl text-slate-900 dark:text-white">Dunia & Lorebook</h1>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400 max-w-xl">
            Atur latar dunia tempat karakter tinggal. Entri lorebook akan otomatis masuk ke konteks chat saat kata
            kuncinya disebut.
          </p>
        </div>

        {(worlds.length > 0 || isCreatingWorld) && (
          <button
            type="button"
            onClick={startNewWorldForm}
            className="w-full sm:w-auto h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Dunia Baru</span>
          </button>
        )}
      </header>

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

      {!loading && worlds.length === 0 && !isCreatingWorld ? (
        <WorldsEmptyState onCreateFirst={startNewWorldForm} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="space-y-2">
            {loading ? (
              <div className="text-xs text-slate-400 p-3">Memuat daftar dunia...</div>
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
                        ? 'bg-slate-900 dark:bg-indigo-600 border-slate-900 dark:border-indigo-600 text-white'
                        : 'bg-white dark:bg-[#0f1729] border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold truncate">{w.name}</span>
                      <Globe className={`w-4 h-4 shrink-0 ${active ? 'text-indigo-200' : 'text-slate-400'}`} />
                    </div>
                    <p
                      className={`text-[11px] line-clamp-2 mt-1 ${
                        active ? 'text-slate-200' : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {w.description || 'Tanpa deskripsi'}
                    </p>
                    <div className={`mt-2 text-[10px] font-medium ${active ? 'text-indigo-100' : 'text-slate-400'}`}>
                      {w.lore_entries?.length || 0} Entri Lore · {w.characters?.length || 0} Karakter
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="lg:col-span-3 space-y-6">
            {(selectedWorldId || isCreatingWorld) && (
              <WorldEditorForm
                isCreating={isCreatingWorld}
                selectedWorldId={selectedWorldId}
                worldName={worldName}
                worldDesc={worldDesc}
                worldRules={worldRules}
                places={places}
                factions={factions}
                timeline={timeline}
                saving={savingWorld}
                onChangeName={setWorldName}
                onChangeDesc={setWorldDesc}
                onChangeRules={setWorldRules}
                onChangePlaces={setPlaces}
                onChangeFactions={setFactions}
                onChangeTimeline={setTimeline}
                onRequestDelete={setDeleteWorldTarget}
                onSubmit={handleSaveWorld}
              />
            )}

            {!isCreatingWorld && activeWorld && (
              <LorebookSection
                activeWorld={activeWorld}
                loreTitle={loreTitle}
                loreKeywords={loreKeywords}
                loreContent={loreContent}
                addingLore={addingLore}
                onChangeTitle={setLoreTitle}
                onChangeKeywords={setLoreKeywords}
                onChangeContent={setLoreContent}
                onAddLore={handleAddLoreEntry}
                onDeleteLore={handleDeleteLoreEntry}
              />
            )}
          </div>
        </div>
      )}

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
