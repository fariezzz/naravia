'use client';

import React from 'react';
import { Send } from 'lucide-react';
import AutoResizeTextarea from '@/components/AutoResizeTextarea';
import FormattedMessage from '@/components/FormattedMessage';

interface CharacterPreviewSidebarProps {
  characterName: string;
  firstGreeting: string;
  messages: Array<{ role: 'user' | 'character'; content: string }>;
  input: string;
  loading: boolean;
  onChangeInput: (v: string) => void;
  onSend: () => void;
  onReset: () => void;
}

export default function CharacterPreviewSidebar({
  characterName,
  firstGreeting,
  messages,
  input,
  loading,
  onChangeInput,
  onSend,
  onReset,
}: CharacterPreviewSidebarProps) {
  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs sticky top-20 flex flex-col h-[520px]">
        <div className="pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Pratinjau Karakter</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Coba ajak mengobrol singkat sebelum karakter disimpan.
            </p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
            >
              Reset
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-3 space-y-3">
          {messages.length === 0 ? (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
              {firstGreeting ||
                'Isi profil karakter lalu kirim pesan uji coba di bawah untuk melihat gaya bicaranya.'}
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`flex flex-col min-w-0 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                <span className="text-[10px] font-medium text-slate-400 mb-0.5 px-1">
                  {m.role === 'user' ? 'Kamu' : characterName || 'Karakter'}
                </span>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed whitespace-pre-line break-words [overflow-wrap:anywhere] ${
                    m.role === 'character'
                      ? 'bg-slate-100 dark:bg-[#151c2e] text-slate-900 dark:text-slate-100 rounded-tl-xs'
                      : 'bg-slate-900 dark:bg-indigo-600 text-white rounded-tr-xs'
                  }`}
                >
                  <FormattedMessage content={m.content} isUser={m.role !== 'character'} />
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="text-xs text-slate-400 italic">{characterName || 'Karakter'} sedang mengetik...</div>
          )}
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-end gap-2">
          <AutoResizeTextarea
            rows={1}
            maxHeight={120}
            submitOnEnter
            onEnterSubmit={() => {
              if (!loading && input.trim()) onSend();
            }}
            value={input}
            onChange={(e) => onChangeInput(e.target.value)}
            placeholder="Ketik pesan uji coba..."
            className="flex-1 min-h-9 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-xs leading-5 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="button"
            disabled={loading || !input.trim()}
            onClick={onSend}
            className="w-9 h-9 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 text-white inline-flex items-center justify-center shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
