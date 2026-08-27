import { AppShell } from '@/components/AppShell'

// Discover lives under the shared pill header, same as For You — the news reel
// is a fixed-width card column, not a full-viewport bleed.
export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
