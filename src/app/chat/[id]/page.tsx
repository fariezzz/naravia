'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, ChevronUp, Globe, X } from 'lucide-react';
import CharacterAvatar from '@/components/CharacterAvatar';
import ConfirmModal from '@/components/ConfirmModal';
import ChatHeader from '@/components/chat/ChatHeader';
import ChatInput from '@/components/chat/ChatInput';
import ChatSettingsDrawer from '@/components/chat/ChatSettingsDrawer';
import MessageBubble from '@/components/chat/MessageBubble';
import { MatchedLoreBadge, MessageItem, PersonaItem } from '@/components/chat/types';
import { getClientCache, invalidateClientCache, setClientCache } from '@/lib/clientCache';

export default function ChatRoomPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const chatId = params.id;

  const [chat, setChat] = useState<any>(() => getClientCache<any>(`chat_room_${chatId}`)?.chat || null);
  const [character, setCharacter] = useState<any>(() => getClientCache<any>(`chat_room_${chatId}`)?.character || null);
  const [messages, setMessages] = useState<MessageItem[]>(
    () => getClientCache<any>(`chat_room_${chatId}`)?.messages || []
  );
  const [totalMessages, setTotalMessages] = useState<number>(
    () => getClientCache<any>(`chat_room_${chatId}`)?.totalMessages || 0
  );
  const [hasMoreMessages, setHasMoreMessages] = useState<boolean>(
    () => Boolean(getClientCache<any>(`chat_room_${chatId}`)?.hasMoreMessages)
  );
  const [oldestCursor, setOldestCursor] = useState<string | null>(
    () => getClientCache<any>(`chat_room_${chatId}`)?.oldestCursor || null
  );
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [memories, setMemories] = useState<any[]>(() => getClientCache<any>(`chat_room_${chatId}`)?.memories || []);
  const [otherChats, setOtherChats] = useState<any[]>(
    () => getClientCache<any>(`chat_room_${chatId}`)?.otherChats || []
  );
  const [matchedLore, setMatchedLore] = useState<MatchedLoreBadge[]>([]);
  const [personas, setPersonas] = useState<PersonaItem[]>(
    () => getClientCache<any>(`chat_room_${chatId}`)?.personas || []
  );
  const [userPersona, setUserPersona] = useState<PersonaItem>(() => {
    const cached = getClientCache<any>(`chat_room_${chatId}`);
    return cached?.userPersona || { id: '', display_name: 'Kamu', avatar: '' };
  });

  const [loading, setLoading] = useState(() => !getClientCache<any>(`chat_room_${chatId}`)?.chat);
  const [sending, setSending] = useState(false);
  const [characterDeleted, setCharacterDeleted] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [inputText, setInputText] = useState('');
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');

  const [showDrawer, setShowDrawer] = useState(false);
  const [chatTitleInput, setChatTitleInput] = useState(
    () => getClientCache<any>(`chat_room_${chatId}`)?.chat?.title || ''
  );
  const [tempInput, setTempInput] = useState(() => {
    const cached = getClientCache<any>(`chat_room_${chatId}`);
    return String(
      cached?.chat?.temperature ?? cached?.defaultSettings?.temperature ?? cached?.character?.temperature_override ?? 0.9
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
  const [rewindTarget, setRewindTarget] = useState<string | null>(null);
  const [rewinding, setRewinding] = useState(false);
  const [forkTarget, setForkTarget] = useState<string | null>(null);
  const [forking, setForking] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [actionMenu, setActionMenu] = useState<{ id: string; up: boolean } | null>(null);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);

  const actionMenuRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const skipAutoScrollRef = useRef(false);

  useEffect(() => {
    setTtsSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleToggleSpeak = (msg: MessageItem) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (speakingMsgId === msg.id) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
      return;
    }
    window.speechSynthesis.cancel();
    // Hilangkan tanda markdown ringan agar pengucapan TTS lebih natural
    const plain = msg.content.replace(/[*_`>#]/g, '').trim();
    if (!plain) return;
    const utterance = new SpeechSynthesisUtterance(plain);
    utterance.lang = 'id-ID';
    const voices = window.speechSynthesis.getVoices();
    const idVoice = voices.find((v) => v.lang.toLowerCase().startsWith('id'));
    if (idVoice) utterance.voice = idVoice;
    utterance.onend = () => setSpeakingMsgId((prev) => (prev === msg.id ? null : prev));
    utterance.onerror = () => setSpeakingMsgId((prev) => (prev === msg.id ? null : prev));
    setSpeakingMsgId(msg.id);
    window.speechSynthesis.speak(utterance);
  };

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

  const loadRoom = async (isBackground = false) => {
    if (!isBackground && !getClientCache<any>(`chat_room_${chatId}`)?.chat) {
      setLoading(true);
    }
    setError('');
    try {
      const [res, pRes] = await Promise.all([fetch(`/api/chats/${chatId}?limit=60`), fetch('/api/persona')]);
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
      if (resolvedPersona) setUserPersona(personaItem);

      setChat(data.chat);
      setCharacter(data.character);
      setCharacterDeleted(Boolean(data.characterDeleted));
      setMessages(data.messages || []);
      setTotalMessages(Number(data.totalMessages ?? (data.messages?.length || 0)));
      setHasMoreMessages(Boolean(data.hasMoreMessages));
      setOldestCursor(data.oldestCursor || null);
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
        totalMessages: Number(data.totalMessages ?? (data.messages?.length || 0)),
        hasMoreMessages: Boolean(data.hasMoreMessages),
        oldestCursor: data.oldestCursor || null,
        memories: data.memories || [],
        otherChats: data.otherChats || [],
        personas: listPersonas,
        userPersona: personaItem,
        defaultSettings: data.defaultSettings,
      });
    } catch (err) {
      if (!chat) setError(err instanceof Error ? err.message : 'Gagal memuat percakapan.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadOlderMessages = async () => {
    if (loadingOlder || !hasMoreMessages || !oldestCursor) return;
    setLoadingOlder(true);
    const box = messagesScrollRef.current;
    const prevScrollHeight = box?.scrollHeight || 0;
    const prevScrollTop = box?.scrollTop || 0;

    try {
      const res = await fetch(
        `/api/chats/${chatId}?messagesOnly=1&limit=50&before=${encodeURIComponent(oldestCursor)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memuat pesan lama.');

      const older: MessageItem[] = data.messages || [];
      if (older.length > 0) {
        skipAutoScrollRef.current = true;
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          return [...older.filter((m) => !existingIds.has(m.id)), ...prev];
        });
        setHasMoreMessages(Boolean(data.hasMoreMessages));
        setOldestCursor(data.oldestCursor || null);
        requestAnimationFrame(() => {
          if (box) {
            box.scrollTop = prevScrollTop + (box.scrollHeight - prevScrollHeight);
          }
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
    if (chatId) {
      const cached = getClientCache<any>(`chat_room_${chatId}`);
      loadRoom(Boolean(cached?.chat));
    }
  }, [chatId]);

  useEffect(() => {
    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  useEffect(() => {
    if (!inputText && textareaRef.current) {
      textareaRef.current.style.height = '';
    }
  }, [inputText]);

  // Tutup menu aksi saat mengetuk di luar menu atau menekan Escape
  useEffect(() => {
    if (!actionMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (actionMenuRef.current && target && !actionMenuRef.current.contains(target)) {
        setActionMenu(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        actionMenuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
        setActionMenu(null);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [actionMenu]);

  // Pintasan keyboard desktop: Esc (batal edit / tutup drawer / stop stream), Alt+ArrowLeft/Right (swipe balasan terakhir)
  useEffect(() => {
    const onGlobalKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingMsgId) {
          setEditingMsgId(null);
          return;
        }
        if (showDrawer) {
          setShowDrawer(false);
          return;
        }
        if (sending) {
          handleStopStreaming();
        }
        return;
      }

      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        if (sending || regeneratingId) return;
        const lastChar = [...messages].reverse().find((m) => m.role === 'character');
        if (!lastChar) return;
        e.preventDefault();
        const curIdx = lastChar.active_alt_index || 0;
        const altLen = lastChar.alternatives?.length || 1;
        if (e.key === 'ArrowLeft' && curIdx > 0) {
          handleSwipeSelect(lastChar, curIdx - 1);
        } else if (e.key === 'ArrowRight') {
          if (curIdx < altLen - 1) handleSwipeSelect(lastChar, curIdx + 1);
          else handleGenerateSwipeOrRegenerate(lastChar);
        }
      }
    };
    window.addEventListener('keydown', onGlobalKey);
    return () => window.removeEventListener('keydown', onGlobalKey);
  }, [editingMsgId, showDrawer, sending, regeneratingId, messages]);

  const toggleActionMenu = (msgId: string, trigger: HTMLElement) => {
    if (actionMenu?.id === msgId) {
      setActionMenu(null);
      return;
    }
    const MENU_HEIGHT = 190;
    const btn = trigger.getBoundingClientRect();
    const box = messagesScrollRef.current?.getBoundingClientRect();
    const spaceBelow = (box ? box.bottom : window.innerHeight) - btn.bottom;
    const spaceAbove = btn.top - (box ? box.top : 0);
    setActionMenu({ id: msgId, up: spaceBelow < MENU_HEIGHT && spaceAbove > spaceBelow });
  };

  const runMenuAction = (action: () => void) => {
    setActionMenu(null);
    action();
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const consumeMessageStream = async (
    res: Response,
    opts: { targetMsgId?: string | null; tempUserMsgId?: string | null } = {}
  ) => {
    if (!res.body) throw new Error('Streaming body tidak diterima dari server.');

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
        if (!trimmed.startsWith('data: ')) continue;
        const jsonStr = trimmed.slice(6).trim();
        if (!jsonStr) continue;

        try {
          const event = JSON.parse(jsonStr);
          if (event.type === 'start') {
            if (!activeCharMsgId) activeCharMsgId = event.characterMessageId;
            setStreamingMsgId(activeCharMsgId);
            if (Array.isArray(event.matchedLore)) setMatchedLore(event.matchedLore);

            setMessages((prev) => {
              let list =
                tempUserMsgId && event.userMessage
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
            setMessages((prev) =>
              prev.map((m) => (m.id === activeCharMsgId ? { ...m, content: accumulatedLiveText } : m))
            );
          } else if (event.type === 'done' || event.type === 'stopped') {
            const finalMsg: MessageItem = event.message;
            setMessages((prev) => prev.map((m) => (m.id === activeCharMsgId ? finalMsg : m)));
            if (!targetMsgId) setTotalMessages((n) => n + (tempUserMsgId ? 2 : 1));
            if (event.title) {
              setChat((prev: any) => (prev ? { ...prev, title: event.title } : prev));
              setChatTitleInput(event.title);
            }
            setClientCache(`chat_room_${chatId}`, null);
          } else if (event.type === 'error') {
            setError(event.error);
            hadError = true;
            if (!accumulatedLiveText && !targetMsgId) {
              setMessages((prev) =>
                prev.filter((m) => m.id !== activeCharMsgId && (!tempUserMsgId || m.id !== tempUserMsgId))
              );
            }
          }
        } catch {}
      }
    }

    return { activeCharMsgId, accumulatedLiveText, hadError };
  };

  const handleSendMessage = async () => {
    const content = inputText.trim();
    if (sending) return;
    if (!content && messages.length === 0) return;

    const isContinue = !content;
    const tempUserMsgId = !isContinue ? `temp-user-${Date.now()}` : null;

    if (!isContinue && tempUserMsgId) {
      setMessages((prev) => [
        ...prev,
        {
          id: tempUserMsgId,
          chat_id: chatId,
          role: 'user',
          content,
          alternatives: [content],
          active_alt_index: 0,
          is_pinned_memory: false,
          created_at: new Date().toISOString(),
        },
      ]);
    }

    setSending(true);
    setError('');
    setInputText('');
    setStreamingMsgId(null);
    if (textareaRef.current) textareaRef.current.style.height = '';

    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    try {
      const res = await fetch('/api/messages/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortCtrl.signal,
        body: JSON.stringify({ action: 'send', chatId, content, isContinue }),
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
      if (hadError && !accumulatedLiveText) setInputText(content);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        if (tempUserMsgId) setMessages((prev) => prev.filter((m) => m.id !== tempUserMsgId));
        setError(err instanceof Error ? err.message : 'Gagal mengirim pesan.');
      }
    } finally {
      abortControllerRef.current = null;
      setSending(false);
      setStreamingMsgId(null);
      setMessages((prev) => prev.filter((m) => !(m.role === 'character' && !m.content.trim())));
    }
  };

  const handleSwipeSelect = async (msg: MessageItem, newIndex: number) => {
    if (newIndex < 0 || newIndex >= msg.alternatives.length) return;
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'swipe_select', messageId: msg.id, index: newIndex }),
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
    setStreamingMsgId(null);

    const previousMsg = msg;
    const baseAlternatives = msg.alternatives && msg.alternatives.length > 0 ? msg.alternatives : [msg.content];
    const newAltIndex = baseAlternatives.length;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id
          ? { ...m, content: '', alternatives: [...baseAlternatives, ''], active_alt_index: newAltIndex }
          : m
      )
    );
    const revertIfEmpty = () => {
      setMessages((prev) => prev.map((m) => (m.id === previousMsg.id && !m.content.trim() ? previousMsg : m)));
    };

    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    try {
      const res = await fetch('/api/messages/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortCtrl.signal,
        body: JSON.stringify({ action: 'swipe_generate', messageId: msg.id }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Gagal membuat alternatif balasan baru.');
      }

      const { hadError } = await consumeMessageStream(res, { targetMsgId: msg.id });
      if (hadError) revertIfEmpty();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== previousMsg.id) return m;
            if (!m.content.trim()) return previousMsg;
            const alts = [...m.alternatives];
            alts[newAltIndex] = m.content;
            return { ...m, alternatives: alts };
          })
        );
      } else {
        revertIfEmpty();
        setError(err instanceof Error ? err.message : 'Gagal membuat alternatif balasan.');
      }
    } finally {
      abortControllerRef.current = null;
      setRegeneratingId(null);
      setStreamingMsgId(null);
    }
  };

  const handleSaveEditMessage = async (messageId: string) => {
    if (!editingContent.trim()) return;
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'edit', messageId, content: editingContent.trim() }),
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
        body: JSON.stringify({ action: 'delete', messageId: deleteMsgTarget }),
      });
      const remainingMessages = messages.filter((m) => m.id !== deleteMsgTarget);
      setMessages(remainingMessages);
      setTotalMessages((n) => Math.max(0, n - 1));
      setDeleteMsgTarget(null);
      invalidateClientCache(`chat_room_${chatId}`);
    } catch {
      setError('Gagal menghapus pesan.');
    }
  };

  const handleConfirmRewind = async () => {
    if (!rewindTarget) return;
    setRewinding(true);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rewind', messageId: rewindTarget }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memundurkan percakapan.');

      const deletedIds: string[] = data.deletedMessageIds || [];
      const deletedMemIds: string[] = data.deletedMemoryIds || [];
      setMessages((prev) => prev.filter((m) => !deletedIds.includes(m.id)));
      setTotalMessages((n) => Math.max(0, n - deletedIds.length));
      setMemories((prev) => prev.filter((m) => !deletedMemIds.includes(m.id)));
      if (data.chat) setChat((prev: any) => ({ ...prev, ...data.chat }));
      setRewindTarget(null);

      invalidateClientCache(`chat_room_${chatId}`);
      invalidateClientCache('home_recent_chats');
      invalidateClientCache('chats_list');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memundurkan percakapan.');
    } finally {
      setRewinding(false);
    }
  };

  const handleConfirmFork = async () => {
    if (!forkTarget) return;
    setForking(true);
    try {
      const res = await fetch(`/api/chats/${chatId}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: forkTarget }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mencabangkan percakapan.');
      setForkTarget(null);
      invalidateClientCache('home_recent_chats');
      invalidateClientCache('chats_list');
      if (data.chat?.id) router.push(`/chat/${data.chat.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mencabangkan percakapan.');
    } finally {
      setForking(false);
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
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, is_pinned_memory: false } : m)));
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
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, is_pinned_memory: true } : m)));
      }
    } catch {
      setError('Gagal memperbarui status memori pesan.');
    }
  };

  const handleSwitchChatPersona = async (personaId: string) => {
    const chosen = personas.find((p) => p.id === personaId);
    if (chosen) {
      setUserPersona({ id: chosen.id, display_name: chosen.display_name || 'Kamu', avatar: chosen.avatar || '' });
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
      if (res.ok && data.chat) router.push(`/chat/${data.chat.id}`);
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

  const rewindCutIndex = rewindTarget ? messages.findIndex((m) => m.id === rewindTarget) : -1;
  const rewindInfo = {
    count: rewindCutIndex >= 0 ? messages.length - rewindCutIndex : 0,
    isFirst: rewindCutIndex === 0 && !hasMoreMessages,
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
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-sm text-rose-700 dark:text-rose-300">
          {error || 'Percakapan tidak ditemukan.'}
        </div>
        <Link href="/" className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
          Kembali ke Beranda
        </Link>
      </div>
    );
  }

  const isBusy = sending || Boolean(streamingMsgId) || Boolean(regeneratingId);
  const hiddenOlderCount = Math.max(0, totalMessages - messages.length);
  const lastCharacterMsgId = [...messages].reverse().find((m) => m.role === 'character')?.id || null;

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden max-w-6xl w-full mx-auto px-0 sm:px-4 py-0 sm:py-3 min-h-0">
      <ChatHeader
        character={character}
        chatTitle={chat.title}
        personas={personas}
        userPersona={userPersona}
        showDrawer={showDrawer}
        onBack={handleBack}
        onSwitchPersona={handleSwitchChatPersona}
        onCreateNewRoom={handleCreateNewRoomSameCharacter}
        onToggleDrawer={() => setShowDrawer((p) => !p)}
      />

      {matchedLore.length > 0 && (
        <div className="mt-2 px-3.5 py-2 rounded-xl bg-teal-50/80 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900 text-xs text-teal-900 dark:text-teal-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 truncate">
            <Globe className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
            <span className="font-semibold">Lorebook Aktif:</span>
            <span className="truncate">{matchedLore.map((l) => l.title).join(', ')}</span>
          </div>
          <button
            type="button"
            onClick={() => setMatchedLore([])}
            className="text-[11px] text-teal-700 dark:text-teal-300 hover:underline shrink-0"
          >
            Tutup
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError('')} className="text-rose-500 hover:text-rose-800">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex-1 flex gap-4 mt-0 sm:mt-3 min-h-0">
        <div className="flex-1 bg-white dark:bg-[#0c1220] border-0 sm:border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden sm:rounded-2xl shadow-none sm:shadow-2xs transition-colors">
          <div ref={messagesScrollRef} className="flex-1 overflow-y-auto px-3.5 py-4 sm:p-6 space-y-4 sm:space-y-5">
            {hasMoreMessages && (
              <div className="flex justify-center pb-2">
                <button
                  type="button"
                  disabled={loadingOlder}
                  onClick={handleLoadOlderMessages}
                  className="h-8 px-3.5 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>
                    {loadingOlder
                      ? 'Memuat pesan lama...'
                      : `Muat pesan lebih lama${hiddenOlderCount > 0 ? ` (${hiddenOlderCount} tersisa)` : ''}`}
                  </span>
                </button>
              </div>
            )}

            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                isLastCharacterMessage={msg.id === lastCharacterMsgId}
                character={character}
                userPersona={userPersona}
                isEditing={editingMsgId === msg.id}
                editingContent={editingContent}
                isRegenerating={regeneratingId === msg.id}
                isStreamingThis={streamingMsgId === msg.id}
                isBusy={isBusy}
                copied={copiedMsgId === msg.id}
                isSpeaking={speakingMsgId === msg.id}
                ttsSupported={ttsSupported}
                isMenuOpen={actionMenu?.id === msg.id}
                menuUp={Boolean(actionMenu?.up)}
                actionMenuRef={actionMenuRef}
                onChangeEditingContent={setEditingContent}
                onStartEdit={(m) => {
                  setEditingMsgId(m.id);
                  setEditingContent(m.content);
                }}
                onCancelEdit={() => setEditingMsgId(null)}
                onSaveEdit={handleSaveEditMessage}
                onSwipeSelect={handleSwipeSelect}
                onRegenerate={handleGenerateSwipeOrRegenerate}
                onCopy={handleCopyMessage}
                onPinMemory={handlePinMessageToMemory}
                onRewind={setRewindTarget}
                onFork={setForkTarget}
                onDelete={setDeleteMsgTarget}
                onToggleSpeak={handleToggleSpeak}
                onToggleMenu={toggleActionMenu}
                onRunMenuAction={runMenuAction}
              />
            ))}

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

          <ChatInput
            characterName={character.name}
            characterDeleted={characterDeleted}
            inputText={inputText}
            sending={sending}
            hasMessages={messages.length > 0}
            textareaRef={textareaRef}
            onChangeText={setInputText}
            onSend={handleSendMessage}
            onStop={handleStopStreaming}
          />
        </div>

        {showDrawer && (
          <ChatSettingsDrawer
            chatId={chatId}
            chatSummary={chat.summary || ''}
            chatTitleInput={chatTitleInput}
            tempInput={tempInput}
            maxTokensInput={maxTokensInput}
            replyStyleInput={replyStyleInput}
            personas={personas}
            userPersona={userPersona}
            otherChats={otherChats}
            summarizing={summarizing}
            savingSettings={savingSettings}
            messageCount={messages.length}
            onClose={() => setShowDrawer(false)}
            onChangeTitle={setChatTitleInput}
            onChangeTemp={setTempInput}
            onChangeMaxTokens={setMaxTokensInput}
            onChangeReplyStyle={setReplyStyleInput}
            onChangeSummary={(val) => setChat((p: any) => ({ ...p, summary: val }))}
            onSwitchPersona={handleSwitchChatPersona}
            onSummarize={handleSummarizeNow}
            onSaveSettings={handleSaveChatSettings}
            onRequestDeleteChat={() => setDeleteChatModal(true)}
          />
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
        description="Pesan yang dipilih akan dihapus dari riwayat percakapan. Ingatan dan ringkasan yang berasal dari pesan ini tidak ikut dihapus. Pakai Mundur bila kamu ingin membuang bagian cerita ini sekaligus ingatannya."
        confirmLabel="Hapus Pesan"
        onConfirm={handleConfirmDeleteMessage}
        onCancel={() => setDeleteMsgTarget(null)}
      />

      <ConfirmModal
        open={Boolean(forkTarget)}
        loading={forking}
        title="Cabangkan Cerita dari Pesan Ini?"
        description="Salinan percakapan baru akan dibuat mulai dari awal hingga pesan ini. Percakapan aslimu tidak akan berubah sehingga kamu bebas mencoba alur cerita alternatif."
        confirmLabel="Buat Cabang Baru"
        danger={false}
        onConfirm={handleConfirmFork}
        onCancel={() => setForkTarget(null)}
      />

      <ConfirmModal
        open={Boolean(rewindTarget)}
        loading={rewinding}
        title={rewindInfo.isFirst ? 'Mundur ke Awal Percakapan?' : 'Mundur ke Pesan Ini?'}
        description={
          rewindInfo.isFirst
            ? `Seluruh pesan di percakapan ini akan dihapus, termasuk sapaan awal, sebanyak ${rewindInfo.count} pesan. Ingatan yang berasal dari pesan-pesan itu juga dihapus, dan ringkasan percakapan akan disusun ulang. Tindakan ini tidak bisa dibatalkan.`
            : `Pesan ini beserta semua pesan sesudahnya akan dihapus, sebanyak ${rewindInfo.count} pesan. Ingatan yang berasal dari pesan-pesan itu juga dihapus, dan ringkasan percakapan akan disusun ulang. Tindakan ini tidak bisa dibatalkan.`
        }
        confirmLabel="Mundur dan Hapus"
        onConfirm={handleConfirmRewind}
        onCancel={() => setRewindTarget(null)}
      />
    </div>
  );
}
