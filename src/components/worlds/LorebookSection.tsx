'use client';

import React from 'react';
import Link from 'next/link';
import { BookOpen, Plus, Trash2 } from 'lucide-react';
import AutoResizeTextarea from '@/components/AutoResizeTextarea';
import CharacterAvatar from '@/components/CharacterAvatar';

interface LorebookSectionProps {
  activeWorld: any;
  loreTitle: string;
  loreKeywords: string;
  loreContent: string;
  addingLore: boolean;
  onChangeTitle: (v: string) => void;
  onChangeKeywords: (v: string) => void;
  onChangeContent: (v: string) => void;
  onAddLore: (e: React.FormEvent) => void;
  onDeleteLore: (id: string) => void;
}

export default function LorebookSection({
  activeWorld,
  loreTitle,
  loreKeywords,
  loreContent,
  addingLore,
  onChangeTitle,
  onChangeKeywords,
  onChangeContent,
  onAddLore,
  onDeleteLore,
}: LorebookSectionProps) {
  return (
    <div className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-2xs">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
          <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>Entri Lorebook ({activeWorld.lore_entries?.length || 0})</span>
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Entri di bawah hanya disuntikkan ke dalam prompt karakter saat salah satu kata kuncinya muncul secara utuh di
          obrolan.
        </p>
      </div>

      <form
        onSubmit={onAddLore}
        className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-3"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Judul Entri Lore
            </label>
            <input
              type="text"
              value={loreTitle}
              onChange={(e) => onChangeTitle(e.target.value)}
              placeholder="Contoh: Menara Jam Agung"
              className="w-full h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0c1220] text-xs text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Kata Kunci Pemicu (Pisahkan dengan koma) *
            </label>
            <AutoResizeTextarea
              rows={1}
              maxHeight={96}
              singleParagraph
              required
              value={loreKeywords}
              onChange={(e) => onChangeKeywords(e.target.value)}
              placeholder="menara jam, lonceng, dewan"
              className="w-full min-h-8 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0c1220] text-xs leading-5 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Penjelasan Fakta Lore *
          </label>
          <textarea
            rows={2}
            required
            value={loreContent}
            onChange={(e) => onChangeContent(e.target.value)}
            placeholder="Tuliskan fakta spesifik yang harus diketahui karakter saat kata kunci di atas disebut..."
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0c1220] p-2.5 text-xs text-slate-900 dark:text-slate-100"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={addingLore}
            className="h-8 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{addingLore ? 'Menambahkan...' : 'Tambah Entri Lore'}</span>
          </button>
        </div>
      </form>

      <div className="space-y-2.5">
        {(activeWorld.lore_entries || []).map((entry: any) => (
          <div
            key={entry.id}
            className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3"
          >
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-slate-900 dark:text-white">{entry.title}</span>
                {(entry.keywords || []).map((kw: string) => (
                  <span
                    key={kw}
                    className="px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-900 text-[10px] font-medium"
                  >
                    {kw}
                  </span>
                ))}
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{entry.content}</p>
            </div>
            <button
              type="button"
              onClick={() => onDeleteLore(entry.id)}
              className="text-slate-400 hover:text-rose-600 shrink-0"
              title="Hapus Entri"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {activeWorld.characters?.length > 0 && (
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            Karakter di Dunia Ini ({activeWorld.characters.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {activeWorld.characters.map((c: any) => (
              <Link
                key={c.id}
                href={`/characters/${c.id}`}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 flex items-center gap-2 text-xs font-medium text-slate-800 dark:text-slate-200"
              >
                <CharacterAvatar name={c.name} avatar={c.avatar} size="sm" />
                <span>{c.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
