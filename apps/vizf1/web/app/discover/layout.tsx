import Link from 'next/link'

/**
 * Discover bypasses the normal AppShell so the news reel can occupy the full
 * viewport. A floating chip in the top-right links back to For You.
 */
export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <Link
        href="/feed"
        className="fixed right-4 top-4 z-20 rounded-full bg-bg/80 px-3 py-1.5 text-xs font-medium text-text backdrop-blur"
      >
        ← For You
      </Link>
      {children}
    </div>
  )
}
