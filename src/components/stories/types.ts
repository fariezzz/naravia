import type { StoryLengthPreset, StoryPov, StoryTone } from '@/lib/db';

export interface StoryData {
  id: string;
  title: string;
  synopsis: string;
  cover_image: string;
  genre: string;
  tags: string[];
  world_id: string | null;
  world_name: string | null;
  pov: StoryPov;
  tone: StoryTone;
  writing_style_notes: string;
  authors_note: string;
  temperature: number;
  length_preset: StoryLengthPreset;
  status: 'ongoing' | 'completed';
  visibility: 'private' | 'public';
  published_at: string | null;
  creator_name: string;
  is_owner: boolean;
  bookmarked: boolean;
  bookmark_count: number;
  created_at: string;
  updated_at: string;
}

export interface StoryCastItem {
  id?: string;
  character_id: string | null;
  persona_id?: string | null;
  name: string;
  role_in_story: 'protagonis' | 'antagonis' | 'pendukung';
  bio: string;
  current_state: string;
  avatar: string;
  sort_order?: number;
}

export interface StoryChapterItem {
  id: string;
  story_id: string;
  chapter_number: number;
  title: string;
  content: string;
  summary: string;
  outline_notes: string;
  word_count: number;
  status: 'draft' | 'done';
  created_at: string;
  updated_at: string;
}

export interface StoryRevisionItem {
  id: string;
  chapter_id: string;
  kind: 'append_variants' | 'checkpoint';
  base_content: string;
  variants: string[];
  active_index: number;
  created_at: string;
}

export interface StoryIdeaItem {
  label: string;
  title: string;
  beat: string;
}

export type PaperTheme = 'auto' | 'ivory' | 'sepia' | 'night';
export type StoryFontFamily = 'serif' | 'sans' | 'mono';
export type StoryFontSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ReaderPrefs {
  paper: PaperTheme;
  font: StoryFontFamily;
  size: StoryFontSize;
  spellCheck: boolean;
}

export const DEFAULT_READER_PREFS: ReaderPrefs = {
  paper: 'auto',
  font: 'serif',
  size: 'md',
  spellCheck: false,
};

export function getPaperSurfaceClasses(paper: PaperTheme): {
  canvasBg: string;
  proseText: string;
  mutedText: string;
  chromeBg: string;
} {
  if (paper === 'ivory') {
    return {
      canvasBg: 'bg-[#FCFBF9]',
      proseText: 'text-[#1F242D]',
      mutedText: 'text-[#647082]',
      chromeBg: 'bg-[#F6F4EF] border-[#E7E3DA]',
    };
  }
  if (paper === 'sepia') {
    return {
      canvasBg: 'bg-[#F6EFE2]',
      proseText: 'text-[#2D241C]',
      mutedText: 'text-[#75624F]',
      chromeBg: 'bg-[#EFE6D5] border-[#DFD2BC]',
    };
  }
  if (paper === 'night') {
    return {
      canvasBg: 'bg-[#0B1120]',
      proseText: 'text-[#E2E8F0]',
      mutedText: 'text-[#94A3B8]',
      chromeBg: 'bg-[#0F172A] border-slate-800',
    };
  }
  return {
    canvasBg: 'bg-[#FCFBF9] dark:bg-[#0B1120]',
    proseText: 'text-slate-900 dark:text-slate-100',
    mutedText: 'text-slate-500 dark:text-slate-400',
    chromeBg: 'bg-white dark:bg-[#0F172A] border-slate-200 dark:border-slate-800',
  };
}

export function getProseFontClasses(font: StoryFontFamily, size: StoryFontSize): string {
  const fontCls =
    font === 'serif'
      ? 'font-serif'
      : font === 'mono'
        ? 'font-mono'
        : 'font-sans';
  const sizeCls =
    size === 'sm'
      ? 'text-[15px] leading-[1.8]'
      : size === 'lg'
        ? 'text-[19px] leading-[1.9]'
        : size === 'xl'
          ? 'text-[21px] leading-[1.95]'
          : 'text-[17px] leading-[1.85]';
  return `${fontCls} ${sizeCls}`;
}
