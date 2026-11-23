'use client';

import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  Alerts,
  apiJson,
  cardClass,
  formatBytes,
  formatDateTime,
  formatNumber,
  secondaryButtonClass,
  StatCard,
} from './ui';

// Label aksi audit agar mudah dibaca admin
const ACTION_LABELS: Record<string, string> = {
  login: 'Masuk',
  login_gagal: 'Gagal Masuk',
  login_ditolak_nonaktif: 'Masuk Ditolak (Nonaktif)',
  logout: 'Keluar',
  daftar: 'Daftar Akun',
  daftar_admin_pertama: 'Daftar Admin Pertama',
  ganti_kata_sandi: 'Ganti Kata Sandi',
  keluar_perangkat_lain: 'Keluarkan Perangkat Lain',
  keluar_semua_perangkat: 'Keluar Semua Perangkat',
  ekspor_data: 'Ekspor Data',
  hapus_semua_data: 'Hapus Semua Data',
  ubah_setelan_sistem: 'Ubah Setelan Sistem',
  bersihkan_aset_global: 'Bersihkan Aset Global',
  admin_buat_akun: 'Admin Buat Akun',
  admin_ubah_akun: 'Admin Ubah Akun',
  admin_reset_sandi: 'Admin Reset Kata Sandi',
  admin_cabut_sesi: 'Admin Cabut Sesi',
  admin_hapus_akun: 'Admin Hapus Akun',
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  chat: 'Chat',
  group_chat: 'Grup Chat',
  research: 'Riset Karakter',
  summary: 'Ringkasan',
  memory: 'Ekstraksi Memori',
  title: 'Judul Otomatis',
  preview: 'Pratinjau & Tes',
  generate: 'Generate',
};

export default function AdminOverview() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await apiJson('/api/admin/overview?auditLimit=100'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat ringkasan.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (!data) {
    return (
      <div className="space-y-3">
        <Alerts error={error} />
        {loading && <p className="text-xs text-slate-400">Memuat ringkasan...</p>}
      </div>
    );
  }

  const { counts, tokens, audit } = data;
  const maxDaily = Math.max(1, ...tokens.daily.map((d: any) => Number(d.tokens || 0)));

  return (
    <div className="space-y-5">
      <Alerts error={error} />

      <div className="flex justify-end">
        <button type="button" onClick={load} disabled={loading} className={secondaryButtonClass}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Muat Ulang</span>
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Pengguna"
          value={formatNumber(counts.users)}
          hint={`${formatNumber(counts.active_users)} aktif - ${formatNumber(counts.admins)} admin`}
        />
        <StatCard label="Aktif 24 Jam" value={formatNumber(counts.online_24h)} hint="Pengguna dengan sesi aktif" />
        <StatCard
          label="Token Hari Ini"
          value={formatNumber(tokens.today_tokens)}
          hint={`${formatNumber(tokens.today_calls)} panggilan model`}
        />
        <StatCard
          label="Total Token"
          value={formatNumber(tokens.total_tokens)}
          hint={`${formatNumber(tokens.total_calls)} panggilan model`}
        />
        <StatCard label="Karakter" value={formatNumber(counts.characters)} />
        <StatCard label="Percakapan" value={formatNumber(counts.chats)} hint={`${formatNumber(counts.group_chats)} grup chat`} />
        <StatCard label="Pesan" value={formatNumber(counts.messages)} />
        <StatCard label="File Unggahan" value={formatNumber(counts.uploads)} hint={formatBytes(counts.upload_bytes)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`${cardClass} p-5 space-y-3`}>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Pemakaian Token 14 Hari Terakhir</h3>
          {tokens.daily.length === 0 ? (
            <p className="text-xs text-slate-400">Belum ada pemakaian.</p>
          ) : (
            <div className="space-y-1.5">
              {tokens.daily.map((d: any) => (
                <div key={d.day} className="flex items-center gap-2 text-[11px]">
                  <span className="w-20 shrink-0 text-slate-500 dark:text-slate-400">{d.day}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${(Number(d.tokens) / maxDaily) * 100}%` }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right font-semibold text-slate-700 dark:text-slate-200">
                    {formatNumber(d.tokens)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={`${cardClass} p-5 space-y-4`}>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Pemakaian per Jenis Aksi</h3>
            {tokens.byAction.map((a: any) => (
              <div key={a.action_type} className="flex justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300">{ACTION_TYPE_LABELS[a.action_type] || a.action_type}</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {formatNumber(a.tokens)} <span className="font-normal text-slate-400">({formatNumber(a.calls)}x)</span>
                </span>
              </div>
            ))}
          </div>
          <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Pengguna Teraktif (7 Hari)</h3>
            {tokens.topUsers.length === 0 && <p className="text-xs text-slate-400">Belum ada pemakaian.</p>}
            {tokens.topUsers.map((u: any) => (
              <div key={u.email} className="flex justify-between gap-3 text-xs">
                <span className="text-slate-600 dark:text-slate-300 truncate">
                  {u.display_name} <span className="text-slate-400">({u.email})</span>
                </span>
                <span className="font-semibold text-slate-900 dark:text-white shrink-0">{formatNumber(u.tokens)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={`${cardClass} p-5 space-y-3`}>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Log Aktivitas Keamanan</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-2 pr-3 font-semibold whitespace-nowrap">Waktu</th>
                <th className="py-2 pr-3 font-semibold whitespace-nowrap">Aksi</th>
                <th className="py-2 pr-3 font-semibold">Akun</th>
                <th className="py-2 pr-3 font-semibold">Detail</th>
                <th className="py-2 font-semibold text-right whitespace-nowrap">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {audit.map((row: any) => (
                <tr key={row.id}>
                  <td className="py-2 pr-3 whitespace-nowrap text-[11px] text-slate-500 dark:text-slate-400">
                    {formatDateTime(row.created_at)}
                  </td>
                  <td
                    className={`py-2 pr-3 whitespace-nowrap font-medium ${
                      row.action.includes('gagal') || row.action.includes('ditolak')
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {ACTION_LABELS[row.action] || row.action}
                  </td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-300 max-w-[160px] truncate" title={row.actor_email || ''}>
                    {row.actor_email || '-'}
                  </td>
                  <td className="py-2 pr-3 text-slate-500 dark:text-slate-400 max-w-[200px] truncate" title={row.detail}>
                    {row.detail || '-'}
                  </td>
                  <td className="py-2 font-mono text-[11px] text-slate-400 text-right whitespace-nowrap">
                    {row.ip || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
