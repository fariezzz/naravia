'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';

export default function UnlockPage() {
  const router = useRouter();
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kunci akses ditolak.');
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuka kunci.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl border border-slate-200 max-w-sm w-full p-6 shadow-sm space-y-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">Kunci Akses Naravia</h1>
            <p className="text-xs text-slate-500">Masukkan kunci akses server Anda.</p>
          </div>
        </div>

        {error && (
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
            {error}
          </div>
        )}

        <input
          type="password"
          required
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Kunci Akses..."
          className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full h-9 rounded-lg bg-slate-900 hover:bg-indigo-600 text-white text-xs font-semibold"
        >
          {loading ? 'Memeriksa...' : 'Buka Naravia'}
        </button>
      </form>
    </div>
  );
}
