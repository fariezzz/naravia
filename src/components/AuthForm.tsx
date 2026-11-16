'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, LogIn, UserPlus } from 'lucide-react';
import { invalidateClientCache } from '@/lib/clientCache';

interface AuthFormProps {
  mode: 'login' | 'register';
}

const inputClass =
  'w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-400';

// Hanya izinkan pengalihan ke path internal agar parameter ?next= tidak bisa dipakai untuk open redirect
function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/login') || raw.startsWith('/register')) {
    return '/';
  }
  return raw;
}

export default function AuthForm({ mode }: AuthFormProps) {
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get('next'));
  const isRegister = mode === 'register';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<{ registrationOpen: boolean; needsFirstAdmin: boolean } | null>(null);

  useEffect(() => {
    fetch('/api/auth/config')
      .then((r) => r.json())
      .then((d) => setConfig({ registrationOpen: Boolean(d.registrationOpen), needsFirstAdmin: Boolean(d.needsFirstAdmin) }))
      .catch(() => setConfig({ registrationOpen: false, needsFirstAdmin: false }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (isRegister && password !== confirmPassword) {
      setError('Konfirmasi kata sandi tidak cocok.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(isRegister ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isRegister ? { email, password, display_name: displayName } : { email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Permintaan gagal.');

      // Cache sesi sebelumnya (jika ada) tidak boleh terbawa ke akun baru
      invalidateClientCache();
      // Navigasi penuh agar seluruh komponen memuat ulang data milik akun yang baru masuk
      window.location.href = nextPath;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Permintaan gagal.');
      setSubmitting(false);
    }
  };

  const registrationClosed = isRegister && config && !config.registrationOpen;

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Naravia</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isRegister ? 'Buat akun untuk mulai mengobrol dengan karakter.' : 'Masuk ke akunmu.'}
          </p>
        </div>

        {isRegister && config?.needsFirstAdmin && (
          <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-900 text-xs text-indigo-800 dark:text-indigo-200">
            Belum ada akun terdaftar. Akun pertama otomatis menjadi admin.
          </div>
        )}

        {registrationClosed ? (
          <div className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 text-sm text-slate-600 dark:text-slate-300 text-center space-y-3">
            <p>Pendaftaran akun baru sedang ditutup. Hubungi admin untuk dibuatkan akun.</p>
            <Link href="/login" className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
              Kembali ke Halaman Masuk
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-2xs"
          >
            {error && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                <span>{error}</span>
              </div>
            )}

            {isRegister && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Nama Tampilan</label>
                <input
                  type="text"
                  required
                  maxLength={60}
                  autoComplete="nickname"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Kata Sandi</label>
              <input
                type="password"
                required
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isRegister ? 'Minimal 8 karakter, huruf dan angka' : ''}
                className={inputClass}
              />
            </div>

            {isRegister && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Ulangi Kata Sandi</label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isRegister ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
              <span>{submitting ? 'Memproses...' : isRegister ? 'Buat Akun' : 'Masuk'}</span>
            </button>
          </form>
        )}

        {!registrationClosed && (
          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
            {isRegister ? (
              <>
                Sudah punya akun?{' '}
                <Link href="/login" className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
                  Masuk
                </Link>
              </>
            ) : config?.registrationOpen ? (
              <>
                Belum punya akun?{' '}
                <Link href="/register" className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
                  Daftar
                </Link>
              </>
            ) : null}
          </p>
        )}
      </div>
    </div>
  );
}
