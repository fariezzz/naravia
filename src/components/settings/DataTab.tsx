'use client';

import React, { useRef, useState } from 'react';
import { Download, Loader2, Trash2, Upload } from 'lucide-react';
import { invalidateClientCache } from '@/lib/clientCache';

interface DataTabProps {
  saving: boolean;
  onCleanupAssets: () => void;
  onOpenResetModal: () => void;
  onNotice: (msg: string) => void;
  onError: (msg: string) => void;
}

export default function DataTab({
  saving,
  onCleanupAssets,
  onOpenResetModal,
  onNotice,
  onError,
}: DataTabProps) {
  const [restoring, setRestoring] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (file.size > 25 * 1024 * 1024) {
      onError('Ukuran berkas cadangan maksimal 25 MB.');
      return;
    }

    setRestoring(true);
    onError('');
    onNotice('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memulihkan cadangan.');

      const r = data.restored || {};
      invalidateClientCache();
      onNotice(
        `Pemulihan berhasil: ${r.characters || 0} karakter, ${r.worlds || 0} dunia, ${r.chats || 0} percakapan, ${r.messages || 0} pesan, dan ${r.memories || 0} memori ditambahkan.`
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Berkas JSON tidak valid atau gagal dipulihkan.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Ekspor Data Akun</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Unduh salinan seluruh karakter, persona, percakapan, dunia, dan memori milikmu dalam format JSON.
          </p>
        </div>
        <a
          href="/api/export"
          download
          className="h-9 px-4 rounded-xl bg-slate-900 dark:bg-indigo-600 hover:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Unduh JSON</span>
        </a>
      </div>

      <div className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Pulihkan Cadangan JSON</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Impor kembali berkas hasil Ekspor Data Naravia. Data baru akan ditambahkan tanpa menimpa koleksi yang sudah ada.
          </p>
        </div>
        <div className="shrink-0">
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            onChange={handleRestoreFile}
            className="hidden"
          />
          <button
            type="button"
            disabled={restoring || saving}
            onClick={() => fileRef.current?.click()}
            className="h-9 px-4 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-indigo-400 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-2xs disabled:opacity-60"
          >
            {restoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            <span>{restoring ? 'Memulihkan...' : 'Pilih Berkas JSON'}</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Bersihkan File Aset Gambar Yatim</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Hapus foto profil lama atau sisa unggahanmu yang sudah tidak dipakai karakter maupun persona.
          </p>
        </div>
        <button
          type="button"
          disabled={saving || restoring}
          onClick={onCleanupAssets}
          className="h-9 px-4 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-slate-400 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors shadow-2xs disabled:opacity-60"
        >
          <Trash2 className="w-3.5 h-3.5 text-slate-500" />
          <span>Bersihkan Aset Yatim</span>
        </button>
      </div>

      <div className="bg-white dark:bg-[#0f1729] rounded-2xl border border-rose-200 dark:border-rose-900/60 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs">
        <div>
          <h3 className="text-sm font-semibold text-rose-700 dark:text-rose-400">Hapus Seluruh Data Akun</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Menghapus semua karakter, ruang chat, dunia, dan memori milik akunmu. Ekspor datamu terlebih dahulu.
          </p>
        </div>
        <button
          type="button"
          disabled={saving || restoring}
          onClick={onOpenResetModal}
          className="h-9 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 disabled:opacity-60"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Hapus Semua Data</span>
        </button>
      </div>
    </div>
  );
}
