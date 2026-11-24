'use client';

import { useState } from 'react';
import { BookOpen } from 'lucide-react';

interface StoryCoverProps {
  title: string;
  genre?: string;
  coverImage?: string;
  authorName?: string;
  className?: string;
  compact?: boolean;
}

const GENRE_THEMES: Record<string, { bg: string; accent: string; border: string }> = {
  fantasi: {
    bg: 'from-emerald-950 via-teal-900 to-slate-950',
    accent: 'text-emerald-200/90',
    border: 'border-emerald-400/25',
  },
  misteri: {
    bg: 'from-slate-950 via-indigo-950 to-slate-900',
    accent: 'text-indigo-200/90',
    border: 'border-indigo-400/25',
  },
  romansa: {
    bg: 'from-rose-950 via-amber-900/90 to-stone-950',
    accent: 'text-rose-200/90',
    border: 'border-rose-300/25',
  },
  'fiksi ilmiah': {
    bg: 'from-slate-950 via-cyan-950 to-indigo-950',
    accent: 'text-cyan-200/90',
    border: 'border-cyan-400/25',
  },
  'slice of life': {
    bg: 'from-stone-800 via-amber-900/80 to-stone-900',
    accent: 'text-amber-200/90',
    border: 'border-amber-300/25',
  },
  drama: {
    bg: 'from-zinc-900 via-slate-800 to-zinc-950',
    accent: 'text-slate-200/90',
    border: 'border-slate-400/25',
  },
  petualangan: {
    bg: 'from-amber-950 via-orange-950 to-stone-950',
    accent: 'text-amber-200/90',
    border: 'border-amber-400/25',
  },
  'horor & gelap': {
    bg: 'from-neutral-950 via-red-950 to-black',
    accent: 'text-red-200/90',
    border: 'border-red-400/25',
  },
  sejarah: {
    bg: 'from-stone-950 via-yellow-950 to-stone-900',
    accent: 'text-yellow-200/90',
    border: 'border-yellow-400/25',
  },
};

const DEFAULT_THEME = {
  bg: 'from-slate-900 via-indigo-950 to-slate-950',
  accent: 'text-indigo-200/90',
  border: 'border-white/20',
};

function getMonogram(title: string): string {
  const words = (title || '')
    .trim()
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length === 0) return 'N';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

export default function StoryCover({
  title,
  genre = 'Bebas',
  coverImage,
  authorName,
  className = '',
  compact = false,
}: StoryCoverProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const theme = GENRE_THEMES[(genre || '').toLowerCase()] || DEFAULT_THEME;

  if (coverImage && !imgFailed) {
    return (
      <div className={`relative overflow-hidden bg-slate-900 select-none ${className}`}>
        <img
          src={coverImage}
          alt={title}
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover"
        />
        {!compact && (
          <>
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-3.5 text-white">
              {genre && (
                <p className="text-[10px] uppercase tracking-[0.14em] text-white/75 font-semibold mb-0.5 truncate">
                  {genre}
                </p>
              )}
              <p className="font-display leading-snug line-clamp-2 text-base">{title}</p>
            </div>
          </>
        )}
      </div>
    );
  }

  // Mode sampul mini (kartu Beranda & Sidebar Bab): jilid buku hardcover + monogram serif agar tidak pernah terpotong
  if (compact) {
    return (
      <div
        className={`relative overflow-hidden bg-gradient-to-br ${theme.bg} text-white select-none flex flex-col items-center justify-center pl-1.5 ${className}`}
        aria-hidden="true"
      >
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1.5 bg-black/30 border-r border-white/15" />
        <div className={`pointer-events-none absolute inset-1 left-2 rounded-[5px] border ${theme.border}`} />
        <BookOpen className="w-3 h-3 text-white/40 mb-0.5 relative z-10" />
        <span className="font-display text-sm tracking-wider text-white/95 leading-none relative z-10">
          {getMonogram(title)}
        </span>
        <span className="w-3.5 h-px bg-white/30 mt-1.5 relative z-10" />
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br ${theme.bg} text-white select-none flex flex-col justify-between p-4 ${className}`}
    >
      {/* Garis punggung buku & bingkai editorial */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-2 bg-black/25 border-r border-white/10" />
      <div className={`pointer-events-none absolute inset-2.5 rounded-lg border ${theme.border}`} />

      <div className="relative z-10 flex items-center justify-between gap-2 pl-1.5">
        <span className={`uppercase tracking-[0.16em] font-semibold truncate text-[10px] ${theme.accent}`}>
          {genre || 'Cerita'}
        </span>
        <BookOpen className="w-3.5 h-3.5 text-white/40 shrink-0" />
      </div>

      <div className="relative z-10 pl-1.5 my-auto py-1">
        <p className="font-display leading-tight text-white/95 line-clamp-3 text-lg sm:text-xl">{title}</p>
      </div>

      <div className="relative z-10 pl-1.5 flex items-center justify-between text-[10px] text-white/60">
        <span className="truncate">{authorName || 'Naravia Studio'}</span>
        <span className="tracking-widest uppercase text-[9px] text-white/40">Novel</span>
      </div>
    </div>
  );
}
