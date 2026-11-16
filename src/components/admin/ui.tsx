'use client';

import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

// Komponen tampilan kecil yang dipakai bersama oleh panel admin

export const cardClass =
  'bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs';

export const inputClass =
  'w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-xs text-slate-900 dark:text-slate-100 disabled:opacity-60';

export const labelClass = 'block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1';

export const primaryButtonClass =
  'h-9 px-4 rounded-xl bg-slate-900 dark:bg-indigo-600 hover:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60 shrink-0';

export const secondaryButtonClass =
  'h-9 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60 shrink-0';

export function Alerts({ error, notice }: { error?: string; notice?: string }) {
  return (
    <>
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
    </>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className={`${cardClass} p-4`}>
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">{value}</p>
      {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}

export function formatNumber(n: unknown): string {
  return Number(n || 0).toLocaleString('id-ID');
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatBytes(n: unknown): string {
  const bytes = Number(n || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function apiJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...(init?.headers || {}) } : init?.headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Permintaan gagal.');
  return data as T;
}
