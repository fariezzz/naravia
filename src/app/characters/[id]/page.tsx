'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  MessageSquare,
  Edit3,
  Copy,
  Trash2,
  Download,
  Globe,
  Bookmark,
  Plus,
  ChevronRight,
} from 'lucide-react';
import CharacterAvatar from '@/components/CharacterAvatar';
import CharacterForm from '@/components/CharacterForm';
import ConfirmModal from '@/components/ConfirmModal';
import { getClientCache, setClientCache, invalidateClientCache } from '@/lib/clientCache';

export default function CharacterProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const characterId = params.id;

  const [character, setCharacter] = useState<any>(() => {
    return getClientCache<any>(`char_profile_${characterId}`)?.character || null;
  });
  const [chats, setChats] = useState<any[]>(() => {
    return getClientCache<any>(`char_profile_${characterId}`)?.chats || [];
  });
  const [memories, setMemories] = useState<any[]>(() => {
    return getClientCache<any>(`char_profile_${characterId}`)?.memories || [];
  });
  const [loading, setLoading] = useState(() => {
    const cached = getClientCache<any>(`char_profile_${characterId}`);
    return !cached || !cached.character;
  });
  const [error, setError] = useState('');

  const [isEditing, setIsEditing] = useState(false);
  const [deleteCharModal, setDeleteCharModal] = useState(false);
  const [deleteChatTarget, setDeleteChatTarget] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [selectedGreetingIdx, setSelectedGreetingIdx] = useState(0);
  const [newMemContent, setNewMemContent] = useState('');
  const [newMemType, setNewMemType] = useState<'fact' | 'preference'>('fact');

  const loadProfile = async (isBackground = false) => {
    if (!isBackground) {
      const cached = getClientCache<any>(`char_profile_${characterId}`);
      if (!cached || !cached.character) setLoading(true);
    }
    setError('');
    try {
      const res = await fetch(`/api/characters/${characterId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Karakter tidak ditemukan.');
      setCharacter(data.character);
      setChats(data.chats || []);
      setMemories(data.memories || []);
      setClientCache(`char_profile_${characterId}`, {
        character: data.character,
        chats: data.chats || [],
        memories: data.memories || [],
      });
    } catch (err) {
      if (!character) {
        setError(err instanceof Error ? err.message : 'Gagal memuat profil karakter.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (characterId) {
      const cached = getClientCache<any>(`char_profile_${characterId}`);
      loadProfile(Boolean(cached?.character));
    }
  }, [characterId]);

  const handleStartNewChat = async () => {
    if (!character) return;
    setActionLoading(true);
    setError('');
    try {
      const res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: character.id,
          greetingIndex: selectedGreetingIdx,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memulai percakapan.');
      router.push(`/chat/${data.chat.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memulai percakapan.');
      setActionLoading(false);
    }
  };

  const handleDuplicate = async () => {
    if (!character) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/characters/${character.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'duplicate' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menduplikasi karakter.');
      router.push(`/characters/${data.character.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menduplikasi karakter.');
      setActionLoading(false);
    }
  };

  const handleDeleteCharacter = async () => {
    if (!character) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/characters/${character.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Gagal menghapus karakter.');
      invalidateClientCache('home_characters');
      invalidateClientCache('home_recent_chats');
      invalidateClientCache(`char_profile_${character.id}`);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus karakter.');
      setActionLoading(false);
      setDeleteCharModal(false);
    }
  };

  const handleDeleteChat = async () => {
    if (!deleteChatTarget) return;
    setActionLoading(true);
    try {
      await fetch(`/api/chats/${deleteChatTarget}`, { method: 'DELETE' });
      const nextChats = chats.filter((c) => c.id !== deleteChatTarget);
      setChats(nextChats);
      setDeleteChatTarget(null);
      invalidateClientCache(`chat_room_${deleteChatTarget}`);
      invalidateClientCache('home_recent_chats');
      setClientCache(`char_profile_${characterId}`, {
        character,
        chats: nextChats,
        memories,
      });
    } catch {
      setError('Gagal menghapus ruang percakapan.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExportJson = () => {
    if (!character) return;
    const cardV2 = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: character.name,
        description: character.description,
        personality: character.personality,
        scenario: character.scenario,
        first_mes: character.greeting?.[0] || '',
        alternate_greetings: (character.greeting || []).slice(1),
        mes_example: (character.example_dialogues || [])
          .map((d: { user: string; char: string }) => `<START>\n{{user}}: ${d.user}\n{{char}}: ${d.char}`)
          .join('\n'),
        creator_notes: character.tagline,
        system_prompt: character.speaking_style,
        tags: character.tags || [],
        extensions: {
          naravia: {
            tagline: character.tagline,
            speaking_style: character.speaking_style,
            example_dialogues: character.example_dialogues,
            research_notes: character.research_notes,
          },
        },
      },
    };

    const blob = new Blob([JSON.stringify(cardV2, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${character.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-card.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemContent.trim() || !character) return;
    try {
      const res = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: character.id,
          type: newMemType,
          content: newMemContent.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.memory) {
        setMemories((prev) => [data.memory, ...prev]);
        setNewMemContent('');
      }
    } catch {
      setError('Gagal menambah memori.');
    }
  };

  const handleDeleteMemory = async (memId: string) => {
    try {
      await fetch(`/api/memories?id=${encodeURIComponent(memId)}`, { method: 'DELETE' });
      setMemories((prev) => prev.filter((m) => m.id !== memId));
    } catch {
      setError('Gagal menghapus memori.');
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl w-full mx-auto px-4 py-8 text-sm text-slate-500">
        Memuat profil karakter...
      </div>
    );
  }

  if (!character) {
    return (
      <div className="max-w-5xl w-full mx-auto px-4 py-8 space-y-4">
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          {error || 'Karakter tidak ditemukan.'}
        </div>
        <Link href="/" className="text-sm font-medium text-indigo-600 hover:underline">
          Kembali ke Beranda
        </Link>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="max-w-6xl w-full mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="w-9 h-9 rounded-xl border border-slate-200 bg-white inline-flex items-center justify-center text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Edit Karakter - {character.name}</h1>
              <p className="text-xs text-slate-500">Perbarui personalisasi, sapaan awal, atau contoh dialog.</p>
            </div>
          </div>
        </div>

        <CharacterForm initialValues={character} isEdit />
      </div>
    );
  }

  return (
    <div className="max-w-5xl w-full mx-auto px-4 py-6 space-y-6">
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Header Profil Karakter */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4 sm:space-y-5">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4 w-full md:w-auto">
            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start shrink-0">
              <Link
                href="/"
                className="w-9 h-9 rounded-xl border border-slate-200 inline-flex items-center justify-center text-slate-600 hover:bg-slate-50 shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <div className="sm:hidden shrink-0">
                <CharacterAvatar name={character.name} avatar={character.avatar} size="lg" />
              </div>
            </div>
            <div className="hidden sm:block shrink-0">
              <CharacterAvatar name={character.name} avatar={character.avatar} size="xl" />
            </div>
            <div className="space-y-1.5 min-w-0 w-full sm:w-auto">
              <h1 className="text-xl font-bold text-slate-900">{character.name}</h1>
              <p className="text-sm text-slate-600 leading-relaxed">{character.tagline}</p>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {character.world_name && (
                  <Link
                    href="/worlds"
                    className="px-2.5 py-0.5 rounded-md bg-teal-50 text-teal-700 border border-teal-200 text-xs font-medium inline-flex items-center gap-1"
                  >
                    <Globe className="w-3 h-3" />
                    <span>{character.world_name}</span>
                  </Link>
                )}
                {(character.tags || []).map((tag: string) => (
                  <span
                    key={tag}
                    className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-medium"
                  >
                    {tag}
                  </span>
                ))}
                <span className="px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-xs font-medium">
                  {chats.length} Ruang Chat
                </span>
              </div>
            </div>
          </div>

          {/* Baris Aksi Satu Baris Rapi */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-start sm:justify-end shrink-0">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="h-9 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
            <button
              type="button"
              onClick={handleDuplicate}
              disabled={actionLoading}
              className="h-9 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Duplikat</span>
            </button>
            <button
              type="button"
              onClick={handleExportJson}
              className="h-9 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Ekspor JSON</span>
            </button>
            <button
              type="button"
              onClick={() => setDeleteCharModal(true)}
              className="h-9 px-3 rounded-lg border border-rose-200 hover:bg-rose-50 text-xs font-medium text-rose-600 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus</span>
            </button>
          </div>
        </div>

        {/* Pemilih Sapaan & Tombol Mulai Chat */}
        <div className="pt-4 border-t border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex-1 min-w-0 max-w-full">
            {character.greeting?.length > 1 ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2.5">
                <span className="text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0">
                  Sapaan Pembuka:
                </span>
                <select
                  value={selectedGreetingIdx}
                  onChange={(e) => setSelectedGreetingIdx(Number(e.target.value))}
                  className="h-12 sm:h-10 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-800 bg-white flex-1 w-full min-w-0 truncate focus:outline-none focus:border-indigo-500 shadow-2xs leading-normal"
                >
                  {character.greeting.map((g: string, idx: number) => {
                    const cleanSnippet = g.replace(/[\r\n\t]+/g, ' ').trim();
                    return (
                      <option key={idx} value={idx}>
                        Sapaan #{idx + 1}: {cleanSnippet.slice(0, 65)}...
                      </option>
                    );
                  })}
                </select>
              </div>
            ) : (
              <p className="text-xs text-slate-500 truncate py-1">
                Sapaan Awal: &ldquo;{(character.greeting?.[0] || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 80)}&rdquo;
              </p>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
            {chats.length > 0 && (
              <Link
                href={`/chat/${chats[0].id}`}
                className="h-12 sm:h-10 px-4 rounded-xl border border-slate-300 hover:bg-slate-50 text-xs sm:text-sm font-semibold text-slate-800 inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors shadow-2xs"
              >
                <span>Lanjutkan Chat Terakhir</span>
              </Link>
            )}
            <button
              type="button"
              disabled={actionLoading}
              onClick={handleStartNewChat}
              className="h-12 sm:h-10 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shadow-xs transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Mulai Chat Baru</span>
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Kolom Kiri (2/3): Detail Kepribadian, Latar, Catatan Riset */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-2xs">
            <h2 className="text-sm font-semibold text-slate-900">Personalisasi Karakter</h2>

            <div className="space-y-3 text-xs leading-relaxed text-slate-700">
              <div>
                <span className="font-semibold text-slate-900 block mb-0.5">Deskripsi</span>
                <p className="whitespace-pre-line">{character.description || '-'}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <span className="font-semibold text-slate-900 block mb-0.5">Kepribadian</span>
                  <p className="whitespace-pre-line">{character.personality || '-'}</p>
                </div>
                <div>
                  <span className="font-semibold text-slate-900 block mb-0.5">Gaya Bicara</span>
                  <p className="whitespace-pre-line">{character.speaking_style || '-'}</p>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100">
                <span className="font-semibold text-slate-900 block mb-0.5">Latar & Situasi Awal</span>
                <p className="whitespace-pre-line">{character.scenario || '-'}</p>
              </div>
            </div>
          </div>

          {/* Catatan Riset Karakter */}
          {character.research_notes?.summary && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2.5 shadow-2xs">
              <h2 className="text-sm font-semibold text-slate-900">Catatan Riset & Referensi</h2>
              <p className="text-xs text-slate-700 leading-relaxed">
                {character.research_notes.summary}
              </p>
              {character.research_notes.sources?.length > 0 && (
                <div className="text-xs text-slate-500 pt-1">
                  <span className="font-semibold text-slate-700">Sumber: </span>
                  {character.research_notes.sources.join(' • ')}
                </div>
              )}
            </div>
          )}

          {/* Memori Jangka Panjang Karakter */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                  <Bookmark className="w-4 h-4 text-indigo-600" />
                  <span>Memori Jangka Panjang ({memories.length})</span>
                </h2>
                <p className="text-[11px] text-slate-500">
                  Fakta dan preferensi yang selalu diingat {character.name} lintas ruang percakapan.
                </p>
              </div>
            </div>

            <form onSubmit={handleAddMemory} className="space-y-2.5">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <select
                  value={newMemType}
                  onChange={(e) => setNewMemType(e.target.value as 'fact' | 'preference')}
                  className="h-10 sm:h-9 px-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white shrink-0"
                >
                  <option value="fact">Fakta Karakter/Pengguna</option>
                  <option value="preference">Preferensi / Kesukaan</option>
                </select>
                <div className="flex-1 min-w-0">
                  <textarea
                    rows={2}
                    value={newMemContent}
                    onChange={(e) => setNewMemContent(e.target.value)}
                    placeholder={`Tambah fakta atau preferensi baru untuk diingat ${character.name}... (misal: "Suka kopi tanpa gula", "Ulang tahun tanggal 12 Mei")`}
                    className="w-full rounded-xl border border-slate-200 bg-white p-2.5 sm:p-3 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 resize-none min-h-[58px]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!newMemContent.trim()}
                  className="h-10 sm:h-auto sm:self-stretch px-4 rounded-xl bg-slate-900 hover:bg-indigo-600 disabled:bg-slate-300 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors shadow-2xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Simpan</span>
                </button>
              </div>
            </form>

            {memories.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">
                Belum ada memori tersimpan. Anda dapat menandai pesan di ruang chat atau menambahkannya di atas.
              </p>
            ) : (
              <div className="space-y-2">
                {memories.map((mem) => (
                  <div
                    key={mem.id}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5">
                      <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-semibold mr-1.5">
                        {mem.type === 'preference' ? 'Preferensi' : 'Fakta'}
                      </span>
                      <span className="text-slate-800">{mem.content}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteMemory(mem.id)}
                      className="text-slate-400 hover:text-rose-600 shrink-0"
                      title="Hapus Memori"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Kolom Kanan (1/3): Daftar Riwayat Ruang Chat */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 shadow-2xs">
            <h2 className="text-sm font-semibold text-slate-900">
              Riwayat Ruang Chat ({chats.length})
            </h2>
            {chats.length === 0 ? (
              <p className="text-xs text-slate-500 leading-relaxed">
                Belum ada percakapan dengan {character.name}. Klik &ldquo;Mulai Chat Baru&rdquo; untuk mengobrol.
              </p>
            ) : (
              <div className="space-y-2">
                {chats.map((ch) => (
                  <div
                    key={ch.id}
                    className="group p-3 rounded-xl border border-slate-200 hover:border-indigo-300 flex items-center justify-between gap-2 transition-all"
                  >
                    <Link href={`/chat/${ch.id}`} className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-900 group-hover:text-indigo-600 truncate">
                        {ch.title}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {ch.message_count || 1} pesan • {new Date(ch.updated_at).toLocaleDateString('id-ID')}
                      </p>
                    </Link>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setDeleteChatTarget(ch.id)}
                        className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center"
                        title="Hapus Percakapan"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <Link
                        href={`/chat/${ch.id}`}
                        className="w-7 h-7 rounded-lg text-slate-400 hover:text-indigo-600 inline-flex items-center justify-center"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={deleteCharModal}
        title={`Hapus Karakter ${character.name}?`}
        description="Seluruh ruang percakapan dan memori yang terkait dengan karakter ini juga akan dihapus secara permanen."
        confirmLabel="Hapus Karakter"
        loading={actionLoading}
        onConfirm={handleDeleteCharacter}
        onCancel={() => setDeleteCharModal(false)}
      />

      <ConfirmModal
        open={Boolean(deleteChatTarget)}
        title="Hapus Ruang Percakapan?"
        description="Seluruh riwayat pesan di dalam ruang percakapan ini akan dihapus dan tidak dapat dikembalikan."
        confirmLabel="Hapus Chat"
        loading={actionLoading}
        onConfirm={handleDeleteChat}
        onCancel={() => setDeleteChatTarget(null)}
      />
    </div>
  );
}
