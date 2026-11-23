'use client';

import React from 'react';
import {
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit3,
  GitBranch,
  MoreHorizontal,
  Rewind,
  RotateCcw,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import CharacterAvatar from '@/components/CharacterAvatar';
import FormattedMessage from '@/components/FormattedMessage';
import { MessageItem, PersonaItem } from './types';

interface MessageBubbleProps {
  msg: MessageItem;
  isLastCharacterMessage: boolean;
  character: { name: string; avatar: string };
  userPersona: PersonaItem;
  isEditing: boolean;
  editingContent: string;
  isRegenerating: boolean;
  isStreamingThis: boolean;
  isBusy: boolean;
  copied: boolean;
  isSpeaking: boolean;
  ttsSupported: boolean;
  isMenuOpen: boolean;
  menuUp: boolean;
  actionMenuRef: React.RefObject<HTMLDivElement | null>;
  onChangeEditingContent: (val: string) => void;
  onStartEdit: (msg: MessageItem) => void;
  onCancelEdit: () => void;
  onSaveEdit: (msgId: string) => void;
  onSwipeSelect: (msg: MessageItem, newIndex: number) => void;
  onRegenerate: (msg: MessageItem) => void;
  onCopy: (msgId: string, text: string) => void;
  onPinMemory: (msg: MessageItem) => void;
  onRewind: (msgId: string) => void;
  onFork: (msgId: string) => void;
  onDelete: (msgId: string) => void;
  onToggleSpeak: (msg: MessageItem) => void;
  onToggleMenu: (msgId: string, trigger: HTMLElement) => void;
  onRunMenuAction: (action: () => void) => void;
}

export default function MessageBubble({
  msg,
  isLastCharacterMessage,
  character,
  userPersona,
  isEditing,
  editingContent,
  isRegenerating,
  isStreamingThis,
  isBusy,
  copied,
  isSpeaking,
  ttsSupported,
  isMenuOpen,
  menuUp,
  actionMenuRef,
  onChangeEditingContent,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onSwipeSelect,
  onRegenerate,
  onCopy,
  onPinMemory,
  onRewind,
  onFork,
  onDelete,
  onToggleSpeak,
  onToggleMenu,
  onRunMenuAction,
}: MessageBubbleProps) {
  const isChar = msg.role === 'character';
  const altCount = msg.alternatives?.length || 1;
  const currentAltIdx = msg.active_alt_index || 0;
  // Tampilkan swipe/ulang secara permanen hanya di balasan karakter terakhir atau jika punya >1 varian
  const showSwipeBar = isChar && (isLastCharacterMessage || altCount > 1);
  // Untuk pesan lama tanpa menu terbuka, sembunyikan bar aksi di desktop sampai di-hover/focus agar alur cerita bersih
  const alwaysShowBar = showSwipeBar || isMenuOpen || copied || isSpeaking;

  return (
    <div className={`group flex items-start gap-2.5 sm:gap-3 ${isChar ? 'justify-start' : 'justify-end'}`}>
      {isChar && <CharacterAvatar name={character.name} avatar={character.avatar} size="sm" />}

      <div className={`max-w-[92%] sm:max-w-[78%] min-w-0 space-y-1.5 ${isChar ? 'items-start' : 'items-end flex flex-col'}`}>
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            {isChar ? character.name : userPersona.display_name || 'Kamu'}
          </span>
          {msg.is_pinned_memory && (
            <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-medium inline-flex items-center gap-0.5">
              <Bookmark className="w-2.5 h-2.5 fill-indigo-600 dark:fill-indigo-400" />
              <span>Diingat</span>
            </span>
          )}
        </div>

        {isEditing ? (
          <div className="w-full min-w-[280px] sm:min-w-[420px] bg-slate-50 dark:bg-[#111827] border border-indigo-300 dark:border-indigo-700 rounded-2xl p-3 space-y-2">
            <textarea
              rows={4}
              value={editingContent}
              onChange={(e) => onChangeEditingContent(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0c1220] p-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
            />
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={onCancelEdit}
                className="h-7 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                <span>Batal</span>
              </button>
              <button
                type="button"
                onClick={() => onSaveEdit(msg.id)}
                className="h-7 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium inline-flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                <span>Simpan</span>
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line break-words [overflow-wrap:anywhere] ${
              isChar
                ? 'bg-slate-100 dark:bg-[#151c2e] text-slate-900 dark:text-slate-100 rounded-tl-xs'
                : 'bg-slate-900 dark:bg-indigo-600 text-white rounded-tr-xs'
            }`}
          >
            {isChar && !msg.content.trim() && (isRegenerating || isStreamingThis) ? (
              <span className="text-xs text-slate-500 dark:text-slate-400 italic">
                {character.name} sedang mengetik balasan...
              </span>
            ) : (
              <FormattedMessage content={msg.content} isUser={!isChar} />
            )}
          </div>
        )}

        <div
          className={`flex-wrap items-center gap-1 px-1 text-slate-400 dark:text-slate-500 transition-opacity ${
            isStreamingThis && !isRegenerating
              ? 'hidden'
              : alwaysShowBar
              ? 'flex opacity-100'
              : 'flex md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100'
          }`}
        >
          {showSwipeBar && (
            <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg px-1.5 py-0.5 text-[11px] text-slate-600 dark:text-slate-300 mr-1">
              <button
                type="button"
                disabled={currentAltIdx <= 0 || isRegenerating}
                onClick={() => onSwipeSelect(msg, currentAltIdx - 1)}
                className="p-0.5 hover:text-slate-900 dark:hover:text-white disabled:opacity-30"
                title="Alternatif Sebelumnya"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="font-medium tabular-nums">
                {currentAltIdx + 1}/{altCount}
              </span>
              <button
                type="button"
                disabled={isRegenerating}
                onClick={() => {
                  if (currentAltIdx < altCount - 1) {
                    onSwipeSelect(msg, currentAltIdx + 1);
                  } else {
                    onRegenerate(msg);
                  }
                }}
                className="p-0.5 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-30"
                title={currentAltIdx < altCount - 1 ? 'Alternatif Berikutnya' : 'Buat Alternatif Swipe Baru'}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {isChar && isLastCharacterMessage && (
            <button
              type="button"
              disabled={isRegenerating}
              onClick={() => onRegenerate(msg)}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 inline-flex items-center gap-1 text-[11px]"
              title="Minta Jawaban Ulang (Regenerate)"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Ulang</span>
            </button>
          )}

          {isChar && ttsSupported && (
            <button
              type="button"
              onClick={() => onToggleSpeak(msg)}
              className={`p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 text-[11px] ${
                isSpeaking
                  ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                  : 'hover:text-slate-700 dark:hover:text-slate-200'
              }`}
              title={isSpeaking ? 'Hentikan suara' : 'Bacakan pesan (TTS)'}
            >
              {isSpeaking ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
            </button>
          )}

          <button
            type="button"
            onClick={() => onCopy(msg.id, msg.content)}
            className={`p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 hidden md:inline-flex items-center gap-1 text-[11px] transition-colors ${
              copied ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'hover:text-slate-700 dark:hover:text-slate-200'
            }`}
            title="Salin Isi Pesan"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span>Tersalin</span>
              </>
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onStartEdit(msg)}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 hidden md:inline-flex items-center gap-1 text-[11px]"
            title="Edit Pesan"
          >
            <Edit3 className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={() => onPinMemory(msg)}
            className={`p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 hidden md:inline-flex items-center gap-1 text-[11px] ${
              msg.is_pinned_memory ? 'text-indigo-600 dark:text-indigo-400 font-medium' : 'hover:text-slate-700 dark:hover:text-slate-200'
            }`}
            title={msg.is_pinned_memory ? 'Tersimpan di Memori' : 'Ingat Ini (Simpan ke Memori)'}
          >
            <Bookmark className={`w-3 h-3 ${msg.is_pinned_memory ? 'fill-current' : ''}`} />
          </button>

          {/* Menu aksi terpadu untuk aksi lanjutan/jarang dipakai di desktop & semua aksi di mobile */}
          <div ref={isMenuOpen ? actionMenuRef : undefined} className="relative">
            <button
              type="button"
              onClick={(e) => onToggleMenu(msg.id, e.currentTarget)}
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              aria-controls={isMenuOpen ? `aksi-pesan-${msg.id}` : undefined}
              aria-label="Aksi lainnya untuk pesan ini"
              title="Aksi Lainnya"
              className={`w-6 h-6 rounded-lg inline-flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                isMenuOpen
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>

            {isMenuOpen && (
              <div
                id={`aksi-pesan-${msg.id}`}
                role="menu"
                aria-label="Aksi pesan"
                className={`absolute ${isChar ? 'left-0' : 'right-0'} z-30 w-44 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f1729] shadow-lg p-1.5 ${
                  menuUp ? 'bottom-full mb-1' : 'top-full mt-1'
                }`}
              >
                {isChar && !isLastCharacterMessage && (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={isRegenerating}
                    onClick={() => onRunMenuAction(() => onRegenerate(msg))}
                    className="w-full h-8 px-2.5 rounded-lg text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 disabled:opacity-40"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Jawaban Ulang</span>
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onRunMenuAction(() => onCopy(msg.id, msg.content))}
                  className="md:hidden w-full h-8 px-2.5 rounded-lg text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onRunMenuAction(() => onStartEdit(msg))}
                  className="md:hidden w-full h-8 px-2.5 rounded-lg text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onRunMenuAction(() => onPinMemory(msg))}
                  className={`md:hidden w-full h-8 px-2.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 ${
                    msg.is_pinned_memory
                      ? 'text-indigo-600 dark:text-indigo-400 font-medium'
                      : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>{msg.is_pinned_memory ? 'Tersimpan' : 'Ingat Ini'}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={isBusy}
                  onClick={() => onRunMenuAction(() => onFork(msg.id))}
                  className="w-full h-8 px-2.5 rounded-lg text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 disabled:opacity-40"
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  <span>Cabangkan Cerita</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={isBusy}
                  onClick={() => onRunMenuAction(() => onRewind(msg.id))}
                  className="w-full h-8 px-2.5 rounded-lg text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 disabled:opacity-40"
                >
                  <Rewind className="w-3.5 h-3.5" />
                  <span>Mundur ke Sini</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onRunMenuAction(() => onDelete(msg.id))}
                  className="w-full h-8 px-2.5 rounded-lg text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Pesan</span>
                </button>
              </div>
            )}
          </div>

          {copied && (
            <span
              role="status"
              className="md:hidden inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
            >
              <Check className="w-3 h-3" />
              <span>Tersalin</span>
            </span>
          )}
        </div>
      </div>

      {!isChar && (
        <CharacterAvatar name={userPersona.display_name || 'Kamu'} avatar={userPersona.avatar} size="sm" />
      )}
    </div>
  );
}
