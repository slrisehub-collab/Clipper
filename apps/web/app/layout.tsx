import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Toaster } from '@/components/toast';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'ClipForge: split long videos into clips', template: '%s · ClipForge' },
  description: 'Upload a video or paste a direct video link, choose a clip length, and download every clip. Real FFmpeg processing, no editing skills needed.',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = { themeColor: '#0B1120', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh">
        <Toaster>{children}</Toaster>
      </body>
    </html>
  );
}
