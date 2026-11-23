'use client';

import React, { useState } from 'react';
import { HelpCircle, Send, Square } from 'lucide-react';

interface ChatInputProps {
  characterName: string;
  characterDeleted: boolean;
  inputText: string;
  sending: boolean;
  hasMessages: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onChangeText: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
}

export default function ChatInput({
  characterName,
  characterDeleted,
  inputText,
  sending,
  hasMessages,
  textareaRef,
  onChangeText,
  onSend,
  onStop,
}: ChatInputProps) {
  const [showTips, setShowTips] = useState(false);

  return (
    <div className="p-2.5 sm:p-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0c1220]/90 backdrop-blur-xs pb-[max(0.625rem,env(safe-area-inset-bottom))] shrink-0 z-20 transition-colors">
      {characterDeleted && (
        <div className="mb-2.5 p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-[11px] leading-relaxed text-amber-900 dark:text-amber-200">
          Karakter ini sudah dihapus oleh pembuatnya. Riwayat percakapan masih bisa kamu baca, tetapi pesan baru tidak
          bisa dikirim lagi.
        </div>
      )}

      <div className="relative flex items-center gap-2">
        <div className="relative hidden md:block shrink-0">
          <button
            type="button"
            onClick={() => setShowTips((v) => !v)}
            onBlur={() => setTimeout(() => setShowTips(false), 150)}
            className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 inline-flex items-center justify-center transition-colors"
            title="Pintasan keyboard"
            aria-label="Pintasan keyboard"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
          {showTips && (
            <div className="absolute bottom-full left-0 mb-2 w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0f1729] p-3 shadow-lg text-[11px] text-slate-600 dark:text-slate-300 space-y-1.5 z-30">
              <p className="font-semibold text-slate-900 dark:text-white">Pintasan & Tips</p>
              <p><kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px]">Enter</kbd> kirim · <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px]">Shift+Enter</kbd> baris baru</p>
              <p>Kirim saat kosong untuk melanjutkan narasi karakter.</p>
              <p><kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px]">Alt+←/→</kbd> swipe balasan terakhir · <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px]">Esc</kbd> batal/stop</p>
            </div>
          )}
        </div>

        <textarea
          ref={textareaRef}
          rows={1}
          disabled={characterDeleted}
          value={inputText}
          onChange={(e) => {
            onChangeText(e.target.value);
            e.target.style.height = 'auto';
            if (e.target.value.trim()) {
              e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
            } else {
              e.target.style.height = '';
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              const isMobileDevice =
                typeof window !== 'undefined' &&
                (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768);
              if (!isMobileDevice) {
                e.preventDefault();
                onSend();
              }
            }
          }}
          placeholder={characterDeleted ? 'Percakapan ini hanya bisa dibaca.' : `Kirim pesan ke ${characterName}...`}
          className="flex-1 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] px-4 py-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 resize-none h-[48px] min-h-[48px] max-h-36 leading-5 shadow-2xs disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:cursor-not-allowed"
        />
        {sending ? (
          <button
            type="button"
            onClick={onStop}
            className="h-[48px] w-[48px] rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center justify-center shrink-0 transition-colors shadow-2xs"
            title="Berhenti Berbicara (Esc)"
            aria-label="Berhenti Berbicara"
          >
            <Square className="w-4 h-4 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            disabled={characterDeleted || (!inputText.trim() && !hasMessages)}
            onClick={onSend}
            className="h-[48px] w-[48px] rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 dark:disabled:text-slate-600 text-white text-xs font-semibold inline-flex items-center justify-center shrink-0 transition-colors shadow-2xs"
            title={!inputText.trim() ? 'Lanjut bicara' : 'Kirim (Enter)'}
            aria-label={!inputText.trim() ? 'Lanjut bicara' : 'Kirim'}
          >
            <Send className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
