'use client';

import React from 'react';
import { BookOpen, Clock, MapPin, Plus, Shield } from 'lucide-react';

export default function WorldsEmptyState({ onCreateFirst }: { onCreateFirst: () => void }) {
  return (
    <section className="space-y-4">
      <div className="relative overflow-hidden rounded-[28px] border border-slate-200 dark:border-slate-800">
        <img
          src="/landing/genre-lembah.webp"
          alt="Lembah berkabut di antara pegunungan"
          width={800}
          height={1000}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: 'center 40%' }}
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/70 to-slate-950/30"
        />

        <div className="relative grid lg:grid-cols-[1.15fr_1fr] gap-10 items-center px-6 py-12 sm:px-12 sm:py-16">
          <div className="max-w-lg">
            <h2 className="font-display text-3xl sm:text-[2.5rem] leading-tight text-white">
              Setiap cerita butuh tempat untuk berpijak
            </h2>
            <p className="mt-4 text-sm sm:text-base text-white/75 leading-relaxed">
              Bangun dunianya sekali, lalu hubungkan ke karaktermu. Detail dunia ikut masuk ke percakapan tanpa perlu
              kamu ulang setiap kali.
            </p>
            <button
              type="button"
              onClick={onCreateFirst}
              className="mt-7 h-11 px-6 rounded-xl bg-white hover:bg-slate-100 text-slate-900 text-sm font-semibold inline-flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Buat Dunia Pertama</span>
            </button>
          </div>

          <div className="hidden lg:block">
            <div className="ml-auto max-w-sm rounded-2xl bg-white/95 dark:bg-[#0f1729]/95 backdrop-blur p-5 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.6)] space-y-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Contoh Entri Lore</p>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">Menara Jam Agung</span>
                  {['menara jam', 'lonceng'].map((kw) => (
                    <span
                      key={kw}
                      className="px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-900 text-[10px] font-medium"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
                <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  Berdentang tiga belas kali saat tengah malam. Hanya penjaga menara yang tahu alasannya.
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="max-w-[85%] ml-auto rounded-2xl rounded-br-md bg-slate-900 dark:bg-indigo-600 px-3.5 py-2 text-xs text-white">
                  Kita bertemu di bawah{' '}
                  <mark className="bg-teal-300/90 text-slate-900 rounded px-1">menara jam</mark> saja.
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                  <span>Kata kunci disebut, entri ini dimuat ke konteks karakter.</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            icon: MapPin,
            label: 'Lokasi Penting',
            text: 'Kota, menara, atau ruang rahasia yang sering disebut dalam cerita.',
            tone: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300',
          },
          {
            icon: Shield,
            label: 'Faksi & Kelompok',
            text: 'Siapa yang berkuasa, siapa yang bersekutu, dan siapa yang berseteru.',
            tone: 'bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-300',
          },
          {
            icon: Clock,
            label: 'Garis Waktu',
            text: 'Peristiwa masa lalu yang membentuk keadaan dunia sekarang.',
            tone: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300',
          },
          {
            icon: BookOpen,
            label: 'Entri Lorebook',
            text: 'Fakta yang dimuat otomatis saat kata kuncinya muncul di obrolan.',
            tone: 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300',
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f1729] p-4 space-y-2.5"
            >
              <span className={`w-9 h-9 rounded-xl inline-flex items-center justify-center ${item.tone}`}>
                <Icon className="w-4 h-4" />
              </span>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.label}</p>
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{item.text}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
