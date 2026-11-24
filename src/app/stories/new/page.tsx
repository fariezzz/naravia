'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Feather,
  Globe,
  ImagePlus,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import CharacterAvatar from '@/components/CharacterAvatar';
import StoryCover from '@/components/stories/StoryCover';
import {
  STORY_GENRES,
  STORY_LENGTH_PRESETS,
  STORY_POVS,
  STORY_TONES,
} from '@/lib/storyConstants';
import type { StoryLengthPreset, StoryPov, StoryTone } from '@/lib/db';

interface CastDraft {
  character_id?: string | null;
  persona_id?: string | null;
  name: string;
  role_in_story: 'protagonis' | 'antagonis' | 'pendukung';
  bio: string;
  avatar?: string;
}

interface PersonaOption {
  id: string;
  display_name: string;
  avatar: string;
  description: string;
  likes: string;
  dislikes: string;
  is_default: boolean;
}

interface ChapterDraft {
  title: string;
  outline_notes: string;
}

function buildPersonaSummary(p: PersonaOption): string {
  const parts: string[] = [];
  if (p.description?.trim()) parts.push(p.description.trim());
  if (p.likes?.trim()) parts.push(`Menyukai: ${p.likes.trim()}`);
  if (p.dislikes?.trim()) parts.push(`Tidak menyukai: ${p.dislikes.trim()}`);
  return parts.join('\n').trim();
}

export default function NewStoryPage() {
  const router = useRouter();
  const [characters, setCharacters] = useState<any[]>([]);
  const [worlds, setWorlds] = useState<any[]>([]);
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [usePersonaProtagonist, setUsePersonaProtagonist] = useState(false);
  const [selectedPersonaId, setSelectedPersonaId] = useState('');

  const [premiseInput, setPremiseInput] = useState('');
  const [brainstorming, setBrainstorming] = useState(false);

  const [title, setTitle] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [genre, setGenre] = useState<string>('Fantasi');
  const [tagsInput, setTagsInput] = useState('');
  const [worldId, setWorldId] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);

  const [pov, setPov] = useState<StoryPov>('third_limited');
  const [tone, setTone] = useState<StoryTone>('sinematik');
  const [lengthPreset, setLengthPreset] = useState<StoryLengthPreset>('sedang');
  const [authorsNote, setAuthorsNote] = useState('');
  const [openingParagraph, setOpeningParagraph] = useState('');
  const [chapters, setChapters] = useState<ChapterDraft[]>([{ title: 'Bab 1: Permulaan', outline_notes: '' }]);

  const [cast, setCast] = useState<CastDraft[]>([]);
  const [localName, setLocalName] = useState('');
  const [localRole, setLocalRole] = useState<'protagonis' | 'antagonis' | 'pendukung'>('protagonis');
  const [localBio, setLocalBio] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/characters').then((r) => (r.ok ? r.json() : { characters: [] })),
      fetch('/api/worlds').then((r) => (r.ok ? r.json() : { worlds: [] })),
      fetch('/api/persona').then((r) => (r.ok ? r.json() : { personas: [] })),
    ])
      .then(([charData, worldData, personaData]) => {
        setCharacters(charData.characters || []);
        setWorlds(worldData.worlds || []);
        const pList: PersonaOption[] = (personaData.personas || []).filter(Boolean);
        setPersonas(pList);
        const def = pList.find((p) => p.is_default) || pList[0];
        if (def) setSelectedPersonaId(def.id);
      })
      .catch(() => undefined);
  }, []);

  const selectedPersona = personas.find((p) => p.id === selectedPersonaId) || personas[0] || null;

  const syncPersonaInCast = (enabled: boolean, personaObj: PersonaOption | null) => {
    setCast((prev) => {
      const withoutPersona = prev.filter((m) => !m.persona_id);
      if (!enabled || !personaObj) return withoutPersona;
      return [
        {
          character_id: null,
          persona_id: personaObj.id,
          name: personaObj.display_name,
          role_in_story: 'protagonis',
          bio: buildPersonaSummary(personaObj),
          avatar: personaObj.avatar || '',
        },
        ...withoutPersona,
      ];
    });
  };

  const handleTogglePersona = () => {
    if (!selectedPersona) return;
    const next = !usePersonaProtagonist;
    setUsePersonaProtagonist(next);
    syncPersonaInCast(next, selectedPersona);
  };

  const handleChangeSelectedPersona = (nextId: string) => {
    setSelectedPersonaId(nextId);
    const found = personas.find((p) => p.id === nextId) || null;
    if (usePersonaProtagonist) {
      syncPersonaInCast(true, found);
    }
  };

  const handleBrainstorm = async () => {
    if (premiseInput.trim().length < 6) {
      setError('Tulis minimal 1 kalimat premis agar AI bisa merancang konsep novelmu.');
      return;
    }
    setBrainstorming(true);
    setError('');
    try {
      const selectedWorld = worlds.find((w) => w.id === worldId);
      const res = await fetch('/api/stories/brainstorm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          premise: premiseInput.trim(),
          genre,
          tone,
          pov,
          worldName: selectedWorld?.name,
          personaId: usePersonaProtagonist && selectedPersona ? selectedPersona.id : undefined,
          castNames: cast.map((c) => c.name),
          castProfiles: cast.map((c) => ({
            name: c.name,
            role: c.role_in_story,
            bio: c.bio,
          })),
        }),
      });
      const rawText = await res.text();
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        throw new Error(
          res.status >= 500
            ? `Server atau proxy mengembalikan error (HTTP ${res.status}). Silakan coba klik Susun Konsep lagi.`
            : `Respons server tidak valid (HTTP ${res.status}).`
        );
      }
      if (!res.ok) throw new Error(data.error || 'Gagal menyusun konsep.');
      const c = data.concept;
      if (c.title) setTitle(c.title);
      if (c.synopsis) setSynopsis(c.synopsis);
      if (c.genre) setGenre(c.genre);
      if (Array.isArray(c.tags) && c.tags.length > 0) setTagsInput(c.tags.join(', '));
      if (c.authors_note) setAuthorsNote(c.authors_note);
      if (Array.isArray(c.chapters) && c.chapters.length > 0) setChapters(c.chapters);
      if (c.opening_paragraph) setOpeningParagraph(c.opening_paragraph);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyusun konsep cerita.');
    } finally {
      setBrainstorming(false);
    }
  };

  const handleUploadCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('aspect', 'cover');
      if (coverImage.startsWith('/uploads/')) fd.append('previousAvatarUrl', coverImage);
      const res = await fetch('/api/avatar', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengunggah sampul.');
      setCoverImage(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengunggah sampul.');
    } finally {
      setUploadingCover(false);
      e.target.value = '';
    }
  };

  const toggleNaraviaCharacter = (char: any) => {
    const exists = cast.some((c) => c.character_id === char.id);
    if (exists) {
      setCast((prev) => prev.filter((c) => c.character_id !== char.id));
    } else {
      setCast((prev) => [
        ...prev,
        {
          character_id: char.id,
          name: char.name,
          role_in_story: prev.length === 0 ? 'protagonis' : 'pendukung',
          bio: char.tagline || char.description || '',
          avatar: char.avatar || '',
        },
      ]);
    }
  };

  const handleAddLocalCast = () => {
    const name = localName.trim();
    if (!name) return;
    setCast((prev) => [
      ...prev,
      { character_id: null, name, role_in_story: localRole, bio: localBio.trim(), avatar: '' },
    ]);
    setLocalName('');
    setLocalBio('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Judul cerita wajib diisi.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          synopsis: synopsis.trim(),
          genre,
          tags: tagsInput
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          world_id: worldId || null,
          cover_image: coverImage,
          pov,
          tone,
          length_preset: lengthPreset,
          authors_note: authorsNote.trim(),
          opening_paragraph: openingParagraph.trim(),
          chapters: chapters.filter((ch) => ch.title.trim()),
          cast,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal membuat cerita.');
      router.push(`/stories/${data.story.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat cerita.');
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
      <header className="flex items-center gap-3">
        <Link
          href="/stories"
          className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 inline-flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-slate-900 dark:text-white">Mulai Cerita Baru</h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Rancang konsep secara cepat lewat Brainstorm AI atau susun langsung sesuai gayamu.
          </p>
        </div>
      </header>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Kotak AI Brainstorm */}
      <section className="rounded-2xl border border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/25 p-5 space-y-3">
        <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300">
          <Sparkles className="w-4 h-4 shrink-0" />
          <h2 className="text-sm font-semibold">Pemantik Konsep dengan AI (Opsional)</h2>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          Punya ide sekilas? Tulis 1–2 kalimat premis di bawah, lalu AI akan membantu merumuskan judul, sinopsis,
          kerangka 3 bab awal, dan paragraf pembuka yang bisa langsung kamu sunting.
        </p>
        <div className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            value={premiseInput}
            onChange={(e) => setPremiseInput(e.target.value)}
            placeholder="Contoh: Seorang penjaga mercusuar tua menemukan surat dari masa depan yang menyelamatkan kotanya..."
            className="w-full sm:flex-1 h-10 px-3.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="button"
            disabled={brainstorming || premiseInput.trim().length < 6}
            onClick={handleBrainstorm}
            className="w-full sm:w-auto h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            {brainstorming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>{brainstorming ? 'Merancang...' : 'Susun Konsep'}</span>
          </button>
        </div>

        {selectedPersona && (
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={handleTogglePersona}
              aria-pressed={usePersonaProtagonist}
              className={`h-8 pl-1.5 pr-3 rounded-full border text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                usePersonaProtagonist
                  ? 'border-indigo-600 bg-indigo-600 text-white shadow-2xs'
                  : 'border-indigo-200 dark:border-indigo-800 bg-white/80 dark:bg-slate-900/80 text-slate-700 dark:text-slate-200 hover:border-indigo-400'
              }`}
            >
              <CharacterAvatar name={selectedPersona.display_name} avatar={selectedPersona.avatar} size="xs" />
              <span>
                {usePersonaProtagonist
                  ? `Persona "${selectedPersona.display_name}" jadi tokoh utama ✓`
                  : `Libatkan Persona saya (${selectedPersona.display_name})`}
              </span>
            </button>

            {personas.length > 1 && (
              <select
                value={selectedPersona.id}
                onChange={(e) => handleChangeSelectedPersona(e.target.value)}
                aria-label="Pilih Persona"
                className="h-8 px-2.5 py-0 rounded-full border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                    {p.is_default ? ' (Bawaan)' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </section>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Kolom Utama (2/3) */}
        <div className="lg:col-span-2 space-y-5">
          {/* Identitas Novel */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Identitas Novel</h2>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Judul Novel *
              </label>
              <input
                type="text"
                required
                maxLength={140}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contoh: Surat dari Stasiun Utara"
                className="w-full h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Genre</label>
                <select
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  className="w-full h-10 px-3 py-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  {STORY_GENRES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Tag Tema (pisah koma)
                </label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="hujan, rahasia, persahabatan"
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Sinopsis / Premis Utama
              </label>
              <textarea
                rows={3}
                value={synopsis}
                onChange={(e) => setSynopsis(e.target.value)}
                placeholder="Ringkasan konflik utama, latar, dan inti perjalanan ceritamu..."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {worlds.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>Tautkan Dunia &amp; Lorebook (Opsional)</span>
                </label>
                <select
                  value={worldId}
                  onChange={(e) => setWorldId(e.target.value)}
                  className="w-full h-10 px-3 py-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Tanpa Dunia Tertaut</option>
                  {worlds.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Entri Lorebook dari dunia terpilih akan otomatis disuntikkan ke AI saat kata kuncinya muncul di naskah.
                </p>
              </div>
            )}
          </section>

          {/* Sudut Pandang & Gaya Prosa */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Sudut Pandang &amp; Gaya Prosa</h2>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Sudut Pandang (POV)</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {STORY_POVS.map((item) => {
                  const active = pov === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setPov(item.value)}
                      className={`p-3 rounded-xl border text-left transition-all space-y-1.5 ${
                        active
                          ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 ring-1 ring-indigo-600/30'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <p className="text-xs font-semibold text-slate-900 dark:text-white">{item.shortLabel}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{item.description}</p>
                      <p className="text-[11px] italic font-serif text-slate-600 dark:text-slate-300 pt-1 border-t border-slate-200/70 dark:border-slate-800">
                        &ldquo;{item.sample}&rdquo;
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Gaya Prosa &amp; Atmosfer</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {STORY_TONES.map((item) => {
                  const active = tone === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setTone(item.value)}
                      className={`p-3 rounded-xl border text-left transition-all space-y-1 ${
                        active
                          ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 ring-1 ring-indigo-600/30'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <p className="text-xs font-semibold text-slate-900 dark:text-white">{item.label}</p>
                      <p className="text-[11px] italic font-serif text-slate-600 dark:text-slate-300 leading-relaxed">
                        &ldquo;{item.sample}&rdquo;
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Panjang Tiap Generasi AI
                </label>
                <select
                  value={lengthPreset}
                  onChange={(e) => setLengthPreset(e.target.value as StoryLengthPreset)}
                  className="w-full h-10 px-3 py-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  {STORY_LENGTH_PRESETS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Catatan Sutradara Awal (Opsional)
                </label>
                <input
                  type="text"
                  value={authorsNote}
                  onChange={(e) => setAuthorsNote(e.target.value)}
                  placeholder="Misal: Fokus ketegangan perlahan, hindari humor berlebih"
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </section>

          {/* Pemeran Novel (Cast) */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Daftar Pemeran ({cast.length})</span>
              </h2>
              <span className="text-[11px] text-slate-400">Opsional — bisa diubah kapan saja</span>
            </div>

            {characters.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Pilih cepat dari koleksi Karakter Naraviamu:
                </p>
                <div className="flex flex-wrap gap-2">
                  {characters.slice(0, 12).map((ch) => {
                    const selected = cast.some((c) => c.character_id === ch.id);
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => toggleNaraviaCharacter(ch)}
                        className={`h-8 pl-1.5 pr-3 rounded-full border text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                          selected
                            ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                            : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <CharacterAvatar name={ch.name} avatar={ch.avatar} size="xs" />
                        <span>{ch.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tambah tokoh lokal khusus cerita */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 space-y-2.5">
              <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5" />
                <span>Atau tambah tokoh khusus cerita ini</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={localName}
                  onChange={(e) => setLocalName(e.target.value)}
                  placeholder="Nama tokoh..."
                  className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                />
                <select
                  value={localRole}
                  onChange={(e) => setLocalRole(e.target.value as any)}
                  className="h-9 px-2.5 py-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                >
                  <option value="protagonis">Protagonis</option>
                  <option value="antagonis">Antagonis</option>
                  <option value="pendukung">Pendukung</option>
                </select>
                <button
                  type="button"
                  onClick={handleAddLocalCast}
                  disabled={!localName.trim()}
                  className="h-9 px-3 rounded-lg bg-slate-900 dark:bg-indigo-600 hover:bg-indigo-600 dark:hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Tokoh</span>
                </button>
              </div>
              <input
                type="text"
                value={localBio}
                onChange={(e) => setLocalBio(e.target.value)}
                placeholder="Sifat & peran singkat (opsional)..."
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>

            {cast.length > 0 && (
              <div className="space-y-2">
                {cast.map((member, idx) => (
                  <div
                    key={`${member.name}-${idx}`}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CharacterAvatar name={member.name} avatar={member.avatar || ''} size="sm" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{member.name}</p>
                        {member.bio && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{member.bio}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <select
                        value={member.role_in_story}
                        onChange={(e) =>
                          setCast((prev) =>
                            prev.map((m, i) => (i === idx ? { ...m, role_in_story: e.target.value as any } : m))
                          )
                        }
                        className="h-7 px-2 py-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px] text-slate-700 dark:text-slate-200"
                      >
                        <option value="protagonis">Protagonis</option>
                        <option value="antagonis">Antagonis</option>
                        <option value="pendukung">Pendukung</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          if (member.persona_id) setUsePersonaProtagonist(false);
                          setCast((prev) => prev.filter((_, i) => i !== idx));
                        }}
                        className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 inline-flex items-center justify-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Kerangka Bab & Paragraf Pembuka (opsional / terisi dari Brainstorm) */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Kerangka Bab Awal</h2>
              <button
                type="button"
                onClick={() =>
                  setChapters((prev) => [...prev, { title: `Bab ${prev.length + 1}`, outline_notes: '' }])
                }
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Bab</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {chapters.map((ch, idx) => (
                <div key={idx} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
                      #{idx + 1}
                    </span>
                    <input
                      type="text"
                      value={ch.title}
                      onChange={(e) =>
                        setChapters((prev) => prev.map((item, i) => (i === idx ? { ...item, title: e.target.value } : item)))
                      }
                      placeholder={`Judul Bab ${idx + 1}`}
                      className="flex-1 h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-semibold text-slate-900 dark:text-slate-100"
                    />
                    {chapters.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setChapters((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-rose-500 p-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={ch.outline_notes}
                    onChange={(e) =>
                      setChapters((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, outline_notes: e.target.value } : item))
                      )
                    }
                    placeholder="Rencana singkat adegan bab ini (opsional)..."
                    className="w-full h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-300"
                  />
                </div>
              ))}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Paragraf Pembuka Bab 1 (Opsional)
              </label>
              <textarea
                rows={4}
                spellCheck={false}
                value={openingParagraph}
                onChange={(e) => setOpeningParagraph(e.target.value)}
                placeholder="Kosongkan jika kamu ingin AI langsung menulis paragraf pembuka di dalam Studio..."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-3 text-sm font-serif leading-relaxed text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </section>
        </div>

        {/* Kolom Kanan (1/3): Pratinjau Sampul & Tombol Simpan */}
        <aside className="space-y-4">
          <div className="lg:sticky lg:top-20 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Pratinjau Sampul
            </p>
            <StoryCover
              title={title.trim() || 'Judul Novelmu'}
              genre={genre}
              coverImage={coverImage}
              className="aspect-[2/3] w-full max-w-[230px] mx-auto rounded-xl shadow-md"
            />

            <div className="flex items-center justify-center gap-2">
              <label className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer transition-colors">
                {uploadingCover ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                <span>{coverImage ? 'Ganti Sampul' : 'Unggah Sampul'}</span>
                <input type="file" accept="image/*" onChange={handleUploadCover} className="hidden" />
              </label>
              {coverImage && (
                <button
                  type="button"
                  onClick={() => setCoverImage('')}
                  className="h-8 px-2.5 rounded-lg text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  Hapus
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || !title.trim()}
              className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-xs transition-colors"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Feather className="w-4 h-4" />}
              <span>{submitting ? 'Menyiapkan Studio...' : 'Buka Studio Menulis'}</span>
            </button>
          </div>
        </aside>
      </form>
    </div>
  );
}
