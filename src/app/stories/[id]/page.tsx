'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  BookMarked,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Feather,
  FileText,
  Lightbulb,
  List,
  Loader2,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Printer,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Square,
  Wand2,
  X,
} from 'lucide-react';
import AutoResizeTextarea from '@/components/AutoResizeTextarea';
import ConfirmModal from '@/components/ConfirmModal';
import StoryBibleDrawer from '@/components/stories/StoryBibleDrawer';
import StoryChapterSidebar from '@/components/stories/StoryChapterSidebar';
import StoryReaderView from '@/components/stories/StoryReaderView';
import StoryTypographyMenu from '@/components/stories/StoryTypographyMenu';
import {
  DEFAULT_READER_PREFS,
  getPaperSurfaceClasses,
  getProseFontClasses,
  ReaderPrefs,
  StoryCastItem,
  StoryChapterItem,
  StoryData,
  StoryIdeaItem,
  StoryRevisionItem,
} from '@/components/stories/types';
import { useAuth } from '@/lib/AuthContext';

const PREFS_STORAGE_KEY = 'naravia_story_reader_prefs';

function countWordsLocal(text: string): number {
  const cleaned = (text || '').trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

function StoryStudioContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const storyId = params.id;

  const [story, setStory] = useState<StoryData | null>(null);
  const [cast, setCast] = useState<StoryCastItem[]>([]);
  const [chapters, setChapters] = useState<StoryChapterItem[]>([]);
  const [revisionsByChapter, setRevisionsByChapter] = useState<Record<string, StoryRevisionItem | null>>({});
  const [activeChapterId, setActiveChapterId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Editor state untuk bab aktif
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterContent, setChapterContent] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved'>('idle');
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // UI & Layout state
  const [isReaderMode, setIsReaderMode] = useState(() => searchParams.get('mode') === 'read');
  const [zenMode, setZenMode] = useState(false);
  const [mobileTocOpen, setMobileTocOpen] = useState(false);
  const [bibleOpen, setBibleOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_READER_PREFS);

  // AI Co-writing state
  const [beatInput, setBeatInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [freshHighlight, setFreshHighlight] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // 3 Ide Plot
  const [ideas, setIdeas] = useState<StoryIdeaItem[]>([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);

  // Inline Prose Toolbar (sunting teks terseleksi)
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number; text: string } | null>(null);
  const [customRewriteInput, setCustomRewriteInput] = useState('');
  const [rewriting, setRewriting] = useState(false);
  const [rewritePreview, setRewritePreview] = useState<string | null>(null);

  // Misc modals/loading
  const [addingChapter, setAddingChapter] = useState(false);
  const [deleteChapterTarget, setDeleteChapterTarget] = useState<StoryChapterItem | null>(null);
  const [deletingChapter, setDeletingChapter] = useState(false);
  const [summarizing, setSummarizing] = useState(false);

  // Muat preferensi kertas & tipografi dari localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setPrefs({
          paper: ['auto', 'ivory', 'sepia', 'night'].includes(parsed.paper) ? parsed.paper : 'auto',
          font: ['serif', 'sans', 'mono'].includes(parsed.font) ? parsed.font : 'serif',
          size: ['sm', 'md', 'lg', 'xl'].includes(parsed.size) ? parsed.size : 'md',
          spellCheck: Boolean(parsed.spellCheck),
        });
      }
    } catch {}
  }, []);

  const updatePrefs = (next: ReaderPrefs) => {
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

  // Tutup menu ekspor saat klik luar
  useEffect(() => {
    if (!exportMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setExportMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [exportMenuOpen]);

  // Pintasan Zen Mode (Ctrl+Shift+F)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setZenMode((v) => !v);
      } else if (e.key === 'Escape' && zenMode) {
        setZenMode(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zenMode]);

  // Auto-resize textarea editor agar terasa seperti kertas novel yang mengalir
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(420, el.scrollHeight + 24)}px`;
  }, [chapterContent, prefs.font, prefs.size, isReaderMode, zenMode]);

  const loadStory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/stories/${storyId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Cerita tidak ditemukan.');
      setStory(data.story);
      setCast(data.cast || []);
      const chList: StoryChapterItem[] = data.chapters || [];
      setChapters(chList);
      setRevisionsByChapter(data.revisionsByChapter || {});

      if (!data.story.is_owner) {
        setIsReaderMode(true);
      }

      if (chList.length > 0) {
        const requestedCh = searchParams.get('chapter');
        const initial = chList.find((c) => c.id === requestedCh) || chList[0];
        setActiveChapterId(initial.id);
        setChapterTitle(initial.title);
        setChapterContent(initial.content || '');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat cerita.');
    } finally {
      setLoading(false);
    }
  }, [storyId, searchParams]);

  useEffect(() => {
    if (storyId) loadStory();
  }, [storyId, loadStory]);

  const activeChapter = chapters.find((c) => c.id === activeChapterId) || chapters[0] || null;
  const activeRevision = activeChapter ? revisionsByChapter[activeChapter.id] || null : null;

  // Simpan bab aktif ke server
  const persistCurrentChapter = useCallback(
    async (overrideTitle?: string, overrideContent?: string) => {
      if (!story?.is_owner || !activeChapterId) return;
      const nextTitle = (overrideTitle ?? chapterTitle).trim() || 'Tanpa Judul';
      const nextContent = overrideContent ?? chapterContent;
      setSaveState('saving');
      try {
        const res = await fetch(`/api/stories/${story.id}/chapters/${activeChapterId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: nextTitle, content: nextContent }),
        });
        const data = await res.json();
        if (res.ok && data.chapter) {
          setChapters((prev) => prev.map((c) => (c.id === data.chapter.id ? data.chapter : c)));
          dirtyRef.current = false;
          setSaveState('saved');
        }
      } catch {
        setSaveState('dirty');
      }
    },
    [story, activeChapterId, chapterTitle, chapterContent]
  );

  // Debounced auto-save saat mengetik
  const scheduleAutoSave = useCallback(
    (nextTitle: string, nextContent: string) => {
      dirtyRef.current = true;
      setSaveState('dirty');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        persistCurrentChapter(nextTitle, nextContent);
      }, 1500);
    },
    [persistCurrentChapter]
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const handleSelectChapter = async (nextId: string) => {
    if (nextId === activeChapterId) return;
    if (dirtyRef.current && story?.is_owner) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      await persistCurrentChapter();
    }
    const target = chapters.find((c) => c.id === nextId);
    if (!target) return;
    setActiveChapterId(target.id);
    setChapterTitle(target.title);
    setChapterContent(target.content || '');
    setSelectionRange(null);
    setRewritePreview(null);
    setIdeas([]);
    setSaveState('idle');
  };

  const handleAddChapter = async () => {
    if (!story?.is_owner) return;
    if (dirtyRef.current) await persistCurrentChapter();
    setAddingChapter(true);
    setError('');
    try {
      const res = await fetch(`/api/stories/${story.id}/chapters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `Bab ${chapters.length + 1}` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menambah bab.');
      setChapters((prev) => [...prev, data.chapter]);
      setActiveChapterId(data.chapter.id);
      setChapterTitle(data.chapter.title);
      setChapterContent('');
      setIdeas([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menambah bab.');
    } finally {
      setAddingChapter(false);
    }
  };

  const handleDeleteChapter = async () => {
    if (!story?.is_owner || !deleteChapterTarget) return;
    setDeletingChapter(true);
    try {
      const res = await fetch(`/api/stories/${story.id}/chapters/${deleteChapterTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus bab.');
      const nextList: StoryChapterItem[] = data.chapters || [];
      setChapters(nextList);
      setDeleteChapterTarget(null);
      if (deleteChapterTarget.id === activeChapterId && nextList.length > 0) {
        setActiveChapterId(nextList[0].id);
        setChapterTitle(nextList[0].title);
        setChapterContent(nextList[0].content || '');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus bab.');
    } finally {
      setDeletingChapter(false);
    }
  };

  const handleMoveChapter = async (chapterId: string, direction: 'up' | 'down') => {
    if (!story?.is_owner) return;
    const idx = chapters.findIndex((c) => c.id === chapterId);
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || targetIdx < 0 || targetIdx >= chapters.length) return;
    const nextOrder = [...chapters];
    const [moved] = nextOrder.splice(idx, 1);
    nextOrder.splice(targetIdx, 0, moved);
    setChapters(nextOrder.map((c, i) => ({ ...c, chapter_number: i + 1 })));

    try {
      const res = await fetch(`/api/stories/${story.id}/chapters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reorder', chapterIds: nextOrder.map((c) => c.id) }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.chapters)) setChapters(data.chapters);
    } catch {}
  };

  // Streaming Lanjutkan Cerita / Coba Versi Lain
  const handleGenerate = async (mode: 'continue' | 'retry' = 'continue', beatOverride?: string) => {
    if (!story?.is_owner || !activeChapter || generating) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    const beat = (beatOverride !== undefined ? beatOverride : beatInput).trim();
    setGenerating(true);
    setStreamingText('');
    setError('');
    setIdeas([]);
    setSelectionRange(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/stories/${story.id}/chapters/${activeChapter.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          mode,
          beat,
          content: chapterContent,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Gagal memulai penulisan AI.');
      }
      if (!res.body) throw new Error('Stream tidak tersedia.');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventType = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            const payloadStr = line.slice(5).trim();
            if (!payloadStr) continue;
            try {
              const payload = JSON.parse(payloadStr);
              if (eventType === 'chunk' && payload.text) {
                setStreamingText((prev) => prev + payload.text);
              } else if (eventType === 'done') {
                if (typeof payload.content === 'string') {
                  setChapterContent(payload.content);
                  setChapters((prev) =>
                    prev.map((c) =>
                      c.id === activeChapter.id
                        ? { ...c, content: payload.content, word_count: payload.word_count ?? countWordsLocal(payload.content) }
                        : c
                    )
                  );
                }
                if (payload.revision) {
                  setRevisionsByChapter((prev) => ({ ...prev, [activeChapter.id]: payload.revision }));
                }
                setBeatInput('');
                setSaveState('saved');
                dirtyRef.current = false;
                setFreshHighlight(true);
                setTimeout(() => setFreshHighlight(false), 3200);
              } else if (eventType === 'error') {
                setError(payload.message || 'Terjadi kesalahan saat menulis cerita.');
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : 'Gagal menghasilkan lanjutan cerita.');
      }
    } finally {
      setGenerating(false);
      setStreamingText('');
      abortRef.current = null;
    }
  };

  const handleStopGenerating = () => {
    abortRef.current?.abort();
  };

  const handleSelectVariant = async (nextIdx: number) => {
    if (!story?.is_owner || !activeChapter || !activeRevision) return;
    try {
      const res = await fetch(`/api/stories/${story.id}/chapters/${activeChapter.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'select_variant', index: nextIdx }),
      });
      const data = await res.json();
      if (res.ok && data.chapter) {
        setChapterContent(data.chapter.content || '');
        setChapters((prev) => prev.map((c) => (c.id === data.chapter.id ? data.chapter : c)));
        setRevisionsByChapter((prev) => ({ ...prev, [activeChapter.id]: data.revision || null }));
      }
    } catch {
      setError('Gagal mengganti versi tulisan.');
    }
  };

  const handleUndoRevision = async () => {
    if (!story?.is_owner || !activeChapter || !activeRevision) return;
    try {
      const res = await fetch(`/api/stories/${story.id}/chapters/${activeChapter.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'undo_revision' }),
      });
      const data = await res.json();
      if (res.ok && data.chapter) {
        setChapterContent(data.chapter.content || '');
        setChapters((prev) => prev.map((c) => (c.id === data.chapter.id ? data.chapter : c)));
        setRevisionsByChapter((prev) => ({ ...prev, [activeChapter.id]: data.revision || null }));
      }
    } catch {
      setError('Gagal mengurungkan hasil generasi.');
    }
  };

  const handleFetchIdeas = async () => {
    if (!story?.is_owner || !activeChapter || loadingIdeas) return;
    setLoadingIdeas(true);
    setError('');
    try {
      const res = await fetch(`/api/stories/${story.id}/chapters/${activeChapter.id}/ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: chapterContent }),
      });
      const rawText = await res.text();
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        throw new Error(`Respons server tidak valid (HTTP ${res.status}). Silakan coba lagi.`);
      }
      if (!res.ok) throw new Error(data.error || 'Gagal meminta ide plot.');
      setIdeas(data.ideas || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal meminta ide plot.');
    } finally {
      setLoadingIdeas(false);
    }
  };

  // Deteksi sorotan teks di textarea untuk Inline Prose Toolbar
  const handleEditorSelect = () => {
    const el = editorRef.current;
    if (!el || generating) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (end - start >= 8) {
      const selected = chapterContent.slice(start, end);
      if (selected.trim().length >= 8) {
        setSelectionRange({ start, end, text: selected });
        return;
      }
    }
    if (!rewriting && rewritePreview === null) {
      setSelectionRange(null);
    }
  };

  const handleInlineRewrite = async (action: 'expand' | 'rewrite' | 'tighten' | 'dialogue' | 'custom') => {
    if (!story?.is_owner || !activeChapter || !selectionRange || rewriting) return;
    setRewriting(true);
    setRewritePreview('');
    setError('');

    try {
      const beforeContext = chapterContent.slice(Math.max(0, selectionRange.start - 900), selectionRange.start);
      const afterContext = chapterContent.slice(selectionRange.end, selectionRange.end + 600);
      const res = await fetch(`/api/stories/${story.id}/chapters/${activeChapter.id}/rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          selectedText: selectionRange.text,
          beforeContext,
          afterContext,
          customInstruction: customRewriteInput.trim(),
        }),
      });
      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Gagal menyunting teks.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventType = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (line.startsWith('event:')) eventType = line.slice(6).trim();
          else if (line.startsWith('data:')) {
            try {
              const payload = JSON.parse(line.slice(5).trim());
              if (eventType === 'chunk' && payload.text) {
                setRewritePreview((prev) => (prev || '') + payload.text);
              } else if (eventType === 'done' && typeof payload.rewrittenText === 'string') {
                setRewritePreview(payload.rewrittenText);
              } else if (eventType === 'error') {
                setError(payload.message || 'Gagal menyunting teks.');
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyunting teks.');
      setRewritePreview(null);
    } finally {
      setRewriting(false);
    }
  };

  const handleApplyRewrite = async () => {
    if (!selectionRange || rewritePreview === null) return;
    const nextContent =
      chapterContent.slice(0, selectionRange.start) + rewritePreview + chapterContent.slice(selectionRange.end);
    setChapterContent(nextContent);
    setSelectionRange(null);
    setRewritePreview(null);
    setCustomRewriteInput('');
    await persistCurrentChapter(chapterTitle, nextContent);
  };

  const handleSaveStory = async (patch: Record<string, unknown>) => {
    if (!story?.is_owner) return;
    const res = await fetch(`/api/stories/${story.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Gagal menyimpan pengaturan cerita.');
      return;
    }
    if (data.story) setStory(data.story);
    if (Array.isArray(data.cast)) setCast(data.cast);
  };

  const handleSaveChapterMeta = async (patch: { summary?: string; outline_notes?: string; status?: 'draft' | 'done' }) => {
    if (!story?.is_owner || !activeChapter) return;
    const res = await fetch(`/api/stories/${story.id}/chapters/${activeChapter.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (res.ok && data.chapter) {
      setChapters((prev) => prev.map((c) => (c.id === data.chapter.id ? data.chapter : c)));
    }
  };

  const handleSummarizeChapter = async () => {
    if (!story?.is_owner || !activeChapter) return;
    if (dirtyRef.current) await persistCurrentChapter();
    setSummarizing(true);
    setError('');
    try {
      const res = await fetch(`/api/stories/${story.id}/chapters/${activeChapter.id}/summarize`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal meringkas bab.');
      setChapters((prev) =>
        prev.map((c) => (c.id === activeChapter.id ? { ...c, summary: data.summary } : c))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal meringkas bab.');
    } finally {
      setSummarizing(false);
    }
  };

  const handleToggleBookmark = async () => {
    if (!story) return;
    if (!authLoading && !user) {
      router.push(`/login?next=${encodeURIComponent(`/stories/${story.id}`)}`);
      return;
    }
    try {
      const res = await fetch(`/api/stories/${story.id}/bookmark`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setStory((prev) =>
          prev
            ? { ...prev, bookmarked: Boolean(data.bookmarked), bookmark_count: Number(data.bookmark_count || 0) }
            : prev
        );
      }
    } catch {}
  };

  if (loading) {
    return (
      <div className="max-w-5xl w-full mx-auto px-4 py-12 text-sm text-slate-500 dark:text-slate-400">
        Menyiapkan meja tulis editorial...
      </div>
    );
  }

  if (!story || !activeChapter) {
    return (
      <div className="max-w-3xl w-full mx-auto px-4 py-12 space-y-4">
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-sm text-rose-700 dark:text-rose-300">
          {error || 'Cerita tidak ditemukan.'}
        </div>
        <Link href="/stories" className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
          Kembali ke Perpustakaan Cerita
        </Link>
      </div>
    );
  }

  const surface = getPaperSurfaceClasses(prefs.paper);
  const proseFont = getProseFontClasses(prefs.font, prefs.size);
  const currentWords = countWordsLocal(chapterContent);

  return (
    <div
      className={
        zenMode
          ? 'fixed inset-0 z-50 flex flex-col bg-white dark:bg-[#0B1120]'
          : 'flex flex-col h-[100dvh] md:h-[calc(100dvh-64px)] w-full overflow-hidden'
      }
    >
      {/* Top Studio Bar */}
      <header className="h-12 px-3 sm:px-4 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0f1729]/95 backdrop-blur flex items-center justify-between gap-2 shrink-0 z-20">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => (story.is_owner ? router.push('/stories') : router.back())}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 inline-flex items-center justify-center shrink-0"
            title="Kembali"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {!zenMode && (
            <button
              type="button"
              onClick={() => setMobileTocOpen(true)}
              className="lg:hidden w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 inline-flex items-center justify-center shrink-0"
              title="Daftar Bab"
            >
              <List className="w-4 h-4" />
            </button>
          )}

          <div className="min-w-0 flex items-center gap-2">
            <span className="font-display text-sm sm:text-base font-semibold text-slate-900 dark:text-white truncate max-w-[160px] sm:max-w-[260px]">
              {story.title}
            </span>
            <span className="hidden md:inline text-slate-300 dark:text-slate-700">/</span>
            <span className="hidden md:inline text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
              Bab {activeChapter.chapter_number}: {chapterTitle}
            </span>
            {story.is_owner && !isReaderMode && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-400 pl-1">
                {saveState === 'saving' && (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                )}
                {saveState === 'saved' && (
                  <>
                    <Check className="w-3 h-3 text-emerald-500" />
                    <span>Tersimpan</span>
                  </>
                )}
                {saveState === 'dirty' && <span>Belum disimpan</span>}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {story.is_owner && (
            <button
              type="button"
              onClick={async () => {
                if (!isReaderMode && dirtyRef.current) await persistCurrentChapter();
                setIsReaderMode((v) => !v);
              }}
              className={`h-8 px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                isReaderMode
                  ? 'border-indigo-500 bg-indigo-600 text-white'
                  : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
              }`}
              title={isReaderMode ? 'Kembali ke Mode Tulis' : 'Buka Mode Baca'}
            >
              {isReaderMode ? <Feather className="w-3.5 h-3.5" /> : <BookOpen className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isReaderMode ? 'Tulis' : 'Baca'}</span>
            </button>
          )}

          <StoryTypographyMenu prefs={prefs} onChange={updatePrefs} />

          <button
            type="button"
            onClick={() => setZenMode((v) => !v)}
            title={zenMode ? 'Keluar dari Zen Mode (Esc)' : 'Mode Fokus / Zen Mode (Ctrl+Shift+F)'}
            className={`w-8 h-8 rounded-lg border inline-flex items-center justify-center transition-colors ${
              zenMode
                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300'
                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            {zenMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {story.is_owner && !isReaderMode && (
            <button
              type="button"
              onClick={() => setBibleOpen((v) => !v)}
              title="Alkitab Cerita, Pemeran & Konteks AI"
              className={`h-8 px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                bibleOpen
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                  : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
              }`}
            >
              <BookMarked className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Story Bible</span>
            </button>
          )}

          {/* Menu Ekspor */}
          <div className="relative" ref={exportMenuRef}>
            <button
              type="button"
              onClick={() => setExportMenuOpen((v) => !v)}
              className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 inline-flex items-center justify-center"
              title="Ekspor Naskah"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {exportMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-48 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0f1729] shadow-xl py-1.5 z-40 text-xs">
                <a
                  href={`/api/stories/${story.id}/export?format=md`}
                  onClick={() => setExportMenuOpen(false)}
                  className="px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                >
                  <Download className="w-3.5 h-3.5 text-slate-400" />
                  <span>Unduh Markdown (.md)</span>
                </a>
                <a
                  href={`/api/stories/${story.id}/export?format=txt`}
                  onClick={() => setExportMenuOpen(false)}
                  className="px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span>Unduh Teks Polos (.txt)</span>
                </a>
                <a
                  href={`/api/stories/${story.id}/export?format=html&inline=1`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setExportMenuOpen(false)}
                  className="px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-400" />
                  <span>Cetak / Simpan PDF</span>
                </a>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Body 3-Kolom Adaptif */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {!zenMode && (
          <StoryChapterSidebar
            story={story}
            chapters={chapters}
            activeChapterId={activeChapter.id}
            readOnly={!story.is_owner || isReaderMode}
            mobileOpen={mobileTocOpen}
            onCloseMobile={() => setMobileTocOpen(false)}
            onSelectChapter={handleSelectChapter}
            onAddChapter={handleAddChapter}
            onDeleteChapter={(ch) => setDeleteChapterTarget(ch)}
            onMoveChapter={handleMoveChapter}
            addingChapter={addingChapter}
          />
        )}

        {/* Area Tengah: Reader Mode ATAU Kanvas Menulis */}
        {isReaderMode || !story.is_owner ? (
          <StoryReaderView
            story={story}
            cast={cast}
            chapters={chapters}
            activeChapter={{ ...activeChapter, title: chapterTitle, content: chapterContent }}
            prefs={prefs}
            onSelectChapter={handleSelectChapter}
            onOpenToc={() => setMobileTocOpen(true)}
            onExitReader={story.is_owner ? () => setIsReaderMode(false) : undefined}
            onToggleBookmark={handleToggleBookmark}
          />
        ) : (
          <main className={`flex-1 flex flex-col min-w-0 h-full ${surface.canvasBg} transition-colors relative`}>
            {error && (
              <div className="mx-4 mt-3 px-3.5 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2 shrink-0">
                <span>{error}</span>
                <button type="button" onClick={() => setError('')} className="p-0.5 hover:opacity-75">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Floating Inline Prose Toolbar saat teks disorot */}
            {selectionRange && (
              <div className="mx-auto w-full max-w-[68ch] px-4 sm:px-6 pt-3 shrink-0 z-20">
                <div className="rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-[#0f1729] shadow-lg p-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                      <Wand2 className="w-3.5 h-3.5" />
                      <span>Sunting Teks Terpilih ({selectionRange.text.length} kar.)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectionRange(null);
                        setRewritePreview(null);
                      }}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: 'expand', label: 'Perkaya Deskripsi' },
                        { id: 'rewrite', label: 'Tulis Ulang Halus' },
                        { id: 'tighten', label: 'Ringkas Padat' },
                        { id: 'dialogue', label: 'Hidupkan Dialog' },
                      ] as const
                    ).map((btn) => (
                      <button
                        key={btn.id}
                        type="button"
                        disabled={rewriting}
                        onClick={() => handleInlineRewrite(btn.id)}
                        className="h-7 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-[11px] font-medium text-slate-700 dark:text-slate-200 disabled:opacity-50 transition-colors"
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-end gap-1.5">
                    <AutoResizeTextarea
                      rows={1}
                      maxHeight={110}
                      submitOnEnter
                      onEnterSubmit={() => {
                        if (!rewriting && customRewriteInput.trim()) handleInlineRewrite('custom');
                      }}
                      value={customRewriteInput}
                      onChange={(e) => setCustomRewriteInput(e.target.value)}
                      placeholder="Atau instruksi kustom (mis: ubah lebih menegangkan)..."
                      className="flex-1 min-h-8 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs leading-5 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      disabled={rewriting || !customRewriteInput.trim()}
                      onClick={() => handleInlineRewrite('custom')}
                      className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold shrink-0"
                    >
                      Jalankan
                    </button>
                  </div>

                  {(rewriting || rewritePreview !== null) && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {rewriting ? 'Menyunting...' : 'Pratinjau Hasil Suntingan'}
                      </p>
                      <div className="max-h-44 overflow-y-auto rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 p-3 text-xs font-serif leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-line">
                        {rewritePreview || '...'}
                      </div>
                      {!rewriting && rewritePreview && (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setRewritePreview(null)}
                            className="h-7 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            onClick={handleApplyRewrite}
                            className="h-7 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                          >
                            Terapkan ke Naskah
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Kanvas Kertas Editorial */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-8 pt-8 pb-44">
              <div className="max-w-[68ch] mx-auto space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-400">
                    <span>Bab {activeChapter.chapter_number}</span>
                    <span className={`font-sans font-normal normal-case tracking-normal ${surface.mutedText}`}>
                      {currentWords.toLocaleString('id-ID')} kata
                    </span>
                  </div>
                  <AutoResizeTextarea
                    rows={1}
                    maxHeight={140}
                    singleParagraph
                    spellCheck={prefs.spellCheck}
                    value={chapterTitle}
                    onChange={(e) => {
                      const next = e.target.value;
                      setChapterTitle(next);
                      scheduleAutoSave(next, chapterContent);
                    }}
                    placeholder="Judul Bab..."
                    className={`w-full bg-transparent font-display text-2xl sm:text-3xl leading-snug focus:outline-none ${surface.proseText} placeholder:opacity-40`}
                  />
                </div>

                <textarea
                  ref={editorRef}
                  spellCheck={prefs.spellCheck}
                  value={chapterContent}
                  readOnly={generating}
                  onSelect={handleEditorSelect}
                  onChange={(e) => {
                    const next = e.target.value;
                    setChapterContent(next);
                    scheduleAutoSave(chapterTitle, next);
                  }}
                  placeholder="Mulai mengetik kisahmu di sini, atau ketik arahan singkat di Bilah Sutradara di bawah lalu klik Lanjutkan Cerita..."
                  className={`w-full bg-transparent resize-none focus:outline-none ${proseFont} ${surface.proseText} placeholder:opacity-40 transition-colors rounded-xl ${
                    freshHighlight ? 'bg-indigo-500/5 ring-1 ring-indigo-500/20 p-2 -mx-2' : ''
                  }`}
                />

                {/* Live streaming blok baru */}
                {generating && (
                  <div className="rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/35 border border-indigo-200/70 dark:border-indigo-800/60 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>AI sedang merangkai prosa...</span>
                    </div>
                    <p className={`${proseFont} ${surface.proseText} whitespace-pre-line`}>
                      {streamingText || '...'}
                    </p>
                  </div>
                )}

                {/* Bar Variasi & Undo untuk blok generasi AI terakhir */}
                {!generating && activeRevision && activeRevision.variants.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-current/10 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[11px] ${surface.mutedText}`}>Blok AI terakhir:</span>
                      {activeRevision.variants.length > 1 && (
                        <div className="inline-flex items-center gap-1 rounded-lg border border-current/15 px-1.5 py-0.5">
                          <button
                            type="button"
                            disabled={activeRevision.active_index <= 0}
                            onClick={() => handleSelectVariant(activeRevision.active_index - 1)}
                            className="disabled:opacity-30"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-[11px] font-mono px-1">
                            {activeRevision.active_index + 1}/{activeRevision.variants.length}
                          </span>
                          <button
                            type="button"
                            disabled={activeRevision.active_index >= activeRevision.variants.length - 1}
                            onClick={() => handleSelectVariant(activeRevision.active_index + 1)}
                            className="disabled:opacity-30"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleGenerate('retry')}
                        className="h-7 px-2.5 rounded-lg border border-current/15 hover:bg-black/5 dark:hover:bg-white/10 text-[11px] font-medium inline-flex items-center gap-1 transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Coba Versi Lain</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleUndoRevision}
                        className="h-7 px-2.5 rounded-lg border border-rose-300/60 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[11px] font-medium inline-flex items-center gap-1 transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Urungkan</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Floating Director Dock (Bilah Sutradara + Panel 3 Ide Plot) */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 px-3 sm:px-6 pb-3 sm:pb-5 pt-6 bg-gradient-to-t from-black/10 via-transparent to-transparent">
              <div className="pointer-events-auto max-w-[68ch] mx-auto space-y-2">
                {ideas.length > 0 && (
                  <div className="rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-white/95 dark:bg-[#0f1729]/95 backdrop-blur shadow-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                        <Lightbulb className="w-3.5 h-3.5" />
                        <span>Pilih Arah Kelanjutan Adegan</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setIdeas([])}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {ideas.map((idea, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleGenerate('continue', idea.beat)}
                          className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 bg-slate-50/70 dark:bg-slate-800/50 text-left space-y-1 transition-all group"
                        >
                          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                            {idea.label}
                          </span>
                          <p className="text-xs font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-300 leading-snug">
                            {idea.title}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-3 leading-relaxed">
                            {idea.beat}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-slate-200 dark:border-slate-700/90 bg-white/95 dark:bg-[#0f1729]/95 backdrop-blur-md shadow-xl p-2 flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
                  <AutoResizeTextarea
                    rows={1}
                    maxHeight={140}
                    submitOnEnter
                    onEnterSubmit={() => {
                      if (!generating && beatInput.trim()) handleGenerate('continue');
                    }}
                    value={beatInput}
                    disabled={generating}
                    onChange={(e) => setBeatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        if (!generating) handleGenerate('continue');
                      }
                    }}
                    placeholder="Arahan adegan berikutnya (opsional — kosongkan agar AI lanjut otomatis)..."
                    className="w-full sm:flex-1 min-h-10 sm:min-h-9 px-3 py-2 rounded-xl bg-transparent text-xs sm:text-sm leading-5 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
                  />

                  <div className="flex items-center justify-end gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={generating || loadingIdeas}
                      onClick={handleFetchIdeas}
                      title="Minta 3 saran arah alur cerita"
                      className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors"
                    >
                      {loadingIdeas ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lightbulb className="w-3.5 h-3.5 text-amber-500" />}
                      <span>Ide Plot</span>
                    </button>

                    {generating ? (
                      <button
                        type="button"
                        onClick={handleStopGenerating}
                        className="h-9 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                      >
                        <Square className="w-3 h-3 fill-current" />
                        <span>Hentikan</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleGenerate('continue')}
                        className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Lanjutkan</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </main>
        )}

        {/* Panel Kanan: Story Bible (hanya untuk pemilik di mode tulis, bukan Zen Mode) */}
        {story.is_owner && !isReaderMode && !zenMode && (
          <StoryBibleDrawer
            open={bibleOpen}
            onClose={() => setBibleOpen(false)}
            story={story}
            cast={cast}
            activeChapter={activeChapter}
            onSaveStory={handleSaveStory}
            onSaveChapterMeta={handleSaveChapterMeta}
            onSummarizeChapter={handleSummarizeChapter}
            summarizing={summarizing}
          />
        )}
      </div>

      <ConfirmModal
        open={Boolean(deleteChapterTarget)}
        title={`Hapus Bab "${deleteChapterTarget?.title || ''}"?`}
        description="Isi naskah dan riwayat generasi pada bab ini akan dihapus permanen."
        confirmLabel="Hapus Bab"
        loading={deletingChapter}
        onConfirm={handleDeleteChapter}
        onCancel={() => setDeleteChapterTarget(null)}
      />
    </div>
  );
}

export default function StoryStudioPage() {
  return (
    <Suspense fallback={<div className="max-w-5xl w-full mx-auto px-4 py-12 text-sm text-slate-400">Menyiapkan meja tulis...</div>}>
      <StoryStudioContent />
    </Suspense>
  );
}
