'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Globe, Plus, Sliders } from 'lucide-react';
import CharacterAvatar from '@/components/CharacterAvatar';
import { PersonaItem } from './types';

interface ChatHeaderProps {
  character: {
    id: string;
    name: string;
    avatar: string;
    world_name?: string | null;
  };
  chatTitle: string;
  personas: PersonaItem[];
  userPersona: PersonaItem;
  showDrawer: boolean;
  onBack: () => void;
  onSwitchPersona: (personaId: string) => void;
  onCreateNewRoom: () => void;
  onToggleDrawer: () => void;
}

function isRedundantTitle(title: string, charName: string): boolean {
  const t = (title || '').trim().toLowerCase();
  const n = (charName || '').trim().toLowerCase();
  if (!t) return true;
  return (
    t === n ||
    t === 'percakapan baru' ||
    t === `percakapan dengan ${n}` ||
    t === `chat dengan ${n}`
  );
}

export default function ChatHeader({
  character,
  chatTitle,
  personas,
  userPersona,
  showDrawer,
  onBack,
  onSwitchPersona,
  onCreateNewRoom,
  onToggleDrawer,
}: ChatHeaderProps) {
  const showSubtitle = !isRedundantTitle(chatTitle, character.name);

  return (
    <div className="bg-white dark:bg-[#0c1220] border-b sm:border border-slate-200 dark:border-slate-800 px-3.5 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between gap-2 sm:gap-3 sm:rounded-2xl shadow-2xs shrink-0 z-20 transition-colors">
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={onBack}
          className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-800 inline-flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0 transition-colors"
          title="Kembali"
          aria-label="Kembali"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Link href={`/characters/${character.id}`} className="flex items-center gap-2.5 min-w-0 group">
          <CharacterAvatar name={character.name} avatar={character.avatar} size="sm" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate transition-colors">
                {character.name}
              </h1>
              {character.world_name && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 text-[10px] font-medium shrink-0">
                  <Globe className="w-2.5 h-2.5" />
                  <span>{character.world_name}</span>
                </span>
              )}
            </div>
            {showSubtitle && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{chatTitle}</p>
            )}
          </div>
        </Link>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {personas.length > 0 && (
          <div
            className="h-8 pl-1.5 pr-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/70 inline-flex items-center gap-1.5"
            title="Persona aktif di ruang chat ini"
          >
            <CharacterAvatar name={userPersona.display_name} avatar={userPersona.avatar} size="xs" />
            <select
              value={userPersona.id || ''}
              onChange={(e) => onSwitchPersona(e.target.value)}
              aria-label="Pilih Persona"
              className="bg-transparent dark:bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer max-w-[82px] sm:max-w-[115px] truncate py-0"
            >
              {personas.map((p) => (
                <option key={p.id} value={p.id} className="bg-white dark:bg-[#0f1729] text-slate-900 dark:text-slate-100">
                  {p.display_name}
                </option>
              ))}
            </select>
          </div>
        )}
        <button
          type="button"
          onClick={onCreateNewRoom}
          className="h-8 w-8 sm:w-auto sm:px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors"
          title="Mulai Alur Chat Baru dengan Karakter Ini"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Chat Baru</span>
        </button>
        <button
          type="button"
          onClick={onToggleDrawer}
          className={`h-8 px-2 sm:px-2.5 rounded-lg border text-xs font-medium inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors ${
            showDrawer
              ? 'bg-slate-900 dark:bg-indigo-600 border-slate-900 dark:border-indigo-600 text-white'
              : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
          }`}
          title="Pengaturan Chat & Inspektor Konteks"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Pengaturan</span>
        </button>
      </div>
    </div>
  );
}
