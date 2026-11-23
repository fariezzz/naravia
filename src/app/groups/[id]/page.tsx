'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Check, ChevronUp, Copy, MessageSquare, Send, Square, X } from 'lucide-react';
import CharacterAvatar from '@/components/CharacterAvatar';
import FormattedMessage from '@/components/FormattedMessage';
import { getClientCache, setClientCache } from '@/lib/clientCache';

export default function GroupChatRoomPage() {
  const params = useParams<{ id: string }>();
  const groupId = params.id;

  const [groupChat, setGroupChat] = useState<any>(() => getClientCache<any>(`group_room_${groupId}`)?.groupChat || null);
  const [members, setMembers] = useState<any[]>(() => getClientCache<any>(`group_room_${groupId}`)?.members || []);
  const [messages, setMessages] = useState<any[]>(() => getClientCache<any>(`group_room_${groupId}`)?.messages || []);
  const [totalMessages, setTotalMessages] = useState<number>(
    () => getClientCache<any>(`group_room_${groupId}`)?.totalMessages || 0
  );
  const [hasMoreMessages, setHasMoreMessages] = useState<boolean>(
    () => Boolean(getClientCache<any>(`group_room_${groupId}`)?.hasMoreMessages)
  );
  const [oldestCursor, setOldestCursor] = useState<string | null>(
    () => getClientCache<any>(`group_room_${groupId}`)?.oldestCursor || null
  );
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [personas, setPersonas] = useState<any[]>(() => getClientCache<any>(`group_room_${groupId}`)?.personas || []);
  const [userPersona, setUserPersona] = useState<{ id?: string; display_name: string; avatar: string }>(() => {
    const cached = getClientCache<any>(`group_room_${groupId}`);
    return cached?.userPersona || { id: '', display_name: 'Kamu', avatar: '' };
  });
  const [loading, setLoading] = useState(() => !getClientCache<any>(`group_room_${groupId}`)?.groupChat);
  const [sending, setSending] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [inputText, setInputText] = useState('');
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const skipAutoScrollRef = useRef(false);

  const handleCopyMessage = async (msgId: string, text: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedMsgId(msgId);
      setTimeout(() => setCopiedMsgId((prev) => (prev === msgId ? null : prev)), 2000);
    } catch {
      setError('Gagal menyalin teks pesan.');
    }
  };

  const loadGroupRoom = async (isBackground = false) => {
    if (!isBackground && !getClientCache<any>(`group_room_${groupId}`)?.groupChat) setLoading(true);
    setError('');
    try {
      const [res, pRes] = await Promise.all([fetch(`/api/group-chats/${groupId}?limit=60`), fetch('/api/persona')]);
      const data = await res.json();
      const pData = await pRes.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Grup chat tidak ditemukan.');

      const listPersonas = Array.isArray(data.personas)
        ? data.personas
        : Array.isArray(pData?.personas)
        ? pData.personas
        : [];
      setPersonas(listPersonas);

      const resolvedPersona = data.activePersona || pData?.persona;
      const personaItem = resolvedPersona
        ? {
            id: resolvedPersona.id || '',
            display_name: resolvedPersona.display_name || 'Kamu',
            avatar: resolvedPersona.avatar || '',
          }
        : userPersona;
      if (resolvedPersona) setUserPersona(personaItem);

      setGroupChat(data.groupChat);
      setMembers(data.members || []);
      setMessages(data.messages || []);
      setTotalMessages(Number(data.totalMessages ?? (data.messages?.length || 0)));
      setHasMoreMessages(Boolean(data.hasMoreMessages));
      setOldestCursor(data.oldestCursor || null);

      setClientCache(`group_room_${groupId}`, {
        groupChat: data.groupChat,
        members: data.members || [],
        messages: data.messages || [],
        totalMessages: Number(data.totalMessages ?? (data.messages?.length || 0)),
        hasMoreMessages: Boolean(data.hasMoreMessages),
        oldestCursor: data.oldestCursor || null,
        personas: listPersonas,
        userPersona: personaItem,
      });
    } catch (err) {
      if (!groupChat) setError(err instanceof Error ? err.message : 'Gagal memuat grup chat.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadOlder = async () => {
    if (loadingOlder || !hasMoreMessages || !oldestCursor) return;
    setLoadingOlder(true);
    const box = scrollBoxRef.current;
    const prevHeight = box?.scrollHeight || 0;
    const prevTop = box?.scrollTop || 0;

    try {
      const res = await fetch(
        `/api/group-chats/${groupId}?messagesOnly=1&limit=50&before=${encodeURIComponent(oldestCursor)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memuat pesan lama.');
      const older = data.messages || [];
      if (older.length > 0) {
        skipAutoScrollRef.current = true;
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          return [...older.filter((m: any) => !ids.has(m.id)), ...prev];
        });
        setHasMoreMessages(Boolean(data.hasMoreMessages));
        setOldestCursor(data.oldestCursor || null);
        requestAnimationFrame(() => {
          if (box) box.scrollTop = prevTop + (box.scrollHeight - prevHeight);
        });
      } else {
        setHasMoreMessages(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat pesan lama.');
    } finally {
      setLoadingOlder(false);
    }
  };

  useEffect(() => {
    if (groupId) {
      const cached = getClientCache<any>(`group_room_${groupId}`);
      loadGroupRoom(Boolean(cached?.groupChat));
    }
  }, [groupId]);

  useEffect(() => {
    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  useEffect(() => {
    if (!inputText && textareaRef.current) textareaRef.current.style.height = '';
  }, [inputText]);

  const handleSwitchGroupPersona = async (personaId: string) => {
    const chosen = personas.find((p) => p.id === personaId);
    if (chosen) {
      setUserPersona({ id: chosen.id, display_name: chosen.display_name || 'Kamu', avatar: chosen.avatar || '' });
    }
    try {
      const res = await fetch(`/api/group-chats/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona_id: personaId }),
      });
      const data = await res.json();
      if (res.ok && data.activePersona) {
        setUserPersona({
          id: data.activePersona.id || '',
          display_name: data.activePersona.display_name || 'Kamu',
          avatar: data.activePersona.avatar || '',
        });
      }
    } catch {
      setError('Gagal mengganti persona grup chat.');
    }
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const handleTurn = async (options?: { content?: string; targetCharacterId?: string }) => {
    if (sending) return;
    const textToSend = options?.content !== undefined ? options.content : inputText.trim();
    if (!textToSend && !options?.targetCharacterId && messages.length === 0) return;

    const tempUserMsgId = textToSend ? `temp-guser-${Date.now()}` : null;
    setSending(true);
    setStreamingMsgId(null);
    setError('');
    if (options?.content === undefined) {
      setInputText('');
      if (textareaRef.current) textareaRef.current.style.height = '';
    }

    if (tempUserMsgId && textToSend) {
      setMessages((prev) => [
        ...prev,
        {
          id: tempUserMsgId,
          group_chat_id: groupId,
          role: 'user',
          character_id: null,
          content: textToSend,
          created_at: new Date().toISOString(),
        },
      ]);
    }

    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    try {
      const res = await fetch(`/api/group-chats/${groupId}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortCtrl.signal,
        body: JSON.stringify({
          content: textToSend,
          targetCharacterId: options?.targetCharacterId || null,
        }),
      });

      if (!res.ok) {
        if (tempUserMsgId) setMessages((prev) => prev.filter((m) => m.id !== tempUserMsgId));
        if (options?.content === undefined && textToSend) setInputText(textToSend);
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Gagal menjalankan giliran grup chat.');
      }

      if (!res.body) throw new Error('Stream tidak tersedia.');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let activeMsgId = '';
      let liveText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const jsonStr = trimmed.slice(6).trim();
          if (!jsonStr) continue;
          try {
            const event = JSON.parse(jsonStr);
            if (event.type === 'start') {
              activeMsgId = event.characterMessageId;
              setStreamingMsgId(activeMsgId);
              setMessages((prev) => {
                const next =
                  tempUserMsgId && event.userMessage
                    ? prev.map((m) => (m.id === tempUserMsgId ? event.userMessage : m))
                    : [...prev];
                return [
                  ...next,
                  {
                    id: activeMsgId,
                    group_chat_id: groupId,
                    role: 'character',
                    character_id: event.speaker?.id || null,
                    character_name: event.speaker?.name || 'Karakter',
                    character_avatar: event.speaker?.avatar || '',
                    content: '',
                    created_at: new Date().toISOString(),
                  },
                ];
              });
            } else if (event.type === 'chunk') {
              liveText += event.text;
              setMessages((prev) => prev.map((m) => (m.id === activeMsgId ? { ...m, content: liveText } : m)));
            } else if (event.type === 'done' || event.type === 'stopped') {
              if (event.message) {
                setMessages((prev) => prev.map((m) => (m.id === activeMsgId ? event.message : m)));
                setTotalMessages((n) => n + (tempUserMsgId ? 2 : 1));
              }
              setClientCache(`group_room_${groupId}`, null);
            } else if (event.type === 'error') {
              setError(event.error);
              if (!liveText) {
                setMessages((prev) =>
                  prev.filter((m) => m.id !== activeMsgId && (!tempUserMsgId || m.id !== tempUserMsgId))
                );
              }
            }
          } catch {}
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        if (tempUserMsgId) setMessages((prev) => prev.filter((m) => m.id !== tempUserMsgId));
        setError(err instanceof Error ? err.message : 'Gagal memproses giliran bicara.');
      }
    } finally {
      abortControllerRef.current = null;
      setSending(false);
      setStreamingMsgId(null);
      setMessages((prev) => prev.filter((m) => !(m.role === 'character' && !String(m.content || '').trim())));
    }
  };

  if (loading) {
    return <div className="max-w-4xl w-full mx-auto px-4 py-8 text-sm text-slate-500">Memuat ruang grup chat...</div>;
  }

  if (!groupChat) {
    return (
      <div className="max-w-4xl w-full mx-auto px-4 py-8 space-y-4">
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-sm text-rose-700 dark:text-rose-300">
          {error || 'Grup chat tidak ditemukan.'}
        </div>
        <Link href="/groups" className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
          Kembali ke Daftar Grup
        </Link>
      </div>
    );
  }

  const hiddenOlder = Math.max(0, totalMessages - messages.length);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden max-w-5xl w-full mx-auto px-0 sm:px-4 py-0 sm:py-3 min-h-0">
      <div className="bg-white dark:bg-[#0c1220] border-b sm:border border-slate-200 dark:border-slate-800 px-3.5 sm:px-4 py-2 sm:py-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 sm:gap-3 sm:rounded-2xl shadow-2xs shrink-0 z-20 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/groups"
            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-800 inline-flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-slate-900 dark:text-white truncate">{groupChat.title}</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Anggota: {members.map((m) => m.name).join(', ')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto max-w-full">
          {personas.length > 0 && (
            <div
              className="h-7 pl-1 pr-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/70 inline-flex items-center gap-1.5 mr-1 shrink-0"
              title="Ganti Persona Kamu di Grup Ini"
            >
              <CharacterAvatar name={userPersona.display_name} avatar={userPersona.avatar} size="xs" />
              <select
                value={userPersona.id || ''}
                onChange={(e) => handleSwitchGroupPersona(e.target.value)}
                aria-label="Pilih Persona"
                className="bg-transparent text-xs text-slate-700 dark:text-slate-200 font-medium focus:outline-none cursor-pointer max-w-[100px] truncate"
              >
                {personas.map((p) => (
                  <option key={p.id} value={p.id} className="dark:bg-[#0f1729]">
                    {p.display_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <span className="text-[11px] text-slate-400 whitespace-nowrap mr-1">Giliran Bicara:</span>
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={sending}
              onClick={() => handleTurn({ content: '', targetCharacterId: m.id })}
              className="h-7 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/40 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-50"
              title={`Minta ${m.name} menanggapi sekarang`}
            >
              <MessageSquare className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
              <span>{m.name}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-3 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError('')}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex-1 bg-white dark:bg-[#0c1220] border-0 sm:border border-slate-200 dark:border-slate-800 mt-0 sm:mt-3 flex flex-col overflow-hidden sm:rounded-2xl shadow-none sm:shadow-2xs transition-colors">
        <div ref={scrollBoxRef} className="flex-1 overflow-y-auto px-3.5 py-4 sm:p-6 space-y-4 sm:space-y-5">
          {hasMoreMessages && (
            <div className="flex justify-center pb-2">
              <button
                type="button"
                disabled={loadingOlder}
                onClick={handleLoadOlder}
                className="h-8 px-3.5 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <ChevronUp className="w-3.5 h-3.5" />
                <span>
                  {loadingOlder
                    ? 'Memuat pesan lama...'
                    : `Muat pesan lebih lama${hiddenOlder > 0 ? ` (${hiddenOlder} tersisa)` : ''}`}
                </span>
              </button>
            </div>
          )}

          {messages.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400 space-y-2">
              <p>Ruang grup siap dimulai.</p>
              <p>
                Kirim pesan di bawah (sebut nama karakter untuk memanggil gilirannya), atau klik tombol nama karakter di
                atas agar mereka memulai percakapan.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isChar = msg.role === 'character';
              const isStreamingThis = streamingMsgId === msg.id;
              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2.5 sm:gap-3 ${isChar ? 'justify-start' : 'justify-end'}`}
                >
                  {isChar && (
                    <CharacterAvatar
                      name={msg.character_name || 'Karakter'}
                      avatar={msg.character_avatar}
                      size="sm"
                    />
                  )}
                  <div
                    className={`max-w-[92%] sm:max-w-[78%] min-w-0 space-y-1.5 ${
                      isChar ? 'items-start' : 'items-end flex flex-col'
                    }`}
                  >
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 px-1">
                      {isChar ? msg.character_name : userPersona.display_name || 'Kamu'}
                    </span>
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line break-words [overflow-wrap:anywhere] ${
                        isChar
                          ? 'bg-slate-100 dark:bg-[#151c2e] text-slate-900 dark:text-slate-100 rounded-tl-xs'
                          : 'bg-slate-900 dark:bg-indigo-600 text-white rounded-tr-xs'
                      }`}
                    >
                      {isChar && !String(msg.content || '').trim() && isStreamingThis ? (
                        <span className="text-xs text-slate-500 dark:text-slate-400 italic">
                          {msg.character_name || 'Karakter'} sedang mengetik...
                        </span>
                      ) : (
                        <FormattedMessage content={msg.content} isUser={!isChar} />
                      )}
                    </div>

                    {!isStreamingThis && (
                      <div className="flex items-center gap-1.5 px-1 text-slate-400 dark:text-slate-500">
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(msg.id, msg.content)}
                          className={`p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 text-[11px] transition-colors ${
                            copiedMsgId === msg.id
                              ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                              : 'hover:text-slate-700 dark:hover:text-slate-200'
                          }`}
                          title="Salin Isi Pesan"
                        >
                          {copiedMsgId === msg.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                              <span>Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Salin</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                  {!isChar && (
                    <CharacterAvatar
                      name={userPersona.display_name || 'Kamu'}
                      avatar={userPersona.avatar}
                      size="sm"
                    />
                  )}
                </div>
              );
            })
          )}

          {sending && !streamingMsgId && (
            <div className="text-xs text-slate-400 dark:text-slate-500 italic px-2">
              Karakter sedang menyusun tanggapan...
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="p-2.5 sm:p-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0c1220]/90 backdrop-blur-xs flex items-center gap-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shrink-0 z-20 transition-colors">
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
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
                  handleTurn();
                }
              }
            }}
            placeholder={`Kirim pesan ke ${groupChat.title}...`}
            className="flex-1 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] px-4 py-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 resize-none h-[48px] min-h-[48px] max-h-36 leading-5 shadow-2xs"
          />
          {sending ? (
            <button
              type="button"
              onClick={handleStopStreaming}
              className="h-[48px] w-[48px] rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center justify-center shrink-0 transition-colors shadow-2xs"
              title="Berhenti Berbicara"
              aria-label="Berhenti Berbicara"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              disabled={!inputText.trim() && messages.length === 0}
              onClick={() => handleTurn()}
              className="h-[48px] w-[48px] rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 dark:disabled:text-slate-600 text-white text-xs font-semibold inline-flex items-center justify-center shrink-0 transition-colors shadow-2xs"
              title={!inputText.trim() ? 'Lanjut bicara' : 'Kirim'}
              aria-label={!inputText.trim() ? 'Lanjut bicara' : 'Kirim'}
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
