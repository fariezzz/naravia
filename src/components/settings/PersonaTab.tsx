'use client';

import React from 'react';
import { Image as ImageIcon, Plus, Save, Star, Trash2 } from 'lucide-react';
import AutoResizeTextarea from '@/components/AutoResizeTextarea';
import CharacterAvatar from '@/components/CharacterAvatar';

export interface PersonaFormState {
  id: string;
  display_name: string;
  avatar: string;
  description: string;
  likes: string;
  dislikes: string;
  is_default: boolean;
  applyToAllChats: boolean;
}

interface PersonaTabProps {
  personas: any[];
  selectedPersonaId: string | null;
  isCreatingPersona: boolean;
  persona: PersonaFormState;
  saving: boolean;
  onStartCreate: () => void;
  onSelectPersona: (p: any) => void;
  onSetDefault: (id: string) => void;
  onRequestDelete: (id: string) => void;
  onChangePersona: React.Dispatch<React.SetStateAction<PersonaFormState>>;
  onSelectPhoto: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export default function PersonaTab({
  personas,
  selectedPersonaId,
  isCreatingPersona,
  persona,
  saving,
  onStartCreate,
  onSelectPersona,
  onSetDefault,
  onRequestDelete,
  onChangePersona,
  onSelectPhoto,
  onSubmit,
}: PersonaTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Daftar Persona ({personas.length})</h2>
          <button
            type="button"
            onClick={onStartCreate}
            className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Persona Baru</span>
          </button>
        </div>

        <div className="space-y-2">
          {personas.map((p) => {
            const active = !isCreatingPersona && p.id === selectedPersonaId;
            return (
              <div
                key={p.id}
                onClick={() => onSelectPersona(p)}
                className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                  active
                    ? 'bg-slate-900 dark:bg-indigo-600 border-slate-900 dark:border-indigo-600 text-white shadow-xs'
                    : 'bg-white dark:bg-[#0f1729] border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-800 dark:text-slate-100'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <CharacterAvatar name={p.display_name} avatar={p.avatar} size="md" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold truncate">{p.display_name}</p>
                      {p.is_default && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            active
                              ? 'bg-amber-400/20 text-amber-200'
                              : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                          }`}
                        >
                          Utama
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-[11px] truncate mt-0.5 ${
                        active ? 'text-slate-200' : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {p.description || 'Tanpa deskripsi'}
                    </p>
                  </div>
                </div>

                {!p.is_default && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetDefault(p.id);
                    }}
                    title="Jadikan Persona Utama (Default)"
                    className={`w-7 h-7 rounded-lg inline-flex items-center justify-center shrink-0 ${
                      active
                        ? 'text-slate-200 hover:text-amber-200 hover:bg-white/10'
                        : 'text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Star className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        className="lg:col-span-2 bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-2xs"
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {isCreatingPersona ? 'Buat Persona Baru' : `Edit Persona: ${persona.display_name}`}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Anda dapat membuat banyak persona dan mengganti persona yang aktif di setiap ruang chat kapan saja.
            </p>
          </div>

          {!isCreatingPersona && personas.length > 1 && (
            <button
              type="button"
              onClick={() => onRequestDelete(persona.id)}
              className="h-8 px-3 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-medium inline-flex items-center gap-1 shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus</span>
            </button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 py-3 border-y border-slate-100 dark:border-slate-800">
          <CharacterAvatar name={persona.display_name || 'Kamu'} avatar={persona.avatar} size="xl" />
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="h-9 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer transition-colors">
                <ImageIcon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Pilih & Crop Foto Profil</span>
                <input type="file" accept="image/*" onChange={onSelectPhoto} className="hidden" />
              </label>
              {persona.avatar && (
                <button
                  type="button"
                  onClick={() => onChangePersona((p) => ({ ...p, avatar: '' }))}
                  className="h-9 px-3 rounded-xl border border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-medium text-rose-600 dark:text-rose-400"
                >
                  Hapus Foto
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Foto disesuaikan dengan rasio persegi 1:1 dan ditampilkan berbentuk lingkaran di navbar serta ruang chat.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nama Panggilan Persona *
            </label>
            <input
              type="text"
              required
              value={persona.display_name}
              onChange={(e) => onChangePersona((p) => ({ ...p, display_name: e.target.value }))}
              placeholder="Contoh: Fariez / Detektif Alden"
              className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="flex items-end pb-1.5">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={persona.is_default}
                onChange={(e) => onChangePersona((p) => ({ ...p, is_default: e.target.checked }))}
                className="rounded border-slate-300"
              />
              <span>Jadikan sebagai Persona Utama (Default untuk chat baru)</span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Deskripsi & Latar Belakang Persona
          </label>
          <textarea
            rows={3}
            value={persona.description}
            onChange={(e) => onChangePersona((p) => ({ ...p, description: e.target.value }))}
            placeholder="Siapa persona ini, latar belakang, profesi, atau hubungannya dengan karakter..."
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] p-3 text-sm text-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Hal yang Disukai
            </label>
            <AutoResizeTextarea
              rows={2}
              maxHeight={140}
              value={persona.likes}
              onChange={(e) => onChangePersona((p) => ({ ...p, likes: e.target.value }))}
              placeholder="Kopi hitam, diskusi logis, cerita misteri..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-xs leading-5 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Hal yang Tidak Disukai
            </label>
            <AutoResizeTextarea
              rows={2}
              maxHeight={140}
              value={persona.dislikes}
              onChange={(e) => onChangePersona((p) => ({ ...p, dislikes: e.target.value }))}
              placeholder="Basa-basi berulang, jawaban bertele-tele..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-xs leading-5 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {!isCreatingPersona && (
          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 pt-1">
            <input
              type="checkbox"
              checked={persona.applyToAllChats}
              onChange={(e) => onChangePersona((p) => ({ ...p, applyToAllChats: e.target.checked }))}
              className="rounded border-slate-300"
            />
            <span>Terapkan persona ini ke seluruh ruang chat yang sudah ada</span>
          </label>
        )}

        <div className="flex justify-end gap-2 pt-2">
          {isCreatingPersona && (
            <button
              type="button"
              onClick={() => {
                if (personas[0]) onSelectPersona(personas[0]);
              }}
              className="h-9 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Batal
            </button>
          )}
          <button
            type="submit"
            disabled={saving}
            className="h-9 px-5 rounded-xl bg-slate-900 dark:bg-indigo-600 hover:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            <span>
              {saving ? 'Menyimpan...' : isCreatingPersona ? 'Simpan Persona Baru' : 'Simpan Perubahan Persona'}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}
