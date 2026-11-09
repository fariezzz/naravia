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
    <div className="max-w-6xl w-full mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="w-9 h-9 rounded-xl border border-slate-200 bg-white inline-flex items-center justify-center text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Buat Karakter Baru</h1>
            <p className="text-xs text-slate-500">
              Gunakan riset AI otomatis dari satu kalimat ide, unggah kartu SillyTavern, atau isi secara manual.
            </p>
          </div>
        </div>
      </div>

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
