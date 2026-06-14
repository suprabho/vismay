import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/lib/ThemeProvider';
import { AuthProvider } from '@/lib/AuthProvider';
import { AuthModalProvider } from '@/lib/AuthModalProvider';
import { QueryProvider } from '@/lib/QueryProvider';

export const metadata: Metadata = {
  title: 'Footshorts',
  description: 'Footshorts web',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-bg text-text antialiased min-h-screen">
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>
              <AuthModalProvider>{children}</AuthModalProvider>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
