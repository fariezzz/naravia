'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Activity, BookOpen, Brain, Globe, Loader2, RefreshCw, Trash2, X } from 'lucide-react';
import AutoResizeTextarea from '@/components/AutoResizeTextarea';
import { ChatContextSnapshot, PersonaItem } from './types';

interface ChatSettingsDrawerProps {
  chatId: string;
  chatSummary: string;
  chatTitleInput: string;
  tempInput: string;
  maxTokensInput: string;
  replyStyleInput: string;
  personas: PersonaItem[];
  userPersona: PersonaItem;
  otherChats: Array<{ id: string; title: string }>;
  summarizing: boolean;
  savingSettings: boolean;
  messageCount: number;
  onClose: () => void;
  onChangeTitle: (val: string) => void;
  onChangeTemp: (val: string) => void;
  onChangeMaxTokens: (val: string) => void;
  onChangeReplyStyle: (val: string) => void;
  onChangeSummary: (val: string) => void;
  onSwitchPersona: (personaId: string) => void;
  onSummarize: () => void;
  onSaveSettings: (e: React.FormEvent) => void;
  onRequestDeleteChat: () => void;
}

export default function ChatSettingsDrawer({
  chatId,
  chatSummary,
  chatTitleInput,
  tempInput,
  maxTokensInput,
  replyStyleInput,
  personas,
  userPersona,
  otherChats,
  summarizing,
  savingSettings,
  messageCount,
  onClose,
  onChangeTitle,
  onChangeTemp,
  onChangeMaxTokens,
  onChangeReplyStyle,
  onChangeSummary,
  onSwitchPersona,
  onSummarize,
  onSaveSettings,
  onRequestDeleteChat,
}: ChatSettingsDrawerProps) {
  const router = useRouter();
  const [drawerTab, setDrawerTab] = useState<'settings' | 'inspector'>('settings');
  const [contextInfo, setContextInfo] = useState<ChatContextSnapshot | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [convertingToStory, setConvertingToStory] = useState(false);
  const [convertError, setConvertError] = useState('');

  const handleConvertToStory = async () => {
    if (convertingToStory) return;
    setConvertingToStory(true);
    setConvertError('');
    try {
      const res = await fetch(`/api/chats/${chatId}/to-story`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengadaptasi percakapan ke novel.');
      if (data.story?.id) {
        router.push(`/stories/${data.story.id}`);
      }
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : 'Gagal mengadaptasi percakapan ke novel.');
      setConvertingToStory(false);
    }
  };

  const loadContext = async () => {
    setLoadingContext(true);
    try {
      const res = await fetch(`/api/chats/${chatId}/context`);
      const data = await res.json();
      if (res.ok && data.context) setContextInfo(data.context);
    } catch {
      // Abaikan kegagalan inspektor ringan
    } finally {
      setLoadingContext(false);
    }
  };

  useEffect(() => {
    if (drawerTab === 'inspector') {
      loadContext();
    }
  }, [drawerTab, chatId, messageCount]);

  return (
    <>
      <div
        className="fixed inset-0 bg-slate-900/40 z-30 xl:hidden backdrop-blur-2xs"
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-40 w-80 max-w-[88vw] xl:static xl:z-auto xl:w-80 bg-white dark:bg-[#0c1220] xl:rounded-2xl border-l xl:border border-slate-200 dark:border-slate-800 p-4 space-y-4 overflow-y-auto shrink-0 shadow-xl xl:shadow-2xs transition-colors">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800/80 p-0.5 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setDrawerTab('settings')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                drawerTab === 'settings'
                  ? 'bg-white dark:bg-[#0f1729] text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Pengaturan
            </button>
            <button
              type="button"
              onClick={() => setDrawerTab('inspector')}
              className={`px-2.5 py-1 rounded-md inline-flex items-center gap-1 transition-colors ${
                drawerTab === 'inspector'
                  ? 'bg-white dark:bg-[#0f1729] text-indigo-700 dark:text-indigo-300 shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Activity className="w-3 h-3" />
              <span>Konteks</span>
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Tutup panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {drawerTab === 'inspector' ? (
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Inspektor Konteks & Token</h3>
              <button
                type="button"
                disabled={loadingContext}
                onClick={loadContext}
                className="p-1 rounded-lg text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Muat ulang inspektor"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingContext ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {!contextInfo ? (
              <p className="text-slate-400">Menghitung estimasi konteks...</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Estimasi Input</div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                      ~{contextInfo.estimatedTotalInputTokens.toLocaleString('id-ID')} tok
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Sys {contextInfo.systemTokens} · Hist {contextInfo.historyTokens}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Jendela Riwayat</div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                      {contextInfo.includedMessages} / {contextInfo.totalMessages}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Batas {contextInfo.historyLimit} pesan
                    </div>
                  </div>
                </div>

                {/* Kuota Token Harian */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Kuota Harian</span>
                    <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                      {contextInfo.quota.unlimited
                        ? `${contextInfo.quota.used.toLocaleString('id-ID')} (Tanpa batas)`
                        : `${contextInfo.quota.used.toLocaleString('id-ID')} / ${contextInfo.quota.budget.toLocaleString('id-ID')}`}
                    </span>
                  </div>
                  {!contextInfo.quota.unlimited && contextInfo.quota.budget > 0 && (
                    <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 dark:bg-indigo-400 rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, Math.round((contextInfo.quota.used / contextInfo.quota.budget) * 100))}%`,
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Lorebook Aktif */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                    <Globe className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    <span>Lorebook Terpicu ({contextInfo.matchedLore.length})</span>
                  </div>
                  {contextInfo.matchedLore.length === 0 ? (
                    <p className="text-[11px] text-slate-400">Belum ada kata kunci lore yang cocok di pesan terbaru.</p>
                  ) : (
                    <div className="space-y-1">
                      {contextInfo.matchedLore.map((l) => (
                        <div
                          key={l.id}
                          className="px-2.5 py-1.5 rounded-lg bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/60 dark:border-teal-900/60"
                        >
                          <div className="font-semibold text-teal-900 dark:text-teal-200">{l.title}</div>
                          {l.matchedKeywords && l.matchedKeywords.length > 0 && (
                            <div className="text-[10px] text-teal-700 dark:text-teal-400">
                              Cocok: {l.matchedKeywords.join(', ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Memori Aktif */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                      <Brain className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>Memori Disuntikkan ({contextInfo.activeMemories.length})</span>
                    </div>
                    <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-medium">
                      {contextInfo.memoryMode === 'semantic'
                        ? 'Semantik'
                        : contextInfo.memoryMode === 'lexical'
                        ? 'Relevansi'
                        : 'Terbaru'}
                    </span>
                  </div>
                  {contextInfo.activeMemories.length === 0 ? (
                    <p className="text-[11px] text-slate-400">Belum ada memori tersimpan untuk karakter ini.</p>
                  ) : (
                    <ul className="space-y-1 max-h-44 overflow-y-auto pr-1">
                      {contextInfo.activeMemories.map((m) => (
                        <li
                          key={m.id}
                          className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800 text-[11px] text-slate-700 dark:text-slate-300 leading-snug"
                        >
                          {m.content}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <form onSubmit={onSaveSettings} className="space-y-3.5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Pengaturan Percakapan Ini</h3>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Judul Ruang Chat
                </label>
                <AutoResizeTextarea
                  rows={1}
                  maxHeight={88}
                  singleParagraph
                  value={chatTitleInput}
                  onChange={(e) => onChangeTitle(e.target.value)}
                  className="w-full min-h-8 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] text-xs leading-5 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Gaya Panjang Balasan
                </label>
                <select
                  value={replyStyleInput}
                  onChange={(e) => onChangeReplyStyle(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-[#111827]"
                >
                  <option value="pendek">Pendek (1-2 paragraf ringkas)</option>
                  <option value="sedang">Sedang (Seimbang & natural)</option>
                  <option value="panjang">Panjang (Deskriptif & mendalam)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Temperature ({tempInput})
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.1"
                    max="1.5"
                    value={tempInput}
                    onChange={(e) => onChangeTemp(e.target.value)}
                    className="w-full h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Max Tokens
                  </label>
                  <input
                    type="number"
                    step="64"
                    min="128"
                    max="4096"
                    value={maxTokensInput}
                    onChange={(e) => onChangeMaxTokens(e.target.value)}
                    className="w-full h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Ringkasan Konteks Cerita
                  </label>
                  <button
                    type="button"
                    disabled={summarizing}
                    onClick={onSummarize}
                    className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    {summarizing ? 'Meringkas...' : 'Buat Ringkasan AI'}
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={chatSummary}
                  onChange={(e) => onChangeSummary(e.target.value)}
                  placeholder="Ringkasan percakapan sejauh ini (otomatis dibuat saat chat panjang atau klik Buat Ringkasan AI)..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-2 text-xs text-slate-800 dark:text-slate-200"
                />
              </div>

              <button
                type="submit"
                disabled={savingSettings}
                className="w-full h-8 rounded-lg bg-slate-900 dark:bg-indigo-600 hover:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
              >
                {savingSettings ? 'Menyimpan...' : 'Simpan Pengaturan Chat'}
              </button>
            </form>

            {otherChats.length > 1 && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Alur Cerita Lain ({otherChats.length})
                </h4>
                <div className="space-y-1.5">
                  {otherChats.map((oc) => (
                    <Link
                      key={oc.id}
                      href={`/chat/${oc.id}`}
                      className={`block px-2.5 py-2 rounded-lg text-xs truncate ${
                        oc.id === chatId
                          ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {oc.title}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <button
                type="button"
                disabled={convertingToStory || messageCount < 2}
                onClick={handleConvertToStory}
                title="Adaptasi riwayat percakapan ini menjadi Bab 1 sebuah novel di Storytelling Studio"
                className="w-full h-8 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
              >
                {convertingToStory ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <BookOpen className="w-3.5 h-3.5" />
                )}
                <span>{convertingToStory ? 'Mengadaptasi ke Novel...' : 'Jadikan Draf Novel'}</span>
              </button>
              {convertError && (
                <p className="text-[11px] text-rose-600 dark:text-rose-400 leading-snug">{convertError}</p>
              )}

              <button
                type="button"
                onClick={onRequestDeleteChat}
                className="w-full h-8 rounded-lg border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-medium inline-flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus Ruang Chat Ini</span>
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
