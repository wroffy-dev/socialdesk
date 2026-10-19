import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import './globals.css';
import { Providers } from '@/components/providers';
import { THEME_SCRIPT } from '@/lib/theme-script';

export const metadata: Metadata = {
  title: { default: 'SocialDesk', template: '%s · SocialDesk' },
  description: 'Plan, schedule and publish social media content with your team.',
  ...(process.env.APP_URL ? { metadataBase: new URL(process.env.APP_URL) } : {}),
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f4f1' },
    { media: '(prefers-color-scheme: dark)', color: '#101210' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The theme script sets the `dark` class before hydration, hence suppressHydrationWarning.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
