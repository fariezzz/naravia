'use client';

import React, { useEffect, useRef, useState } from 'react';
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
  Globe2,
  Lock,
  UserCircle2,
  Bookmark,
  Plus,
  ChevronDown,
  ChevronRight,
  GitFork,
  ImageDown,
  MoreHorizontal,
} from 'lucide-react';
import CharacterAvatar from '@/components/CharacterAvatar';
import CharacterForm from '@/components/CharacterForm';
import ConfirmModal from '@/components/ConfirmModal';
import { useAuth } from '@/lib/AuthContext';
import { getClientCache, setClientCache, invalidateClientCache } from '@/lib/clientCache';

export default function CharacterProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
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
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [showResearchNotes, setShowResearchNotes] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [moreMenuOpen]);

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
    // Tamu tanpa akun diarahkan ke login dulu, lalu dikembalikan ke profil ini
    if (!authLoading && !user) {
      router.push(`/login?next=${encodeURIComponent(`/characters/${characterId}`)}`);
      return;
    }
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

  const handleExportCard = (format: 'json' | 'png') => {
    if (!character) return;
    window.location.href = `/api/characters/${character.id}/export?format=${format}`;
  };

  const handleToggleBookmark = async () => {
    if (!character) return;
    if (!authLoading && !user) {
      router.push(`/login?next=${encodeURIComponent(`/characters/${characterId}`)}`);
      return;
    }
    try {
      const res = await fetch(`/api/characters/${character.id}/bookmark`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setCharacter((prev: any) =>
          prev
            ? {
                ...prev,
                bookmarked: Boolean(data.bookmarked),
                bookmark_count: Number(data.bookmark_count || 0),
              }
            : prev
        );
      }
    } catch {
      setError('Gagal memperbarui bookmark karakter.');
    }
  };

  const handleRemixCharacter = async () => {
    if (!character) return;
    if (!authLoading && !user) {
      router.push(`/login?next=${encodeURIComponent(`/characters/${characterId}`)}`);
      return;
    }
    setActionLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/characters/${character.id}/remix`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyalin karakter.');
      invalidateClientCache('home_characters');
      router.push(`/characters/${data.character.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyalin karakter.');
      setActionLoading(false);
    }
  };

  const handleToggleAllowRemix = async () => {
    if (!character || !character.is_owner) return;
    const nextVal = !character.allow_remix;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/characters/${character.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allow_remix: nextVal }),
      });
      const data = await res.json();
      if (res.ok && data.character) {
        setCharacter((prev: any) => (prev ? { ...prev, allow_remix: data.character.allow_remix } : prev));
        invalidateClientCache(`char_profile_${character.id}`);
      }
    } catch {
      setError('Gagal mengubah izin remix.');
    } finally {
      setActionLoading(false);
    }
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
      <div className="max-w-5xl w-full mx-auto px-4 py-8 text-sm text-slate-500 dark:text-slate-400">
        Memuat profil karakter...
      </div>
    );
  }

  if (!character) {
    return (
      <div className="max-w-5xl w-full mx-auto px-4 py-8 space-y-4">
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-sm text-rose-700 dark:text-rose-300">
          {error || 'Karakter tidak ditemukan.'}
        </div>
        <Link href="/" className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
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
              className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 inline-flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="font-display text-2xl sm:text-3xl text-slate-900 dark:text-white">
                Edit Karakter &mdash; {character.name}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Perbarui personalisasi, sapaan awal, atau contoh dialog.
              </p>
            </div>
          </div>
        </div>

        <CharacterForm initialValues={character} isEdit />
      </div>
    );
  }

  const hasSecondaryActions = Boolean(character.is_owner || character.allow_remix);

  return (
    <div className="max-w-5xl w-full mx-auto px-4 py-6 space-y-6">
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Header Profil Karakter */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-2xs space-y-4 sm:space-y-5">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4 w-full md:w-auto min-w-0">
            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start shrink-0">
              <Link
                href="/"
                className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 inline-flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
                title="Kembali ke Beranda"
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
              <h1 className="font-display text-2xl sm:text-3xl text-slate-900 dark:text-white leading-tight">
                {character.name}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{character.tagline}</p>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {character.world_name &&
                  (character.is_owner ? (
                    <Link
                      href="/worlds"
                      className="px-2.5 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-xs font-medium inline-flex items-center gap-1"
                    >
                      <Globe className="w-3 h-3" />
                      <span>{character.world_name}</span>
                    </Link>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-xs font-medium inline-flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      <span>{character.world_name}</span>
                    </span>
                  ))}
                {(character.tags || []).map((tag: string) => (
                  <span
                    key={tag}
                    className="px-2.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium"
                  >
                    {tag}
                  </span>
                ))}
                <span className="px-2.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-medium">
                  {chats.length} Ruang Chat
                </span>
                {/* Visibilitas & izin remix hanya relevan bagi pemiliknya */}
                {character.is_owner && (
                  <>
                    <span
                      className={`px-2.5 py-0.5 rounded-md text-xs font-medium inline-flex items-center gap-1 border ${
                        character.visibility === 'public'
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {character.visibility === 'public' ? <Globe2 className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                      <span>{character.visibility === 'public' ? 'Publik' : 'Pribadi'}</span>
                    </span>
                    {character.visibility === 'public' && (
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={handleToggleAllowRemix}
                        className={`px-2.5 py-0.5 rounded-md text-xs font-medium inline-flex items-center gap-1 border transition-colors ${
                          character.allow_remix
                            ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/60'
                            : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                        title="Klik untuk mengubah apakah pengguna lain boleh menyalin (remix) atau mengekspor karakter publik ini"
                      >
                        <GitFork className="w-3 h-3" />
                        <span>{character.allow_remix ? 'Remix Diizinkan' : 'Remix Nonaktif'}</span>
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Pembuat karakter: hanya nama tampilan, email tidak pernah diekspos */}
              {character.creator_name && (
                <p className="text-xs text-slate-500 dark:text-slate-400 pt-0.5 inline-flex items-center gap-1.5">
                  <UserCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Dibuat oleh{' '}
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {character.is_owner ? `${character.creator_name} (kamu)` : character.creator_name}
                    </span>
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Baris Aksi Utama + Menu Overflow */}
          <div className="flex items-center gap-2 w-full md:w-auto justify-start md:justify-end shrink-0">
            {!character.is_owner && (
              <button
                type="button"
                onClick={handleToggleBookmark}
                className={`h-9 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  character.bookmarked
                    ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                }`}
                title={character.bookmarked ? 'Hapus dari bookmark' : 'Simpan karakter ini'}
              >
                <Bookmark className={`w-3.5 h-3.5 ${character.bookmarked ? 'fill-current' : ''}`} />
                <span>{character.bookmarked ? 'Tersimpan' : 'Simpan'}</span>
                {Number(character.bookmark_count || 0) > 0 && (
                  <span className="text-[11px] opacity-80">({character.bookmark_count})</span>
                )}
              </button>
            )}

            {!character.is_owner && character.allow_remix && (
              <button
                type="button"
                onClick={handleRemixCharacter}
                disabled={actionLoading}
                className="h-9 px-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-xs font-semibold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5 whitespace-nowrap"
                title="Salin karakter ini ke koleksi pribadimu agar bisa kamu ubah sendiri"
              >
                <GitFork className="w-3.5 h-3.5" />
                <span>Remix</span>
              </button>
            )}

            {character.is_owner && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="h-9 px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            )}

            {hasSecondaryActions && (
              <div className="relative" ref={moreMenuRef}>
                <button
                  type="button"
                  onClick={() => setMoreMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={moreMenuOpen}
                  title="Aksi lainnya (Ekspor, Duplikat, Hapus)"
                  className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 inline-flex items-center justify-center transition-colors"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>

                {moreMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-1.5 w-48 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1.5 z-30"
                  >
                    {character.is_owner && (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={actionLoading}
                        onClick={() => {
                          setMoreMenuOpen(false);
                          handleDuplicate();
                        }}
                        className="w-full px-3 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                      >
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                        <span>Duplikat Karakter</span>
                      </button>
                    )}

                    {(character.is_owner || character.allow_remix) && (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMoreMenuOpen(false);
                            handleExportCard('json');
                          }}
                          className="w-full px-3 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                        >
                          <Download className="w-3.5 h-3.5 text-slate-400" />
                          <span>Ekspor JSON (V2)</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMoreMenuOpen(false);
                            handleExportCard('png');
                          }}
                          className="w-full px-3 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                        >
                          <ImageDown className="w-3.5 h-3.5 text-slate-400" />
                          <span>Ekspor Kartu PNG</span>
                        </button>
                      </>
                    )}

                    {character.is_owner && (
                      <>
                        <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMoreMenuOpen(false);
                            setDeleteCharModal(true);
                          }}
                          className="w-full px-3 py-2 text-left text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Hapus Karakter</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Pemilih Sapaan & Tombol Mulai Chat */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="w-full md:flex-1 min-w-0 max-w-full">
            {character.greeting?.length > 1 ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2.5">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap shrink-0">
                  Sapaan Pembuka:
                </span>
                <select
                  value={selectedGreetingIdx}
                  onChange={(e) => setSelectedGreetingIdx(Number(e.target.value))}
                  className="h-10 px-3 py-0 rounded-xl border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-950 w-full sm:flex-1 min-w-0 truncate focus:outline-none focus:border-indigo-500 shadow-2xs"
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
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate py-1">
                Sapaan Awal: &ldquo;{(character.greeting?.[0] || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 80)}&rdquo;
              </p>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
            {chats.length > 0 && (
              <Link
                href={`/chat/${chats[0].id}`}
                className="h-10 px-4 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors shadow-2xs"
              >
                <span>Lanjutkan Chat Terakhir</span>
              </Link>
            )}
            <button
              type="button"
              disabled={actionLoading}
              onClick={handleStartNewChat}
              className="h-10 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shadow-xs transition-colors"
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-2xs">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Personalisasi Karakter</h2>

            <div className="space-y-3 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              <div>
                <span className="font-semibold text-slate-900 dark:text-slate-100 block mb-0.5">Deskripsi</span>
                <p className="whitespace-pre-line">{character.description || '-'}</p>
              </div>
              {character.prompt_hidden ? (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Detail kepribadian, gaya bicara, dan skenario dikunci oleh pembuat (Remix nonaktif).
                  </span>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 block mb-0.5">Kepribadian</span>
                      <p className="whitespace-pre-line">{character.personality || '-'}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 block mb-0.5">Gaya Bicara</span>
                      <p className="whitespace-pre-line">{character.speaking_style || '-'}</p>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="font-semibold text-slate-900 dark:text-slate-100 block mb-0.5">
                      Latar & Situasi Awal
                    </span>
                    <p className="whitespace-pre-line">{character.scenario || '-'}</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Catatan Riset Karakter (Collapsible, default tertutup agar profil tetap ringkas) */}
          {character.research_notes?.summary && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
              <button
                type="button"
                onClick={() => setShowResearchNotes((v) => !v)}
                aria-expanded={showResearchNotes}
                className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Catatan Riset & Referensi</h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {showResearchNotes
                      ? 'Sembunyikan ringkasan hasil riset karakter'
                      : 'Klik untuk melihat ringkasan hasil riset & verifikasi kanon'}
                  </p>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                    showResearchNotes ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {showResearchNotes && (
                <div className="px-5 pb-5 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    {character.research_notes.summary}
                  </p>
                  {character.research_notes.revision_verification && (
                    <div
                      className={`mt-2 p-3 rounded-xl border text-xs space-y-1 ${
                        character.research_notes.revision_verification.valid
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200'
                          : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-950 dark:text-rose-200'
                      }`}
                    >
                      <div className="font-semibold">
                        {character.research_notes.revision_verification.valid
                          ? 'Status Verifikasi Revisi: Terverifikasi Sesuai Fakta'
                          : 'Status Verifikasi Revisi: Catatan Koreksi Kanon'}
                      </div>
                      <p className="leading-relaxed">
                        {character.research_notes.revision_verification.explanation}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Memori Jangka Panjang Karakter: pribadi, hanya untuk pemilik */}
          {character.is_owner && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Bookmark className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Memori Jangka Panjang ({memories.length})</span>
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Fakta dan preferensi yang selalu diingat {character.name} lintas ruang percakapan.
                  </p>
                </div>
              </div>

              <form onSubmit={handleAddMemory} className="space-y-2.5">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <select
                    value={newMemType}
                    onChange={(e) => setNewMemType(e.target.value as 'fact' | 'preference')}
                    className="h-10 sm:h-9 px-3 py-0 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-950 shrink-0 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="fact">Fakta Karakter/Pengguna</option>
                    <option value="preference">Preferensi / Kesukaan</option>
                  </select>
                  <div className="w-full sm:flex-1 min-w-0">
                    <textarea
                      rows={2}
                      value={newMemContent}
                      onChange={(e) => setNewMemContent(e.target.value)}
                      placeholder={`Tambah fakta atau preferensi baru untuk diingat ${character.name}... (misal: "Suka kopi tanpa gula", "Ulang tahun tanggal 12 Mei")`}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-2.5 sm:p-3 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 resize-none min-h-[58px]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!newMemContent.trim()}
                    className="h-10 sm:h-auto sm:self-stretch px-4 rounded-xl bg-slate-900 dark:bg-indigo-600 hover:bg-indigo-600 dark:hover:bg-indigo-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors shadow-2xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Simpan</span>
                  </button>
                </div>
              </form>

              {memories.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500 py-2">
                  Belum ada memori tersimpan. Anda dapat menandai pesan di ruang chat atau menambahkannya di atas.
                </p>
              ) : (
                <div className="space-y-2">
                  {memories.map((mem) => (
                    <div
                      key={mem.id}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="space-y-0.5">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold mr-1.5">
                          {mem.type === 'preference' ? 'Preferensi' : 'Fakta'}
                        </span>
                        <span className="text-slate-800 dark:text-slate-200">{mem.content}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteMemory(mem.id)}
                        className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 shrink-0"
                        title="Hapus Memori"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Kolom Kanan (1/3): Daftar Riwayat Ruang Chat */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3 shadow-2xs">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Riwayat Ruang Chat ({chats.length})
            </h2>
            {chats.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Belum ada percakapan dengan {character.name}. Klik &ldquo;Mulai Chat Baru&rdquo; untuk mengobrol.
              </p>
            ) : (
              <div className="space-y-2">
                {chats.map((ch) => (
                  <div
                    key={ch.id}
                    className="group p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-500/60 flex items-center justify-between gap-2 transition-all"
                  >
                    <Link href={`/chat/${ch.id}`} className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate">
                        {ch.title}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {ch.message_count || 1} pesan &bull; {new Date(ch.updated_at).toLocaleDateString('id-ID')}
                      </p>
                    </Link>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setDeleteChatTarget(ch.id)}
                        className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 inline-flex items-center justify-center"
                        title="Hapus Percakapan"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <Link
                        href={`/chat/${ch.id}`}
                        className="w-7 h-7 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 inline-flex items-center justify-center"
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
