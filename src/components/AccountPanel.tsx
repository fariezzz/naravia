'use client';

import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, Laptop, LogOut, MonitorSmartphone, Save, Smartphone, Trash2 } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import { useAuth } from '@/lib/AuthContext';

interface SessionItem {
  id: string;
  user_agent: string;
  ip: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  is_current: boolean;
}

interface AccountInfo {
  email: string;
  display_name: string;
  role: 'user' | 'admin';
  created_at: string | null;
  last_login_at: string | null;
  active_sessions: number;
  sessions?: SessionItem[];
}

function summarizeUserAgent(ua: string): { label: string; isMobile: boolean } {
  const lower = (ua || '').toLowerCase();
  const isMobile = /mobile|android|iphone|ipad/.test(lower);
  const browser = lower.includes('edg/')
    ? 'Edge'
    : lower.includes('chrome/') && !lower.includes('chromium')
    ? 'Chrome'
    : lower.includes('firefox/')
    ? 'Firefox'
    : lower.includes('safari/') && !lower.includes('chrome')
    ? 'Safari'
    : 'Browser';
  const os = lower.includes('windows')
    ? 'Windows'
    : lower.includes('android')
    ? 'Android'
    : lower.includes('iphone') || lower.includes('ipad')
    ? 'iOS'
    : lower.includes('mac os')
    ? 'macOS'
    : lower.includes('linux')
    ? 'Linux'
    : 'Perangkat lain';
  return { label: `${browser} di ${os}`, isMobile };
}

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

const inputClass =
  'w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-xs text-slate-900 dark:text-slate-100';

export default function AccountPanel() {
  const { refresh, logout } = useAuth();
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [logoutAllOpen, setLogoutAllOpen] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/auth/account');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memuat informasi akun.');
      setAccount(data.account);
      setDisplayName(data.account.display_name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat informasi akun.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const post = async (key: string, payload: Record<string, unknown>, successMessage: string) => {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/auth/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Permintaan gagal.');
      setNotice(successMessage);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Permintaan gagal.');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = await post('profile', { action: 'update_profile', display_name: displayName }, 'Nama tampilan akun diperbarui.');
    if (data) {
      await refresh();
      load();
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi kata sandi baru tidak cocok.');
      return;
    }
    const data = await post(
      'password',
      { action: 'change_password', current_password: currentPassword, new_password: newPassword },
      'Kata sandi diganti. Sesi di perangkat lain telah dikeluarkan.'
    );
    if (data) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      load();
    }
  };

  const handleLogoutOthers = async () => {
    const data = await post('others', { action: 'logout_others' }, 'Semua perangkat lain telah dikeluarkan.');
    if (data) load();
  };

  const handleRevokeSession = async (sessionId: string) => {
    const data = await post(
      `revoke_${sessionId}`,
      { action: 'revoke_session', session_id: sessionId },
      'Sesi perangkat telah dicabut.'
    );
    if (data?.revokedSelf) {
      await logout(false);
    } else if (data) {
      load();
    }
  };

  const handleLogoutAll = async () => {
    setLogoutAllOpen(false);
    const data = await post('all', { action: 'logout_all' }, '');
    if (data) await logout(false);
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      <form
        onSubmit={handleSaveProfile}
        className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-2xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Informasi Akun</h3>
          {account?.role === 'admin' && (
            <span className="self-start px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
              Admin
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Email</label>
            <input type="email" value={account?.email || ''} disabled className={`${inputClass} opacity-70`} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Nama Tampilan Akun</label>
            <input
              type="text"
              value={displayName}
              maxLength={60}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Terdaftar {formatDate(account?.created_at || null)} - Terakhir masuk {formatDate(account?.last_login_at || null)}
          </p>
            <button
              type="submit"
              disabled={busy !== null || !displayName.trim()}
              className="h-9 px-4 rounded-xl bg-slate-900 dark:bg-indigo-600 hover:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60 shrink-0 transition-colors"
            >
            <Save className="w-3.5 h-3.5" />
            <span>{busy === 'profile' ? 'Menyimpan...' : 'Simpan Nama'}</span>
          </button>
        </div>
      </form>

      <form
        onSubmit={handleChangePassword}
        className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-2xs"
      >
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Ganti Kata Sandi</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Kata Sandi Saat Ini</label>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Kata Sandi Baru</label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimal 8 karakter, huruf dan angka"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Ulangi Kata Sandi Baru</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="submit"
            disabled={busy !== null || !currentPassword || !newPassword}
            className="h-9 px-4 rounded-xl bg-slate-900 dark:bg-indigo-600 hover:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60 transition-colors"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{busy === 'password' ? 'Mengganti...' : 'Ganti Kata Sandi'}</span>
          </button>
        </div>
      </form>

      <div className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-2xs">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Sesi Perangkat</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {account ? `${account.active_sessions} sesi aktif, termasuk perangkat ini.` : 'Memuat...'}
          </p>
        </div>
        {account?.sessions && account.sessions.length > 0 && (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {account.sessions.map((s) => {
              const info = summarizeUserAgent(s.user_agent);
              const Icon = info.isMobile ? Smartphone : Laptop;
              return (
                <div
                  key={s.id}
                  className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-900/40"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Icon className="w-4 h-4 text-slate-400 dark:text-slate-500 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{info.label}</span>
                        {s.is_current && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold">
                            Perangkat ini
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        IP: {s.ip || '-'} · Aktif terakhir {formatDate(s.last_seen_at)}
                      </p>
                    </div>
                  </div>
                  {!s.is_current && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => handleRevokeSession(s.id)}
                      className="self-end sm:self-center h-7 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400 text-[11px] font-medium text-slate-600 dark:text-slate-300 inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>{busy === `revoke_${s.id}` ? 'Mencabut...' : 'Cabut'}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={handleLogoutOthers}
            className="h-9 px-4 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            <MonitorSmartphone className="w-3.5 h-3.5" />
            <span>{busy === 'others' ? 'Memproses...' : 'Keluarkan Perangkat Lain'}</span>
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => setLogoutAllOpen(true)}
            className="h-9 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar dari Semua Perangkat</span>
          </button>
        </div>
      </div>

      <ConfirmModal
        open={logoutAllOpen}
        title="Keluar dari Semua Perangkat?"
        description="Semua sesi, termasuk perangkat ini, akan diakhiri. Kamu perlu masuk kembali."
        confirmLabel="Keluar Semua"
        loading={busy === 'all'}
        onConfirm={handleLogoutAll}
        onCancel={() => setLogoutAllOpen(false)}
      />
    </div>
  );
}
