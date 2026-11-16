import Link from 'next/link';
import { ArrowRight, BookOpen, Brain, Globe2, Lock, Users, Wand2 } from 'lucide-react';

// Tiga langkah inti produk, bukan daftar fitur hiasan
const STEPS = [
  {
    icon: Wand2,
    title: 'Rancang Karakternya',
    body: 'Tulis beberapa kalimat ide, lalu biarkan AI melengkapi kepribadian, gaya bicara, sapaan awal, dan contoh dialog untuk kamu tinjau. Bisa juga diisi manual sepenuhnya, atau impor kartu karakter yang sudah ada.',
  },
  {
    icon: Globe2,
    title: 'Bangun Dunianya',
    body: 'Satukan beberapa karakter dalam satu dunia, lengkap dengan catatan lore yang otomatis dibawa ke percakapan saat relevan. Dunia yang sama bisa dipakai ulang untuk cerita berbeda.',
  },
  {
    icon: BookOpen,
    title: 'Jalani Ceritanya',
    body: 'Balasan muncul mengalir kata demi kata, bisa dihentikan, diulang, atau disunting. Simpan kejadian penting sebagai ingatan agar karakter tetap konsisten di percakapan berikutnya.',
  },
];

// Setiap kartu memakai foto suasana, bukan ikon generik
const SCENES = [
  { img: 'genre-kafe.webp', label: 'Keseharian', caption: 'Percakapan ringan sepulang kerja' },
  { img: 'genre-perpustakaan.webp', label: 'Misteri', caption: 'Arsip tua dan catatan yang hilang' },
  { img: 'genre-neon.webp', label: 'Fiksi Ilmiah', caption: 'Kota yang tidak pernah benar-benar sepi' },
  { img: 'genre-lembah.webp', label: 'Fantasi', caption: 'Perjalanan melewati lembah berkabut' },
  { img: 'genre-peron.webp', label: 'Perpisahan', caption: 'Peron terakhir sebelum kereta berangkat' },
];

const CAPABILITIES = [
  {
    icon: Brain,
    title: 'Ingatan Jangka Panjang',
    body: 'Tandai kejadian penting, dan karakter akan membawanya ke percakapan berikutnya tanpa kamu ulang ceritakan.',
  },
  {
    icon: Users,
    title: 'Grup Multi Karakter',
    body: 'Satukan beberapa karakter dalam satu ruang. Masing-masing tetap memakai kepribadian dan cara bicaranya sendiri.',
  },
  {
    icon: Lock,
    title: 'Ruang Pribadi Per Akun',
    body: 'Karakter, percakapan, dan dunia hanya terlihat oleh pemiliknya. Admin mengelola layanan tanpa membaca isi percakapan.',
  },
];

export default function LandingSections() {
  return (
    <>
      {/* Tiga langkah */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl sm:text-4xl text-slate-900 dark:text-white">
            Dari satu kalimat ide, sampai cerita yang berjalan
          </h2>
        </div>

        <div className="mt-10 grid gap-x-8 gap-y-9 sm:grid-cols-3">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="border-t border-slate-200 dark:border-slate-800 pt-5">
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                  <span className="text-[11px] font-semibold tabular-nums text-slate-400 dark:text-slate-500">
                    0{i + 1}
                  </span>
                </div>
                <h3 className="mt-3 text-base font-semibold text-slate-900 dark:text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{step.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Galeri suasana */}
      <section className="border-y border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1120] py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-display text-3xl sm:text-4xl text-slate-900 dark:text-white max-w-lg">
              Latar apa pun, selama kamu yang menulisnya
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
              Tidak ada katalog karakter bersama. Semua yang kamu lihat di akunmu adalah hasil rancanganmu sendiri.
            </p>
          </div>

          <div className="mt-9 grid grid-cols-2 md:grid-cols-5 gap-3.5">
            {SCENES.map((scene, i) => (
              <figure
                key={scene.label}
                className={`group relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 ${
                  i === 4 ? 'col-span-2 md:col-span-1' : ''
                }`}
              >
                <img
                  src={`/landing/${scene.img}`}
                  alt={scene.caption}
                  width={800}
                  height={1000}
                  loading="lazy"
                  decoding="async"
                  className="h-[260px] md:h-[320px] w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
                <div
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/15 to-transparent"
                />
                <figcaption className="absolute inset-x-0 bottom-0 p-3.5">
                  <p className="text-[13px] font-semibold text-white">{scene.label}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-white/70">{scene.caption}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Kemampuan utama */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <h2 className="font-display text-3xl sm:text-4xl text-slate-900 dark:text-white">
            Yang membuat percakapannya bertahan lama
          </h2>

          <div className="space-y-7">
            {CAPABILITIES.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex gap-4">
                  <div className="mt-0.5 w-9 h-9 shrink-0 rounded-xl border border-slate-200 dark:border-slate-800 inline-flex items-center justify-center text-slate-700 dark:text-slate-300">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">{item.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{item.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Ajakan penutup */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
        <div className="relative overflow-hidden rounded-[28px] border border-slate-200 dark:border-slate-800">
          <img
            src="/landing/cta-hutan.webp"
            alt="Jalan setapak di hutan berkabut menuju cahaya"
            width={1200}
            height={640}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div aria-hidden className="absolute inset-0 bg-slate-950/72" />

          <div className="relative px-6 py-14 sm:px-14 sm:py-20 text-center">
            <h2 className="font-display text-3xl sm:text-[2.6rem] leading-tight text-white max-w-2xl mx-auto">
              Karakter pertamamu bisa jadi malam ini
            </h2>
            <p className="mt-4 text-sm sm:text-base text-white/70 max-w-md mx-auto leading-relaxed">
              Buat akun, tulis satu ide, lalu mulai percakapan pertamanya.
            </p>
            <Link
              href="/register"
              className="group mt-8 h-12 px-7 rounded-xl bg-white hover:bg-slate-100 text-slate-900 text-sm font-semibold inline-flex items-center gap-2 transition-colors"
            >
              <span>Mulai Sekarang</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-7 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">Naravia - Ruang Interaksi Karakter AI</p>
          <div className="flex items-center gap-5 text-xs">
            <Link href="/login" className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">
              Masuk
            </Link>
            <Link href="/register" className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">
              Daftar
            </Link>
          </div>
        </div>
      </footer>
    </>
  );
}
