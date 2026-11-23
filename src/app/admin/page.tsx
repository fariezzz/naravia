'use client';

import React, { useState } from 'react';
import { Activity, Cpu, Users } from 'lucide-react';
import AdminOverview from '@/components/admin/AdminOverview';
import AdminUsers from '@/components/admin/AdminUsers';
import AdminSystemSettings from '@/components/admin/AdminSystemSettings';

type Tab = 'overview' | 'users' | 'system';

const TABS: Array<{ id: Tab; label: string; icon: typeof Activity }> = [
  { id: 'overview', label: 'Ringkasan', icon: Activity },
  { id: 'users', label: 'Pengguna', icon: Users },
  { id: 'system', label: 'Model AI & Sistem', icon: Cpu },
];

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
      <header className="space-y-2">
        <h1 className="font-display text-3xl sm:text-4xl text-slate-900 dark:text-white">Panel Admin</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Kelola pengguna, kuota token, provider AI, dan pantau aktivitas sistem.
        </p>
      </header>

      <div className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-1.5 inline-flex overflow-x-auto items-center gap-1 max-w-full">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`h-9 px-3.5 sm:px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors shrink-0 ${
                active
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {tab === 'overview' && <AdminOverview />}
      {tab === 'users' && <AdminUsers />}
      {tab === 'system' && <AdminSystemSettings />}
    </div>
  );
}
