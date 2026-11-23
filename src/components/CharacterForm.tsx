'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  Palette,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import CharacterAvatar from './CharacterAvatar';
import ImageCropModal from './ImageCropModal';
import CharacterPreviewSidebar from './character-form/CharacterPreviewSidebar';
import ImportCardPanel from './character-form/ImportCardPanel';
import ResearchNotesPanel from './character-form/ResearchNotesPanel';
import ResearchWizardPanel from './character-form/ResearchWizardPanel';

export interface CharacterFormValues {
  id?: string;
  name: string;
  tagline: string;
  avatar: string;
  description: string;
  personality: string;
  speaking_style: string;
  scenario: string;
  greeting: string[];
  example_dialogues: Array<{ user: string; char: string }>;
  tags: string[];
  world_id: string | null;
  visibility: 'private' | 'public';
  allow_remix: boolean;
  temperature_override: string;
  research_notes: {
    mode: string;
    summary: string;
    sources: string[];
    uncertainFields: string[];
  };
}

interface CharacterFormProps {
  initialValues?: Partial<CharacterFormValues>;
  initialTab?: 'auto' | 'manual' | 'import';
  isEdit?: boolean;
}

export default function CharacterForm({
  initialValues,
  initialTab = 'auto',
  isEdit = false,
}: CharacterFormProps) {
  const router = useRouter();
  const [activeMode, setActiveMode] = useState<'auto' | 'manual' | 'import'>(isEdit ? 'manual' : initialTab);

  const [ideaInput, setIdeaInput] = useState('');
  const [charTypeHint, setCharTypeHint] = useState<'auto' | 'existing' | 'original'>('auto');
  const [manualResearchText, setManualResearchText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [worlds, setWorlds] = useState<Array<{ id: string; name: string }>>([]);

  const [form, setForm] = useState<CharacterFormValues>({
    name: initialValues?.name || '',
    tagline: initialValues?.tagline || '',
    avatar: initialValues?.avatar || '',
    description: initialValues?.description || '',
    personality: initialValues?.personality || '',
    speaking_style: initialValues?.speaking_style || '',
    scenario: initialValues?.scenario || '',
    greeting: initialValues?.greeting && initialValues.greeting.length > 0 ? initialValues.greeting : [''],
    example_dialogues:
      initialValues?.example_dialogues && initialValues.example_dialogues.length > 0
        ? initialValues.example_dialogues
        : [{ user: '', char: '' }],
    tags: initialValues?.tags || [],
    world_id: initialValues?.world_id || null,
    visibility: initialValues?.visibility === 'public' ? 'public' : 'private',
    allow_remix: Boolean(initialValues?.allow_remix),
    temperature_override:
      initialValues?.temperature_override !== undefined && initialValues?.temperature_override !== null
        ? String(initialValues.temperature_override)
        : '',
    research_notes: initialValues?.research_notes || {
      mode: 'manual',
      summary: '',
      sources: [],
      uncertainFields: [],
    },
  });

  const [tagInput, setTagInput] = useState((initialValues?.tags || []).join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);

  const [previewMessages, setPreviewMessages] = useState<Array<{ role: 'user' | 'character'; content: string }>>([]);
  const [previewInput, setPreviewInput] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const [revisionInput, setRevisionInput] = useState('');
  const [revising, setRevising] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{ valid: boolean; explanation: string } | null>(null);
  const [sanitizing, setSanitizing] = useState(false);

  useEffect(() => {
    fetch('/api/worlds')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.worlds)) {
          setWorlds(d.worlds.map((w: any) => ({ id: w.id, name: w.name })));
        }
      })
      .catch(() => {});
  }, []);

  const handleGenerateAuto = async () => {
    if (!ideaInput.trim()) {
      setError('Tuliskan minimal satu kalimat ide karakter terlebih dahulu.');
      return;
    }
    setGenerating(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idea: ideaInput,
          characterTypeHint: charTypeHint,
          manualResearchText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal membuat draf karakter otomatis.');

      const draft = data.draft;
      setForm((prev) => ({
        ...prev,
        name: draft.name || prev.name,
        tagline: draft.tagline || '',
        description: draft.description || '',
        personality: draft.personality || '',
        speaking_style: draft.speaking_style || '',
        scenario: draft.scenario || '',
        greeting: Array.isArray(draft.greeting) && draft.greeting.length > 0 ? draft.greeting : [''],
        example_dialogues:
          Array.isArray(draft.example_dialogues) && draft.example_dialogues.length > 0
            ? draft.example_dialogues
            : [{ user: '', char: '' }],
        tags: Array.isArray(draft.tags) ? draft.tags : [],
        research_notes: draft.research_notes || { mode: 'original', summary: '', sources: [], uncertainFields: [] },
      }));
      setTagInput(Array.isArray(draft.tags) ? draft.tags.join(', ') : '');
      setPreviewMessages(draft.greeting?.[0] ? [{ role: 'character', content: draft.greeting[0] }] : []);
      setNotice('Draf karakter selesai dibuat oleh AI. Silakan tinjau dan sunting isinya di bawah sebelum menyimpan.');
      setActiveMode('manual');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat karakter otomatis.');
    } finally {
      setGenerating(false);
    }
  };

  const handleImportCardFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setError('');
    setNotice('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengimpor kartu karakter.');

      const draft = data.draft;
      setForm((prev) => ({
        ...prev,
        name: draft.name || '',
        tagline: draft.tagline || '',
        avatar: draft.avatar || prev.avatar,
        description: draft.description || '',
        personality: draft.personality || '',
        speaking_style: draft.speaking_style || '',
        scenario: draft.scenario || '',
        greeting: Array.isArray(draft.greeting) && draft.greeting.length > 0 ? draft.greeting : [''],
        example_dialogues:
          Array.isArray(draft.example_dialogues) && draft.example_dialogues.length > 0
            ? draft.example_dialogues
            : [{ user: '', char: '' }],
        tags: Array.isArray(draft.tags) ? draft.tags : [],
        research_notes: draft.research_notes || {
          mode: 'import',
          summary: 'Diimpor dari kartu karakter.',
          sources: [],
          uncertainFields: [],
        },
      }));
      setTagInput(Array.isArray(draft.tags) ? draft.tags.join(', ') : '');
      setNotice('Kartu karakter berhasil dibaca. Tinjau kembali isinya di bawah sebelum menekan Simpan.');
      setActiveMode('manual');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membaca file kartu.');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const handleSanitizeMetaSentences = async () => {
    setSanitizing(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'sanitize',
          fields: {
            description: form.description,
            personality: form.personality,
            speaking_style: form.speaking_style,
            scenario: form.scenario,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal membersihkan kalimat meta.');

      setForm((prev) => ({
        ...prev,
        description: data.fields.description ?? prev.description,
        personality: data.fields.personality ?? prev.personality,
        speaking_style: data.fields.speaking_style ?? prev.speaking_style,
        scenario: data.fields.scenario ?? prev.scenario,
      }));
      setNotice('Kalimat meta AI berhasil dibersihkan dari kolom personalisasi. Periksa hasilnya, lalu simpan jika sudah sesuai.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membersihkan kalimat meta.');
    } finally {
      setSanitizing(false);
    }
  };

  const handleApplyRevision = async () => {
    if (!revisionInput.trim()) {
      setError('Tuliskan poin revisi atau fakta yang ingin Anda perbaiki terlebih dahulu.');
      return;
    }
    setRevising(true);
    setError('');
    setNotice('');
    setVerificationResult(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'revise',
          currentDraft: {
            name: form.name,
            tagline: form.tagline,
            description: form.description,
            personality: form.personality,
            speaking_style: form.speaking_style,
            scenario: form.scenario,
            greeting: form.greeting,
            example_dialogues: form.example_dialogues,
            tags: form.tags,
            research_notes: form.research_notes,
          },
          revisionRequest: revisionInput.trim(),
          characterTypeHint: charTypeHint,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memproses revisi riset.');

      const revisedDraft = data.draft;
      setVerificationResult(data.verification);

      setForm((prev) => ({
        ...prev,
        name: revisedDraft.name || prev.name,
        tagline: revisedDraft.tagline || prev.tagline,
        description: revisedDraft.description || prev.description,
        personality: revisedDraft.personality || prev.personality,
        speaking_style: revisedDraft.speaking_style || prev.speaking_style,
        scenario: revisedDraft.scenario || prev.scenario,
        greeting: Array.isArray(revisedDraft.greeting) && revisedDraft.greeting.length > 0 ? revisedDraft.greeting : prev.greeting,
        example_dialogues:
          Array.isArray(revisedDraft.example_dialogues) && revisedDraft.example_dialogues.length > 0
            ? revisedDraft.example_dialogues
            : prev.example_dialogues,
        tags: Array.isArray(revisedDraft.tags) ? revisedDraft.tags : prev.tags,
        research_notes: revisedDraft.research_notes || prev.research_notes,
      }));
      setTagInput(Array.isArray(revisedDraft.tags) ? revisedDraft.tags.join(', ') : '');
      if (revisedDraft.greeting?.[0]) setPreviewMessages([{ role: 'character', content: revisedDraft.greeting[0] }]);

      if (data.verification?.valid) {
        setNotice('Revisi riset diverifikasi sesuai fakta dan draf karakter berhasil diperbarui!');
        setRevisionInput('');
      } else {
        setNotice('Catatan verifikasi: Revisi mengandung hal yang tidak sesuai dengan fakta kanon/resmi. Simak penjelasannya di bawah.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memproses revisi riset.');
    } finally {
      setRevising(false);
    }
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setCropImageSrc(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleConfirmCroppedAvatar = async (blob: Blob) => {
    setError('');
    try {
      const ext = blob.type === 'image/webp' ? '.webp' : '.png';
      const fd = new FormData();
      fd.append('file', new File([blob], `avatar-${Date.now()}${ext}`, { type: blob.type || 'image/webp' }));
      if (form.avatar && form.avatar.startsWith('/uploads/')) fd.append('previousAvatarUrl', form.avatar);
      const res = await fetch('/api/avatar', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengunggah avatar.');
      setForm((prev) => ({ ...prev, avatar: data.avatarUrl }));
      setCropImageSrc(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengunggah avatar.');
    }
  };

  const handleGenerateSvgAvatar = async () => {
    setError('');
    try {
      const res = await fetch('/api/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name || 'Naravia' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal membuat avatar.');
      setForm((prev) => ({ ...prev, avatar: data.avatarUrl }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat avatar.');
    }
  };

  const handleSendPreview = async () => {
    if (!previewInput.trim() || previewLoading) return;
    const userMsg = previewInput.trim();
    setPreviewInput('');

    const baseMessages =
      previewMessages.length === 0 && form.greeting[0]?.trim()
        ? [{ role: 'character' as const, content: form.greeting[0].trim() }]
        : previewMessages;

    const updatedMsgs = [...baseMessages, { role: 'user' as const, content: userMsg }];
    setPreviewMessages(updatedMsgs);
    setPreviewLoading(true);
    setError('');

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'preview',
          character: {
            ...form,
            tags: tagInput.split(',').map((t) => t.trim()).filter(Boolean),
          },
          messages: updatedMsgs,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menguji respons karakter.');
      setPreviewMessages([...updatedMsgs, { role: 'character', content: data.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menjalankan pratinjau obrolan.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSaveCharacter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Nama karakter wajib diisi.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const parsedTags = tagInput.split(',').map((t) => t.trim()).filter(Boolean);
      const payload = {
        ...form,
        tags: parsedTags,
        greeting: form.greeting.map((g) => g.trim()).filter(Boolean),
        example_dialogues: form.example_dialogues.filter((d) => d.user.trim() || d.char.trim()),
      };

      const url = isEdit && initialValues?.id ? `/api/characters/${initialValues.id}` : '/api/characters';
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan karakter.');

      router.push(`/characters/${data.character.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan karakter.');
      setSaving(false);
    }
  };

  const isUncertain = (fieldName: string) =>
    Array.isArray(form.research_notes?.uncertainFields) &&
    form.research_notes.uncertainFields.includes(fieldName);

  return (
    <div className="space-y-6">
      {!isEdit && (
        <div className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-1.5 inline-flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveMode('auto')}
            className={`h-9 px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
              activeMode === 'auto'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Buat Otomatis dengan AI</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('manual')}
            className={`h-9 px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
              activeMode === 'manual'
                ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span>Form Karakter Lengkap</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('import')}
            className={`h-9 px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
              activeMode === 'import'
                ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Impor Kartu SillyTavern</span>
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-sm text-rose-700 dark:text-rose-300 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-sm text-emerald-800 dark:text-emerald-300 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{notice}</span>
        </div>
      )}

      {activeMode === 'auto' && !isEdit && (
        <ResearchWizardPanel
          ideaInput={ideaInput}
          charTypeHint={charTypeHint}
          manualResearchText={manualResearchText}
          generating={generating}
          onChangeIdea={setIdeaInput}
          onChangeTypeHint={setCharTypeHint}
          onChangeManualResearch={setManualResearchText}
          onGenerate={handleGenerateAuto}
        />
      )}

      {activeMode === 'import' && !isEdit && (
        <ImportCardPanel importing={importing} onFileChange={handleImportCardFile} />
      )}

      {(isEdit || activeMode === 'manual') && (
      <form onSubmit={handleSaveCharacter} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <ResearchNotesPanel
            researchNotes={form.research_notes}
            verificationResult={verificationResult}
            revisionInput={revisionInput}
            revising={revising}
            onChangeRevision={setRevisionInput}
            onApplyRevision={handleApplyRevision}
          />

          <div className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-2xs">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Identitas & Avatar Karakter</h3>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <CharacterAvatar name={form.name || 'N'} avatar={form.avatar} size="xl" />
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer">
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>Unggah Gambar</span>
                    <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateSvgAvatar}
                    className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5"
                  >
                    <Palette className="w-3.5 h-3.5" />
                    <span>Buat Avatar Monogram</span>
                  </button>
                  {form.avatar && (
                    <button
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, avatar: '' }))}
                      className="h-8 px-2.5 rounded-lg text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Mendukung unggahan gambar lokal atau generator monogram SVG otomatis.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Karakter *
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Contoh: Kana Valerius"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Dunia / Lorebook Tempat Tinggal
                </label>
                <select
                  value={form.world_id || ''}
                  onChange={(e) => setForm((p) => ({ ...p, world_id: e.target.value || null }))}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-[#111827] focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Tanpa Dunia Khusus (Mandiri)</option>
                  {worlds.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Visibilitas Karakter
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  {
                    value: 'private' as const,
                    label: 'Pribadi',
                    desc: 'Hanya kamu yang bisa melihat dan memakai karakter ini.',
                  },
                  {
                    value: 'public' as const,
                    label: 'Publik',
                    desc: 'Siapa pun bisa menemukan dan mengajaknya mengobrol. Namamu tampil sebagai pembuat.',
                  },
                ].map((opt) => {
                  const active = form.visibility === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, visibility: opt.value }))}
                      aria-pressed={active}
                      className={`text-left p-3 rounded-xl border transition-colors ${
                        active
                          ? 'border-slate-900 dark:border-indigo-500 bg-slate-50 dark:bg-indigo-950/30 ring-1 ring-slate-900 dark:ring-indigo-500'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <span className="block text-xs font-semibold text-slate-900 dark:text-white">{opt.label}</span>
                      <span className="block mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                        {opt.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
              {form.visibility === 'public' && (
                <div className="mt-2.5 space-y-2">
                  <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    Riwayat percakapan dan memorimu tetap pribadi. Yang dibagikan hanya profil karakternya.
                  </p>
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.allow_remix}
                      onChange={(e) => setForm((p) => ({ ...p, allow_remix: e.target.checked }))}
                      className="rounded border-slate-300"
                    />
                    <span>Izinkan pengguna lain menyalin (Remix) & mengekspor kartu karakter ini</span>
                  </label>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tagline (Satu Kalimat Pengenal)
              </label>
              <input
                type="text"
                value={form.tagline}
                onChange={(e) => setForm((p) => ({ ...p, tagline: e.target.value }))}
                placeholder="Contoh: Penyihir restorasi artefak yang selalu lapar"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tag Pencarian (Pisahkan dengan koma)
              </label>
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Fantasi, Sarkastik, Mentor, Misteri"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Personalisasi & Peran</h3>
              <button
                type="button"
                disabled={sanitizing}
                onClick={handleSanitizeMetaSentences}
                className="h-8 px-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-amber-700 dark:text-amber-300 text-[11px] font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors disabled:opacity-50"
                title="Hapus kalimat tentang proses riset/roleplay yang bocor ke kolom personalisasi"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{sanitizing ? 'Membersihkan...' : 'Bersihkan Kalimat Meta'}</span>
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Deskripsi Karakter{' '}
                {isUncertain('description') && <span className="text-amber-600">(Periksa Ulang)</span>}
              </label>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Siapa karakter ini, latar belakang singkat, dan hubungannya dengan pengguna..."
                className={`w-full rounded-xl border p-3 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-[#111827] focus:outline-none focus:border-indigo-500 ${
                  isUncertain('description')
                    ? 'border-amber-400 bg-amber-50/20'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Kepribadian & Sifat Utama
                </label>
                <textarea
                  rows={3}
                  value={form.personality}
                  onChange={(e) => setForm((p) => ({ ...p, personality: e.target.value }))}
                  placeholder="Contoh: Ceria, sarkastik tipis, jujur, teliti saat bekerja..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] p-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Gaya Bicara
                </label>
                <textarea
                  rows={3}
                  value={form.speaking_style}
                  onChange={(e) => setForm((p) => ({ ...p, speaking_style: e.target.value }))}
                  placeholder="Contoh: Bahasa santai, memakai 'aku' dan 'kamu', suka memberi analogi..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] p-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Latar / Skenario Awal{' '}
                {isUncertain('scenario') && <span className="text-amber-600">(Periksa Ulang)</span>}
              </label>
              <textarea
                rows={2}
                value={form.scenario}
                onChange={(e) => setForm((p) => ({ ...p, scenario: e.target.value }))}
                placeholder="Situasi dan tempat ketika percakapan berlangsung..."
                className={`w-full rounded-xl border p-3 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-[#111827] focus:outline-none focus:border-indigo-500 ${
                  isUncertain('scenario')
                    ? 'border-amber-400 bg-amber-50/20'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              />
            </div>
          </div>

          <div className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Sapaan Awal (Bisa Lebih dari Satu)
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Saat memulai chat baru, pengguna bisa memilih salah satu sapaan pembuka ini.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, greeting: [...p.greeting, ''] }))}
                className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Sapaan</span>
              </button>
            </div>

            <div className="space-y-3">
              {form.greeting.map((g, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      Sapaan Awal #{idx + 1}
                    </span>
                    {form.greeting.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, greeting: p.greeting.filter((_, i) => i !== idx) }))}
                        className="text-xs text-rose-600 dark:text-rose-400 hover:underline inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Hapus</span>
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={3}
                    value={g}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForm((p) => {
                        const copy = [...p.greeting];
                        copy[idx] = val;
                        return { ...p, greeting: copy };
                      });
                    }}
                    placeholder="Tulis pesan pertama karakter saat menyambut pengguna..."
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] p-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Contoh Dialog</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Pasangan pesan contoh untuk menjaga ritme dan kosakata karakter tetap konsisten.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setForm((p) => ({
                    ...p,
                    example_dialogues: [...p.example_dialogues, { user: '', char: '' }],
                  }))
                }
                className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Contoh</span>
              </button>
            </div>

            <div className="space-y-3">
              {form.example_dialogues.map((pair, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Contoh Dialog #{idx + 1}
                    </span>
                    {form.example_dialogues.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setForm((p) => ({
                            ...p,
                            example_dialogues: p.example_dialogues.filter((_, i) => i !== idx),
                          }))
                        }
                        className="text-xs text-rose-600 dark:text-rose-400 hover:underline"
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={pair.user}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForm((p) => {
                        const copy = [...p.example_dialogues];
                        copy[idx] = { ...copy[idx], user: val };
                        return { ...p, example_dialogues: copy };
                      });
                    }}
                    placeholder="Ucapan Pengguna..."
                    className="w-full h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0c1220] text-xs text-slate-900 dark:text-slate-100"
                  />
                  <textarea
                    rows={2}
                    value={pair.char}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForm((p) => {
                        const copy = [...p.example_dialogues];
                        copy[idx] = { ...copy[idx], char: val };
                        return { ...p, example_dialogues: copy };
                      });
                    }}
                    placeholder="Jawaban Karakter..."
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0c1220] p-2.5 text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-10 px-6 rounded-xl bg-slate-900 dark:bg-indigo-600 hover:bg-indigo-600 dark:hover:bg-indigo-500 disabled:bg-slate-300 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan' : 'Simpan Karakter'}</span>
            </button>
          </div>
        </div>

        <CharacterPreviewSidebar
          characterName={form.name}
          firstGreeting={form.greeting[0]?.trim() || ''}
          messages={previewMessages}
          input={previewInput}
          loading={previewLoading}
          onChangeInput={setPreviewInput}
          onSend={handleSendPreview}
          onReset={() => setPreviewMessages([])}
        />
      </form>
      )}

      <ImageCropModal
        open={Boolean(cropImageSrc)}
        imageSrc={cropImageSrc}
        title="Crop Foto Profil Karakter"
        onCancel={() => setCropImageSrc(null)}
        onConfirm={handleConfirmCroppedAvatar}
      />
    </div>
  );
}
