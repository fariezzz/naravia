'use client';

import { ArrowDown, ArrowUp, CheckCircle2, Plus, Trash2, X } from 'lucide-react';
import StoryCover from './StoryCover';
import type { StoryChapterItem, StoryData } from './types';

interface StoryChapterSidebarProps {
  story: StoryData;
  chapters: StoryChapterItem[];
  activeChapterId: string;
  readOnly?: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onSelectChapter: (chapterId: string) => void;
  onAddChapter?: () => void;
  onDeleteChapter?: (chapter: StoryChapterItem) => void;
  onMoveChapter?: (chapterId: string, direction: 'up' | 'down') => void;
  addingChapter?: boolean;
}

export default function StoryChapterSidebar({
  story,
  chapters,
  activeChapterId,
  readOnly = false,
  mobileOpen,
  onCloseMobile,
  onSelectChapter,
  onAddChapter,
  onDeleteChapter,
  onMoveChapter,
  addingChapter = false,
}: StoryChapterSidebarProps) {
  const totalWords = chapters.reduce((sum, ch) => sum + (ch.word_count || 0), 0);
  const estMinutes = Math.max(1, Math.round(totalWords / 220));

  const content = (
    <div className="flex flex-col h-full bg-white dark:bg-[#0f1729] border-r border-slate-200 dark:border-slate-800 w-[264px]">
      <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex items-start gap-2.5">
        <StoryCover
          title={story.title}
          genre={story.genre}
          coverImage={story.cover_image}
          compact
          className="w-12 h-16 rounded-lg shrink-0 shadow-xs"
        />
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold text-slate-900 dark:text-white line-clamp-2 leading-snug">
            {story.title}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            {story.genre} &bull; {chapters.length} bab
          </p>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Tutup daftar bab"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-3.5 pt-3 pb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {readOnly ? 'Daftar Isi' : 'Daftar Bab'}
        </span>
        {!readOnly && onAddChapter && (
          <button
            type="button"
            disabled={addingChapter}
            onClick={onAddChapter}
            className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Bab Baru</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 pb-3 space-y-1">
        {chapters.map((ch, idx) => {
          const active = ch.id === activeChapterId;
          return (
            <div
              key={ch.id}
              className={`group rounded-xl transition-colors ${
                active
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800'
                  : 'border border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-1 p-2">
                <button
                  type="button"
                  onClick={() => {
                    onSelectChapter(ch.id);
                    onCloseMobile();
                  }}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[10px] font-bold shrink-0 ${
                        active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'
                      }`}
                    >
                      {ch.chapter_number}.
                    </span>
                    <span
                      className={`text-xs font-medium truncate ${
                        active ? 'text-indigo-900 dark:text-indigo-100 font-semibold' : 'text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {ch.title}
                    </span>
                    {ch.status === 'done' && (
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 pl-4">
                    {(ch.word_count || 0).toLocaleString('id-ID')} kata
                  </p>
                </button>

                {!readOnly && (
                  <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 flex items-center gap-0.5 shrink-0 transition-opacity">
                    {onMoveChapter && idx > 0 && (
                      <button
                        type="button"
                        onClick={() => onMoveChapter(ch.id, 'up')}
                        title="Pindah ke atas"
                        className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                    )}
                    {onMoveChapter && idx < chapters.length - 1 && (
                      <button
                        type="button"
                        onClick={() => onMoveChapter(ch.id, 'down')}
                        title="Pindah ke bawah"
                        className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    )}
                    {onDeleteChapter && chapters.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onDeleteChapter(ch)}
                        title="Hapus bab"
                        className="p-1 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-3.5 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
        <span>Total: {totalWords.toLocaleString('id-ID')} kata</span>
        <span>~{estMinutes} mnt baca</span>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop docked */}
      <aside className="hidden lg:block shrink-0 h-full">{content}</aside>

      {/* Mobile / Tablet slide-over */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs" onClick={onCloseMobile} />
          <div className="relative z-10 h-full shadow-2xl">{content}</div>
        </div>
      )}
    </>
  );
}
