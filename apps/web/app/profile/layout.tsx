import { AppShell } from '@/components/AppShell';
import { AuthGate } from '@/components/AuthGate';

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}
