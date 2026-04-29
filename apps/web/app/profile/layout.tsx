import { AppHeader } from '@/components/AppHeader';
import { AuthGate } from '@/components/AuthGate';

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <AppHeader />
      {children}
    </AuthGate>
  );
}
