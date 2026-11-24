'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Feather,
  Globe2,
  Lock,
  Plus,
  Search,
  Sparkles,
  Trash2,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import CharacterAvatar from '@/components/CharacterAvatar';
import ConfirmModal from '@/components/ConfirmModal';
import StoryCover from '@/components/stories/StoryCover';

interface StorySummary {
  id: string;
  title: string;
  synopsis: string;
  cover_image: string;
  genre: string;
  tags: string[];
  world_name: string | null;
  pov: string;
  tone: string;
  status: 'ongoing' | 'completed';
  visibility: 'private' | 'public';
  chapter_count: number;
  total_words: number;
  latest_chapter_id: string | null;
  latest_chapter_title: string | null;
  latest_chapter_number: number;
  cast_preview: Array<{ name: string; avatar: string; role_in_story: string }>;
  updated_at: string;
}

function formatRelative(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'baru saja';
  if (mins < 60) return `${mins} mnt lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} jam lalu`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} hari lalu`;
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export default function StoriesLibraryPage() {
  const [stories, setStories] = useState<StorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ongoing' | 'completed'>('all');
  const [deleteTarget, setDeleteTarget] = useState<StorySummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadStories = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/stories');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memuat perpustakaan cerita.');
      setStories(data.stories || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat perpustakaan cerita.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStories();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/stories/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Gagal menghapus cerita.');
      setStories((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus cerita.');
    } finally {
      setDeleting(false);
    }
  };

  const keyword = search.trim().toLowerCase();
  const filtered = stories.filter((s) => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (!keyword) return true;
    return (
      s.title.toLowerCase().includes(keyword) ||
      s.synopsis.toLowerCase().includes(keyword) ||
      s.genre.toLowerCase().includes(keyword) ||
      s.tags.some((t) => t.toLowerCase().includes(keyword))
    );
  });

  return (
    <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="font-display text-3xl sm:text-4xl text-slate-900 dark:text-white">Cerita &amp; Novel</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-xl leading-relaxed">
            Tulis novel bersama AI layaknya meja tulis editorial. Libatkan karakter dan dunia yang sudah kamu buat, lalu
            nikmati naskahmu dalam Mode Baca.
          </p>
        </div>

        {stories.length > 0 && (
          <Link
            href="/stories/new"
            className="h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shadow-xs transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Tulis Cerita Baru</span>
          </Link>
        )}
      </header>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {stories.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative w-full sm:flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari judul novel, genre, atau tag..."
              className="w-full h-10 pl-10 pr-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex sm:inline-flex items-center gap-1 p-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] shrink-0">
            {(
              [
                { value: 'all', label: 'Semua' },
                { value: 'ongoing', label: 'Sedang Ditulis' },
                { value: 'completed', label: 'Selesai' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatusFilter(opt.value)}
                className={`flex-1 sm:flex-initial h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  statusFilter === opt.value
                    ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-64 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse"
            />
          ))}
        </div>
      ) : stories.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 sm:p-14 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 inline-flex items-center justify-center mx-auto">
            <Feather className="w-6 h-6" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h2 className="font-display text-2xl text-slate-900 dark:text-white">Rak Ceritamu Masih Kosong</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Mulai dari premis satu kalimat—biarkan AI membantu menyusun kerangka bab, atau tulis langsung bersama
              karakter dan dunia yang sudah kamu bangun.
            </p>
          </div>
          <div className="pt-1 flex flex-wrap items-center justify-center gap-2.5">
            <Link
              href="/stories/new"
              className="h-10 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold inline-flex items-center gap-2 shadow-xs transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              <span>Tulis Cerita Pertama</span>
            </Link>
            <Link
              href="/jelajah?tab=stories"
              className="h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-2 transition-colors"
            >
              <Globe2 className="w-4 h-4" />
              <span>Baca Cerita Publik</span>
            </Link>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-2">
          <p className="text-base font-semibold text-slate-800 dark:text-slate-100">Tidak Ada Cerita yang Cocok</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Coba ubah kata kunci atau filter status di atas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((story) => {
            const readMinutes = Math.max(1, Math.round(story.total_words / 220));
            return (
              <article
                key={story.id}
                className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden hover:border-indigo-300 dark:hover:border-indigo-500/60 transition-all shadow-2xs flex flex-col"
              >
                <Link href={`/stories/${story.id}`} className="block relative">
                  <StoryCover
                    title={story.title}
                    genre={story.genre}
                    coverImage={story.cover_image}
                    className="h-44 w-full"
                  />
                  <div className="absolute top-3 right-3 flex items-center gap-1.5">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-semibold backdrop-blur-md inline-flex items-center gap-1 ${
                        story.visibility === 'public'
                          ? 'bg-emerald-950/75 text-emerald-200 border border-emerald-400/30'
                          : 'bg-slate-950/70 text-slate-200 border border-white/15'
                      }`}
                    >
                      {story.visibility === 'public' ? <Globe2 className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                      <span>{story.visibility === 'public' ? 'Publik' : 'Pribadi'}</span>
                    </span>
                    {story.status === 'completed' && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-950/80 text-indigo-200 border border-indigo-400/30 backdrop-blur-md inline-flex items-center gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        <span>Tamat</span>
                      </span>
                    )}
                  </div>
                </Link>

                <div className="p-4 flex-1 flex flex-col gap-3">
                  <div className="space-y-1">
                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {story.synopsis || 'Belum ada sinopsis. Lanjutkan menulis di Studio untuk mengembangkan alurnya.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {story.world_name && (
                      <span className="px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 text-[10px] font-medium">
                        {story.world_name}
                      </span>
                    )}
                    {story.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      <span>
                        {story.chapter_count} bab &bull; {story.total_words.toLocaleString('id-ID')} kata
                      </span>
                      <span className="hidden sm:inline text-slate-300 dark:text-slate-700">&middot;</span>
                      <span className="hidden sm:inline">~{readMinutes} mnt</span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] shrink-0">
                      <Clock className="w-3 h-3" />
                      {formatRelative(story.updated_at)}
                    </span>
                  </div>

                  {story.cast_preview.length > 0 && (
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <div className="flex -space-x-1.5">
                        {story.cast_preview.slice(0, 3).map((member, idx) => (
                          <div key={`${member.name}-${idx}`} className="ring-2 ring-white dark:ring-slate-900 rounded-full">
                            <CharacterAvatar name={member.name} avatar={member.avatar} size="xs" />
                          </div>
                        ))}
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {story.cast_preview.map((m) => m.name).join(', ')}
                      </span>
                    </div>
                  )}

                  <div className="mt-auto pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-1">
                      <Link
                        href={`/stories/${story.id}`}
                        className="flex-1 h-8 px-3 rounded-lg bg-slate-900 dark:bg-indigo-600 hover:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Feather className="w-3.5 h-3.5" />
                        <span>Lanjutkan</span>
                      </Link>
                      <Link
                        href={`/stories/${story.id}?mode=read`}
                        className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 transition-colors"
                        title="Buka dalam Mode Baca"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Baca</span>
                      </Link>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(story)}
                      className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 inline-flex items-center justify-center transition-colors shrink-0"
                      title="Hapus Cerita"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title={`Hapus "${deleteTarget?.title || ''}"?`}
        description="Seluruh bab, naskah, daftar pemeran, dan riwayat generasi di dalam cerita ini akan dihapus secara permanen."
        confirmLabel="Hapus Cerita"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
