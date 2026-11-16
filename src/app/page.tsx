import { cookies } from 'next/headers';
import { queryOne } from '@/lib/db';
import { getSessionUserByToken, SESSION_COOKIE } from '@/lib/auth';
import { getSystemSettings } from '@/lib/store';
import HomeDashboard from '@/components/HomeDashboard';
import LandingHero from '@/components/landing/LandingHero';
import LandingSections from '@/components/landing/LandingSections';

export const dynamic = 'force-dynamic';

// Beranda punya dua wajah: halaman perkenalan untuk tamu, dashboard karakter untuk yang sudah masuk
export default async function HomePage() {
  const cookieStore = await cookies();
  const user = await getSessionUserByToken(cookieStore.get(SESSION_COOKIE)?.value).catch(() => null);

  if (user) return <HomeDashboard />;

  // Tombol utama menyesuaikan diri saat admin menutup pendaftaran
  let registrationOpen = true;
  try {
    const [system, count] = await Promise.all([
      getSystemSettings(),
      queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM users'),
    ]);
    const hasUsers = Number(count?.cnt || 0) > 0;
    registrationOpen = !hasUsers || system.registration_mode !== 'closed';
  } catch {
    // Database belum siap: biarkan tombol daftar tampil, validasi tetap dilakukan di API
  }

  return (
    <div className="w-full">
      <LandingHero registrationOpen={registrationOpen} />
      <LandingSections />
    </div>
  );
}
