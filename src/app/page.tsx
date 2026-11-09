'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  Pin,
  Star,
  MessageSquare,
  Plus,
  Upload,
  Globe,
  Clock,
  ChevronRight,
} from 'lucide-react';
import CharacterAvatar from '@/components/CharacterAvatar';
import { getClientCache, setClientCache } from '@/lib/clientCache';

interface CharacterItem {
  id: string;
  name: string;
  tagline: string;
  avatar: string;
  description: string;
  personality: string;
  greeting: string[];
  tags: string[];
  world_id: string | null;
  world_name: string | null;
  is_pinned: boolean;
  is_favorite: boolean;
  chat_count: number;
  last_chat_at: string | null;
}

interface RecentChatItem {
  id: string;
  character_id: string;
  title: string;
  character_name: string;
  character_avatar: string;
  last_message: string;
  updated_at: string;
}

export default function HomePage() {
  const router = useRouter();
  const [characters, setCharacters] = useState<CharacterItem[]>(() => {
    return getClientCache<CharacterItem[]>('home_characters') || [];
  });
  const [recentChats, setRecentChats] = useState<RecentChatItem[]>(() => {
    return getClientCache<RecentChatItem[]>('home_recent_chats') || [];
  });
  const [loading, setLoading] = useState<boolean>(() => {
    const cached = getClientCache<CharacterItem[]>('home_characters');
    return !cached || cached.length === 0;
  });
  const [error, setError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('Semua');
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  const [greetingModalChar, setGreetingModalChar] = useState<CharacterItem | null>(null);
  const [selectedGreetingIdx, setSelectedGreetingIdx] = useState(0);
  const [startingChatId, setStartingChatId] = useState<string | null>(null);

  const loadData = async (isBackground = false) => {
    if (!isBackground) {
      const cached = getClientCache<CharacterItem[]>('home_characters');
      if (!cached || cached.length === 0) setLoading(true);
    }
    setError('');
    try {
      const [charRes, chatRes] = await Promise.all([
        fetch('/api/characters'),
        fetch('/api/chats'),
      ]);
      const charData = await charRes.json();
      const chatData = await chatRes.json();

      if (!charRes.ok) throw new Error(charData.error || 'Gagal memuat karakter.');
      const chars = charData.characters || [];
      const chats = (chatData.chats || []).slice(0, 4);
      setCharacters(chars);
      setRecentChats(chats);
      setClientCache('home_characters', chars);
      setClientCache('home_recent_chats', chats);
    } catch (err) {
      if (!characters.length) {
        setError(err instanceof Error ? err.message : 'Gagal memuat data beranda.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const hasCached = (getClientCache<CharacterItem[]>('home_characters') || []).length > 0;
    loadData(hasCached);
  }, []);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    characters.forEach((c) => {
      (c.tags || []).forEach((t) => {
        if (t) set.add(t);
      });
    });
    return ['Semua', ...Array.from(set)];
  }, [characters]);

  const filteredCharacters = useMemo(() => {
    return characters.filter((c) => {
      if (onlyFavorites && !c.is_favorite) return false;
      if (selectedTag !== 'Semua' && !(c.tags || []).includes(selectedTag)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = c.name.toLowerCase().includes(q);
        const matchTagline = (c.tagline || '').toLowerCase().includes(q);
        const matchTags = (c.tags || []).some((t) => t.toLowerCase().includes(q));
        return matchName || matchTagline || matchTags;
      }
      return true;
    });
  }, [characters, onlyFavorites, selectedTag, searchQuery]);

  const togglePinOrFav = async (
    e: React.MouseEvent,
    char: CharacterItem,
    field: 'is_pinned' | 'is_favorite'
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const nextVal = !char[field];
    setCharacters((prev) => {
      const updated = prev.map((item) => (item.id === char.id ? { ...item, [field]: nextVal } : item));
      setClientCache('home_characters', updated);
      return updated;
    });

    try {
      await fetch(`/api/characters/${char.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: nextVal }),
      });
    } catch {
      loadData();
    }
  };

  const handleStartChatClick = async (char: CharacterItem) => {
    if (char.greeting && char.greeting.length > 1) {
      setGreetingModalChar(char);
      setSelectedGreetingIdx(0);
      return;
    }
    await createAndOpenChat(char.id, 0);
  };

  const createAndOpenChat = async (characterId: string, greetingIndex: number) => {
    setStartingChatId(characterId);
    setError('');
    try {
      const res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, greetingIndex }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memulai percakapan.');
      setGreetingModalChar(null);
      router.push(`/chat/${data.chat.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memulai percakapan.');
      setStartingChatId(null);
    }
  };

  return (
    <div className="max-w-6xl w-full mx-auto px-4 py-6 space-y-6">
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Lanjutkan Percakapan Terakhir */}
      {recentChats.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-slate-500" />
              <span>Percakapan Terakhir</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {recentChats.map((ch) => (
              <Link
                key={ch.id}
                href={`/chat/${ch.id}`}
                className="group bg-white rounded-xl border border-slate-200 p-3 hover:border-indigo-300 hover:shadow-xs transition-all flex items-center gap-3"
              >
                <CharacterAvatar name={ch.character_name} avatar={ch.character_avatar} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-sm font-semibold text-slate-900 truncate group-hover:text-indigo-600">
                      {ch.character_name}
                    </p>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {ch.last_message || ch.title}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Bar Pencarian & Filter Satu Baris Rapi */}
      <section className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama karakter, sifat, atau kata kunci..."
              className="w-full h-9 pl-9 pr-3.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setOnlyFavorites((prev) => !prev)}
              className={`h-9 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                onlyFavorites
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${onlyFavorites ? 'fill-amber-500 text-amber-500' : ''}`} />
              <span>Favorit</span>
            </button>

            <Link
              href="/characters/new?tab=import"
              className="h-9 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Impor Kartu</span>
            </Link>
          </div>
        </div>

        {/* Filter Kategori Tag */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {allTags.map((tag) => {
            const active = selectedTag === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTag(tag)}
                className={`h-7 px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </section>

      {/* Grid Karakter */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-48 rounded-2xl bg-white border border-slate-200 p-4 animate-pulse flex flex-col justify-between"
            >
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-1/2" />
                  <div className="h-3 bg-slate-100 rounded w-3/4" />
                </div>
              </div>
              <div className="h-8 bg-slate-100 rounded-lg w-full" />
            </div>
          ))}
        </div>
      ) : filteredCharacters.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3">
          <p className="text-base font-semibold text-slate-800">Tidak Ada Karakter Ditemukan</p>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Belum ada karakter yang cocok dengan pencarian Anda. Buat karakter baru dengan AI otomatis atau secara manual.
          </p>
          <div className="pt-2">
            <Link
              href="/characters/new"
              className="h-9 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Buat Karakter Baru</span>
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCharacters.map((char) => (
            <div
              key={char.id}
              className="bg-white rounded-2xl border border-slate-200 p-4 hover:border-slate-300 shadow-2xs transition-all flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2.5">
                  <Link
                    href={`/characters/${char.id}`}
                    className="flex items-start gap-3 min-w-0 flex-1 group"
                  >
                    <CharacterAvatar name={char.name} avatar={char.avatar} size="md" />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold text-slate-900 group-hover:text-indigo-600 truncate transition-colors">
                        {char.name}
                      </h3>
                      <p className="text-xs text-slate-600 line-clamp-2 mt-0.5 leading-relaxed">
                        {char.tagline || char.description}
                      </p>
                    </div>
                  </Link>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => togglePinOrFav(e, char, 'is_pinned')}
                      title={char.is_pinned ? 'Lepas Sematan' : 'Sematkan di Atas'}
                      className={`w-7 h-7 rounded-lg inline-flex items-center justify-center transition-colors ${
                        char.is_pinned
                          ? 'bg-indigo-50 text-indigo-600'
                          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                      }`}
                    >
                      <Pin className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => togglePinOrFav(e, char, 'is_favorite')}
                      title={char.is_favorite ? 'Hapus dari Favorit' : 'Tandai Favorit'}
                      className={`w-7 h-7 rounded-lg inline-flex items-center justify-center transition-colors ${
                        char.is_favorite
                          ? 'bg-amber-50 text-amber-500'
                          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                      }`}
                    >
                      <Star className={`w-3.5 h-3.5 ${char.is_favorite ? 'fill-amber-500' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Baris Tag & Dunia */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {char.world_name && (
                    <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 border border-teal-200 text-[11px] font-medium inline-flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      <span className="truncate max-w-[140px]">{char.world_name}</span>
                    </span>
                  )}
                  {(char.tags || []).slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <Link
                  href={`/characters/${char.id}`}
                  className="text-xs font-medium text-slate-500 hover:text-slate-900 inline-flex items-center gap-1.5"
                >
                  <span>Detail Profil</span>
                  {char.chat_count > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px]">
                      {char.chat_count} ruang chat
                    </span>
                  )}
                </Link>

                <button
                  type="button"
                  disabled={startingChatId === char.id}
                  onClick={() => handleStartChatClick(char)}
                  className="h-8 px-3.5 rounded-lg bg-slate-900 hover:bg-indigo-600 disabled:bg-slate-300 text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{startingChatId === char.id ? 'Membuka...' : 'Mulai Chat'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Pemilih Sapaan Awal (Jika Karakter Punya >1 Sapaan Awal) */}
      {greetingModalChar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Pilih Sapaan Pembuka - {greetingModalChar.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pilih situasi awal untuk memulai alur percakapan baru ini.
                </p>
              </div>
            </div>

            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {greetingModalChar.greeting.map((g, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedGreetingIdx(idx)}
                  className={`w-full text-left p-3.5 rounded-xl border text-xs leading-relaxed transition-all ${
                    selectedGreetingIdx === idx
                      ? 'border-indigo-600 bg-indigo-50/50 text-slate-900 ring-1 ring-indigo-600'
                      : 'border-slate-200 hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <div className="font-semibold text-indigo-700 mb-1">
                    Sapaan Awal #{idx + 1}
                  </div>
                  <div className="whitespace-pre-line">{g}</div>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setGreetingModalChar(null)}
                className="h-9 px-4 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={startingChatId === greetingModalChar.id}
                onClick={() => createAndOpenChat(greetingModalChar.id, selectedGreetingIdx)}
                className="h-9 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium"
              >
                {startingChatId === greetingModalChar.id ? 'Membuat Ruang...' : 'Mulai Percakapan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
