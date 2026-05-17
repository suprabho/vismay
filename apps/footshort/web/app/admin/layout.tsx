import { AppShell } from '@/components/AppShell';
import { AuthGate } from '@/components/AuthGate';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}
