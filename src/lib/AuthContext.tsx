'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { invalidateClientCache } from './clientCache';

export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
  role: 'user' | 'admin';
  avatar: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: (callApi?: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
});

const PUBLIC_PATHS = ['/login', '/register'];

export function AuthProvider({
  children,
  initialUser = null,
}: {
  children: React.ReactNode;
  initialUser?: AuthUser | null;
}) {
  const [user, setUser] = useState<AuthUser | null>(initialUser);
  const [loading, setLoading] = useState(!initialUser);
  const pathname = usePathname();
  const router = useRouter();
  // Beranda bersifat publik: tamu melihat halaman perkenalan, pengguna yang sudah masuk melihat dashboard
  const isPublic = pathname === '/' || PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      if (!res.ok) {
        setUser(null);
        return;
      }
      const data = await res.json();
      setUser(data.user || null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isPublic && !initialUser) {
      setLoading(false);
      return;
    }
    refresh();
  }, [isPublic, initialUser, refresh]);

  // Sesi kedaluwarsa atau dicabut admin: arahkan kembali ke halaman masuk
  useEffect(() => {
    if (!loading && !user && !isPublic) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, isPublic, pathname, router]);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener('naravia-persona-updated', handler);
    return () => window.removeEventListener('naravia-persona-updated', handler);
  }, [refresh]);

  const logout = useCallback(
    async (callApi = true) => {
      if (callApi) {
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
      }
      // Cache klien berisi data akun sebelumnya; wajib dibersihkan sebelum akun lain masuk
      invalidateClientCache();
      setUser(null);
      router.replace('/login');
      router.refresh();
    },
    [router]
  );

  return <AuthContext.Provider value={{ user, loading, refresh, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
