'use client';

import React from 'react';

interface CharacterAvatarProps {
  name: string;
  avatar?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

const PALETTES = [
  'bg-indigo-100 text-indigo-800 border-indigo-200',
  'bg-teal-100 text-teal-800 border-teal-200',
  'bg-rose-100 text-rose-800 border-rose-200',
  'bg-amber-100 text-amber-800 border-amber-200',
  'bg-violet-100 text-violet-800 border-violet-200',
  'bg-slate-200 text-slate-800 border-slate-300',
];

export default function CharacterAvatar({ name, avatar, size = 'md' }: CharacterAvatarProps) {
  const sizeClasses = {
    xs: 'w-7 h-7 text-[11px] rounded-full',
    sm: 'w-8 h-8 text-xs rounded-full',
    md: 'w-11 h-11 text-sm rounded-full',
    lg: 'w-14 h-14 text-base rounded-full',
    xl: 'w-20 h-20 text-xl rounded-full',
  }[size];

  if (avatar && (avatar.startsWith('/') || avatar.startsWith('http') || avatar.startsWith('data:'))) {
    return (
      <img
        src={avatar}
        alt={name}
        loading="lazy"
        decoding="async"
        className={`${sizeClasses} object-cover shrink-0 border border-slate-200 bg-slate-100`}
      />
    );
  }

  const initials = (name || 'N')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');

  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = (name || '').charCodeAt(i) + ((hash << 5) - hash);
  }
  const colorClass = PALETTES[Math.abs(hash) % PALETTES.length];

  return (
    <div
      className={`${sizeClasses} ${colorClass} border font-semibold inline-flex items-center justify-center shrink-0 select-none`}
    >
      {initials || 'N'}
    </div>
  );
}
