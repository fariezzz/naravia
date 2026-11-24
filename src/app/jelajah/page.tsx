'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Bookmark,
  BookOpen,
  GitFork,
  Globe2,
  Loader2,
  MessageSquare,
  Search,
  Sparkles,
  UserCircle2,
  X,
} from 'lucide-react';
import CharacterAvatar from '@/components/CharacterAvatar';
import StoryCover from '@/components/stories/StoryCover';
import { useAuth } from '@/lib/AuthContext';

interface PublicCharacter {
  id: string;
  name: string;
  tagline: string;
  avatar: string;
  description: string;
  tags: string[];
  creator_name: string;
  allow_remix: boolean;
  chat_count: number;
  bookmark_count: number;
  bookmarked: boolean;
  is_owner: boolean;
}

interface PublicStory {
  id: string;
  title: string;
  synopsis: string;
  cover_image: string;
  genre: string;
  tags: string[];
  status: 'ongoing' | 'completed';
  world_name: string | null;
  creator_name: string;
  is_owner: boolean;
  chapter_count: number;
  total_words: number;
  bookmark_count: number;
  bookmarked: boolean;
}

function JelajahPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'characters' | 'stories'>(() =>
    searchParams.get('tab') === 'stories' ? 'stories' : 'characters'
  );

  // State Karakter Publik
  const [items, setItems] = useState<PublicCharacter[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);

  // State Cerita Publik
  const [stories, setStories] = useState<PublicStory[]>([]);
  const [storyTags, setStoryTags] = useState<string[]>([]);
  const [storyGenres, setStoryGenres] = useState<string[]>([]);
  const [storyTotal, setStoryTotal] = useState(0);
  const [storyHasMore, setStoryHasMore] = useState(false);
  const [storyPage, setStoryPage] = useState(1);
  const [selectedGenre, setSelectedGenre] = useState('');

  // Shared filter state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [remixableOnly, setRemixableOnly] = useState(false);
  const [sort, setSort] = useState<'terbaru' | 'popular' | 'bookmarked'>('terbaru');

  const loadCharacters = useCallback(
    async (targetPage: number, append: boolean) => {
      setLoading(true);
      setError('');
      try {
        const qs = new URLSearchParams({ page: String(targetPage), sort });
        if (search) qs.set('q', search);
        if (selectedTags.length > 0) qs.set('tags', selectedTags.join(','));
        if (bookmarkedOnly) qs.set('bookmarked', '1');
        if (remixableOnly) qs.set('remixable', '1');

        const res = await fetch(`/api/characters/public?${qs.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Gagal memuat katalog karakter.');

        setItems((prev) => (append ? [...prev, ...(data.characters || [])] : data.characters || []));
        if (Array.isArray(data.availableTags)) setAvailableTags(data.availableTags);
        setTotal(Number(data.total || 0));
        setHasMore(Boolean(data.hasMore));
        setPage(targetPage);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Gagal memuat katalog karakter.');
      } finally {
        setLoading(false);
      }
    },
    [search, selectedTags, bookmarkedOnly, remixableOnly, sort]
  );

  const loadStories = useCallback(
    async (targetPage: number, append: boolean) => {
      setLoading(true);
      setError('');
      try {
        const qs = new URLSearchParams({ page: String(targetPage), sort });
        if (search) qs.set('q', search);
        if (selectedGenre) qs.set('genre', selectedGenre);
        if (selectedTags.length > 0) qs.set('tags', selectedTags.join(','));
        if (bookmarkedOnly) qs.set('bookmarked', '1');

        const res = await fetch(`/api/stories/public?${qs.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Gagal memuat katalog cerita.');

        setStories((prev) => (append ? [...prev, ...(data.stories || [])] : data.stories || []));
        if (Array.isArray(data.availableTags)) setStoryTags(data.availableTags);
        if (Array.isArray(data.availableGenres)) setStoryGenres(data.availableGenres);
        setStoryTotal(Number(data.total || 0));
        setStoryHasMore(Boolean(data.hasMore));
        setStoryPage(targetPage);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Gagal memuat katalog cerita.');
      } finally {
        setLoading(false);
      }
    },
    [search, selectedGenre, selectedTags, bookmarkedOnly, sort]
  );

  useEffect(() => {
    if (activeTab === 'characters') {
      loadCharacters(1, false);
    } else {
      loadStories(1, false);
    }
  }, [activeTab, loadCharacters, loadStories]);

  const switchTab = (next: 'characters' | 'stories') => {
    if (next === activeTab) return;
    setActiveTab(next);
    setSelectedTags([]);
    setSelectedGenre('');
    setRemixableOnly(false);
    setError('');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : prev.length < 5 ? [...prev, tag] : prev
    );
  };

  const handleToggleCharBookmark = async (e: React.MouseEvent, char: PublicCharacter) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      router.push('/login?next=%2Fjelajah');
      return;
    }
    try {
      const res = await fetch(`/api/characters/${char.id}/bookmark`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setItems((prev) =>
          prev
            .map((item) =>
              item.id === char.id
                ? { ...item, bookmarked: Boolean(data.bookmarked), bookmark_count: Number(data.bookmark_count || 0) }
                : item
            )
            .filter((item) => !(bookmarkedOnly && item.id === char.id && !data.bookmarked))
        );
      }
    } catch {
      setError('Gagal memperbarui bookmark.');
    }
  };

  const handleToggleStoryBookmark = async (e: React.MouseEvent, st: PublicStory) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      router.push('/login?next=%2Fjelajah%3Ftab%3Dstories');
      return;
    }
    try {
      const res = await fetch(`/api/stories/${st.id}/bookmark`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setStories((prev) =>
          prev
            .map((item) =>
              item.id === st.id
                ? { ...item, bookmarked: Boolean(data.bookmarked), bookmark_count: Number(data.bookmark_count || 0) }
                : item
            )
            .filter((item) => !(bookmarkedOnly && item.id === st.id && !data.bookmarked))
        );
      }
    } catch {
      setError('Gagal memperbarui bookmark cerita.');
    }
  };

  const currentTags = activeTab === 'characters' ? availableTags : storyTags;
  const hasActiveFilters = Boolean(
    search || selectedTags.length > 0 || bookmarkedOnly || remixableOnly || selectedGenre
  );

  return (
    <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-display text-3xl sm:text-4xl text-slate-900 dark:text-white">
            {activeTab === 'characters' ? 'Jelajahi Karakter' : 'Jelajahi Cerita & Novel'}
          </h1>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400 max-w-xl">
            {activeTab === 'characters'
              ? 'Karakter yang dibagikan pengguna Naravia. Pilih satu, simpan ke bookmark, atau remix ke koleksi pribadimu bila pembuat mengizinkannya.'
              : 'Novel dan cerita pendek karya pengguna Naravia yang dipublikasikan. Buka dalam Mode Baca yang nyaman atau simpan ke daftar bacaanmu.'}
          </p>
        </div>

        {/* Tab Pengalih Karakter | Cerita */}
        <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] shrink-0 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => switchTab('characters')}
            className={`h-9 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
              activeTab === 'characters'
                ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Karakter</span>
          </button>
          <button
            type="button"
            onClick={() => switchTab('stories')}
            className={`h-9 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
              activeTab === 'stories'
                ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Cerita</span>
          </button>
        </div>
      </header>

      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <form onSubmit={handleSearch} className="relative w-full sm:flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={
                activeTab === 'characters'
                  ? 'Cari karakter atau kata kunci...'
                  : 'Cari judul novel, genre, atau penulis...'
              }
              className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-slate-900 dark:focus:border-slate-400"
            />
          </form>

          <div className="flex sm:inline-flex items-center gap-1 p-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] shrink-0 overflow-x-auto">
            {(
              [
                { value: 'terbaru' as const, label: 'Terbaru' },
                { value: 'popular' as const, label: 'Populer' },
                { value: 'bookmarked' as const, label: 'Tersimpan' },
              ]
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSort(opt.value)}
                aria-pressed={sort === opt.value}
                className={`flex-1 sm:flex-initial h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  sort === opt.value
                    ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filter cepat */}
        <div className="flex flex-wrap items-center gap-1.5">
          {user && (
            <button
              type="button"
              onClick={() => setBookmarkedOnly((v) => !v)}
              className={`h-7 px-2.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors ${
                bookmarkedOnly
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Bookmark className={`w-3 h-3 ${bookmarkedOnly ? 'fill-current' : ''}`} />
              <span>Tersimpan</span>
            </button>
          )}

          {activeTab === 'characters' && (
            <button
              type="button"
              onClick={() => setRemixableOnly((v) => !v)}
              className={`h-7 px-2.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors ${
                remixableOnly
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <GitFork className="w-3 h-3" />
              <span>Bisa Di-remix</span>
            </button>
          )}

          {activeTab === 'stories' &&
            storyGenres.map((g) => {
              const active = selectedGenre === g;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setSelectedGenre(active ? '' : g)}
                  className={`h-7 px-2.5 rounded-lg border text-[11px] font-semibold transition-colors ${
                    active
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f1729] text-slate-600 dark:text-slate-300 hover:border-slate-400'
                  }`}
                >
                  {g}
                </button>
              );
            })}

          {currentTags.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`h-7 px-2.5 rounded-lg border text-[11px] font-medium transition-colors ${
                  active
                    ? 'bg-slate-900 dark:bg-indigo-600 border-slate-900 dark:border-indigo-600 text-white'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f1729] text-slate-600 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-600'
                }`}
              >
                {tag}
              </button>
            );
          })}

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setSearch('');
                setSelectedTags([]);
                setSelectedGenre('');
                setBookmarkedOnly(false);
                setRemixableOnly(false);
              }}
              className="h-7 px-2 rounded-lg text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 inline-flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              <span>Reset filter</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-sm text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      {/* TAB 1: KARAKTER PUBLIK */}
      {activeTab === 'characters' ? (
        loading && items.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="h-40 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f1729] animate-pulse"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center space-y-2">
            <p className="text-base font-semibold text-slate-800 dark:text-slate-100">
              {hasActiveFilters ? 'Tidak Ada Karakter yang Cocok' : 'Belum Ada Karakter Publik'}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              {hasActiveFilters
                ? 'Coba ubah kata kunci atau lepaskan beberapa filter tag.'
                : 'Belum ada pengguna yang membagikan karakternya. Kamu bisa jadi yang pertama lewat pengaturan visibilitas di karaktermu.'}
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-500 dark:text-slate-400">{total} karakter publik</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((char) => (
                <div
                  key={char.id}
                  className="group relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f1729] p-4 hover:border-indigo-300 dark:hover:border-indigo-500/60 transition-colors flex flex-col gap-3 shadow-2xs"
                >
                  <div className="flex items-start gap-3">
                    <CharacterAvatar name={char.name} avatar={char.avatar} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="text-base font-semibold text-slate-900 dark:text-white truncate">
                          <Link
                            href={`/characters/${char.id}`}
                            className="group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors after:absolute after:inset-0 focus:outline-none"
                          >
                            {char.name}
                          </Link>
                        </h2>
                        <button
                          type="button"
                          onClick={(e) => handleToggleCharBookmark(e, char)}
                          title={char.bookmarked ? 'Hapus dari tersimpan' : 'Simpan karakter'}
                          aria-label={char.bookmarked ? 'Hapus dari tersimpan' : 'Simpan karakter'}
                          className={`relative z-10 p-1 rounded-lg transition-colors shrink-0 ${
                            char.bookmarked
                              ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60'
                              : 'text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <Bookmark className={`w-3.5 h-3.5 ${char.bookmarked ? 'fill-current' : ''}`} />
                        </button>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
                        {char.tagline || char.description}
                      </p>
                    </div>
                  </div>

                  {(char.tags.length > 0 || char.allow_remix) && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {char.allow_remix && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold inline-flex items-center gap-1">
                          <GitFork className="w-2.5 h-2.5" />
                          <span>Remix</span>
                        </span>
                      )}
                      {char.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-medium"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-auto pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <UserCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{char.is_owner ? 'Karaktermu' : char.creator_name}</span>
                    </span>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="inline-flex items-center gap-1" title="Jumlah disimpan">
                        <Bookmark className="w-3 h-3" />
                        <span>{char.bookmark_count}</span>
                      </span>
                      <span className="inline-flex items-center gap-1" title="Jumlah percakapan">
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>{char.chat_count}</span>
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => loadCharacters(page + 1, true)}
                  className="h-11 px-6 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-slate-900 dark:hover:border-slate-500 text-sm font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-2 transition-colors disabled:opacity-60"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe2 className="w-4 h-4" />}
                  <span>{loading ? 'Memuat...' : 'Tampilkan Lebih Banyak'}</span>
                </button>
              </div>
            )}
          </>
        )
      ) : /* TAB 2: CERITA & NOVEL PUBLIK */
      loading && stories.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-64 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f1729] animate-pulse"
            />
          ))}
        </div>
      ) : stories.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center space-y-2.5">
          <p className="text-base font-semibold text-slate-800 dark:text-slate-100">
            {hasActiveFilters ? 'Tidak Ada Cerita yang Cocok' : 'Belum Ada Cerita Publik'}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            {hasActiveFilters
              ? 'Coba ubah kata kunci atau lepaskan filter genre/tag.'
              : 'Belum ada novel yang dipublikasikan. Kamu bisa jadi penulis pertama dengan mengubah visibilitas ceritamu ke Publik di Story Bible.'}
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-500 dark:text-slate-400">{storyTotal} cerita publik</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {stories.map((st) => (
              <div
                key={st.id}
                className="group relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f1729] overflow-hidden hover:border-indigo-300 dark:hover:border-indigo-500/60 transition-colors flex flex-col shadow-2xs"
              >
                <div className="relative">
                  <StoryCover
                    title={st.title}
                    genre={st.genre}
                    coverImage={st.cover_image}
                    authorName={st.creator_name}
                    className="h-44 w-full"
                  />
                  <button
                    type="button"
                    onClick={(e) => handleToggleStoryBookmark(e, st)}
                    title={st.bookmarked ? 'Hapus dari bacaan tersimpan' : 'Simpan bacaan'}
                    aria-label={st.bookmarked ? 'Hapus dari bacaan tersimpan' : 'Simpan bacaan'}
                    className={`absolute top-3 right-3 z-10 p-1.5 rounded-lg backdrop-blur-md transition-colors ${
                      st.bookmarked
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-950/60 text-white/90 hover:bg-indigo-600'
                    }`}
                  >
                    <Bookmark className={`w-3.5 h-3.5 ${st.bookmarked ? 'fill-current' : ''}`} />
                  </button>
                </div>

                <div className="p-4 flex-1 flex flex-col gap-2.5">
                  <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white leading-snug">
                    <Link
                      href={`/stories/${st.id}?mode=read`}
                      className="group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors after:absolute after:inset-0 focus:outline-none"
                    >
                      {st.title}
                    </Link>
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                    {st.synopsis || 'Klik untuk mulai membaca cerita ini dalam Mode Baca.'}
                  </p>

                  {st.tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      {st.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-medium"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-auto pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <UserCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{st.is_owner ? 'Ceritamu' : st.creator_name}</span>
                    </span>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span>{st.chapter_count} bab</span>
                      <span>&bull;</span>
                      <span>{st.total_words.toLocaleString('id-ID')} kata</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {storyHasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => loadStories(storyPage + 1, true)}
                className="h-11 px-6 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-slate-900 dark:hover:border-slate-500 text-sm font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-2 transition-colors disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
                <span>{loading ? 'Memuat...' : 'Tampilkan Lebih Banyak'}</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function JelajahPage() {
  return (
    <Suspense fallback={<div className="max-w-6xl w-full mx-auto px-4 py-10 text-sm text-slate-400">Memuat katalog...</div>}>
      <JelajahPageContent />
    </Suspense>
  );
}
