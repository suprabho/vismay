import { AppHeader } from '@/components/AppHeader';
import { AuthGate } from '@/components/AuthGate';

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <AppHeader />
      {children}
    </AuthGate>
  );
}
