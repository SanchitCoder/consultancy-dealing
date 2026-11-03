import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = { title: { default: 'Deal Pipeline', template: '%s · Deal Pipeline' }, description: 'Discovery calls, proposals and win rates for consultancies and agencies.' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: [{ media: '(prefers-color-scheme: light)', color: '#f6f5f1' }, { media: '(prefers-color-scheme: dark)', color: '#0e1012' }] };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
