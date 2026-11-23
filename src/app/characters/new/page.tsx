'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import CharacterForm from '@/components/CharacterForm';

function NewCharacterContent() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initialTab =
    tabParam === 'import' ? 'import' : tabParam === 'manual' ? 'manual' : 'auto';

  return (
    <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
      <header className="flex items-start gap-3">
        <Link
          href="/"
          className="w-9 h-9 mt-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f1729] inline-flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
          title="Kembali ke Beranda"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="space-y-1.5">
          <h1 className="font-display text-3xl sm:text-4xl text-slate-900 dark:text-white">Buat Karakter Baru</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Gunakan riset AI otomatis dari satu kalimat ide, unggah kartu SillyTavern, atau isi secara manual.
          </p>
        </div>
      </header>

      <CharacterForm initialTab={initialTab} />
    </div>
  );
}

export default function NewCharacterPage() {
  return (
    <Suspense fallback={<div className="max-w-6xl mx-auto p-6 text-sm text-slate-500">Memuat form...</div>}>
      <NewCharacterContent />
    </Suspense>
  );
}
