'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { bacaDaftarSumber } from '@/lib/researchSources';

interface Props {
  sources: unknown;
  // Nada warna disesuaikan dengan panel pembungkusnya
  tone?: 'indigo' | 'slate';
}

/**
 * Daftar sumber riset yang ringkas dan terlipat.
 *
 * Satu baris per sumber berisi nama situs dan judul halaman. Tautan mentah tidak
 * ditampilkan, tetapi barisnya bisa diklik untuk membuka sumbernya.
 * Dipakai di semua tempat peninjauan supaya perilakunya konsisten.
 */
export default function ResearchSourceList({ sources, tone = 'indigo' }: Props) {
  const [terbuka, setTerbuka] = useState(false);
  const daftar = bacaDaftarSumber(sources);

  if (daftar.length === 0) return null;

  const warna =
    tone === 'indigo'
      ? {
          tombol: 'text-indigo-800 hover:text-indigo-950',
          baris: 'border-indigo-200 hover:border-indigo-400 bg-white/70',
          situs: 'text-indigo-700',
          judul: 'text-indigo-950',
        }
      : {
          tombol: 'text-slate-600 hover:text-slate-900',
          baris: 'border-slate-200 hover:border-slate-400 bg-white',
          situs: 'text-slate-500',
          judul: 'text-slate-900',
        };

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setTerbuka((v) => !v)}
        aria-expanded={terbuka}
        className={`inline-flex items-center gap-1 text-[11px] font-semibold ${warna.tombol}`}
      >
        {terbuka ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <span>Lihat sumber ({daftar.length})</span>
      </button>

      {terbuka && (
        <ul className="space-y-1">
          {daftar.map((s, i) => {
            const isi = (
              <>
                {s.namaSitus && (
                  <span className={`text-[10px] font-semibold uppercase tracking-wide shrink-0 ${warna.situs}`}>
                    {s.namaSitus}
                  </span>
                )}
                <span className={`text-[11px] truncate flex-1 ${warna.judul}`}>{s.judul}</span>
                {s.url && <ExternalLink className="w-3 h-3 opacity-60 shrink-0" />}
              </>
            );

            return (
              <li key={`${s.url || s.judul}-${i}`}>
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    title={s.judul}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-colors ${warna.baris}`}
                  >
                    {isi}
                  </a>
                ) : (
                  // Entri tanpa tautan, misalnya "Pengetahuan Model"
                  <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${warna.baris}`}>
                    {isi}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
