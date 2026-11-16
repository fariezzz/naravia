import type { Metadata, Viewport } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import { ThemeProvider } from '@/lib/ThemeContext';
import { AuthProvider } from '@/lib/AuthContext';

export const metadata: Metadata = {
  title: 'Naravia - Ruang Interaksi Karakter AI',
  description: 'Ngobrol dan bermain peran dengan karakter AI buatanmu sendiri.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="h-full" suppressHydrationWarning>
      <head>
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
          <AuthProvider>
            <Navbar />
            <main className="flex-1 flex flex-col min-h-0 overflow-y-auto">{children}</main>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
