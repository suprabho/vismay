import { AppShell } from '@/components/AppShell';

// The feed is publicly reachable so logged-out visitors can browse Discover.
// Per-tab gating (For You / Editorial) lives in the feed page itself, and the
// sidebar gates its other links via the auth modal.
export default function FeedLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
