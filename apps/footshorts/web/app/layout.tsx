import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/lib/ThemeProvider';
import { AuthProvider } from '@/lib/AuthProvider';
import { AuthModalProvider } from '@/lib/AuthModalProvider';
import { QueryProvider } from '@/lib/QueryProvider';
import { Analytics } from '@vercel/analytics/next';
import AmplitudeProvider from '@/components/AmplitudeProvider';

const DESCRIPTION =
  'Football news in 60 words, and data stories on the tactics, title races and transfers behind the headlines.';

export const metadata: Metadata = {
  // Relative canonical / OG URLs resolve against production, never a preview
  // host; www, since the apex redirects to it.
  metadataBase: new URL('https://www.footshorts.com'),
  applicationName: 'Footshorts',
  title: { default: 'Footshorts · Football news, short', template: '%s · Footshorts' },
  description: DESCRIPTION,
  openGraph: { type: 'website', siteName: 'Footshorts', locale: 'en_GB', description: DESCRIPTION },
  twitter: { card: 'summary_large_image' },
  alternates: { types: { 'application/rss+xml': [{ url: '/editorial/rss.xml', title: 'Footshorts Editorial' }] } },
  // iOS has no manifest-driven install — these drive "Add to Home Screen":
  // launch fullscreen (standalone), the home-screen label, and a dark status bar.
  appleWebApp: {
    capable: true,
    title: 'Footshorts',
    statusBarStyle: 'black',
  },
  // Next emits the standardized `mobile-web-app-capable` for `capable: true`;
  // also emit the legacy apple name so iOS < 16.4 (which ignores the manifest's
  // display:standalone) still launches fullscreen from the home screen.
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
};

// themeColor sets the mobile browser chrome / standalone status-bar colour.
// Matches the dark app background (the 'classic' theme bg token) for a seamless top bar.
export const viewport: Viewport = {
  themeColor: '#0B0B0F',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-bg text-text antialiased min-h-screen">
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>
              <AmplitudeProvider />
              <AuthModalProvider>{children}</AuthModalProvider>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
