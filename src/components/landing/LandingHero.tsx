import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

interface LandingHeroProps {
  registrationOpen: boolean;
}

// Contoh percakapan singkat untuk menggambarkan bentuk produk, bukan data pengguna sungguhan
const SAMPLE_TURNS = [
  { who: 'char' as const, name: 'Kirana', text: 'Kedainya sudah mau tutup. Kamu masih mau pesan satu lagi, atau kita jalan dulu?' },
  { who: 'user' as const, name: 'Kamu', text: 'Satu lagi. Aku belum siap pulang.' },
  { who: 'char' as const, name: 'Kirana', text: 'Baiklah. Tapi kali ini ceritamu dulu yang dibayar, bukan kopinya.' },
];

export default function LandingHero({ registrationOpen }: LandingHeroProps) {
  return (
    <section className="relative overflow-hidden border-b border-slate-200 dark:border-slate-800">
      {/* Cahaya latar yang sangat halus, bukan gradien penuh warna */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-amber-100/50 blur-3xl dark:bg-indigo-500/10"
      />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-14 sm:pt-20 sm:pb-20">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-14 items-center">
          {/* Kolom teks */}
          <div className="animate-rise">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400">
              Ruang Interaksi Karakter AI
            </p>

            <h1 className="font-display mt-4 text-[2.6rem] leading-[1.06] sm:text-6xl lg:text-[4.1rem] text-slate-900 dark:text-white">
              Karakter yang
              <br />
              <span className="italic">mengingat</span> ceritamu.
            </h1>

            <p className="mt-5 max-w-xl text-[15px] sm:text-base leading-relaxed text-slate-600 dark:text-slate-300">
              Naravia tempat kamu merancang karakter dengan kepribadian, gaya bicara, dan dunianya sendiri, lalu
              menjalani kisahnya lewat percakapan. Setiap akun punya ruang pribadi yang tidak terlihat oleh siapa pun.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {registrationOpen ? (
                <>
                  <Link
                    href="/register"
                    className="group h-12 px-6 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-sm font-semibold inline-flex items-center gap-2 transition-colors"
                  >
                    <span>Buat Akun Gratis</span>
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <Link
                    href="/login"
                    className="h-12 px-6 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-slate-900 dark:hover:border-slate-500 text-slate-800 dark:text-slate-200 text-sm font-semibold inline-flex items-center transition-colors"
                  >
                    Masuk
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="group h-12 px-6 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-sm font-semibold inline-flex items-center gap-2 transition-colors"
                  >
                    <span>Masuk ke Akun</span>
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Pendaftaran sedang ditutup. Hubungi admin untuk dibuatkan akun.
                  </span>
                </>
              )}
            </div>

            <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
              Pilih sendiri model AI yang dipakai. Bawa kunci API milikmu atau layanan yang disiapkan admin.
            </p>
          </div>

          {/* Kolom gambar dengan kartu percakapan mengapung */}
          <div className="animate-rise relative" style={{ animationDelay: '120ms' }}>
            <div className="relative mx-auto w-full max-w-[440px]">
              <div className="overflow-hidden rounded-[28px] border border-slate-200 dark:border-slate-800 shadow-[0_24px_70px_-32px_rgba(15,23,42,0.45)]">
                <img
                  src="/landing/hero-kafe.webp"
                  alt="Interior kedai kopi dengan cahaya hangat di malam hari"
                  width={880}
                  height={1100}
                  className="w-full h-[380px] sm:h-[460px] object-cover"
                />
              </div>

              <div className="absolute -bottom-6 -left-3 sm:-left-8 w-[270px] sm:w-[310px] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-[#0f1729]/95 backdrop-blur p-3.5 shadow-xl">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500 mb-2.5">
                  Contoh Percakapan
                </p>
                <div className="space-y-2">
                  {SAMPLE_TURNS.map((turn, i) => (
                    <div key={i} className={turn.who === 'user' ? 'flex justify-end' : ''}>
                      <div
                        className={`max-w-[88%] rounded-xl px-3 py-2 text-[11.5px] leading-relaxed ${
                          turn.who === 'user'
                            ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {turn.text}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
