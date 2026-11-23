import React from 'react';
import Link from 'next/link';
import { Compass, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white dark:bg-[#0f1729] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center shadow-sm space-y-4">
        <div className="text-4xl font-display italic text-indigo-600 dark:text-indigo-400">404</div>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Halaman Tidak Ditemukan</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Karakter, percakapan, atau halaman yang kamu cari mungkin sudah dihapus, bersifat pribadi, atau tautannya keliru.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 pt-2">
          <Link
            href="/"
            className="h-9 px-4 rounded-xl bg-slate-900 dark:bg-indigo-600 hover:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Kembali ke Beranda</span>
          </Link>
          <Link
            href="/jelajah"
            className="h-9 px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Jelajah Karakter</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
