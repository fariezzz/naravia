'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Download,
  Feather,
  List,
  Volume2,
  VolumeX,
} from 'lucide-react';
import CharacterAvatar from '@/components/CharacterAvatar';
import StoryCover from './StoryCover';
import {
  getPaperSurfaceClasses,
  getProseFontClasses,
  ReaderPrefs,
  StoryCastItem,
  StoryChapterItem,
  StoryData,
} from './types';

interface StoryReaderViewProps {
  story: StoryData;
  cast: StoryCastItem[];
  chapters: StoryChapterItem[];
  activeChapter: StoryChapterItem;
  prefs: ReaderPrefs;
  onSelectChapter: (chapterId: string) => void;
  onOpenToc: () => void;
  onExitReader?: () => void;
  onToggleBookmark?: () => void;
}

export default function StoryReaderView({
  story,
  cast,
  chapters,
  activeChapter,
  prefs,
  onSelectChapter,
  onOpenToc,
  onExitReader,
  onToggleBookmark,
}: StoryReaderViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [speaking, setSpeaking] = useState(false);

  const surface = getPaperSurfaceClasses(prefs.paper);
  const proseFont = getProseFontClasses(prefs.font, prefs.size);

  const currentIdx = chapters.findIndex((c) => c.id === activeChapter.id);
  const prevChapter = currentIdx > 0 ? chapters[currentIdx - 1] : null;
  const nextChapter = currentIdx >= 0 && currentIdx < chapters.length - 1 ? chapters[currentIdx + 1] : null;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setProgress(0);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }
  }, [activeChapter.id]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = Math.max(1, el.scrollHeight - el.clientHeight);
    setProgress(Math.min(100, Math.round((el.scrollTop / max) * 100)));
  };

  const handleToggleTts = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const text = `${activeChapter.title}. ${(activeChapter.content || '').trim()}`;
    if (!text.trim()) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'id-ID';
    utter.rate = 0.98;
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utter);
  };

  const paragraphs = (activeChapter.content || '')
    .trim()
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className={`flex-1 flex flex-col min-w-0 h-full relative ${surface.canvasBg} transition-colors`}>
      {/* Progress bar baca tipis */}
      <div className="h-0.5 w-full bg-black/5 dark:bg-white/10 shrink-0">
        <div
          className="h-full bg-indigo-500 transition-[width] duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-5 sm:px-8 py-8 sm:py-12"
      >
        <div className="max-w-[68ch] mx-auto space-y-8">
          {/* Header Sampul Novel di Bab 1 */}
          {currentIdx === 0 && (
            <header className="pb-8 border-b border-current/10 flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
              <StoryCover
                title={story.title}
                genre={story.genre}
                coverImage={story.cover_image}
                authorName={story.creator_name}
                className="w-32 h-48 rounded-xl shadow-md shrink-0"
              />
              <div className="space-y-2.5 w-full sm:flex-1 min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-400">
                  {story.genre}
                </p>
                <h1 className={`font-display text-3xl sm:text-4xl leading-tight ${surface.proseText}`}>
                  {story.title}
                </h1>
                <p className={`text-xs ${surface.mutedText}`}>
                  Ditulis oleh <span className="font-semibold">{story.creator_name}</span> &bull; {chapters.length} bab
                </p>
                {story.synopsis && (
                  <p className={`text-sm italic leading-relaxed pt-1 ${surface.mutedText}`}>
                    {story.synopsis}
                  </p>
                )}

                {cast.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 pt-2">
                    {cast.map((m) => (
                      <span
                        key={m.id || m.name}
                        className="pl-1 pr-2.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-[11px] inline-flex items-center gap-1.5"
                      >
                        <CharacterAvatar name={m.name} avatar={m.avatar} size="xs" />
                        <span className={surface.proseText}>{m.name}</span>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-2">
                  {!story.is_owner && onToggleBookmark && (
                    <button
                      type="button"
                      onClick={onToggleBookmark}
                      className={`h-8 px-3 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                        story.bookmarked
                          ? 'border-indigo-500 bg-indigo-600 text-white'
                          : 'border-current/15 hover:bg-black/5 dark:hover:bg-white/10'
                      }`}
                    >
                      <Bookmark className={`w-3.5 h-3.5 ${story.bookmarked ? 'fill-current' : ''}`} />
                      <span>{story.bookmarked ? 'Tersimpan' : 'Simpan Bacaan'}</span>
                    </button>
                  )}
                  <a
                    href={`/api/stories/${story.id}/export?format=html&inline=1`}
                    target="_blank"
                    rel="noreferrer"
                    className={`h-8 px-3 rounded-lg border border-current/15 hover:bg-black/5 dark:hover:bg-white/10 text-xs font-medium inline-flex items-center gap-1.5 ${surface.proseText}`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Cetak / PDF</span>
                  </a>
                  {story.is_owner && onExitReader && (
                    <button
                      type="button"
                      onClick={onExitReader}
                      className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Feather className="w-3.5 h-3.5" />
                      <span>Kembali Menulis</span>
                    </button>
                  )}
                </div>
              </div>
            </header>
          )}

          {/* Judul Bab & Alat Baca */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-400">
                Bab {activeChapter.chapter_number}
              </p>
              <h2 className={`font-display text-2xl sm:text-3xl leading-snug ${surface.proseText}`}>
                {activeChapter.title}
              </h2>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 pt-1">
              <button
                type="button"
                onClick={handleToggleTts}
                title={speaking ? 'Hentikan suara' : 'Dengarkan bab ini (TTS)'}
                className={`h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                  speaking
                    ? 'border-indigo-500 bg-indigo-600 text-white'
                    : `border-current/15 hover:bg-black/5 dark:hover:bg-white/10 ${surface.proseText}`
                }`}
              >
                {speaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{speaking ? 'Berhenti' : 'Dengarkan'}</span>
              </button>
              <button
                type="button"
                onClick={onOpenToc}
                className={`lg:hidden h-8 px-2.5 rounded-lg border border-current/15 hover:bg-black/5 dark:hover:bg-white/10 text-xs font-medium inline-flex items-center gap-1 ${surface.proseText}`}
              >
                <List className="w-3.5 h-3.5" />
                <span>Bab</span>
              </button>
            </div>
          </div>

          {/* Isi Prosa */}
          <article className={`${proseFont} ${surface.proseText} space-y-5`}>
            {paragraphs.length === 0 ? (
              <p className={`italic ${surface.mutedText}`}>Bab ini belum memiliki isi.</p>
            ) : (
              paragraphs.map((para, idx) => (
                <p key={idx} className="whitespace-pre-line">
                  {para}
                </p>
              ))
            )}
          </article>

          {/* Navigasi Antar Bab */}
          <nav className="pt-10 pb-6 border-t border-current/10 flex items-center justify-between gap-3">
            {prevChapter ? (
              <button
                type="button"
                onClick={() => onSelectChapter(prevChapter.id)}
                className={`px-3.5 py-2.5 rounded-xl border border-current/15 hover:bg-black/5 dark:hover:bg-white/10 text-left inline-flex items-center gap-2 transition-colors ${surface.proseText}`}
              >
                <ChevronLeft className="w-4 h-4 shrink-0" />
                <div className="min-w-0">
                  <p className={`text-[10px] uppercase tracking-wider ${surface.mutedText}`}>Sebelumnya</p>
                  <p className="text-xs font-semibold truncate max-w-[160px] sm:max-w-[220px]">{prevChapter.title}</p>
                </div>
              </button>
            ) : (
              <div />
            )}

            {nextChapter ? (
              <button
                type="button"
                onClick={() => onSelectChapter(nextChapter.id)}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-right inline-flex items-center gap-2 transition-colors shadow-xs"
              >
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-indigo-200">Bab Berikutnya</p>
                  <p className="text-xs font-semibold truncate max-w-[160px] sm:max-w-[220px]">{nextChapter.title}</p>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0" />
              </button>
            ) : (
              <span className={`text-xs italic ${surface.mutedText}`}>Akhir bab saat ini</span>
            )}
          </nav>
        </div>
      </div>
    </div>
  );
}
