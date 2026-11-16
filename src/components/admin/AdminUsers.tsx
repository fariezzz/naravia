'use client';

import React, { useEffect, useState } from 'react';
import { KeyRound, LogOut, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import {
  Alerts,
  apiJson,
  cardClass,
  formatDateTime,
  formatNumber,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from './ui';

interface AdminUserRow {
  id: string;
  email: string;
  display_name: string;
  role: 'user' | 'admin';
  is_active: boolean;
  daily_token_budget: number | null;
  last_login_at: string | null;
  created_at: string;
  character_count: number;
  chat_count: number;
  active_sessions: number;
  total_tokens: number;
  today_tokens: number;
}

type Dialog =
  | { kind: 'create' }
  | { kind: 'edit'; user: AdminUserRow }
  | { kind: 'password'; user: AdminUserRow }
  | { kind: 'delete'; user: AdminUserRow }
  | null;

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  const load = async () => {
    try {
      const data = await apiJson<{ users: AdminUserRow[] }>('/api/admin/users');
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat pengguna.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openDialog = (next: Dialog) => {
    setError('');
    setNotice('');
    if (next?.kind === 'edit') {
      setForm({
        display_name: next.user.display_name,
        role: next.user.role,
        is_active: next.user.is_active ? 'true' : 'false',
        daily_token_budget: next.user.daily_token_budget === null ? '' : String(next.user.daily_token_budget),
      });
    } else if (next?.kind === 'create') {
      setForm({ email: '', display_name: '', password: '', role: 'user', daily_token_budget: '' });
    } else {
      setForm({ password: '', confirmEmail: '' });
    }
    setDialog(next);
  };

  const submit = async (payload: Record<string, unknown>, successMessage: string) => {
    setBusy(true);
    setError('');
    try {
      await apiJson('/api/admin/users', { method: 'POST', body: JSON.stringify(payload) });
      setNotice(successMessage);
      setDialog(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Permintaan gagal.');
    } finally {
      setBusy(false);
    }
  };

  const handleDialogSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dialog) return;
    if (dialog.kind === 'create') {
      submit({ action: 'create', ...form }, `Akun ${form.email} berhasil dibuat.`);
    } else if (dialog.kind === 'edit') {
      submit(
        {
          action: 'update',
          userId: dialog.user.id,
          display_name: form.display_name,
          role: form.role,
          is_active: form.is_active === 'true',
          daily_token_budget: form.daily_token_budget,
        },
        `Akun ${dialog.user.email} diperbarui.`
      );
    } else if (dialog.kind === 'password') {
      submit(
        { action: 'reset_password', userId: dialog.user.id, password: form.password },
        `Kata sandi ${dialog.user.email} diganti dan sesinya dicabut.`
      );
    } else if (dialog.kind === 'delete') {
      submit(
        { action: 'delete', userId: dialog.user.id, confirmEmail: form.confirmEmail },
        `Akun ${dialog.user.email} beserta seluruh datanya telah dihapus.`
      );
    }
  };

  const revokeSessions = (u: AdminUserRow) =>
    submit({ action: 'revoke_sessions', userId: u.id }, `Sesi ${u.email} telah dicabut.`);

  const keyword = search.trim().toLowerCase();
  const filtered = keyword
    ? users.filter((u) => u.email.includes(keyword) || u.display_name.toLowerCase().includes(keyword))
    : users;

  return (
    <div className="space-y-4">
      <Alerts error={dialog ? '' : error} notice={notice} />

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari email atau nama..."
          className={`${inputClass} sm:max-w-xs`}
        />
        <button type="button" onClick={() => openDialog({ kind: 'create' })} className={primaryButtonClass}>
          <Plus className="w-3.5 h-3.5" />
          <span>Tambah Akun</span>
        </button>
      </div>

      <div className={`${cardClass} p-5`}>
        {loading ? (
          <p className="text-xs text-slate-400">Memuat pengguna...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-3 font-semibold">Akun</th>
                  <th className="py-2 pr-3 font-semibold">Peran</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 pr-3 font-semibold">Token Hari Ini</th>
                  <th className="py-2 pr-3 font-semibold">Kuota Harian</th>
                  <th className="py-2 pr-3 font-semibold">Isi</th>
                  <th className="py-2 pr-3 font-semibold">Terakhir Masuk</th>
                  <th className="py-2 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((u) => {
                  const isMe = u.id === me?.id;
                  return (
                    <tr key={u.id}>
                      <td className="py-2.5 pr-3">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {u.display_name}
                          {isMe && <span className="ml-1.5 text-[10px] font-normal text-slate-400">(Kamu)</span>}
                        </p>
                        <p className="text-slate-500 dark:text-slate-400">{u.email}</p>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                            u.role === 'admin'
                              ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {u.role === 'admin' ? 'Admin' : 'Pengguna'}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className={u.is_active ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                          {u.is_active ? 'Aktif' : 'Nonaktif'}
                        </span>
                        <p className="text-[11px] text-slate-400">{formatNumber(u.active_sessions)} sesi</p>
                      </td>
                      <td className="py-2.5 pr-3 text-slate-700 dark:text-slate-200">{formatNumber(u.today_tokens)}</td>
                      <td className="py-2.5 pr-3 text-slate-700 dark:text-slate-200">
                        {u.role === 'admin'
                          ? 'Tanpa Batas'
                          : u.daily_token_budget === null
                          ? 'Bawaan Sistem'
                          : u.daily_token_budget === 0
                          ? 'Tanpa Batas'
                          : formatNumber(u.daily_token_budget)}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatNumber(u.character_count)} karakter
                        <br />
                        {formatNumber(u.chat_count)} chat
                      </td>
                      <td className="py-2.5 pr-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDateTime(u.last_login_at)}
                      </td>
                      <td className="py-2.5">
                        <div className="flex justify-end gap-1">
                          <IconButton title="Ubah Akun" onClick={() => openDialog({ kind: 'edit', user: u })}>
                            <Pencil className="w-3.5 h-3.5" />
                          </IconButton>
                          <IconButton title="Atur Ulang Kata Sandi" onClick={() => openDialog({ kind: 'password', user: u })}>
                            <KeyRound className="w-3.5 h-3.5" />
                          </IconButton>
                          <IconButton title="Cabut Semua Sesi" disabled={busy} onClick={() => revokeSessions(u)}>
                            <LogOut className="w-3.5 h-3.5" />
                          </IconButton>
                          {!isMe && (
                            <IconButton title="Hapus Akun" danger onClick={() => openDialog({ kind: 'delete', user: u })}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </IconButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">Tidak ada pengguna yang cocok.</p>}
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-400">
        Isi percakapan, karakter, dan memori milik pengguna bersifat privat dan tidak ditampilkan di panel admin.
      </p>

      {dialog && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" onClick={() => !busy && setDialog(null)}>
          <form
            onSubmit={handleDialogSubmit}
            onClick={(e) => e.stopPropagation()}
            className={`${cardClass} w-full max-w-md p-5 space-y-4`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {dialog.kind === 'create' && 'Tambah Akun Baru'}
                {dialog.kind === 'edit' && `Ubah Akun ${dialog.user.email}`}
                {dialog.kind === 'password' && `Atur Ulang Kata Sandi ${dialog.user.email}`}
                {dialog.kind === 'delete' && 'Hapus Akun Permanen?'}
              </h3>
              <button type="button" onClick={() => setDialog(null)} aria-label="Tutup" className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <Alerts error={error} />

            {dialog.kind === 'create' && (
              <>
                <Field label="Email">
                  <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
                </Field>
                <Field label="Nama Tampilan">
                  <input required maxLength={60} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className={inputClass} />
                </Field>
                <Field label="Kata Sandi Awal">
                  <input type="password" required autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Minimal 8 karakter, huruf dan angka" className={inputClass} />
                </Field>
                <RoleAndBudget form={form} setForm={setForm} />
              </>
            )}

            {dialog.kind === 'edit' && (
              <>
                <Field label="Nama Tampilan">
                  <input required maxLength={60} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className={inputClass} />
                </Field>
                <RoleAndBudget form={form} setForm={setForm} disableRole={dialog.user.id === me?.id} />
                <Field label="Status Akun">
                  <select
                    value={form.is_active}
                    disabled={dialog.user.id === me?.id}
                    onChange={(e) => setForm({ ...form, is_active: e.target.value })}
                    className={inputClass}
                  >
                    <option value="true">Aktif</option>
                    <option value="false">Nonaktif (Tidak Bisa Masuk)</option>
                  </select>
                </Field>
              </>
            )}

            {dialog.kind === 'password' && (
              <Field label="Kata Sandi Baru">
                <input type="password" required autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Minimal 8 karakter, huruf dan angka" className={inputClass} />
              </Field>
            )}

            {dialog.kind === 'delete' && (
              <>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Seluruh karakter, percakapan, persona, dunia, memori, dan unggahan milik akun ini akan dihapus permanen.
                </p>
                <Field label={`Ketik ulang ${dialog.user.email} untuk konfirmasi`}>
                  <input value={form.confirmEmail} onChange={(e) => setForm({ ...form, confirmEmail: e.target.value })} className={inputClass} />
                </Field>
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setDialog(null)} disabled={busy} className={secondaryButtonClass}>
                Batal
              </button>
              <button
                type="submit"
                disabled={busy || (dialog.kind === 'delete' && form.confirmEmail.trim().toLowerCase() !== dialog.user.email)}
                className={dialog.kind === 'delete' ? `${primaryButtonClass} !bg-rose-600 hover:!bg-rose-700` : primaryButtonClass}
              >
                {busy ? 'Memproses...' : dialog.kind === 'delete' ? 'Hapus Permanen' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  );
}

function RoleAndBudget({
  form,
  setForm,
  disableRole,
}: {
  form: Record<string, string>;
  setForm: (f: Record<string, string>) => void;
  disableRole?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Peran">
        <select value={form.role} disabled={disableRole} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inputClass}>
          <option value="user">Pengguna</option>
          <option value="admin">Admin</option>
        </select>
      </Field>
      <Field label="Kuota Token Harian">
        <input
          type="number"
          min="0"
          step="1000"
          value={form.daily_token_budget}
          disabled={form.role === 'admin'}
          onChange={(e) => setForm({ ...form, daily_token_budget: e.target.value })}
          placeholder="Kosong = bawaan, 0 = tanpa batas"
          className={inputClass}
        />
      </Field>
    </div>
  );
}

function IconButton({
  title,
  onClick,
  children,
  danger,
  disabled,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`w-8 h-8 rounded-lg inline-flex items-center justify-center border transition-colors disabled:opacity-50 ${
        danger
          ? 'border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  );
}
