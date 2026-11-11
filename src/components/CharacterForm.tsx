'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Upload,
  Plus,
  Trash2,
  Send,
  AlertCircle,
  CheckCircle2,
  Palette,
  Image as ImageIcon,
  Save,
} from 'lucide-react';
import CharacterAvatar from './CharacterAvatar';
import ImageCropModal from './ImageCropModal';
import FormattedMessage from './FormattedMessage';

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
  const [activeMode, setActiveMode] = useState<'auto' | 'manual' | 'import'>(
    isEdit ? 'manual' : initialTab
  );

  // State Pembuatan Otomatis (Bagian 11)
  const [ideaInput, setIdeaInput] = useState('');
  const [charTypeHint, setCharTypeHint] = useState<'auto' | 'existing' | 'original'>('auto');
  const [manualResearchText, setManualResearchText] = useState('');
  const [generating, setGenerating] = useState(false);

  // State Impor Kartu SillyTavern
  const [importing, setImporting] = useState(false);

  // State Daftar Dunia
  const [worlds, setWorlds] = useState<Array<{ id: string; name: string }>>([]);

  // State Form Utama Karakter
  const [form, setForm] = useState<CharacterFormValues>({
    name: initialValues?.name || '',
    tagline: initialValues?.tagline || '',
    avatar: initialValues?.avatar || '',
    description: initialValues?.description || '',
    personality: initialValues?.personality || '',
    speaking_style: initialValues?.speaking_style || '',
    scenario: initialValues?.scenario || '',
    greeting:
      initialValues?.greeting && initialValues.greeting.length > 0
        ? initialValues.greeting
        : [''],
    example_dialogues:
      initialValues?.example_dialogues && initialValues.example_dialogues.length > 0
        ? initialValues.example_dialogues
        : [{ user: '', char: '' }],
    tags: initialValues?.tags || [],
    world_id: initialValues?.world_id || null,
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

  // State Pratinjau Chat sebelum simpan (Bagian 8.5)
  const [previewMessages, setPreviewMessages] = useState<Array<{ role: 'user' | 'character'; content: string }>>([]);
  const [previewInput, setPreviewInput] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

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
        research_notes: draft.research_notes || {
          mode: 'original',
          summary: '',
          sources: [],
          uncertainFields: [],
        },
      }));
      setTagInput(Array.isArray(draft.tags) ? draft.tags.join(', ') : '');
      setPreviewMessages(
        draft.greeting?.[0] ? [{ role: 'character', content: draft.greeting[0] }] : []
      );
      setNotice(
        'Draf karakter selesai dibuat oleh AI. Silakan tinjau dan sunting isinya di bawah sebelum menyimpan.'
      );
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
      const res = await fetch('/api/import', {
        method: 'POST',
        body: fd,
      });
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

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCropImageSrc(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleConfirmCroppedAvatar = async (blob: Blob) => {
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', new File([blob], `avatar-${Date.now()}.png`, { type: 'image/png' }));
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
            tags: tagInput
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean),
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
      const parsedTags = tagInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const payload = {
        ...form,
        tags: parsedTags,
        greeting: form.greeting.map((g) => g.trim()).filter(Boolean),
        example_dialogues: form.example_dialogues.filter(
          (d) => d.user.trim() || d.char.trim()
        ),
      };

      const url = isEdit && initialValues?.id ? `/api/characters/${initialValues.id}` : '/api/characters';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
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
      {/* Pemilih Mode di Bagian Atas (Buat Otomatis vs Form Manual vs Impor Kartu) */}
      {!isEdit && (
        <div className="bg-white rounded-2xl border border-slate-200 p-1.5 inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveMode('auto')}
            className={`h-9 px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
              activeMode === 'auto'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
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
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <span>Form Karakter Lengkap</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('import')}
            className={`h-9 px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
              activeMode === 'import'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Impor Kartu SillyTavern</span>
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{notice}</span>
        </div>
      )}

      {/* Panel 1: Pembuatan Otomatis dengan AI */}
      {activeMode === 'auto' && !isEdit && (
        <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-2xs">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Pembuatan Karakter Otomatis & Riset AI
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tulis satu atau dua kalimat ide. AI akan menentukan jenis riset, melengkapi semua kepribadian, gaya bicara, sapaan awal, serta contoh dialog untuk Anda tinjau.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ide Singkat Karakter
              </label>
              <textarea
                rows={3}
                value={ideaInput}
                onChange={(e) => setIdeaInput(e.target.value)}
                placeholder='Contoh: "Buatkan karakter Frieren dari anime Sousou no Frieren" atau "CEO startup logistik yang sarkastik dan gila kerja tapi peduli pada timnya"'
                className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Jenis Karakter
                </label>
                <select
                  value={charTypeHint}
                  onChange={(e) => setCharTypeHint(e.target.value as any)}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="auto">Deteksi Otomatis oleh AI</option>
                  <option value="existing">Tokoh yang Sudah Ada (Riset Kanon/Fakta)</option>
                  <option value="original">Tokoh Orisinal (Kembangkan Kreatif)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tempel Teks Riset Manual / Wiki (Opsional - Bagian 11.2 Opsi C)
              </label>
              <textarea
                rows={3}
                value={manualResearchText}
                onChange={(e) => setManualResearchText(e.target.value)}
                placeholder="Jika ingin menyalin artikel wiki atau catatan latar tokoh sendiri, tempel di sini agar AI merangkum kartu karakter langsung dari teks Anda..."
                className="w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end pt-1">
              <button
                type="button"
                disabled={generating}
                onClick={handleGenerateAuto}
                className="h-10 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                <span>{generating ? 'Sedang Meriset & Menyusun Kartu...' : 'Riset & Isi Kartu Karakter'}</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Panel 2: Impor Kartu SillyTavern JSON / PNG */}
      {activeMode === 'import' && !isEdit && (
        <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-2xs">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Impor Kartu Karakter SillyTavern (JSON / PNG)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Unggah file kartu karakter berformat .json atau .png (Character Card V2). Gambar PNG akan otomatis dipakai sebagai avatar dan placeholder {'{{char}}'} serta {'{{user}}'} akan disesuaikan.
            </p>
          </div>

          <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-8 cursor-pointer transition-colors bg-slate-50/60">
            <Upload className="w-7 h-7 text-indigo-600 mb-2" />
            <span className="text-sm font-semibold text-slate-800">
              {importing ? 'Membaca File Kartu...' : 'Pilih File Kartu Karakter (.PNG atau .JSON)'}
            </span>
            <span className="text-xs text-slate-500 mt-1">
              Setelah diunggah, semua field akan terbuka di form untuk Anda tinjau sebelum disimpan.
            </span>
            <input
              type="file"
              accept=".png,.json,image/png,application/json"
              onChange={handleImportCardFile}
              disabled={importing}
              className="hidden"
            />
          </label>
        </section>
      )}

      {/* Form Utama & Panel Pratinjau berdampingan */}
      <form onSubmit={handleSaveCharacter} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          {/* Ringkasan Riset Otomatis jika tersedia */}
          {form.research_notes?.summary && (
            <div className="bg-indigo-50/70 rounded-2xl border border-indigo-200 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-indigo-900">
                  Catatan Riset Karakter ({form.research_notes.mode === 'existing' ? 'Tokoh Kanon' : form.research_notes.mode === 'import' ? 'Impor Kartu' : 'Pengembangan Orisinal'})
                </span>
              </div>
              <p className="text-xs text-indigo-950 leading-relaxed">{form.research_notes.summary}</p>
              {form.research_notes.sources?.length > 0 && (
                <div className="text-[11px] text-indigo-800">
                  <span className="font-semibold">Sumber: </span>
                  {form.research_notes.sources.join(' | ')}
                </div>
              )}
              {form.research_notes.uncertainFields?.length > 0 && (
                <div className="text-[11px] text-amber-800 bg-amber-100/80 px-2.5 py-1.5 rounded-lg">
                  Periksa kembali field berikut karena dirangkum dari ingatan model: {form.research_notes.uncertainFields.join(', ')}
                </div>
              )}
            </div>
          )}

          {/* Identitas Dasar & Avatar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-2xs">
            <h3 className="text-sm font-semibold text-slate-900">Identitas & Avatar Karakter</h3>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pb-3 border-b border-slate-100">
              <CharacterAvatar name={form.name || 'N'} avatar={form.avatar} size="xl" />
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="h-8 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer">
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>Unggah Gambar</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateSvgAvatar}
                    className="h-8 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5"
                  >
                    <Palette className="w-3.5 h-3.5" />
                    <span>Buat Avatar Monogram</span>
                  </button>
                  {form.avatar && (
                    <button
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, avatar: '' }))}
                      className="h-8 px-2.5 rounded-lg text-xs text-rose-600 hover:bg-rose-50"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  Mendukung unggahan gambar lokal atau generator monogram SVG otomatis.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Karakter *
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Contoh: Kana Valerius"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Dunia / Lorebook Tempat Tinggal
                </label>
                <select
                  value={form.world_id || ''}
                  onChange={(e) => setForm((p) => ({ ...p, world_id: e.target.value || null }))}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white focus:outline-none focus:border-indigo-500"
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tagline (Satu Kalimat Pengenal)
              </label>
              <input
                type="text"
                value={form.tagline}
                onChange={(e) => setForm((p) => ({ ...p, tagline: e.target.value }))}
                placeholder="Contoh: Penyihir restorasi artefak yang selalu lapar"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tag Pencarian (Pisahkan dengan koma)
              </label>
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Fantasi, Sarkastik, Mentor, Misteri"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Personalisasi Mendalam */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-2xs">
            <h3 className="text-sm font-semibold text-slate-900">Personalisasi & Peran</h3>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Deskripsi Karakter {isUncertain('description') && <span className="text-amber-600">(Periksa Ulang)</span>}
              </label>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Siapa karakter ini, latar belakang singkat, dan hubungannya dengan pengguna..."
                className={`w-full rounded-xl border p-3 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 ${
                  isUncertain('description') ? 'border-amber-400 bg-amber-50/20' : 'border-slate-200'
                }`}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kepribadian & Sifat Utama
                </label>
                <textarea
                  rows={3}
                  value={form.personality}
                  onChange={(e) => setForm((p) => ({ ...p, personality: e.target.value }))}
                  placeholder="Contoh: Ceria, sarkastik tipis, jujur, teliti saat bekerja..."
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Gaya Bicara
                </label>
                <textarea
                  rows={3}
                  value={form.speaking_style}
                  onChange={(e) => setForm((p) => ({ ...p, speaking_style: e.target.value }))}
                  placeholder="Contoh: Bahasa santai, memakai 'aku' dan 'kamu', suka memberi analogi..."
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Latar / Skenario Awal {isUncertain('scenario') && <span className="text-amber-600">(Periksa Ulang)</span>}
              </label>
              <textarea
                rows={2}
                value={form.scenario}
                onChange={(e) => setForm((p) => ({ ...p, scenario: e.target.value }))}
                placeholder="Situasi dan tempat ketika percakapan berlangsung..."
                className={`w-full rounded-xl border p-3 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 ${
                  isUncertain('scenario') ? 'border-amber-400 bg-amber-50/20' : 'border-slate-200'
                }`}
              />
            </div>
          </div>

          {/* Sapaan Awal Jamak */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Sapaan Awal (Bisa Lebih dari Satu)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Saat memulai chat baru, pengguna bisa memilih salah satu sapaan pembuka ini.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, greeting: [...p.greeting, ''] }))}
                className="h-8 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Sapaan</span>
              </button>
            </div>

            <div className="space-y-3">
              {form.greeting.map((g, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600">
                      Sapaan Awal #{idx + 1}
                    </span>
                    {form.greeting.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setForm((p) => ({
                            ...p,
                            greeting: p.greeting.filter((_, i) => i !== idx),
                          }))
                        }
                        className="text-xs text-rose-600 hover:underline inline-flex items-center gap-1"
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
                    className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Contoh Dialog */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Contoh Dialog</h3>
                <p className="text-[11px] text-slate-500">
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
                className="h-8 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Contoh</span>
              </button>
            </div>

            <div className="space-y-3">
              {form.example_dialogues.map((pair, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">
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
                        className="text-xs text-rose-600 hover:underline"
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
                    className="w-full h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-900"
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
                    className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-10 px-6 rounded-xl bg-slate-900 hover:bg-indigo-600 disabled:bg-slate-300 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan' : 'Simpan Karakter'}</span>
            </button>
          </div>
        </div>

        {/* Kolom Kanan: Uji Coba / Pratinjau Obrolan Sebelum Disimpan */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs sticky top-20 flex flex-col h-[520px]">
            <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Pratinjau Karakter</h3>
                <p className="text-[11px] text-slate-500">
                  Coba ajak mengobrol singkat sebelum karakter disimpan.
                </p>
              </div>
              {previewMessages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setPreviewMessages([])}
                  className="text-[11px] text-slate-500 hover:text-slate-800"
                >
                  Reset
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-3">
              {previewMessages.length === 0 ? (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                  {form.greeting[0]?.trim() ||
                    'Isi profil karakter di samping atau gunakan Buat Otomatis, lalu kirim pesan uji coba di bawah.'}
                </div>
              ) : (
                previewMessages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex flex-col min-w-0 ${
                      m.role === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <span className="text-[10px] font-medium text-slate-400 mb-0.5 px-1">
                      {m.role === 'user' ? 'Kamu' : form.name || 'Karakter'}
                    </span>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed whitespace-pre-line break-words [overflow-wrap:anywhere] ${
                        m.role === 'character'
                          ? 'bg-slate-100 text-slate-900 rounded-tl-xs'
                          : 'bg-slate-900 text-white rounded-tr-xs'
                      }`}
                    >
                      <FormattedMessage content={m.content} isUser={m.role !== 'character'} />
                    </div>
                  </div>
                ))
              )}
              {previewLoading && (
                <div className="text-xs text-slate-400 italic">
                  {form.name || 'Karakter'} sedang mengetik...
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
              <input
                type="text"
                value={previewInput}
                onChange={(e) => setPreviewInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSendPreview();
                  }
                }}
                placeholder="Ketik pesan uji coba..."
                className="flex-1 h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                disabled={previewLoading || !previewInput.trim()}
                onClick={handleSendPreview}
                className="w-9 h-9 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white inline-flex items-center justify-center shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </form>

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
