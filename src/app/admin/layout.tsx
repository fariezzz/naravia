import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getSessionUserByToken, SESSION_COOKIE } from '@/lib/auth';

export const metadata: Metadata = { title: 'Panel Admin - Naravia' };
export const dynamic = 'force-dynamic';

// Validasi peran admin di server sebelum halaman dirender (API admin tetap memeriksa ulang)
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const user = await getSessionUserByToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) redirect('/login?next=/admin');
  if (user.role !== 'admin') redirect('/');
  return <>{children}</>;
}
