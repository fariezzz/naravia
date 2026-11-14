'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Compass, Users, Globe, Settings, Plus, Menu, X, Sun, Moon } from 'lucide-react';
import CharacterAvatar from './CharacterAvatar';
import { getClientCache, setClientCache } from '@/lib/clientCache';
import { useTheme } from '@/lib/ThemeContext';

export default function Navbar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userPersona, setUserPersona] = useState<{ display_name: string; avatar: string }>(() => {
    return (
      getClientCache<{ display_name: string; avatar: string }>('navbar_persona') || {
        display_name: 'Kamu',
        avatar: '',
      }
    );
  });

  const fetchPersona = () => {
    fetch('/api/persona')
      .then((r) => r.json())
      .then((d) => {
        if (d?.persona) {
          const item = {
            display_name: d.persona.display_name || 'Kamu',
            avatar: d.persona.avatar || '',
          };
          setUserPersona(item);
          setClientCache('navbar_persona', item);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    fetchPersona();
    const handler = () => fetchPersona();
    window.addEventListener('naravia-persona-updated', handler);
    return () => window.removeEventListener('naravia-persona-updated', handler);
  }, []);

  const navItems = [
    { href: '/', label: 'Karakter', icon: Compass, match: (p: string) => p === '/' || p.startsWith('/characters') || p.startsWith('/chat/') },
    { href: '/groups', label: 'Grup Chat', icon: Users, match: (p: string) => p.startsWith('/groups') },
    { href: '/worlds', label: 'Dunia & Lore', icon: Globe, match: (p: string) => p.startsWith('/worlds') },
    { href: '/settings', label: 'Pengaturan', icon: Settings, match: (p: string) => p.startsWith('/settings') },
  ];

  if (pathname.startsWith('/chat/') || pathname.startsWith('/groups/')) {
    // Pada halaman percakapan, navbar atas disembunyikan di mobile agar ruang chat 100% full height & header chat menjadi navbar utama
    // Di desktop (md:flex), navbar tetap tampil
  }

  return (
    <header className={`sticky top-0 z-20 w-full bg-white/95 dark:bg-[#0c1220]/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 h-[54px] md:h-[64px] shrink-0 transition-colors ${
      pathname.startsWith('/chat/') || pathname.startsWith('/groups/') ? 'hidden md:block' : 'block'
    }`}>
      <div className="max-w-6xl mx-auto h-full px-3.5 sm:px-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors whitespace-nowrap"
          >
            Naravia
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`h-[36px] px-3.5 rounded-lg text-sm font-medium inline-flex items-center gap-2 whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-slate-900 text-white dark:bg-indigo-600 dark:text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="hidden md:flex items-center gap-2.5">
          <button
            type="button"
            onClick={toggleTheme}
            className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center justify-center text-slate-700 dark:text-slate-300 transition-colors"
            title={theme === 'dark' ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          <Link
            href="/characters/new"
            className="h-[36px] px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Buat Karakter</span>
          </Link>

          <Link
            href="/settings"
            title={`Profil Persona: ${userPersona.display_name}`}
            className="h-[36px] pl-1.5 pr-3 rounded-full border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 inline-flex items-center gap-2 transition-colors"
          >
            <CharacterAvatar
              name={userPersona.display_name}
              avatar={userPersona.avatar}
              size="xs"
            />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 max-w-[110px] truncate">
              {userPersona.display_name}
            </span>
          </Link>
        </div>

        <div className="flex md:hidden items-center gap-1.5">
          <button
            type="button"
            onClick={toggleTheme}
            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-800 inline-flex items-center justify-center text-slate-700 dark:text-slate-300"
            title="Toggle Tema"
            aria-label="Toggle Tema"
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
          </button>

          <Link
            href="/characters/new"
            className="h-8 px-2.5 rounded-lg bg-indigo-600 text-white text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Buat Karakter</span>
          </Link>
          <Link
            href="/settings"
            aria-label="Profil Pengguna"
            className="rounded-full"
          >
            <CharacterAvatar
              name={userPersona.display_name}
              avatar={userPersona.avatar}
              size="sm"
            />
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label="Menu Navigasi"
            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-800 inline-flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-white dark:bg-[#0c1220] border-b border-slate-200 dark:border-slate-800 px-4 py-2.5 shadow-lg">
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`h-9 px-3 rounded-lg text-xs font-medium inline-flex items-center gap-2 transition-colors ${
                    active
                      ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
