import { AuthGate } from '@/components/AuthGate';

// Epic landing is native (unlike the story reader, which iframes vizmaya.fyi).
// Same chrome-less treatment so the landing can use the full viewport.
export default function EditorialEpicLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
