import type { Metadata } from 'next';
import { Forum, Space_Grotesk, Space_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/lib/ThemeProvider';
import { AuthProvider } from '@/lib/AuthProvider';
import { QueryProvider } from '@/lib/QueryProvider';

// Brand families — Space Grotesk (UI/body), Space Mono (scores/stats), Forum
// (editorial display serif). Exposed as CSS variables so brand surfaces can
// map them onto the theme's --sf-font-* tokens.
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
  display: 'swap',
});

const forum = Forum({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-forum',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Footshorts',
  description: 'Football, but only the good bits.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${spaceGrotesk.variable} ${spaceMono.variable} ${forum.variable}`}
    >
      <body className="bg-bg text-text antialiased min-h-screen">
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>{children}</AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
