'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { invalidateClientCache } from '@/lib/clientCache';

interface AuthFormProps {
  mode: 'login' | 'register';
}

// Hanya izinkan pengalihan ke path internal agar parameter ?next= tidak bisa dipakai untuk open redirect
function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/login') || raw.startsWith('/register')) {
    return '/';
  }
  return raw;
}

const FIELD_CLASS =
  'w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors focus:outline-none focus:border-slate-900 dark:focus:border-slate-400';
const LABEL_CLASS = 'block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5';

export default function AuthForm({ mode }: AuthFormProps) {
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get('next'));
  const isRegister = mode === 'register';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<{ registrationOpen: boolean; needsFirstAdmin: boolean } | null>(null);
  // Dibedakan dari "pendaftaran ditutup": server tidak bisa dihubungi atau databasenya bermasalah
  const [configError, setConfigError] = useState('');

  useEffect(() => {
    fetch('/api/auth/config')
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Server tidak dapat memuat konfigurasi.');
        setConfig({ registrationOpen: Boolean(d.registrationOpen), needsFirstAdmin: Boolean(d.needsFirstAdmin) });
      })
      .catch((err) => {
        setConfigError(err instanceof Error ? err.message : 'Server tidak dapat dihubungi.');
      });
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

  // Foto dan kalimat pembuka dibedakan antara halaman masuk dan daftar agar tidak terasa seragam
  const panel = isRegister
    ? {
        img: '/landing/auth-perpustakaan.webp',
        alt: 'Deretan lemari buku kayu tua dengan lampu lilin di dinding',
        quote: 'Setiap karakter dimulai dari satu catatan kecil yang kamu tulis sendiri.',
      }
    : {
        img: '/landing/auth-mercusuar.webp',
        alt: 'Mercusuar di tepi tebing berbatu saat langit mendung',
        quote: 'Ceritamu masih menunggu di tempat terakhir kamu meninggalkannya.',
      };

  return (
    <div className="flex-1 grid lg:grid-cols-2">
      {/* Panel suasana, hanya tampil pada layar lebar */}
      <aside className="relative hidden lg:block overflow-hidden">
        <img src={panel.img} alt={panel.alt} className="absolute inset-0 h-full w-full object-cover" />
        <div aria-hidden className="absolute inset-0 bg-slate-950/62" />

        <div className="relative h-full flex flex-col justify-between p-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-white/80 hover:text-white transition-colors w-fit"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Naravia</span>
          </Link>

          <div className="max-w-sm">
            <p className="font-display text-[1.9rem] leading-snug text-white">{panel.quote}</p>
            <p className="mt-5 text-xs leading-relaxed text-white/60">
              Karakter, percakapan, dan dunia yang kamu buat hanya terlihat oleh akunmu sendiri.
            </p>
          </div>
        </div>
      </aside>

      {/* Panel formulir */}
      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[380px] animate-rise">
          <Link
            href="/"
            className="lg:hidden inline-flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors mb-7"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali ke Beranda</span>
          </Link>

          <h1 className="font-display text-[2.1rem] leading-tight text-slate-900 dark:text-white">
            {isRegister ? 'Buat akun baru' : 'Selamat datang kembali'}
          </h1>
          <p className="mt-2.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            {isRegister
              ? 'Cukup satu akun untuk merancang karakter dan menyimpan seluruh percakapanmu.'
              : 'Masuk untuk melanjutkan percakapan dan karakter yang sudah kamu buat.'}
          </p>

          {configError && (
            <div
              role="alert"
              className="mt-6 p-3.5 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-px text-rose-600 dark:text-rose-400" />
              <div className="text-xs leading-relaxed text-rose-700 dark:text-rose-300">
                <p className="font-semibold">Server bermasalah</p>
                <p className="mt-0.5">{configError}</p>
              </div>
            </div>
          )}

          {isRegister && config?.needsFirstAdmin && (
            <div className="mt-6 p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-px text-amber-700 dark:text-amber-400" />
              <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">
                Belum ada akun terdaftar di server ini. Akun pertama otomatis menjadi admin.
              </p>
            </div>
          )}

          {registrationClosed ? (
            <div className="mt-7 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3.5">
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Pendaftaran akun baru sedang ditutup. Hubungi admin untuk dibuatkan akun.
              </p>
              <Link
                href="/login"
                className="h-10 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold inline-flex items-center gap-2 transition-colors"
              >
                <span>Ke Halaman Masuk</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              {error && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                  <span className="leading-relaxed">{error}</span>
                </div>
              )}

              {isRegister && (
                <div>
                  <label htmlFor="auth-name" className={LABEL_CLASS}>
                    Nama Tampilan
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    required
                    maxLength={60}
                    autoComplete="nickname"
                    placeholder="Nama yang dipakai karakter saat menyapamu"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className={FIELD_CLASS}
                  />
                </div>
              )}

              <div>
                <label htmlFor="auth-email" className={LABEL_CLASS}>
                  Email
                </label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="nama@contoh.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={FIELD_CLASS}
                />
              </div>

              <div>
                <label htmlFor="auth-password" className={LABEL_CLASS}>
                  Kata Sandi
                </label>
                <div className="relative">
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isRegister ? 'Minimal 8 karakter, huruf dan angka' : 'Kata sandi akunmu'}
                    className={`${FIELD_CLASS} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {isRegister && (
                <div>
                  <label htmlFor="auth-confirm" className={LABEL_CLASS}>
                    Ulangi Kata Sandi
                  </label>
                  <input
                    id="auth-confirm"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={FIELD_CLASS}
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="group w-full h-11 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-55"
              >
                <span>{submitting ? 'Memproses...' : isRegister ? 'Buat Akun' : 'Masuk'}</span>
                {!submitting && <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />}
              </button>
            </form>
          )}

          {!registrationClosed && (
            <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
              {isRegister ? (
                <>
                  Sudah punya akun?{' '}
                  <Link href="/login" className="font-semibold text-slate-900 dark:text-white hover:underline">
                    Masuk di sini
                  </Link>
                </>
              ) : config?.registrationOpen ? (
                <>
                  Belum punya akun?{' '}
                  <Link href="/register" className="font-semibold text-slate-900 dark:text-white hover:underline">
                    Daftar sekarang
                  </Link>
                </>
              ) : null}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
