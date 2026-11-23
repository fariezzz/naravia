'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';
import ResearchSourceList from '@/components/ResearchSourceList';

interface ResearchNotesPanelProps {
  researchNotes: {
    mode: string;
    summary: string;
    sources: string[];
    uncertainFields: string[];
  };
  verificationResult: { valid: boolean; explanation: string } | null;
  revisionInput: string;
  revising: boolean;
  onChangeRevision: (v: string) => void;
  onApplyRevision: () => void;
}

export default function ResearchNotesPanel({
  researchNotes,
  verificationResult,
  revisionInput,
  revising,
  onChangeRevision,
  onApplyRevision,
}: ResearchNotesPanelProps) {
  if (!researchNotes?.summary) return null;

  return (
    <div className="bg-indigo-50/70 dark:bg-indigo-950/30 rounded-2xl border border-indigo-200 dark:border-indigo-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">
          Catatan Riset Karakter (
          {researchNotes.mode === 'existing'
            ? 'Tokoh Kanon'
            : researchNotes.mode === 'import'
            ? 'Impor Kartu'
            : 'Pengembangan Orisinal'}
          )
        </span>
      </div>
      <p className="text-xs text-indigo-950 dark:text-indigo-100 leading-relaxed">{researchNotes.summary}</p>
      <ResearchSourceList sources={researchNotes.sources} tone="indigo" />
      {researchNotes.uncertainFields?.length > 0 && (
        <div className="text-[11px] text-amber-800 dark:text-amber-200 bg-amber-100/80 dark:bg-amber-950/50 px-2.5 py-1.5 rounded-lg">
          Periksa kembali field berikut karena dirangkum dari ingatan model: {researchNotes.uncertainFields.join(', ')}
        </div>
      )}

      {verificationResult && (
        <div
          className={`p-3 rounded-xl border text-xs space-y-1 ${
            verificationResult.valid
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-200'
          }`}
        >
          <div className="flex items-center gap-1.5 font-bold">
            <span>
              {verificationResult.valid
                ? 'Verifikasi Fakta: Terverifikasi Sesuai'
                : 'Verifikasi Fakta: Tidak Sesuai Fakta Resmi/Kanon'}
            </span>
          </div>
          <p className="leading-relaxed">{verificationResult.explanation}</p>
        </div>
      )}

      <div className="pt-2 border-t border-indigo-200/80 dark:border-indigo-900 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
            Revisi Riset & Fakta Karakter
          </label>
          <span className="text-[10px] text-indigo-700 dark:text-indigo-400">
            Diverifikasi kebenaran faktanya sebelum diterapkan
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <textarea
            rows={3}
            value={revisionInput}
            onChange={(e) => onChangeRevision(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onApplyRevision();
              }
            }}
            placeholder='Contoh: "Ubah umurnya jadi 17 tahun dan tambahkan bahwa dia punya adik perempuan bernama Alisa"'
            className="w-full min-h-[84px] px-3 py-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-[#0c1220] text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 shadow-2xs resize-none leading-relaxed"
          />
          <button
            type="button"
            disabled={revising || !revisionInput.trim()}
            onClick={onApplyRevision}
            className="w-full sm:w-auto sm:self-end h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{revising ? 'Memverifikasi...' : 'Verifikasi & Terapkan Revisi'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
