import type { Metadata, Viewport } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'Naravia - Ruang Interaksi Karakter AI Pribadi',
  description: 'Aplikasi roleplay dan diskusi karakter AI pribadi berbasis lokal.',
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
    <html lang="id" className="h-full">
      <body className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-x-hidden">
        <Navbar />
        <main className="flex-1 flex flex-col min-h-0 overflow-y-auto">{children}</main>
      </body>
    </html>
  );
}
