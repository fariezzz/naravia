'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Globe2, Loader2, MessageSquare, Search, UserCircle2 } from 'lucide-react';
import CharacterAvatar from '@/components/CharacterAvatar';

interface PublicCharacter {
  id: string;
  name: string;
  tagline: string;
  avatar: string;
  description: string;
  tags: string[];
  creator_name: string;
  chat_count: number;
  is_owner: boolean;
}

export default function JelajahPage() {
  const [items, setItems] = useState<PublicCharacter[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'terbaru' | 'popular'>('terbaru');

  const load = useCallback(
    async (targetPage: number, append: boolean) => {
      setLoading(true);
      setError('');
      try {
        const qs = new URLSearchParams({ page: String(targetPage), sort });
        if (search) qs.set('q', search);

        const res = await fetch(`/api/characters/public?${qs.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Gagal memuat katalog karakter.');

        setItems((prev) => (append ? [...prev, ...(data.characters || [])] : data.characters || []));
        setTotal(Number(data.total || 0));
        setHasMore(Boolean(data.hasMore));
        setPage(targetPage);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Gagal memuat katalog karakter.');
      } finally {
        setLoading(false);
      }
    },
    [search, sort]
  );

  useEffect(() => {
    load(1, false);
  }, [load]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  return (
    <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-7">
      <header className="space-y-2.5">
        <h1 className="font-display text-3xl sm:text-4xl text-slate-900 dark:text-white">Jelajahi Karakter</h1>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400 max-w-xl">
          Karakter yang dibagikan pengguna Naravia. Pilih satu, lalu mulai ceritamu sendiri. Riwayat percakapanmu
          tetap pribadi.
        </p>
      </header>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        <form onSubmit={handleSearch} className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Cari nama atau kata kunci karakter..."
            className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-slate-900 dark:focus:border-slate-400"
          />
        </form>

        <div className="flex items-center gap-1.5 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
          {([
            { value: 'terbaru' as const, label: 'Terbaru' },
            { value: 'popular' as const, label: 'Terpopuler' },
          ]).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSort(opt.value)}
              aria-pressed={sort === opt.value}
              className={`h-8 px-3.5 rounded-lg text-xs font-semibold transition-colors ${
                sort === opt.value
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {loading && items.length === 0 ? (
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
          <p className="text-base font-semibold text-slate-800 dark:text-slate-100">Belum Ada Karakter Publik</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            {search
              ? 'Tidak ada karakter yang cocok dengan pencarianmu.'
              : 'Belum ada pengguna yang membagikan karakternya. Kamu bisa jadi yang pertama lewat pengaturan visibilitas di karaktermu.'}
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-500 dark:text-slate-400">{total} karakter publik</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((char) => (
              <Link
                key={char.id}
                href={`/characters/${char.id}`}
                className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f1729] p-4 hover:border-slate-400 dark:hover:border-slate-600 transition-colors flex flex-col gap-3"
              >
                <div className="flex items-start gap-3">
                  <CharacterAvatar name={char.name} avatar={char.avatar} size="md" />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white truncate">{char.name}</h2>
                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
                      {char.tagline || char.description}
                    </p>
                  </div>
                </div>

                {char.tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
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
                  <span className="inline-flex items-center gap-1 shrink-0">
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>{char.chat_count}</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => load(page + 1, true)}
                className="h-11 px-6 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-slate-900 dark:hover:border-slate-500 text-sm font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-2 transition-colors disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe2 className="w-4 h-4" />}
                <span>{loading ? 'Memuat...' : 'Tampilkan Lebih Banyak'}</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
