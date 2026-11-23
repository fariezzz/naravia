'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Compass, Users, Globe, Globe2, Settings, Plus, Menu, X, ShieldCheck, LogOut, Sun, Moon } from 'lucide-react';
import CharacterAvatar from './CharacterAvatar';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';

const AUTH_PAGES = ['/login', '/register'];

export default function Navbar() {
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isNewCharPage = pathname === '/characters/new';

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  // Tutup menu akun saat klik di luar area menu
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const isAuthPage = AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const displayName = user?.display_name || 'Akun';
  const isAdmin = user?.role === 'admin';

  const navItems = [
    { href: '/', label: 'Beranda', icon: Compass, match: (p: string) => p === '/' || p.startsWith('/characters') || p.startsWith('/chat/') },
    { href: '/jelajah', label: 'Jelajah', icon: Globe2, match: (p: string) => p.startsWith('/jelajah') },
    { href: '/groups', label: 'Grup Chat', icon: Users, match: (p: string) => p.startsWith('/groups') },
    { href: '/worlds', label: 'Dunia & Lore', icon: Globe, match: (p: string) => p.startsWith('/worlds') },
    { href: '/settings', label: 'Pengaturan', icon: Settings, match: (p: string) => p.startsWith('/settings') },
    ...(isAdmin
      ? [{ href: '/admin', label: 'Admin', icon: ShieldCheck, match: (p: string) => p.startsWith('/admin') }]
      : []),
  ];

  // Pengalih tema dipindahkan ke halaman Pengaturan, tab Preferensi Chat

  // Halaman masuk/daftar memakai tata letak panel penuh dengan tautan kembali sendiri
  if (isAuthPage) return null;

  // Tamu di halaman perkenalan: hanya logo, pengalih tema, dan tautan autentikasi
  if (!loading && !user) {
    return (
      <header className="sticky top-0 z-20 w-full bg-white/85 dark:bg-[#0c1220]/85 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 h-[58px] md:h-[68px] shrink-0">
        <div className="max-w-6xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between">
          <Link href="/" className="font-display brand-wordmark text-xl md:text-[1.4rem] text-slate-900 dark:text-white">
            Naravia
          </Link>
          <div className="flex items-center gap-2 sm:gap-2.5">
            <Link
              href="/jelajah"
              className="h-9 px-3.5 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center transition-colors"
            >
              Jelajah
            </Link>
            <Link
              href="/login"
              className="h-9 px-3.5 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center transition-colors"
            >
              Masuk
            </Link>
            <Link
              href="/register"
              className="h-9 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-sm font-semibold inline-flex items-center whitespace-nowrap transition-colors"
            >
              Daftar
            </Link>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header
      className={`sticky top-0 z-20 w-full bg-white/95 dark:bg-[#0c1220]/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 h-[54px] md:h-[64px] shrink-0 transition-colors ${
        pathname.startsWith('/chat/') || pathname.startsWith('/groups/') ? 'hidden md:block' : 'block'
      }`}
    >
      <div className="max-w-6xl mx-auto h-full px-3.5 sm:px-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="font-display brand-wordmark text-xl text-slate-900 dark:text-white hover:text-slate-600 dark:hover:text-slate-300 transition-colors whitespace-nowrap"
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
          {!isNewCharPage && (
            <Link
              href="/characters/new"
              className="h-[36px] px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Buat Karakter</span>
            </Link>
          )}

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="h-[36px] pl-1.5 pr-3 rounded-full border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 inline-flex items-center gap-2 transition-colors"
            >
              <CharacterAvatar name={displayName} avatar={user?.avatar || ''} size="xs" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 max-w-[110px] truncate">
                {displayName}
              </span>
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-[44px] w-56 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f1729] shadow-lg p-1.5"
              >
                <div className="px-2.5 py-2 border-b border-slate-100 dark:border-slate-800 mb-1">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{displayName}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{user?.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="w-full h-8 px-2.5 rounded-lg text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between gap-2"
                >
                  <span className="inline-flex items-center gap-2">
                    {theme === 'dark' ? (
                      <Sun className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <Moon className="w-3.5 h-3.5 text-indigo-500" />
                    )}
                    <span>{theme === 'dark' ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap'}</span>
                  </span>
                </button>
                <Link
                  href="/settings"
                  className="h-8 px-2.5 rounded-lg text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Pengaturan</span>
                </Link>
                {isAdmin && (
                  <Link
                    href="/admin"
                    className="h-8 px-2.5 rounded-lg text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Panel Admin</span>
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => logout()}
                  className="w-full h-8 px-2.5 rounded-lg text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Keluar</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex md:hidden items-center gap-1.5">
          {!isNewCharPage && (
            <Link
              href="/characters/new"
              className="h-8 px-2.5 rounded-lg bg-indigo-600 text-white text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Buat Karakter</span>
            </Link>
          )}
          <Link href="/settings" aria-label="Pengaturan Akun" className="rounded-full">
            <CharacterAvatar name={displayName} avatar={user?.avatar || ''} size="sm" />
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
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="h-9 px-3 rounded-lg text-xs font-medium inline-flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400 shrink-0" />
              ) : (
                <Moon className="w-4 h-4 text-indigo-500 shrink-0" />
              )}
              <span>{theme === 'dark' ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap'}</span>
            </button>
            <button
              type="button"
              onClick={() => logout()}
              className="h-9 px-3 rounded-lg text-xs font-medium inline-flex items-center gap-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Keluar</span>
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
