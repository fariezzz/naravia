'use client';

import { useEffect, useState } from 'react';
import {
  BookMarked,
  Check,
  Copy,
  Cpu,
  Globe,
  Globe2,
  ImagePlus,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import CharacterAvatar from '@/components/CharacterAvatar';
import {
  STORY_GENRES,
  STORY_LENGTH_PRESETS,
  STORY_POVS,
  STORY_TONES,
} from '@/lib/storyConstants';
import type { StoryCastItem, StoryChapterItem, StoryData } from './types';

interface StoryBibleDrawerProps {
  open: boolean;
  onClose: () => void;
  story: StoryData;
  cast: StoryCastItem[];
  activeChapter: StoryChapterItem;
  onSaveStory: (patch: Record<string, unknown>) => Promise<void>;
  onSaveChapterMeta: (patch: { summary?: string; outline_notes?: string; status?: 'draft' | 'done' }) => Promise<void>;
  onSummarizeChapter: () => Promise<void>;
  summarizing: boolean;
}

type DrawerTab = 'director' | 'cast' | 'context' | 'info';

export default function StoryBibleDrawer({
  open,
  onClose,
  story,
  cast,
  activeChapter,
  onSaveStory,
  onSaveChapterMeta,
  onSummarizeChapter,
  summarizing,
}: StoryBibleDrawerProps) {
  const [tab, setTab] = useState<DrawerTab>('director');
  const [saving, setSaving] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Director & Style fields
  const [authorsNote, setAuthorsNote] = useState(story.authors_note || '');
  const [styleNotes, setStyleNotes] = useState(story.writing_style_notes || '');
  const [pov, setPov] = useState(story.pov);
  const [tone, setTone] = useState(story.tone);
  const [lengthPreset, setLengthPreset] = useState(story.length_preset);
  const [temperature, setTemperature] = useState(story.temperature || 0.85);
  const [chapterSummary, setChapterSummary] = useState(activeChapter.summary || '');
  const [chapterOutline, setChapterOutline] = useState(activeChapter.outline_notes || '');

  // Info fields
  const [title, setTitle] = useState(story.title);
  const [synopsis, setSynopsis] = useState(story.synopsis || '');
  const [genre, setGenre] = useState(story.genre || 'Bebas');
  const [tagsText, setTagsText] = useState((story.tags || []).join(', '));
  const [worldId, setWorldId] = useState(story.world_id || '');
  const [coverImage, setCoverImage] = useState(story.cover_image || '');
  const [uploadingCover, setUploadingCover] = useState(false);

  // Cast fields
  const [castDraft, setCastDraft] = useState<StoryCastItem[]>(cast);
  const [characters, setCharacters] = useState<any[]>([]);
  const [personas, setPersonas] = useState<any[]>([]);
  const [worlds, setWorlds] = useState<any[]>([]);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'protagonis' | 'antagonis' | 'pendukung'>('pendukung');
  const [newBio, setNewBio] = useState('');

  // Context Inspector
  const [contextData, setContextData] = useState<any>(null);
  const [loadingContext, setLoadingContext] = useState(false);

  useEffect(() => {
    setAuthorsNote(story.authors_note || '');
    setStyleNotes(story.writing_style_notes || '');
    setPov(story.pov);
    setTone(story.tone);
    setLengthPreset(story.length_preset);
    setTemperature(story.temperature || 0.85);
    setTitle(story.title);
    setSynopsis(story.synopsis || '');
    setGenre(story.genre || 'Bebas');
    setTagsText((story.tags || []).join(', '));
    setWorldId(story.world_id || '');
    setCoverImage(story.cover_image || '');
  }, [story]);

  useEffect(() => {
    setCastDraft(cast);
  }, [cast]);

  useEffect(() => {
    setChapterSummary(activeChapter.summary || '');
    setChapterOutline(activeChapter.outline_notes || '');
  }, [activeChapter.id, activeChapter.summary, activeChapter.outline_notes]);

  useEffect(() => {
    if (!open) return;
    if (characters.length === 0) {
      fetch('/api/characters')
        .then((r) => (r.ok ? r.json() : { characters: [] }))
        .then((d) => setCharacters(d.characters || []))
        .catch(() => undefined);
    }
    if (personas.length === 0) {
      fetch('/api/persona')
        .then((r) => (r.ok ? r.json() : { personas: [] }))
        .then((d) => setPersonas((d.personas || []).filter(Boolean)))
        .catch(() => undefined);
    }
    if (worlds.length === 0) {
      fetch('/api/worlds')
        .then((r) => (r.ok ? r.json() : { worlds: [] }))
        .then((d) => setWorlds(d.worlds || []))
        .catch(() => undefined);
    }
  }, [open, characters.length, personas.length, worlds.length]);

  const loadContext = async () => {
    setLoadingContext(true);
    try {
      const res = await fetch(`/api/stories/${story.id}/context?chapterId=${encodeURIComponent(activeChapter.id)}`);
      const data = await res.json();
      if (res.ok) setContextData(data.context);
    } finally {
      setLoadingContext(false);
    }
  };

  useEffect(() => {
    if (open && tab === 'context') {
      loadContext();
    }
  }, [open, tab, activeChapter.id]);

  const runSave = async (fn: () => Promise<void>) => {
    setSaving(true);
    try {
      await fn();
    } finally {
      setSaving(false);
    }
  };

  const handleUploadCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('aspect', 'cover');
      if (coverImage.startsWith('/uploads/')) fd.append('previousAvatarUrl', coverImage);
      const res = await fetch('/api/avatar', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.url) {
        setCoverImage(data.url);
        await onSaveStory({ cover_image: data.url });
      }
    } finally {
      setUploadingCover(false);
      e.target.value = '';
    }
  };

  const handleCopyPublicLink = () => {
    const url = `${window.location.origin}/stories/${story.id}`;
    navigator.clipboard?.writeText(url).catch(() => undefined);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1800);
  };

  if (!open) return null;

  const panel = (
    <div className="flex flex-col h-full w-[320px] max-w-[92vw] bg-white dark:bg-[#0f1729] border-l border-slate-200 dark:border-slate-800">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BookMarked className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
            Alkitab Cerita
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Tutup panel Alkitab Cerita"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="px-3 pt-2.5 pb-2 border-b border-slate-100 dark:border-slate-800 grid grid-cols-4 gap-1">
        {(
          [
            { id: 'director', label: 'Sutradara' },
            { id: 'cast', label: `Pemeran` },
            { id: 'context', label: 'Konteks' },
            { id: 'info', label: 'Info' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`h-7 rounded-lg text-[11px] font-semibold transition-colors ${
              tab === t.id
                ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {tab === 'director' && (
          <>
            {/* Catatan Sutradara */}
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 dark:text-slate-200 block">
                Catatan Sutradara (Author&apos;s Note)
              </label>
              <textarea
                rows={3}
                value={authorsNote}
                onChange={(e) => setAuthorsNote(e.target.value)}
                placeholder="Selalu dibaca AI sebelum menulis: suasana adegan saat ini, hal yang perlu ditekankan atau dihindari..."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-200 block">Sudut Pandang</label>
                <select
                  value={pov}
                  onChange={(e) => setPov(e.target.value as any)}
                  className="w-full h-9 px-2 py-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                >
                  {STORY_POVS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.shortLabel}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-200 block">Gaya Prosa</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value as any)}
                  className="w-full h-9 px-2 py-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                >
                  {STORY_TONES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-200 block">Panjang Generasi AI</label>
              <select
                value={lengthPreset}
                onChange={(e) => setLengthPreset(e.target.value as any)}
                className="w-full h-9 px-2.5 py-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              >
                {STORY_LENGTH_PRESETS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-700 dark:text-slate-200">Kreativitas (Temperature)</label>
                <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400">
                  {Number(temperature).toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0.3}
                max={1.3}
                step={0.05}
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 dark:text-slate-200 block">Catatan Gaya Penulisan</label>
              <textarea
                rows={2}
                value={styleNotes}
                onChange={(e) => setStyleNotes(e.target.value)}
                placeholder="Misal: Gunakan kalimat pendek saat aksi, banyak metafora alam..."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={() =>
                runSave(() =>
                  onSaveStory({
                    authors_note: authorsNote,
                    writing_style_notes: styleNotes,
                    pov,
                    tone,
                    length_preset: lengthPreset,
                    temperature,
                  })
                )
              }
              className="w-full h-9 rounded-xl bg-slate-900 dark:bg-indigo-600 hover:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan Gaya'}
            </button>

            <hr className="border-slate-100 dark:border-slate-800" />

            {/* Memori & Kerangka Bab Aktif */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  Bab {activeChapter.chapter_number} — Memori &amp; Status
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onSaveChapterMeta({ status: activeChapter.status === 'done' ? 'draft' : 'done' })
                  }
                  className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-colors ${
                    activeChapter.status === 'done'
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {activeChapter.status === 'done' ? 'Selesai ✓' : 'Tandai Selesai'}
                </button>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block">
                  Kerangka Adegan Bab Ini
                </label>
                <textarea
                  rows={2}
                  value={chapterOutline}
                  onChange={(e) => setChapterOutline(e.target.value)}
                  onBlur={() => onSaveChapterMeta({ outline_notes: chapterOutline })}
                  placeholder="Rencana peristiwa yang harus terjadi di bab ini..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-2.5 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Ringkasan Memori Bab
                  </label>
                  <button
                    type="button"
                    disabled={summarizing}
                    onClick={onSummarizeChapter}
                    className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    {summarizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    <span>Ringkas Otomatis</span>
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={chapterSummary}
                  onChange={(e) => setChapterSummary(e.target.value)}
                  onBlur={() => onSaveChapterMeta({ summary: chapterSummary })}
                  placeholder="Ringkasan bab ini akan dibaca AI saat kamu menulis bab-bab berikutnya..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-2.5 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          </>
        )}

        {tab === 'cast' && (
          <div className="space-y-4">
            <div className="space-y-2.5">
              {castDraft.length === 0 ? (
                <p className="text-slate-400 text-xs">
                  Belum ada pemeran terdaftar. Tambahkan karakter Naravia atau tokoh lokal di bawah.
                </p>
              ) : (
                castDraft.map((m, idx) => (
                  <div
                    key={`${m.name}-${idx}`}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <CharacterAvatar name={m.name} avatar={m.avatar || ''} size="xs" />
                        <span className="font-semibold text-slate-900 dark:text-white truncate">{m.name}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <select
                          value={m.role_in_story}
                          onChange={(e) =>
                            setCastDraft((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, role_in_story: e.target.value as any } : item))
                            )
                          }
                          className="h-6 px-1.5 py-0 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[10px] text-slate-700 dark:text-slate-200"
                        >
                          <option value="protagonis">Protagonis</option>
                          <option value="antagonis">Antagonis</option>
                          <option value="pendukung">Pendukung</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => setCastDraft((prev) => prev.filter((_, i) => i !== idx))}
                          className="p-1 text-slate-400 hover:text-rose-500"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <input
                      type="text"
                      value={m.current_state || ''}
                      onChange={(e) =>
                        setCastDraft((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, current_state: e.target.value } : item))
                        )
                      }
                      placeholder="Kondisi terkini di cerita (mis: terluka, curiga, di stasiun...)"
                      className="w-full h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px] text-slate-800 dark:text-slate-100"
                    />
                  </div>
                ))
              )}
            </div>

            {personas.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Users className="w-3 h-3 text-indigo-500" />
                  <span>Impor dari Persona Kamu</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {personas.slice(0, 8).map((p) => {
                    const added = castDraft.some(
                      (c) =>
                        c.persona_id === p.id ||
                        c.name.trim().toLowerCase() === String(p.display_name || '').trim().toLowerCase()
                    );
                    if (added) return null;
                    const bioParts = [
                      p.description?.trim() || '',
                      p.likes?.trim() ? `Menyukai: ${p.likes.trim()}` : '',
                      p.dislikes?.trim() ? `Tidak menyukai: ${p.dislikes.trim()}` : '',
                    ].filter(Boolean);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          setCastDraft((prev) => [
                            {
                              character_id: null,
                              persona_id: p.id,
                              name: p.display_name,
                              role_in_story: 'protagonis',
                              bio: bioParts.join('\n'),
                              current_state: '',
                              avatar: p.avatar || '',
                            },
                            ...prev,
                          ])
                        }
                        className="h-7 px-2.5 rounded-full border border-indigo-200 dark:border-indigo-800 hover:border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/30 text-[11px] text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{p.display_name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {characters.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  <span>Impor dari Karakter Naravia</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {characters.slice(0, 10).map((ch) => {
                    const added = castDraft.some((c) => c.character_id === ch.id);
                    if (added) return null;
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() =>
                          setCastDraft((prev) => [
                            ...prev,
                            {
                              character_id: ch.id,
                              name: ch.name,
                              role_in_story: prev.length === 0 ? 'protagonis' : 'pendukung',
                              bio: ch.tagline || ch.description || '',
                              current_state: '',
                              avatar: ch.avatar || '',
                            },
                          ])
                        }
                        className="h-7 px-2.5 rounded-full border border-slate-200 dark:border-slate-700 hover:border-indigo-500 text-[11px] text-slate-700 dark:text-slate-200 inline-flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3 text-indigo-500" />
                        <span>{ch.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Tambah Tokoh Baru</p>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nama tokoh..."
                  className="flex-1 h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                />
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as any)}
                  className="h-8 px-1.5 py-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px]"
                >
                  <option value="protagonis">Protag.</option>
                  <option value="antagonis">Antag.</option>
                  <option value="pendukung">Pendukung</option>
                </select>
              </div>
              <input
                type="text"
                value={newBio}
                onChange={(e) => setNewBio(e.target.value)}
                placeholder="Profil singkat..."
                className="w-full h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
              />
              <button
                type="button"
                disabled={!newName.trim()}
                onClick={() => {
                  setCastDraft((prev) => [
                    ...prev,
                    {
                      character_id: null,
                      name: newName.trim(),
                      role_in_story: newRole,
                      bio: newBio.trim(),
                      current_state: '',
                      avatar: '',
                    },
                  ]);
                  setNewName('');
                  setNewBio('');
                }}
                className="w-full h-8 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-40"
              >
                + Masukkan ke Daftar
              </button>
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={() => runSave(() => onSaveStory({ cast: castDraft }))}
              className="w-full h-9 rounded-xl bg-slate-900 dark:bg-indigo-600 hover:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50"
            >
              {saving ? 'Menyimpan...' : 'Simpan Daftar Pemeran'}
            </button>
          </div>
        )}

        {tab === 'context' && (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-indigo-500" />
                <span>Inspektor Konteks AI</span>
              </span>
              <button
                type="button"
                onClick={loadContext}
                disabled={loadingContext}
                className="p-1 rounded-lg text-slate-400 hover:text-indigo-500"
                title="Muat ulang konteks"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingContext ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1">
                <Globe className="w-3 h-3 text-teal-500" />
                <span>Dunia &amp; Lorebook Tertaut</span>
              </label>
              <select
                value={worldId}
                onChange={(e) => {
                  const next = e.target.value;
                  setWorldId(next);
                  runSave(async () => {
                    await onSaveStory({ world_id: next || null });
                    await loadContext();
                  });
                }}
                className="w-full h-9 px-2.5 py-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              >
                <option value="">Tanpa Dunia Tertaut</option>
                {worlds.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            {loadingContext ? (
              <p className="text-slate-400 py-4 text-center">Menganalisis konteks prompt...</p>
            ) : contextData ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70">
                    <p className="text-[10px] text-slate-400 uppercase">Estimasi Prompt</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      ~{Number(contextData.estimatedPromptTokens || 0).toLocaleString('id-ID')} tok
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70">
                    <p className="text-[10px] text-slate-400 uppercase">Lore Terdeteksi</p>
                    <p className="text-sm font-bold text-teal-600 dark:text-teal-400">
                      {(contextData.matchedLore || []).length} entri
                    </p>
                  </div>
                </div>

                {contextData.manuscriptTruncated && (
                  <p className="text-[11px] p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
                    Naskah bab ini cukup panjang; AI otomatis membaca bagian akhir bab + seluruh ringkasan bab
                    sebelumnya agar hemat token.
                  </p>
                )}

                {(contextData.matchedLore || []).length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      Lorebook Aktif di Adegan Ini:
                    </p>
                    {contextData.matchedLore.map((l: any) => (
                      <div
                        key={l.id}
                        className="p-2.5 rounded-xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/70 dark:border-teal-800/60 space-y-0.5"
                      >
                        <p className="font-semibold text-teal-900 dark:text-teal-200">{l.title}</p>
                        <p className="text-[10px] text-teal-700 dark:text-teal-400">
                          Kata pemicu: {(l.matchedKeywords || []).join(', ')}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {(contextData.previousChaptersIncluded || []).length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      Memori Bab Sebelumnya:
                    </p>
                    {contextData.includesPreviousEndingTail && (
                      <p className="text-[11px] p-2 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-300">
                        2–3 paragraf terakhir bab sebelumnya ikut disuntikkan agar transisi bab menyambung mulus.
                      </p>
                    )}
                    {contextData.previousChaptersIncluded.map((ch: any) => (
                      <div key={ch.chapter_number} className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="truncate">
                          Bab {ch.chapter_number}: {ch.title}
                        </span>
                        <span className={ch.hasSummary ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'}>
                          {ch.hasSummary ? 'Ringkasan' : 'Awal+Akhir'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {tab === 'info' && (
          <div className="space-y-3.5">
            {/* Publikasi & Status Novel */}
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800 dark:text-slate-100">Visibilitas Cerita</span>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    runSave(() =>
                      onSaveStory({ visibility: story.visibility === 'public' ? 'private' : 'public' })
                    )
                  }
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 border transition-colors ${
                    story.visibility === 'public'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {story.visibility === 'public' ? <Globe2 className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                  <span>{story.visibility === 'public' ? 'Publik di Jelajah' : 'Pribadi'}</span>
                </button>
              </div>
              {story.visibility === 'public' && (
                <button
                  type="button"
                  onClick={handleCopyPublicLink}
                  className="w-full h-7 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-medium text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5"
                >
                  {copiedLink ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedLink ? 'Tautan Baca Disalin!' : 'Salin Tautan Baca Publik'}</span>
                </button>
              )}

              <div className="flex items-center justify-between pt-1 border-t border-slate-200/70 dark:border-slate-700/60">
                <span className="font-semibold text-slate-800 dark:text-slate-100">Status Novel</span>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    runSave(() =>
                      onSaveStory({ status: story.status === 'completed' ? 'ongoing' : 'completed' })
                    )
                  }
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                >
                  {story.status === 'completed' ? 'Tamat ✓' : 'Sedang Ditulis'}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-200 block">Judul Novel</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-200 block">Genre</label>
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="w-full h-9 px-2.5 py-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
              >
                {STORY_GENRES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-200 block">Tag (pisah koma)</label>
              <input
                type="text"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-200 block">Sinopsis</label>
              <textarea
                rows={4}
                value={synopsis}
                onChange={(e) => setSynopsis(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-2.5 text-xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="flex-1 h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer">
                {uploadingCover ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                <span>{coverImage ? 'Ganti Sampul' : 'Unggah Sampul'}</span>
                <input type="file" accept="image/*" onChange={handleUploadCover} className="hidden" />
              </label>
              {coverImage && (
                <button
                  type="button"
                  onClick={() => {
                    setCoverImage('');
                    runSave(() => onSaveStory({ cover_image: '' }));
                  }}
                  className="h-8 px-2.5 rounded-lg text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  Hapus
                </button>
              )}
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={() =>
                runSave(() =>
                  onSaveStory({
                    title: title.trim() || story.title,
                    genre,
                    synopsis,
                    tags: tagsText
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                )
              }
              className="w-full h-9 rounded-xl bg-slate-900 dark:bg-indigo-600 hover:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50"
            >
              {saving ? 'Menyimpan...' : 'Simpan Info Novel'}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop xl+: docked */}
      <aside className="hidden xl:block shrink-0 h-full">{panel}</aside>
      {/* < xl: slide-over overlay */}
      <div className="xl:hidden fixed inset-0 z-40 flex justify-end">
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs" onClick={onClose} />
        <div className="relative z-10 h-full shadow-2xl">{panel}</div>
      </div>
    </>
  );
}
