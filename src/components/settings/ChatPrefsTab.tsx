'use client';

import React from 'react';
import { CheckCircle2, Moon, Save, Sun } from 'lucide-react';

interface ChatPrefsTabProps {
  settings: Record<string, string>;
  saving: boolean;
  theme: 'light' | 'dark';
  onChangeSettings: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onChangeTheme: (theme: 'light' | 'dark') => void;
  onSubmit: (e: React.FormEvent) => void;
}

export default function ChatPrefsTab({
  settings,
  saving,
  theme,
  onChangeSettings,
  onChangeTheme,
  onSubmit,
}: ChatPrefsTabProps) {
  return (
    <div className="space-y-5">
      <form
        onSubmit={onSubmit}
        className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-5 shadow-2xs"
      >
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Preferensi Percakapan</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Nilai bawaan untuk ruang chat baru. Setiap ruang chat tetap bisa diatur terpisah.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Temperature Bawaan
            </label>
            <input
              type="number"
              step="0.05"
              min="0"
              max="2"
              value={settings.temperature ?? ''}
              placeholder="0.9"
              onChange={(e) => onChangeSettings((s) => ({ ...s, temperature: e.target.value }))}
              className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-xs text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Max Tokens Balasan
            </label>
            <input
              type="number"
              step="64"
              min="64"
              max="8192"
              value={settings.max_tokens ?? ''}
              placeholder="1024"
              onChange={(e) => onChangeSettings((s) => ({ ...s, max_tokens: e.target.value }))}
              className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-xs text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Gaya Panjang Balasan Bawaan
            </label>
            <select
              value={settings.default_reply_style || 'sedang'}
              onChange={(e) => onChangeSettings((s) => ({ ...s, default_reply_style: e.target.value }))}
              className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="sedang">Sedang (1-2 Paragraf)</option>
              <option value="pendek">Pendek (1-3 Kalimat)</option>
              <option value="panjang">Panjang (Deskriptif)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Batas Riwayat Pesan
            </label>
            <input
              type="number"
              min="4"
              max="100"
              value={settings.history_limit ?? ''}
              placeholder="20"
              onChange={(e) => onChangeSettings((s) => ({ ...s, history_limit: e.target.value }))}
              className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-xs text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={settings.auto_extract_memory === 'true'}
              onChange={(e) =>
                onChangeSettings((s) => ({ ...s, auto_extract_memory: e.target.checked ? 'true' : 'false' }))
              }
              className="rounded border-slate-300"
            />
            <span>Simpan Memori Jangka Panjang Otomatis</span>
          </label>
          <button
            type="submit"
            disabled={saving}
            className="h-9 px-5 rounded-xl bg-slate-900 dark:bg-indigo-600 hover:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Menyimpan...' : 'Simpan Preferensi'}</span>
          </button>
        </div>
      </form>

      <div className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-2xs">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Tampilan</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Pilihan tema berlaku untuk perangkat ini dan langsung tersimpan.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(
            [
              {
                nilai: 'light' as const,
                label: 'Mode Terang',
                ikon: Sun,
                keterangan: 'Latar putih, cocok untuk ruangan terang.',
              },
              {
                nilai: 'dark' as const,
                label: 'Mode Gelap',
                ikon: Moon,
                keterangan: 'Latar gelap, lebih nyaman saat malam.',
              },
            ]
          ).map((opsi) => {
            const Ikon = opsi.ikon;
            const aktif = theme === opsi.nilai;
            return (
              <button
                key={opsi.nilai}
                type="button"
                onClick={() => onChangeTheme(opsi.nilai)}
                aria-pressed={aktif}
                className={`text-left p-3.5 rounded-xl border transition-colors ${
                  aktif
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Ikon
                    className={`w-4 h-4 shrink-0 ${opsi.nilai === 'dark' ? 'text-indigo-500' : 'text-amber-500'}`}
                  />
                  <span className="text-xs font-semibold text-slate-900 dark:text-white">{opsi.label}</span>
                  {aktif && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 ml-auto shrink-0" />}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                  {opsi.keterangan}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
