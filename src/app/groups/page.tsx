'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Users, Plus, Trash2, ChevronRight, AlertCircle } from 'lucide-react';
import CharacterAvatar from '@/components/CharacterAvatar';
import ConfirmModal from '@/components/ConfirmModal';
import { getClientCache, setClientCache, invalidateClientCache } from '@/lib/clientCache';

export default function GroupsPage() {
  const router = useRouter();
  const [groupChats, setGroupChats] = useState<any[]>(() => {
    return getClientCache<any[]>('group_chats_list') || [];
  });
  const [characters, setCharacters] = useState<any[]>(() => {
    return getClientCache<any[]>('home_characters') || [];
  });
  const [loading, setLoading] = useState(() => {
    const cached = getClientCache<any[]>('group_chats_list');
    return !cached || cached.length === 0;
  });
  const [error, setError] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [scenarioInput, setScenarioInput] = useState('');
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const loadData = async (isBackground = false) => {
    if (!isBackground) {
      const cached = getClientCache<any[]>('group_chats_list');
      if (!cached || cached.length === 0) setLoading(true);
    }
    setError('');
    try {
      const [gRes, cRes] = await Promise.all([
        fetch('/api/group-chats'),
        fetch('/api/characters'),
      ]);
      const gData = await gRes.json();
      const cData = await cRes.json();
      const groups = gData.groupChats || [];
      const chars = cData.characters || [];
      setGroupChats(groups);
      setCharacters(chars);
      setClientCache('group_chats_list', groups);
      setClientCache('home_characters', chars);
    } catch (err) {
      if (!groupChats.length) {
        setError(err instanceof Error ? err.message : 'Gagal memuat daftar grup chat.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const hasCached = (getClientCache<any[]>('group_chats_list') || []).length > 0;
    loadData(hasCached);
  }, []);

  const toggleCharacterSelection = (id: string) => {
    setSelectedCharIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCharIds.length < 2) {
      setError('Pilih minimal 2 karakter untuk membuat ruang Grup Chat.');
      return;
    }

    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/group-chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleInput.trim(),
          scenario: scenarioInput.trim(),
          characterIds: selectedCharIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal membuat grup chat.');
      setShowCreateModal(false);
      router.push(`/groups/${data.groupChat.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat grup chat.');
      setCreating(false);
    }
  };

  const handleConfirmDeleteGroup = async () => {
    if (!deleteTargetId) return;
    try {
      await fetch(`/api/group-chats/${deleteTargetId}`, { method: 'DELETE' });
      const nextGroups = groupChats.filter((g) => g.id !== deleteTargetId);
      setGroupChats(nextGroups);
      setClientCache('group_chats_list', nextGroups);
      invalidateClientCache(`group_room_${deleteTargetId}`);
      setDeleteTargetId(null);
    } catch {
      setError('Gagal menghapus grup chat.');
    }
  };

  return (
    <div className="max-w-5xl w-full mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Grup Chat Multi-Karakter</h1>
          <p className="text-xs text-slate-500">
            Pertemukan dua karakter atau lebih dalam satu ruangan. Giliran bicara ditentukan dari nama yang disebut atau bergantian otomatis.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setSelectedCharIds([]);
            setTitleInput('');
            setScenarioInput('');
            setShowCreateModal(true);
          }}
          className="w-full sm:w-auto h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Buat Grup Chat</span>
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="text-xs text-slate-400">Memuat ruang grup chat...</div>
      ) : groupChats.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3">
          <Users className="w-8 h-8 text-indigo-600 mx-auto" />
          <p className="text-base font-semibold text-slate-800">Belum Ada Grup Chat</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Gabungkan beberapa karakter favorit Anda dalam satu skenario diskusi atau petualangan bersama.
          </p>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Grup Chat Pertama</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groupChats.map((g) => (
            <div
              key={g.id}
              className="bg-white rounded-2xl border border-slate-200 p-4 hover:border-indigo-300 transition-all flex flex-col justify-between gap-4 shadow-2xs"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/groups/${g.id}`} className="group flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-slate-900 group-hover:text-indigo-600 truncate">
                      {g.title}
                    </h3>
                    {g.scenario && (
                      <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{g.scenario}</p>
                    )}
                  </Link>
                  <button
                    type="button"
                    onClick={() => setDeleteTargetId(g.id)}
                    className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center"
                    title="Hapus Grup"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {(g.members || []).map((m: any) => (
                    <span
                      key={m.id}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs font-medium inline-flex items-center gap-1.5"
                    >
                      <CharacterAvatar name={m.name} avatar={m.avatar} size="sm" />
                      <span>{m.name}</span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">{g.message_count || 0} pesan</span>
                <Link
                  href={`/groups/${g.id}`}
                  className="font-semibold text-indigo-600 hover:underline inline-flex items-center gap-1"
                >
                  <span>Buka Ruang Grup</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Buat Grup Chat Baru */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <form
            onSubmit={handleCreateGroup}
            className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-5 shadow-xl space-y-4"
          >
            <div>
              <h3 className="text-base font-semibold text-slate-900">Buat Grup Chat Baru</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Pilih minimal 2 karakter yang akan berinteraksi bersama di ruangan ini.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Judul Ruang Grup (Opsional)
              </label>
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="Contoh: Diskusi Tengah Malam di Baker Street"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Situasi / Skenario Pertemuan (Opsional)
              </label>
              <textarea
                rows={2}
                value={scenarioInput}
                onChange={(e) => setScenarioInput(e.target.value)}
                placeholder="Jelaskan secara singkat di mana mereka sedang berkumpul dan apa topiknya..."
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Pilih Anggota Karakter ({selectedCharIds.length} dipilih) *
              </label>
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                {characters.map((c) => {
                  const selected = selectedCharIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCharacterSelection(c.id)}
                      className={`w-full text-left p-2.5 rounded-xl border flex items-center gap-3 transition-all ${
                        selected
                          ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <CharacterAvatar name={c.name} avatar={c.avatar} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-900 truncate">{c.name}</p>
                        <p className="text-[11px] text-slate-500 truncate">{c.tagline}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="w-full sm:w-auto h-9 px-4 rounded-lg border border-slate-200 text-xs font-medium text-slate-700"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={creating || selectedCharIds.length < 2}
                className="w-full sm:w-auto h-9 px-5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-semibold"
              >
                {creating ? 'Membuat...' : 'Mulai Grup Chat'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTargetId)}
        title="Hapus Ruang Grup Chat?"
        description="Seluruh riwayat percakapan di dalam grup ini akan dihapus permanen."
        confirmLabel="Hapus Grup"
        onConfirm={handleConfirmDeleteGroup}
        onCancel={() => setDeleteTargetId(null)}
      />
    </div>
  );
}
