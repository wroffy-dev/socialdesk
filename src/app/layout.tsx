import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: { default: 'SocialDesk', template: '%s · SocialDesk' },
  description: 'Plan, schedule and publish social media content with your team.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f5f4f1' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
