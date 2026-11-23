'use client';

import React from 'react';

interface StatsTabProps {
  stats: any;
}

export default function StatsTab({ stats }: StatsTabProps) {
  if (!stats) return null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs">
          <span className="text-xs text-slate-500 dark:text-slate-400">Pemakaian Token Hari Ini</span>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            {stats.summary.today_used.toLocaleString('id-ID')}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">{stats.summary.today_calls} permintaan hari ini</p>
        </div>

        <div className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs">
          <span className="text-xs text-slate-500 dark:text-slate-400">Sisa Kuota Hari Ini</span>
          {stats.summary.daily_budget > 0 ? (
            <>
              <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">
                {Number(stats.summary.remaining_budget || 0).toLocaleString('id-ID')}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Dari batas {stats.summary.daily_budget.toLocaleString('id-ID')} token/hari, diperbarui tiap tengah malam
              </p>
            </>
          ) : (
            <>
              <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">Tanpa Batas</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Akun ini tidak dibatasi kuota harian</p>
            </>
          )}
        </div>

        <div className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs">
          <span className="text-xs text-slate-500 dark:text-slate-400">Total Akumulasi Token</span>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            {stats.summary.total_tokens.toLocaleString('id-ID')}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Masuk: {stats.summary.total_in.toLocaleString('id-ID')} · Keluar:{' '}
            {stats.summary.total_out.toLocaleString('id-ID')}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-[#0f1729] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3 shadow-2xs">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Pemakaian Token per Karakter</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-2 font-semibold">Karakter</th>
                <th className="py-2 font-semibold">Panggilan</th>
                <th className="py-2 font-semibold">Token Masuk</th>
                <th className="py-2 font-semibold">Token Keluar</th>
                <th className="py-2 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(stats.byCharacter || []).map((row: any) => {
                const tot = Number(row.tokens_in || 0) + Number(row.tokens_out || 0);
                return (
                  <tr key={row.character_id}>
                    <td className="py-2.5 font-medium text-slate-900 dark:text-slate-100">{row.character_name}</td>
                    <td className="py-2.5 text-slate-600 dark:text-slate-300">{row.call_count}</td>
                    <td className="py-2.5 text-slate-600 dark:text-slate-300">
                      {Number(row.tokens_in || 0).toLocaleString('id-ID')}
                    </td>
                    <td className="py-2.5 text-slate-600 dark:text-slate-300">
                      {Number(row.tokens_out || 0).toLocaleString('id-ID')}
                    </td>
                    <td className="py-2.5 font-semibold text-slate-900 dark:text-white">
                      {tot.toLocaleString('id-ID')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
