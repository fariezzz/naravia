'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';

interface ResearchWizardPanelProps {
  ideaInput: string;
  charTypeHint: 'auto' | 'existing' | 'original';
  manualResearchText: string;
  generating: boolean;
  onChangeIdea: (v: string) => void;
  onChangeTypeHint: (v: 'auto' | 'existing' | 'original') => void;
  onChangeManualResearch: (v: string) => void;
  onGenerate: () => void;
}

export default function ResearchWizardPanel({
  ideaInput,
  charTypeHint,
  manualResearchText,
  generating,
  onChangeIdea,
  onChangeTypeHint,
  onChangeManualResearch,
  onGenerate,
}: ResearchWizardPanelProps) {
  return (
    <section className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-2xs">
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          Pembuatan Karakter Otomatis & Riset AI
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Tulis satu atau dua kalimat ide. AI akan menentukan jenis riset, melengkapi semua kepribadian, gaya bicara,
          sapaan awal, serta contoh dialog untuk Anda tinjau.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Ide Singkat Karakter
          </label>
          <textarea
            rows={3}
            value={ideaInput}
            onChange={(e) => onChangeIdea(e.target.value)}
            placeholder='Contoh: "Buatkan karakter Frieren dari anime Sousou no Frieren" atau "CEO startup logistik yang sarkastik dan gila kerja tapi peduli pada timnya"'
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] p-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Jenis Karakter
            </label>
            <select
              value={charTypeHint}
              onChange={(e) => onChangeTypeHint(e.target.value as 'auto' | 'existing' | 'original')}
              className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-[#111827] focus:outline-none focus:border-indigo-500"
            >
              <option value="auto">Deteksi Otomatis oleh AI</option>
              <option value="existing">Tokoh yang Sudah Ada (Riset Kanon/Fakta)</option>
              <option value="original">Tokoh Orisinal (Kembangkan Kreatif)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Tempel Teks Riset Manual / Wiki (Opsional)
          </label>
          <textarea
            rows={3}
            value={manualResearchText}
            onChange={(e) => onChangeManualResearch(e.target.value)}
            placeholder="Jika ingin menyalin artikel wiki atau catatan latar tokoh sendiri, tempel di sini agar AI merangkum kartu karakter langsung dari teks Anda..."
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] p-3 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center justify-end pt-1">
          <button
            type="button"
            disabled={generating}
            onClick={onGenerate}
            className="h-10 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            <span>{generating ? 'Sedang Meriset & Menyusun Kartu...' : 'Riset & Isi Kartu Karakter'}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
