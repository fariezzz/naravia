'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Send,
  RotateCcw,
  Edit3,
  Trash2,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Plus,
  Globe,
  AlertCircle,
  Check,
  X,
} from 'lucide-react';
import CharacterAvatar from '@/components/CharacterAvatar';
import ConfirmModal from '@/components/ConfirmModal';
import FormattedMessage from '@/components/FormattedMessage';
import { getClientCache, setClientCache } from '@/lib/clientCache';

interface MessageItem {
  id: string;
  chat_id: string;
  role: 'user' | 'character';
  content: string;
  alternatives: string[];
  active_alt_index: number;
  is_pinned_memory: boolean;
  created_at: string;
}

export default function ChatRoomPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const chatId = params.id;

  const [chat, setChat] = useState<any>(() => {
    return getClientCache<any>(`chat_room_${chatId}`)?.chat || null;
  });
  const [character, setCharacter] = useState<any>(() => {
    return getClientCache<any>(`chat_room_${chatId}`)?.character || null;
  });
  const [messages, setMessages] = useState<MessageItem[]>(() => {
    return getClientCache<any>(`chat_room_${chatId}`)?.messages || [];
  });
  const [memories, setMemories] = useState<any[]>(() => {
    return getClientCache<any>(`chat_room_${chatId}`)?.memories || [];
  });
  const [otherChats, setOtherChats] = useState<any[]>(() => {
    return getClientCache<any>(`chat_room_${chatId}`)?.otherChats || [];
  });
  const [matchedLore, setMatchedLore] = useState<any[]>([]);
  const [personas, setPersonas] = useState<any[]>(() => {
    return getClientCache<any>(`chat_room_${chatId}`)?.personas || [];
  });
  const [userPersona, setUserPersona] = useState<{
    id?: string;
    display_name: string;
    avatar: string;
  }>(() => {
    const cached = getClientCache<any>(`chat_room_${chatId}`);
    return (
      cached?.userPersona || {
        id: '',
        display_name: 'Kamu',
        avatar: '',
      }
    );
  });

  const [loading, setLoading] = useState(() => {
    const cached = getClientCache<any>(`chat_room_${chatId}`);
    return !cached || !cached.chat;
  });
  const [sending, setSending] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [inputText, setInputText] = useState('');
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');

  const [showDrawer, setShowDrawer] = useState(false);
  const [chatTitleInput, setChatTitleInput] = useState(() => {
    return getClientCache<any>(`chat_room_${chatId}`)?.chat?.title || '';
  });
  const [tempInput, setTempInput] = useState(() => {
    const cached = getClientCache<any>(`chat_room_${chatId}`);
    return String(cached?.chat?.temperature ?? cached?.character?.temperature_override ?? 0.9);
  });
  const [maxTokensInput, setMaxTokensInput] = useState(() => {
    const cached = getClientCache<any>(`chat_room_${chatId}`);
    return String(cached?.chat?.max_tokens ?? 1024);
  });
  const [replyStyleInput, setReplyStyleInput] = useState(() => {
    const cached = getClientCache<any>(`chat_room_${chatId}`);
    return cached?.chat?.reply_style || 'sedang';
  });
  const [summarizing, setSummarizing] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const [deleteChatModal, setDeleteChatModal] = useState(false);
  const [deleteMsgTarget, setDeleteMsgTarget] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  const loadRoom = async (isBackground = false) => {
    if (!isBackground) {
      const cached = getClientCache<any>(`chat_room_${chatId}`);
      if (!cached || !cached.chat) setLoading(true);
    }
    setError('');
    try {
      const [res, pRes] = await Promise.all([
        fetch(`/api/chats/${chatId}`),
        fetch('/api/persona'),
      ]);
      const data = await res.json();
      const pData = await pRes.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Ruang percakapan tidak ditemukan.');
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
      setChat(data.chat);
      setCharacter(data.character);
      setMessages(data.messages || []);
      setMemories(data.memories || []);
      setOtherChats(data.otherChats || []);

      setChatTitleInput(data.chat.title || '');
      setTempInput(String(data.chat.temperature ?? data.character.temperature_override ?? 0.9));
      setMaxTokensInput(String(data.chat.max_tokens ?? 1024));
      setReplyStyleInput(data.chat.reply_style || 'sedang');

      setClientCache(`chat_room_${chatId}`, {
        chat: data.chat,
        character: data.character,
        messages: data.messages || [],
        memories: data.memories || [],
        otherChats: data.otherChats || [],
        personas: listPersonas,
        userPersona: personaItem,
      });
    } catch (err) {
      if (!chat) {
        setError(err instanceof Error ? err.message : 'Gagal memuat percakapan.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (chatId) {
      const cached = getClientCache<any>(`chat_room_${chatId}`);
      loadRoom(Boolean(cached?.chat));
    }
  }, [chatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  const handleSendMessage = async () => {
    const content = inputText.trim();
    if (sending) return;

    // Jika pesan kosong dan belum ada percakapan sama sekali, jangan kirim
    if (!content && messages.length === 0) return;

    const isContinue = !content;
    const tempUserMsgId = !isContinue ? `temp-user-${Date.now()}` : null;

    if (!isContinue && tempUserMsgId) {
      const optimisticUserMessage: MessageItem = {
        id: tempUserMsgId,
        chat_id: chatId,
        role: 'user',
        content,
        alternatives: [content],
        active_alt_index: 0,
        is_pinned_memory: false,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticUserMessage]);
    }

    setSending(true);
    setError('');
    setInputText('');

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          chatId,
          content,
          isContinue,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (tempUserMsgId) {
          setMessages((prev) => prev.filter((m) => m.id !== tempUserMsgId));
          setInputText(content);
        }
        throw new Error(data.error || 'Gagal mengirim pesan.');
      }

      const newItems: MessageItem[] = [];
      if (data.userMessage) newItems.push(data.userMessage);
      if (data.characterMessage) newItems.push(data.characterMessage);

      let updatedMessages: MessageItem[] = [];
      setMessages((prev) => {
        const filtered = tempUserMsgId ? prev.filter((m) => m.id !== tempUserMsgId) : prev;
        updatedMessages = [...filtered, ...newItems];
        return updatedMessages;
      });

      if (Array.isArray(data.matchedLore)) setMatchedLore(data.matchedLore);
      if (data.chat) setChat(data.chat);
      if (Array.isArray(data.memories)) setMemories(data.memories);

      setClientCache(`chat_room_${chatId}`, {
        chat: data.chat || chat,
        character,
        messages: updatedMessages.length > 0 ? updatedMessages : messages,
        memories: Array.isArray(data.memories) ? data.memories : memories,
        otherChats,
        personas,
        userPersona,
      });
    } catch (err) {
      if (tempUserMsgId) {
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMsgId));
      }
      setError(err instanceof Error ? err.message : 'Gagal mengirim pesan.');
    } finally {
      setSending(false);
    }
  };

  const handleSwipeSelect = async (msg: MessageItem, newIndex: number) => {
    if (newIndex < 0 || newIndex >= msg.alternatives.length) return;
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'swipe_select',
          messageId: msg.id,
          index: newIndex,
        }),
      });
      const data = await res.json();
      if (res.ok && data.message) {
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? data.message : m)));
      }
    } catch {
      setError('Gagal mengganti alternatif balasan.');
    }
  };

  const handleGenerateSwipeOrRegenerate = async (msg: MessageItem) => {
    if (regeneratingId || sending) return;
    setRegeneratingId(msg.id);
    setError('');
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'swipe_generate',
          messageId: msg.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal membuat alternatif balasan baru.');

      setMessages((prev) => prev.map((m) => (m.id === msg.id ? data.message : m)));
      if (Array.isArray(data.matchedLore)) setMatchedLore(data.matchedLore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat alternatif balasan.');
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleSaveEditMessage = async (messageId: string) => {
    if (!editingContent.trim()) return;
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit',
          messageId,
          content: editingContent.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan perubahan pesan.');
      setMessages((prev) => prev.map((m) => (m.id === messageId ? data.message : m)));
      setEditingMsgId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengedit pesan.');
    }
  };

  const handleConfirmDeleteMessage = async () => {
    if (!deleteMsgTarget) return;
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          messageId: deleteMsgTarget,
        }),
      });
      setMessages((prev) => prev.filter((m) => m.id !== deleteMsgTarget));
      setDeleteMsgTarget(null);
    } catch {
      setError('Gagal menghapus pesan.');
    }
  };

  const handlePinMessageToMemory = async (msg: MessageItem) => {
    if (!character) return;
    try {
      if (msg.is_pinned_memory) {
        const linked = memories.find((mem) => mem.source_message_id === msg.id);
        if (linked) {
          await fetch(`/api/memories?id=${encodeURIComponent(linked.id)}`, { method: 'DELETE' });
          setMemories((prev) => prev.filter((m) => m.id !== linked.id));
        }
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, is_pinned_memory: false } : m))
        );
        return;
      }

      const res = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: character.id,
          type: 'fact',
          content: msg.content.slice(0, 300),
          sourceChatId: chatId,
          sourceMessageId: msg.id,
        }),
      });
      const data = await res.json();
      if (res.ok && data.memory) {
        setMemories((prev) => [data.memory, ...prev]);
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, is_pinned_memory: true } : m))
        );
      }
    } catch {
      setError('Gagal memperbarui status memori pesan.');
    }
  };

  const handleSwitchChatPersona = async (personaId: string) => {
    const chosen = personas.find((p) => p.id === personaId);
    if (chosen) {
      setUserPersona({
        id: chosen.id,
        display_name: chosen.display_name || 'Kamu',
        avatar: chosen.avatar || '',
      });
    }
    try {
      const res = await fetch(`/api/chats/${chatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona_id: personaId }),
      });
      const data = await res.json();
      if (res.ok && data.chat) {
        setChat(data.chat);
        if (data.activePersona) {
          setUserPersona({
            id: data.activePersona.id || '',
            display_name: data.activePersona.display_name || 'Kamu',
            avatar: data.activePersona.avatar || '',
          });
        }
      }
    } catch {
      setError('Gagal mengganti persona ruang chat.');
    }
  };

  const handleSaveChatSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setError('');
    try {
      const res = await fetch(`/api/chats/${chatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: chatTitleInput,
          temperature: parseFloat(tempInput) || 0.9,
          max_tokens: parseInt(maxTokensInput, 10) || 1024,
          reply_style: replyStyleInput,
          persona_id: userPersona.id || null,
          summary: chat.summary || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan pengaturan chat.');
      setChat(data.chat);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSummarizeNow = async () => {
    setSummarizing(true);
    setError('');
    try {
      const res = await fetch(`/api/chats/${chatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'summarize' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal meringkas percakapan.');
      setChat(data.chat);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal meringkas percakapan.');
    } finally {
      setSummarizing(false);
    }
  };

  const handleCreateNewRoomSameCharacter = async () => {
    if (!character) return;
    try {
      const res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: character.id, greetingIndex: 0 }),
      });
      const data = await res.json();
      if (res.ok && data.chat) {
        router.push(`/chat/${data.chat.id}`);
      }
    } catch {
      setError('Gagal memulai percakapan baru.');
    }
  };

  const handleDeleteCurrentChat = async () => {
    try {
      await fetch(`/api/chats/${chatId}`, { method: 'DELETE' });
      router.push(character ? `/characters/${character.id}` : '/');
    } catch {
      setError('Gagal menghapus ruang percakapan.');
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl w-full mx-auto px-4 py-8 text-sm text-slate-500">
        Memuat ruang percakapan...
      </div>
    );
  }

  if (!chat || !character) {
    return (
      <div className="max-w-4xl w-full mx-auto px-4 py-8 space-y-4">
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          {error || 'Percakapan tidak ditemukan.'}
        </div>
        <Link href="/" className="text-sm font-medium text-indigo-600 hover:underline">
          Kembali ke Beranda
        </Link>
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-54px)] md:h-[calc(100dvh-64px)] overflow-hidden flex flex-col max-w-5xl w-full mx-auto px-4 py-3">
      {/* Bar Header Ruang Chat */}
      <div className="bg-white rounded-2xl border border-slate-200 px-4 py-2.5 flex items-center justify-between gap-3 shadow-2xs shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/characters/${character.id}`}
            className="w-8 h-8 rounded-lg border border-slate-200 inline-flex items-center justify-center text-slate-600 hover:bg-slate-50 shrink-0"
            title="Profil Karakter"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <Link href={`/characters/${character.id}`} className="flex items-center gap-2.5 min-w-0">
            <CharacterAvatar name={character.name} avatar={character.avatar} size="sm" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-slate-900 truncate">{character.name}</h1>
                {character.world_name && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-teal-50 text-teal-700 text-[10px] font-medium">
                    <Globe className="w-2.5 h-2.5" />
                    <span>{character.world_name}</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 truncate">{chat.title}</p>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {personas.length > 0 && (
            <div
              className="h-8 pl-1.5 pr-2 rounded-lg border border-slate-200 bg-slate-50/70 inline-flex items-center gap-1.5"
              title="Ganti Persona Kamu di Ruang Chat Ini"
            >
              <CharacterAvatar
                name={userPersona.display_name}
                avatar={userPersona.avatar}
                size="xs"
              />
              <select
                value={userPersona.id || ''}
                onChange={(e) => handleSwitchChatPersona(e.target.value)}
                aria-label="Pilih Persona"
                className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer max-w-[115px] truncate"
              >
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            type="button"
            onClick={handleCreateNewRoomSameCharacter}
            className="h-8 px-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1 whitespace-nowrap"
            title="Mulai Alur Chat Baru dengan Karakter Ini"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Chat Baru</span>
          </button>
          <button
            type="button"
            onClick={() => setShowDrawer((p) => !p)}
            className={`h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap transition-colors ${
              showDrawer
                ? 'bg-slate-900 border-slate-900 text-white'
                : 'border-slate-200 hover:bg-slate-50 text-slate-700'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Pengaturan Chat</span>
          </button>
        </div>
      </div>

      {/* Indikator Lorebook Aktif jika kata kunci terpicu */}
      {matchedLore.length > 0 && (
        <div className="mt-2 px-3.5 py-2 rounded-xl bg-teal-50/80 border border-teal-200 text-xs text-teal-900 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 truncate">
            <Globe className="w-3.5 h-3.5 text-teal-600 shrink-0" />
            <span className="font-semibold">Lorebook Aktif:</span>
            <span className="truncate">
              {matchedLore.map((l) => l.title).join(', ')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMatchedLore([])}
            className="text-[11px] text-teal-700 hover:underline shrink-0"
          >
            Tutup
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError('')}
            className="text-rose-500 hover:text-rose-800"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Area Utama: Alur Bubble Chat + Drawer Pengaturan Samping */}
      <div className="flex-1 flex gap-4 mt-3 min-h-0">
        {/* Daftar Pesan */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden shadow-2xs">
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            {messages.map((msg) => {
              const isChar = msg.role === 'character';
              const altCount = msg.alternatives?.length || 1;
              const currentAltIdx = msg.active_alt_index || 0;
              const isEditingThis = editingMsgId === msg.id;
              const isRegeneratingThis = regeneratingId === msg.id;

              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 ${isChar ? 'justify-start' : 'justify-end'}`}
                >
                  {isChar && (
                    <CharacterAvatar name={character.name} avatar={character.avatar} size="sm" />
                  )}

                  <div
                    className={`max-w-[85%] sm:max-w-[75%] space-y-1.5 ${
                      isChar ? 'items-start' : 'items-end flex flex-col'
                    }`}
                  >
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-xs font-semibold text-slate-700">
                        {isChar ? character.name : userPersona.display_name || 'Kamu'}
                      </span>
                      {msg.is_pinned_memory && (
                        <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-medium inline-flex items-center gap-0.5">
                          <Bookmark className="w-2.5 h-2.5 fill-indigo-600" />
                          <span>Diingat</span>
                        </span>
                      )}
                    </div>

                    {isEditingThis ? (
                      <div className="w-full min-w-[280px] sm:min-w-[420px] bg-slate-50 border border-indigo-300 rounded-2xl p-3 space-y-2">
                        <textarea
                          rows={4}
                          value={editingContent}
                          onChange={(e) => setEditingContent(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm text-slate-900 focus:outline-none focus:border-indigo-500"
                        />
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingMsgId(null)}
                            className="h-7 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1"
                          >
                            <X className="w-3 h-3" />
                            <span>Batal</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveEditMessage(msg.id)}
                            className="h-7 px-3 rounded-lg bg-indigo-600 text-white text-xs font-medium inline-flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" />
                            <span>Simpan</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${
                          isChar
                            ? 'bg-slate-100 text-slate-900 rounded-tl-xs'
                            : 'bg-slate-900 text-white rounded-tr-xs'
                        }`}
                      >
                        {isRegeneratingThis ? (
                          <span className="text-slate-500 italic">
                            Menyusun alternatif jawaban baru...
                          </span>
                        ) : (
                          <FormattedMessage content={msg.content} isUser={!isChar} />
                        )}
                      </div>
                    )}

                    {/* Bar Aksi per Pesan & Navigasi Swipe */}
                    <div className="flex flex-wrap items-center gap-1.5 px-1 text-slate-400">
                      {isChar && (
                        <div className="inline-flex items-center gap-1 bg-slate-100 rounded-lg px-1.5 py-0.5 text-[11px] text-slate-600 mr-1">
                          <button
                            type="button"
                            disabled={currentAltIdx <= 0 || isRegeneratingThis}
                            onClick={() => handleSwipeSelect(msg, currentAltIdx - 1)}
                            className="p-0.5 hover:text-slate-900 disabled:opacity-30"
                            title="Alternatif Sebelumnya"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <span className="font-medium tabular-nums">
                            {currentAltIdx + 1}/{altCount}
                          </span>
                          <button
                            type="button"
                            disabled={isRegeneratingThis}
                            onClick={() => {
                              if (currentAltIdx < altCount - 1) {
                                handleSwipeSelect(msg, currentAltIdx + 1);
                              } else {
                                handleGenerateSwipeOrRegenerate(msg);
                              }
                            }}
                            className="p-0.5 hover:text-indigo-600 disabled:opacity-30"
                            title={
                              currentAltIdx < altCount - 1
                                ? 'Alternatif Berikutnya'
                                : 'Buat Alternatif Swipe Baru'
                            }
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {isChar && (
                        <button
                          type="button"
                          disabled={isRegeneratingThis}
                          onClick={() => handleGenerateSwipeOrRegenerate(msg)}
                          className="p-1 rounded hover:bg-slate-100 hover:text-slate-700 inline-flex items-center gap-1 text-[11px]"
                          title="Minta Jawaban Ulang (Regenerate)"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Ulang</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setEditingMsgId(msg.id);
                          setEditingContent(msg.content);
                        }}
                        className="p-1 rounded hover:bg-slate-100 hover:text-slate-700 inline-flex items-center gap-1 text-[11px]"
                        title="Edit Pesan"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handlePinMessageToMemory(msg)}
                        className={`p-1 rounded hover:bg-slate-100 inline-flex items-center gap-1 text-[11px] ${
                          msg.is_pinned_memory ? 'text-indigo-600 font-medium' : 'hover:text-slate-700'
                        }`}
                        title="Tandai sebagai Memori Jangka Panjang ('Ingat Ini')"
                      >
                        <Bookmark className="w-3 h-3" />
                        <span>{msg.is_pinned_memory ? 'Tersimpan' : 'Ingat Ini'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteMsgTarget(msg.id)}
                        className="p-1 rounded hover:bg-rose-50 hover:text-rose-600 inline-flex items-center gap-1 text-[11px]"
                        title="Hapus Pesan"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
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
            })}

            {sending && (
              <div className="flex items-start gap-3">
                <CharacterAvatar name={character.name} avatar={character.avatar} size="sm" />
                <div className="bg-slate-100 rounded-2xl rounded-tl-xs px-4 py-3 text-xs text-slate-500 italic">
                  {character.name} sedang mengetik balasan...
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input Kirim Pesan */}
          <div className="p-3.5 border-t border-slate-200 bg-slate-50/50">
            <div className="flex items-end gap-2">
              <textarea
                rows={2}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={
                  messages.length > 0
                    ? `Kirim pesan ke ${character.name}... (Enter kosong untuk lanjut bicara, Shift+Enter baris baru)`
                    : `Kirim pesan ke ${character.name}... (Enter untuk kirim, Shift+Enter baris baru)`
                }
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 resize-none"
              />
              <button
                type="button"
                disabled={sending || (!inputText.trim() && messages.length === 0)}
                onClick={handleSendMessage}
                className="h-[60px] px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors"
                title={!inputText.trim() ? 'Lanjut bicara' : 'Kirim'}
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {inputText.trim() ? 'Kirim' : messages.length > 0 ? 'Lanjut' : 'Kirim'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Panel Samping: Pengaturan per Chat, Ringkasan Konteks, dan Pindah Ruang Chat */}
        {showDrawer && (
          <aside className="w-80 bg-white rounded-2xl border border-slate-200 p-4 space-y-5 overflow-y-auto shrink-0 shadow-2xs">
            <form onSubmit={handleSaveChatSettings} className="space-y-3.5">
              <h3 className="text-sm font-semibold text-slate-900">Pengaturan Percakapan Ini</h3>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Judul Ruang Chat
                </label>
                <input
                  type="text"
                  value={chatTitleInput}
                  onChange={(e) => setChatTitleInput(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-900"
                />
              </div>

              {personas.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Persona Kamu di Chat Ini
                  </label>
                  <select
                    value={userPersona.id || ''}
                    onChange={(e) => handleSwitchChatPersona(e.target.value)}
                    className="w-full h-8 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white"
                  >
                    {personas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name} {p.is_default ? '(Utama)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Gaya Panjang Balasan
                </label>
                <select
                  value={replyStyleInput}
                  onChange={(e) => setReplyStyleInput(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white"
                >
                  <option value="pendek">Pendek (1-2 paragraf ringkas)</option>
                  <option value="sedang">Sedang (Seimbang & natural)</option>
                  <option value="panjang">Panjang (Deskriptif & mendalam)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Temperature ({tempInput})
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.1"
                    max="1.5"
                    value={tempInput}
                    onChange={(e) => setTempInput(e.target.value)}
                    className="w-full h-8 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Max Tokens
                  </label>
                  <input
                    type="number"
                    step="64"
                    min="128"
                    max="4096"
                    value={maxTokensInput}
                    onChange={(e) => setMaxTokensInput(e.target.value)}
                    className="w-full h-8 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-900"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Ringkasan Konteks Cerita
                  </label>
                  <button
                    type="button"
                    disabled={summarizing}
                    onClick={handleSummarizeNow}
                    className="text-[11px] font-medium text-indigo-600 hover:underline"
                  >
                    {summarizing ? 'Meringkas...' : 'Buat Ringkasan AI'}
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={chat.summary || ''}
                  onChange={(e) => setChat((p: any) => ({ ...p, summary: e.target.value }))}
                  placeholder="Ringkasan percakapan sejauh ini (otomatis dibuat saat chat panjang atau klik Buat Ringkasan AI)..."
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-800"
                />
              </div>

              <button
                type="submit"
                disabled={savingSettings}
                className="w-full h-8 rounded-lg bg-slate-900 hover:bg-indigo-600 text-white text-xs font-semibold transition-colors"
              >
                {savingSettings ? 'Menyimpan...' : 'Simpan Pengaturan Chat'}
              </button>
            </form>

            {/* Daftar Ruang Chat Lain untuk Karakter yang Sama */}
            {otherChats.length > 1 && (
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <h4 className="text-xs font-semibold text-slate-800">
                  Alur Cerita Lain ({otherChats.length})
                </h4>
                <div className="space-y-1.5">
                  {otherChats.map((oc) => (
                    <Link
                      key={oc.id}
                      href={`/chat/${oc.id}`}
                      className={`block px-2.5 py-2 rounded-lg text-xs truncate ${
                        oc.id === chatId
                          ? 'bg-indigo-50 text-indigo-700 font-semibold'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {oc.title}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteChatModal(true)}
                className="w-full h-8 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-medium inline-flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus Ruang Chat Ini</span>
              </button>
            </div>
          </aside>
        )}
      </div>

      <ConfirmModal
        open={deleteChatModal}
        title="Hapus Ruang Percakapan Ini?"
        description="Seluruh pesan di dalam alur percakapan ini akan dihapus secara permanen."
        confirmLabel="Hapus Chat"
        onConfirm={handleDeleteCurrentChat}
        onCancel={() => setDeleteChatModal(false)}
      />

      <ConfirmModal
        open={Boolean(deleteMsgTarget)}
        title="Hapus Pesan Ini?"
        description="Pesan yang dipilih akan dihapus dari riwayat percakapan."
        confirmLabel="Hapus Pesan"
        onConfirm={handleConfirmDeleteMessage}
        onCancel={() => setDeleteMsgTarget(null)}
      />
    </div>
  );
}
