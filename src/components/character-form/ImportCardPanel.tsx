'use client';

import React from 'react';
import { Upload } from 'lucide-react';

interface ImportCardPanelProps {
  importing: boolean;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function ImportCardPanel({ importing, onFileChange }: ImportCardPanelProps) {
  return (
    <section className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xs">
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          Impor Kartu Karakter SillyTavern (JSON / PNG)
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Unggah file kartu karakter berformat .json atau .png (Character Card V2). Gambar PNG akan otomatis dipakai
          sebagai avatar dan placeholder {'{{char}}'} serta {'{{user}}'} akan disesuaikan.
        </p>
      </div>

      <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 rounded-2xl p-8 cursor-pointer transition-colors bg-slate-50/60 dark:bg-slate-900/50">
        <Upload className="w-7 h-7 text-indigo-600 dark:text-indigo-400 mb-2" />
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {importing ? 'Membaca File Kartu...' : 'Pilih File Kartu Karakter (.PNG atau .JSON)'}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Setelah diunggah, semua field akan terbuka di form untuk Anda tinjau sebelum disimpan.
        </span>
        <input
          type="file"
          accept=".png,.json,image/png,application/json"
          onChange={onFileChange}
          disabled={importing}
          className="hidden"
        />
      </label>
    </section>
  );
}
