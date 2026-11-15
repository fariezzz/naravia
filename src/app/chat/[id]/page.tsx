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
  Copy,
  Square,
} from 'lucide-react';
import CharacterAvatar from '@/components/CharacterAvatar';
import ConfirmModal from '@/components/ConfirmModal';
import FormattedMessage from '@/components/FormattedMessage';
import { getClientCache, setClientCache, invalidateClientCache } from '@/lib/clientCache';

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
    return String(
      cached?.chat?.temperature ??
      cached?.defaultSettings?.temperature ??
      cached?.character?.temperature_override ??
      0.9
    );
  });
  const [maxTokensInput, setMaxTokensInput] = useState(() => {
    const cached = getClientCache<any>(`chat_room_${chatId}`);
    return String(cached?.chat?.max_tokens ?? cached?.defaultSettings?.max_tokens ?? 1024);
  });
  const [replyStyleInput, setReplyStyleInput] = useState(() => {
    const cached = getClientCache<any>(`chat_room_${chatId}`);
    return cached?.chat?.reply_style || cached?.defaultSettings?.default_reply_style || 'sedang';
  });
  const [summarizing, setSummarizing] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const [deleteChatModal, setDeleteChatModal] = useState(false);
  const [deleteMsgTarget, setDeleteMsgTarget] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [streamingCharText, setStreamingCharText] = useState<string>('');
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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
      setTimeout(() => {
        setCopiedMsgId((prev) => (prev === msgId ? null : prev));
      }, 2000);
    } catch {
      setError('Gagal menyalin teks pesan.');
    }
  };

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
      const defTemp = data.defaultSettings?.temperature ?? data.character?.temperature_override ?? '0.9';
      const defMaxTokens = data.defaultSettings?.max_tokens ?? '1024';
      const defReplyStyle = data.defaultSettings?.default_reply_style ?? 'sedang';

      setTempInput(String(data.chat.temperature ?? defTemp));
      setMaxTokensInput(String(data.chat.max_tokens ?? defMaxTokens));
      setReplyStyleInput(data.chat.reply_style || defReplyStyle);

      setClientCache(`chat_room_${chatId}`, {
        chat: data.chat,
        character: data.character,
        messages: data.messages || [],
        memories: data.memories || [],
        otherChats: data.otherChats || [],
        personas: listPersonas,
        userPersona: personaItem,
        defaultSettings: data.defaultSettings,
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

  useEffect(() => {
    if (!inputText && textareaRef.current) {
      textareaRef.current.style.height = '';
    }
  }, [inputText]);

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

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
    setStreamingCharText('');
    setStreamingMsgId(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = '';
    }

    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    try {
      const res = await fetch('/api/messages/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortCtrl.signal,
        body: JSON.stringify({
          action: 'send',
          chatId,
          content,
          isContinue,
        }),
      });

      if (!res.ok) {
        if (tempUserMsgId) {
          setMessages((prev) => prev.filter((m) => m.id !== tempUserMsgId));
          setInputText(content);
        }
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Gagal memulai streaming balasan.');
      }

      const { accumulatedLiveText, hadError } = await consumeMessageStream(res, { tempUserMsgId });
      if (hadError && !accumulatedLiveText) {
        setInputText(content);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Balasan sengaja dihentikan oleh pengguna
      } else {
        if (tempUserMsgId) {
          setMessages((prev) => prev.filter((m) => m.id !== tempUserMsgId));
        }
        setError(err instanceof Error ? err.message : 'Gagal mengirim pesan.');
      }
    } finally {
      abortControllerRef.current = null;
      setSending(false);
      setStreamingCharText('');
      setStreamingMsgId(null);
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

  // Memproses respons streaming SSE umum dari /api/messages/stream
  // Dipakai bersama oleh pengiriman pesan baru dan regenerate/swipe alternatif baru
  const consumeMessageStream = async (
    res: Response,
    opts: { targetMsgId?: string | null; tempUserMsgId?: string | null } = {}
  ) => {
    if (!res.body) {
      throw new Error('Streaming body tidak diterima dari server.');
    }

    const { targetMsgId, tempUserMsgId } = opts;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let activeCharMsgId = targetMsgId || '';
    let accumulatedLiveText = '';
    let hadError = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === 'start') {
              if (!activeCharMsgId) activeCharMsgId = event.characterMessageId;
              setStreamingMsgId(activeCharMsgId);

              setMessages((prev) => {
                let list = tempUserMsgId && event.userMessage
                  ? prev.map((m) => (m.id === tempUserMsgId ? event.userMessage : m))
                  : prev;
                if (!event.isRegenerate && !list.some((m) => m.id === activeCharMsgId)) {
                  list = [
                    ...list,
                    {
                      id: activeCharMsgId,
                      chat_id: chatId,
                      role: 'character',
                      content: '',
                      alternatives: [''],
                      active_alt_index: 0,
                      is_pinned_memory: false,
                      created_at: new Date().toISOString(),
                    },
                  ];
                }
                return list;
              });
            } else if (event.type === 'chunk') {
              accumulatedLiveText += event.text;
              setStreamingCharText(accumulatedLiveText);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === activeCharMsgId ? { ...m, content: accumulatedLiveText } : m
                )
              );
            } else if (event.type === 'done' || event.type === 'stopped') {
              const finalMsg: MessageItem = event.message;
              setMessages((prev) => prev.map((m) => (m.id === activeCharMsgId ? finalMsg : m)));

              if (event.title) {
                setChat((prev: any) => (prev ? { ...prev, title: event.title } : prev));
                setChatTitleInput(event.title);
              }

              setClientCache(`chat_room_${chatId}`, null);
            } else if (event.type === 'error') {
              setError(event.error);
              hadError = true;
              if (tempUserMsgId && !accumulatedLiveText) {
                setMessages((prev) => prev.filter((m) => m.id !== tempUserMsgId && m.id !== activeCharMsgId));
              }
            }
          } catch {}
        }
      }
    }

    return { activeCharMsgId, accumulatedLiveText, hadError };
  };

  const handleGenerateSwipeOrRegenerate = async (msg: MessageItem) => {
    if (regeneratingId || sending) return;
    setRegeneratingId(msg.id);
    setError('');
    setStreamingCharText('');
    setStreamingMsgId(null);

    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    try {
      const res = await fetch('/api/messages/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortCtrl.signal,
        body: JSON.stringify({
          action: 'swipe_generate',
          messageId: msg.id,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Gagal membuat alternatif balasan baru.');
      }

      await consumeMessageStream(res, { targetMsgId: msg.id });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Gagal membuat alternatif balasan.');
      }
    } finally {
      abortControllerRef.current = null;
      setRegeneratingId(null);
      setStreamingCharText('');
      setStreamingMsgId(null);
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
      const remainingMessages = messages.filter((m) => m.id !== deleteMsgTarget);
      setMessages(remainingMessages);
      setDeleteMsgTarget(null);

      // Perbarui in-memory client cache secara langsung agar pesan yang dihapus tidak pernah muncul lagi saat navigasi
      setClientCache(`chat_room_${chatId}`, {
        chat,
        character,
        messages: remainingMessages,
        memories,
        otherChats,
        personas,
        userPersona,
      });
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
      invalidateClientCache(`chat_room_${chatId}`);
      invalidateClientCache('home_recent_chats');
      invalidateClientCache(`char_profile_${character?.id}`);
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
    <div className="flex-1 flex flex-col h-full overflow-hidden max-w-5xl w-full mx-auto px-0 sm:px-4 py-0 sm:py-3 min-h-0">
      {/* Bar Header Ruang Chat (Sticky & Fixed di Atas) */}
      <div className="bg-white dark:bg-[#0c1220] border-b sm:border border-slate-200 dark:border-slate-800 px-3.5 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between gap-2 sm:gap-3 sm:rounded-2xl shadow-2xs shrink-0 z-20 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/characters/${character.id}`}
            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-800 inline-flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
            title="Profil Karakter"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <Link href={`/characters/${character.id}`} className="flex items-center gap-2.5 min-w-0">
            <CharacterAvatar name={character.name} avatar={character.avatar} size="sm" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-slate-900 dark:text-white truncate">{character.name}</h1>
                {character.world_name && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 text-[10px] font-medium">
                    <Globe className="w-2.5 h-2.5" />
                    <span>{character.world_name}</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{chat.title}</p>
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
                className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer max-w-[85px] sm:max-w-[115px] truncate"
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
            className="h-8 w-8 sm:w-auto sm:px-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center justify-center gap-1 whitespace-nowrap"
            title="Mulai Alur Chat Baru dengan Karakter Ini"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Chat Baru</span>
          </button>
          <button
            type="button"
            onClick={() => setShowDrawer((p) => !p)}
            className={`h-8 px-2 sm:px-2.5 rounded-lg border text-xs font-medium inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors ${
              showDrawer
                ? 'bg-slate-900 border-slate-900 text-white'
                : 'border-slate-200 hover:bg-slate-50 text-slate-700'
            }`}
            title="Pengaturan Chat"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Pengaturan Chat</span>
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
      <div className="flex-1 flex gap-4 mt-0 sm:mt-3 min-h-0">
        {/* Daftar Pesan */}
        <div className="flex-1 bg-white dark:bg-[#0c1220] border-0 sm:border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden sm:rounded-2xl shadow-none sm:shadow-2xs transition-colors">
          <div className="flex-1 overflow-y-auto px-3.5 py-4 sm:p-6 space-y-4 sm:space-y-5">
            {messages.map((msg) => {
              const isChar = msg.role === 'character';
              const altCount = msg.alternatives?.length || 1;
              const currentAltIdx = msg.active_alt_index || 0;
              const isEditingThis = editingMsgId === msg.id;
              const isRegeneratingThis = regeneratingId === msg.id;

              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2.5 sm:gap-3 ${isChar ? 'justify-start' : 'justify-end'}`}
                >
                  {isChar && (
                    <CharacterAvatar name={character.name} avatar={character.avatar} size="sm" />
                  )}

                  <div
                    className={`max-w-[92%] sm:max-w-[78%] min-w-0 space-y-1.5 ${
                      isChar ? 'items-start' : 'items-end flex flex-col'
                    }`}
                  >
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
                        className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line break-words [overflow-wrap:anywhere] ${
                          isChar
                            ? 'bg-slate-100 dark:bg-[#151c2e] text-slate-900 dark:text-slate-100 rounded-tl-xs'
                            : 'bg-slate-900 dark:bg-indigo-600 text-white rounded-tr-xs'
                        }`}
                      >
                        {isRegeneratingThis && !msg.content ? (
                          <span className="text-slate-500 dark:text-slate-400 italic">
                            Menyusun alternatif jawaban baru...
                          </span>
                        ) : (
                          <FormattedMessage content={msg.content} isUser={!isChar} />
                        )}
                      </div>
                    )}

                    {/* Bar Aksi per Pesan & Navigasi Swipe */}
                    <div className="flex flex-wrap items-center gap-1.5 px-1 text-slate-400 dark:text-slate-500">
                      {isChar && (
                        <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg px-1.5 py-0.5 text-[11px] text-slate-600 dark:text-slate-300 mr-1">
                          <button
                            type="button"
                            disabled={currentAltIdx <= 0 || isRegeneratingThis}
                            onClick={() => handleSwipeSelect(msg, currentAltIdx - 1)}
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
                            disabled={isRegeneratingThis}
                            onClick={() => {
                              if (currentAltIdx < altCount - 1) {
                                handleSwipeSelect(msg, currentAltIdx + 1);
                              } else {
                                handleGenerateSwipeOrRegenerate(msg);
                              }
                            }}
                            className="p-0.5 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-30"
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
                          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 inline-flex items-center gap-1 text-[11px]"
                          title="Minta Jawaban Ulang (Regenerate)"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Ulang</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg.id, msg.content)}
                        className={`p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 text-[11px] transition-colors ${
                          copiedMsgId === msg.id ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'hover:text-slate-700 dark:hover:text-slate-200'
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

                      <button
                        type="button"
                        onClick={() => {
                          setEditingMsgId(msg.id);
                          setEditingContent(msg.content);
                        }}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 inline-flex items-center gap-1 text-[11px]"
                        title="Edit Pesan"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handlePinMessageToMemory(msg)}
                        className={`p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 text-[11px] ${
                          msg.is_pinned_memory ? 'text-indigo-600 dark:text-indigo-400 font-medium' : 'hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                        title="Tandai sebagai Memori Jangka Panjang ('Ingat Ini')"
                      >
                        <Bookmark className="w-3 h-3" />
                        <span>{msg.is_pinned_memory ? 'Tersimpan' : 'Ingat Ini'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteMsgTarget(msg.id)}
                        className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 inline-flex items-center gap-1 text-[11px]"
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

            {sending && !streamingMsgId && (
              <div className="flex items-start gap-3">
                <CharacterAvatar name={character.name} avatar={character.avatar} size="sm" />
                <div className="bg-slate-100 dark:bg-[#151c2e] rounded-2xl rounded-tl-xs px-4 py-3 text-xs text-slate-500 dark:text-slate-400 italic">
                  {character.name} sedang mengetik balasan...
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input Kirim Pesan (Sticky & Fixed di Bagian Bawah) */}
          <div className="p-2.5 sm:p-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0c1220]/90 backdrop-blur-xs pb-[max(0.625rem,env(safe-area-inset-bottom))] shrink-0 z-20 transition-colors">
            <div className="flex items-center gap-2.5">
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
                      handleSendMessage();
                    }
                  }
                }}
                placeholder={`Kirim pesan ke ${character.name}...`}
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
                  onClick={handleSendMessage}
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

        {/* Panel Samping: Pengaturan per Chat, Ringkasan Konteks, dan Pindah Ruang Chat */}
        {showDrawer && (
          <>
            <div
              className="fixed inset-0 bg-slate-900/40 z-30 sm:hidden backdrop-blur-2xs"
              onClick={() => setShowDrawer(false)}
            />
            <aside className="fixed inset-y-0 right-0 z-40 w-80 max-w-[85vw] sm:static sm:z-auto sm:w-80 bg-white dark:bg-[#0c1220] sm:rounded-2xl border-l sm:border border-slate-200 dark:border-slate-800 p-4 space-y-5 overflow-y-auto shrink-0 shadow-xl sm:shadow-2xs transition-colors">
              <div className="flex items-center justify-between sm:hidden pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-900 dark:text-white">Pengaturan Chat</span>
                <button
                  type="button"
                  onClick={() => setShowDrawer(false)}
                  className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleSaveChatSettings} className="space-y-3.5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Pengaturan Percakapan Ini</h3>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Judul Ruang Chat
                </label>
                <input
                  type="text"
                  value={chatTitleInput}
                  onChange={(e) => setChatTitleInput(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] text-xs text-slate-900 dark:text-slate-100"
                />
              </div>

              {personas.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Persona Kamu di Chat Ini
                  </label>
                  <select
                    value={userPersona.id || ''}
                    onChange={(e) => handleSwitchChatPersona(e.target.value)}
                    className="w-full h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-[#111827]"
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
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Gaya Panjang Balasan
                </label>
                <select
                  value={replyStyleInput}
                  onChange={(e) => setReplyStyleInput(e.target.value)}
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
                    onChange={(e) => setTempInput(e.target.value)}
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
                    onChange={(e) => setMaxTokensInput(e.target.value)}
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
                    onClick={handleSummarizeNow}
                    className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    {summarizing ? 'Meringkas...' : 'Buat Ringkasan AI'}
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={chat.summary || ''}
                  onChange={(e) => setChat((p: any) => ({ ...p, summary: e.target.value }))}
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

            {/* Daftar Ruang Chat Lain untuk Karakter yang Sama */}
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

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDeleteChatModal(true)}
                className="w-full h-8 rounded-lg border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-medium inline-flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus Ruang Chat Ini</span>
              </button>
            </div>
          </aside>
        </>
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
