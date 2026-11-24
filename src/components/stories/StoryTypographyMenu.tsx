'use client';

import { useEffect, useRef, useState } from 'react';
import { Type } from 'lucide-react';
import type { PaperTheme, ReaderPrefs, StoryFontFamily, StoryFontSize } from './types';

interface StoryTypographyMenuProps {
  prefs: ReaderPrefs;
  onChange: (next: ReaderPrefs) => void;
}

const PAPERS: Array<{ value: PaperTheme; label: string; swatch: string }> = [
  { value: 'auto', label: 'Otomatis', swatch: 'bg-gradient-to-br from-white to-slate-900' },
  { value: 'ivory', label: 'Gading', swatch: 'bg-[#FCFBF9]' },
  { value: 'sepia', label: 'Sepia', swatch: 'bg-[#F6EFE2]' },
  { value: 'night', label: 'Malam', swatch: 'bg-[#0B1120]' },
];

const FONTS: Array<{ value: StoryFontFamily; label: string; sampleCls: string }> = [
  { value: 'serif', label: 'Serif Novel', sampleCls: 'font-serif' },
  { value: 'sans', label: 'Sans Bersih', sampleCls: 'font-sans' },
  { value: 'mono', label: 'Mono Draf', sampleCls: 'font-mono' },
];

const SIZES: Array<{ value: StoryFontSize; label: string }> = [
  { value: 'sm', label: 'Kecil' },
  { value: 'md', label: 'Sedang' },
  { value: 'lg', label: 'Besar' },
  { value: 'xl', label: 'Nyaman' },
];

export default function StoryTypographyMenu({ prefs, onChange }: StoryTypographyMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Suasana Kertas & Tipografi"
        className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 transition-colors"
      >
        <Type className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Aa</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-64 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0f1729] shadow-xl p-3.5 z-40 space-y-3.5 text-xs">
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Suasana Kertas</p>
            <div className="grid grid-cols-2 gap-1.5">
              {PAPERS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => onChange({ ...prefs, paper: p.value })}
                  className={`h-8 px-2.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-2 transition-colors ${
                    prefs.paper === p.value
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className={`w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-600 shrink-0 ${p.swatch}`} />
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Jenis Huruf</p>
            <div className="grid grid-cols-3 gap-1">
              {FONTS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => onChange({ ...prefs, font: f.value })}
                  className={`h-8 px-1.5 rounded-lg border text-[11px] transition-colors ${f.sampleCls} ${
                    prefs.font === f.value
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {f.label.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ukuran Teks</p>
            <div className="grid grid-cols-4 gap-1">
              {SIZES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => onChange({ ...prefs, size: s.value })}
                  className={`h-7 rounded-lg border text-[11px] font-medium transition-colors ${
                    prefs.size === s.value
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">Cek Ejaan Browser</p>
              <p className="text-[10px] text-slate-400">Garis bawah merah saat menulis</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.spellCheck}
              onClick={() => onChange({ ...prefs, spellCheck: !prefs.spellCheck })}
              className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${
                prefs.spellCheck ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'
              }`}
            >
              <span
                className={`block w-4 h-4 rounded-full bg-white shadow-xs transition-transform ${
                  prefs.spellCheck ? 'translate-x-4.5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
