import { AppHeader } from '@/components/AppHeader';
import { AuthGate } from '@/components/AuthGate';

export default function FeedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <AppHeader />
      {children}
    </AuthGate>
  );
}
