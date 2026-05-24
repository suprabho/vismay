import { AuthGate } from '@/components/AuthGate';

// Editorial reader is intentionally chrome-less: no AppShell, no header.
// The vizmaya.fyi iframe inside ships its own logo/navigation, and the
// less-is-more here lets the story occupy the full viewport.
export default function EditorialReaderLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
