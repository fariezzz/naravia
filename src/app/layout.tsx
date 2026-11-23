import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { cookies } from 'next/headers';
import './globals.css';
import Navbar from '@/components/Navbar';
import { ThemeProvider } from '@/lib/ThemeContext';
import { AuthProvider } from '@/lib/AuthContext';
import { getSessionUserByToken, SESSION_COOKIE } from '@/lib/auth';

// Font di-host sendiri agar tidak ada permintaan ke Google Fonts saat build maupun saat halaman dibuka
const sans = localFont({
  src: './fonts/PlusJakartaSans-Variable.woff2',
  weight: '300 800',
  display: 'swap',
  variable: '--font-sans',
  fallback: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
});

const display = localFont({
  src: [
    { path: './fonts/InstrumentSerif-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/InstrumentSerif-Italic.woff2', weight: '400', style: 'italic' },
  ],
  display: 'swap',
  variable: '--font-display',
  fallback: ['Georgia', 'Cambria', 'serif'],
});

export const metadata: Metadata = {
  title: 'Naravia - Ruang Interaksi Karakter AI',
  description:
    'Rancang karakter dengan kepribadian, ingatan, dan dunianya sendiri, lalu jalani ceritanya lewat percakapan. Setiap akun punya ruang pribadi yang terpisah.',
  manifest: '/manifest.json',
  openGraph: {
    title: 'Naravia - Ruang Interaksi Karakter AI',
    description: 'Rancang karakter, bangun dunianya, lalu jalani ceritanya lewat percakapan.',
    type: 'website',
    locale: 'id_ID',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  interactiveWidget: 'resizes-content',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Sesi dibaca di server agar navbar dan beranda tidak berkedip saat memuat identitas akun
  const cookieStore = await cookies();
  const session = await getSessionUserByToken(cookieStore.get(SESSION_COOKIE)?.value).catch(() => null);
  const initialUser = session
    ? {
        id: session.id,
        email: session.email,
        display_name: session.display_name,
        role: session.role,
        avatar: '',
      }
    : null;

  return (
    <html lang="id" className={`h-full ${sans.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static inline theme hydration script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const t = localStorage.getItem('naravia-theme');
                if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body className="h-full flex flex-col bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100 overflow-x-hidden">
        <ThemeProvider>
          <AuthProvider initialUser={initialUser}>
            <Navbar />
            <main className="flex-1 flex flex-col min-h-0 overflow-y-auto">{children}</main>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
