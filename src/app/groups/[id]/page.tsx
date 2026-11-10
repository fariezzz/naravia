'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Send, MessageSquare, AlertCircle, X } from 'lucide-react';
import CharacterAvatar from '@/components/CharacterAvatar';
import FormattedMessage from '@/components/FormattedMessage';
import { getClientCache, setClientCache } from '@/lib/clientCache';

export default function GroupChatRoomPage() {
  const params = useParams<{ id: string }>();
  const groupId = params.id;

  const [groupChat, setGroupChat] = useState<any>(() => {
    return getClientCache<any>(`group_room_${groupId}`)?.groupChat || null;
  });
  const [members, setMembers] = useState<any[]>(() => {
    return getClientCache<any>(`group_room_${groupId}`)?.members || [];
  });
  const [messages, setMessages] = useState<any[]>(() => {
    return getClientCache<any>(`group_room_${groupId}`)?.messages || [];
  });
  const [personas, setPersonas] = useState<any[]>(() => {
    return getClientCache<any>(`group_room_${groupId}`)?.personas || [];
  });
  const [userPersona, setUserPersona] = useState<{
    id?: string;
    display_name: string;
    avatar: string;
  }>(() => {
    const cached = getClientCache<any>(`group_room_${groupId}`);
    return (
      cached?.userPersona || {
        id: '',
        display_name: 'Kamu',
        avatar: '',
      }
    );
  });
  const [loading, setLoading] = useState(() => {
    const cached = getClientCache<any>(`group_room_${groupId}`);
    return !cached || !cached.groupChat;
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [inputText, setInputText] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);

  const loadGroupRoom = async (isBackground = false) => {
    if (!isBackground) {
      const cached = getClientCache<any>(`group_room_${groupId}`);
      if (!cached || !cached.groupChat) setLoading(true);
    }
    setError('');
    try {
      const [res, pRes] = await Promise.all([
        fetch(`/api/group-chats/${groupId}`),
        fetch('/api/persona'),
      ]);
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

      if (resolvedPersona) {
        setUserPersona(personaItem);
      }
      setGroupChat(data.groupChat);
      setMembers(data.members || []);
      setMessages(data.messages || []);

      setClientCache(`group_room_${groupId}`, {
        groupChat: data.groupChat,
        members: data.members || [],
        messages: data.messages || [],
        personas: listPersonas,
        userPersona: personaItem,
      });
    } catch (err) {
      if (!groupChat) {
        setError(err instanceof Error ? err.message : 'Gagal memuat grup chat.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (groupId) {
      const cached = getClientCache<any>(`group_room_${groupId}`);
      loadGroupRoom(Boolean(cached?.groupChat));
    }
  }, [groupId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  const handleSwitchGroupPersona = async (personaId: string) => {
    const chosen = personas.find((p) => p.id === personaId);
    if (chosen) {
      setUserPersona({
        id: chosen.id,
        display_name: chosen.display_name || 'Kamu',
        avatar: chosen.avatar || '',
      });
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

  const handleTurn = async (options?: { content?: string; targetCharacterId?: string }) => {
    if (sending) return;
    const textToSend = options?.content !== undefined ? options.content : inputText.trim();

    // Jika pesan kosong dan belum ada percakapan sama sekali serta tidak ada target karakter khusus
    if (!textToSend && !options?.targetCharacterId && messages.length === 0) return;

    const tempUserMsgId = textToSend ? `temp-guser-${Date.now()}` : null;

    setSending(true);
    setError('');
    if (options?.content === undefined) {
      setInputText('');
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

    try {
      const res = await fetch(`/api/group-chats/${groupId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: textToSend,
          targetCharacterId: options?.targetCharacterId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (tempUserMsgId) {
          setMessages((prev) => prev.filter((m) => m.id !== tempUserMsgId));
        }
        if (options?.content === undefined && textToSend) setInputText(textToSend);
        throw new Error(data.error || 'Gagal menjalankan giliran grup chat.');
      }

      setMessages((prev) => {
        const next = tempUserMsgId ? prev.filter((m) => m.id !== tempUserMsgId) : [...prev];
        if (data.userMessage) next.push(data.userMessage);
        if (data.characterMessage) next.push(data.characterMessage);
        return next;
      });
    } catch (err) {
      if (tempUserMsgId) {
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMsgId));
      }
      setError(err instanceof Error ? err.message : 'Gagal memproses giliran bicara.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl w-full mx-auto px-4 py-8 text-sm text-slate-500">
        Memuat ruang grup chat...
      </div>
    );
  }

  if (!groupChat) {
    return (
      <div className="max-w-4xl w-full mx-auto px-4 py-8 space-y-4">
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          {error || 'Grup chat tidak ditemukan.'}
        </div>
        <Link href="/groups" className="text-sm font-medium text-indigo-600 hover:underline">
          Kembali ke Daftar Grup
        </Link>
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-54px)] md:h-[calc(100dvh-64px)] overflow-hidden flex flex-col max-w-5xl w-full mx-auto px-4 py-3">
      {/* Header Grup */}
      <div className="bg-white rounded-2xl border border-slate-200 px-4 py-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/groups"
            className="w-8 h-8 rounded-lg border border-slate-200 inline-flex items-center justify-center text-slate-600 hover:bg-slate-50 shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-slate-900 truncate">{groupChat.title}</h1>
            <p className="text-[11px] text-slate-500 truncate">
              Anggota: {members.map((m) => m.name).join(', ')}
            </p>
          </div>
        </div>

        {/* Pemilih Persona & Tombol Panggil Giliran Bicara Karakter Tertentu */}
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-full">
          {personas.length > 0 && (
            <div
              className="h-7 pl-1 pr-2 rounded-lg border border-slate-200 bg-slate-50/70 inline-flex items-center gap-1.5 mr-1 shrink-0"
              title="Ganti Persona Kamu di Grup Ini"
            >
              <CharacterAvatar
                name={userPersona.display_name}
                avatar={userPersona.avatar}
                size="xs"
              />
              <select
                value={userPersona.id || ''}
                onChange={(e) => handleSwitchGroupPersona(e.target.value)}
                aria-label="Pilih Persona"
                className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer max-w-[110px] truncate"
              >
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <span className="text-[11px] text-slate-400 whitespace-nowrap mr-1">
            Giliran Bicara:
          </span>
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={sending}
              onClick={() => handleTurn({ content: '', targetCharacterId: m.id })}
              className="h-7 px-2.5 rounded-lg border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
              title={`Minta ${m.name} menanggapi sekarang`}
            >
              <MessageSquare className="w-3 h-3 text-indigo-600" />
              <span>{m.name}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-3 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError('')}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Area Pesan Grup */}
      <div className="flex-1 bg-white rounded-2xl border border-slate-200 mt-3 flex flex-col overflow-hidden shadow-2xs">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 space-y-2">
              <p>Ruang grup siap dimulai.</p>
              <p>
                Kirim pesan di bawah (sebut nama karakter untuk memanggil gilirannya), atau klik tombol nama karakter di atas agar mereka memulai percakapan.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isChar = msg.role === 'character';
              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 ${isChar ? 'justify-start' : 'justify-end'}`}
                >
                  {isChar && (
                    <CharacterAvatar
                      name={msg.character_name || 'Karakter'}
                      avatar={msg.character_avatar}
                      size="sm"
                    />
                  )}
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] space-y-1 ${
                      isChar ? 'items-start' : 'items-end flex flex-col'
                    }`}
                  >
                    <span className="text-xs font-semibold text-slate-700 px-1">
                      {isChar ? msg.character_name : userPersona.display_name || 'Kamu'}
                    </span>
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${
                        isChar
                          ? 'bg-slate-100 text-slate-900 rounded-tl-xs'
                          : 'bg-slate-900 text-white rounded-tr-xs'
                      }`}
                    >
                      <FormattedMessage content={msg.content} isUser={!isChar} />
                    </div>
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

          {sending && (
            <div className="text-xs text-slate-400 italic px-2">
              Karakter sedang menyusun tanggapan...
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="p-3.5 border-t border-slate-200 bg-slate-50/50 flex items-end gap-2">
          <textarea
            rows={2}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleTurn();
              }
            }}
            placeholder={
              messages.length > 0
                ? 'Kirim pesan ke grup (Enter kosong untuk lanjut bicara karakter lain)...'
                : 'Kirim pesan ke grup (sebut nama karakter jika ingin menunjuk gilirannya)...'
            }
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 resize-none"
          />
          <button
            type="button"
            disabled={sending || (!inputText.trim() && messages.length === 0)}
            onClick={() => handleTurn()}
            className="h-[60px] px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 shrink-0"
            title={!inputText.trim() ? 'Lanjut bicara karakter berikutnya' : 'Kirim'}
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">
              {inputText.trim() ? 'Kirim' : messages.length > 0 ? 'Lanjut' : 'Kirim'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
