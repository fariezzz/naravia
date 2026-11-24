'use client';

import React from 'react';
import { Clock, MapPin, Save, Shield, Trash2 } from 'lucide-react';
import AutoResizeTextarea from '@/components/AutoResizeTextarea';

interface WorldEditorFormProps {
  isCreating: boolean;
  selectedWorldId: string | null;
  worldName: string;
  worldDesc: string;
  worldRules: string;
  places: Array<{ name: string; description: string }>;
  factions: Array<{ name: string; description: string }>;
  timeline: Array<{ era: string; event: string }>;
  saving: boolean;
  onChangeName: (v: string) => void;
  onChangeDesc: (v: string) => void;
  onChangeRules: (v: string) => void;
  onChangePlaces: React.Dispatch<React.SetStateAction<Array<{ name: string; description: string }>>>;
  onChangeFactions: React.Dispatch<React.SetStateAction<Array<{ name: string; description: string }>>>;
  onChangeTimeline: React.Dispatch<React.SetStateAction<Array<{ era: string; event: string }>>>;
  onRequestDelete: (id: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

const inputCls =
  'w-full h-7 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0c1220] text-xs text-slate-900 dark:text-slate-100';

const textareaCls =
  'w-full min-h-8 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0c1220] text-xs leading-4 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500';

export default function WorldEditorForm({
  isCreating,
  selectedWorldId,
  worldName,
  worldDesc,
  worldRules,
  places,
  factions,
  timeline,
  saving,
  onChangeName,
  onChangeDesc,
  onChangeRules,
  onChangePlaces,
  onChangeFactions,
  onChangeTimeline,
  onRequestDelete,
  onSubmit,
}: WorldEditorFormProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-2xs"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          {isCreating ? 'Tambah Dunia Baru' : `Pengaturan Dunia: ${worldName}`}
        </h2>
        {!isCreating && selectedWorldId && (
          <button
            type="button"
            onClick={() => onRequestDelete(selectedWorldId)}
            className="h-8 px-3 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-medium inline-flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Hapus Dunia</span>
          </button>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Nama Dunia *</label>
        <input
          type="text"
          required
          value={worldName}
          onChange={(e) => onChangeName(e.target.value)}
          placeholder="Contoh: Veloria - Kota Kabut & Menara Jam"
          className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-sm text-slate-900 dark:text-slate-100"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Deskripsi Umum Dunia
          </label>
          <textarea
            rows={3}
            value={worldDesc}
            onChange={(e) => onChangeDesc(e.target.value)}
            placeholder="Suasana, geografi, dan zaman dunia ini..."
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] p-3 text-xs text-slate-900 dark:text-slate-100"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Aturan Main / Hukum Dunia
          </label>
          <textarea
            rows={3}
            value={worldRules}
            onChange={(e) => onChangeRules(e.target.value)}
            placeholder="Batas sihir, teknologi, hukum sosial yang berlaku..."
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] p-3 text-xs text-slate-900 dark:text-slate-100"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Lokasi Penting</span>
            </span>
            <button
              type="button"
              onClick={() => onChangePlaces((p) => [...p, { name: '', description: '' }])}
              className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              + Tambah
            </button>
          </div>
          {places.map((pl, idx) => (
            <div
              key={idx}
              className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-1.5"
            >
              <input
                type="text"
                value={pl.name}
                onChange={(e) => {
                  const v = e.target.value;
                  onChangePlaces((p) => p.map((item, i) => (i === idx ? { ...item, name: v } : item)));
                }}
                placeholder="Nama Lokasi"
                className={inputCls}
              />
              <AutoResizeTextarea
                rows={2}
                maxHeight={120}
                value={pl.description}
                onChange={(e) => {
                  const v = e.target.value;
                  onChangePlaces((p) => p.map((item, i) => (i === idx ? { ...item, description: v } : item)));
                }}
                placeholder="Keterangan singkat"
                className={textareaCls}
              />
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>Faksi & Kelompok</span>
            </span>
            <button
              type="button"
              onClick={() => onChangeFactions((p) => [...p, { name: '', description: '' }])}
              className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              + Tambah
            </button>
          </div>
          {factions.map((fc, idx) => (
            <div
              key={idx}
              className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-1.5"
            >
              <input
                type="text"
                value={fc.name}
                onChange={(e) => {
                  const v = e.target.value;
                  onChangeFactions((p) => p.map((item, i) => (i === idx ? { ...item, name: v } : item)));
                }}
                placeholder="Nama Faksi"
                className={inputCls}
              />
              <AutoResizeTextarea
                rows={2}
                maxHeight={120}
                value={fc.description}
                onChange={(e) => {
                  const v = e.target.value;
                  onChangeFactions((p) => p.map((item, i) => (i === idx ? { ...item, description: v } : item)));
                }}
                placeholder="Peran faksi"
                className={textareaCls}
              />
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Garis Waktu</span>
            </span>
            <button
              type="button"
              onClick={() => onChangeTimeline((p) => [...p, { era: '', event: '' }])}
              className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              + Tambah
            </button>
          </div>
          {timeline.map((tm, idx) => (
            <div
              key={idx}
              className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-1.5"
            >
              <input
                type="text"
                value={tm.era}
                onChange={(e) => {
                  const v = e.target.value;
                  onChangeTimeline((p) => p.map((item, i) => (i === idx ? { ...item, era: v } : item)));
                }}
                placeholder="Tahun / Era"
                className={inputCls}
              />
              <AutoResizeTextarea
                rows={2}
                maxHeight={120}
                value={tm.event}
                onChange={(e) => {
                  const v = e.target.value;
                  onChangeTimeline((p) => p.map((item, i) => (i === idx ? { ...item, event: v } : item)));
                }}
                placeholder="Peristiwa penting"
                className={textareaCls}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving}
          className="h-9 px-5 rounded-xl bg-slate-900 dark:bg-indigo-600 hover:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{saving ? 'Menyimpan...' : 'Simpan Dunia'}</span>
        </button>
      </div>
    </form>
  );
}
