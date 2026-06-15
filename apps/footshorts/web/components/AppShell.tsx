'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/AuthProvider';
import { useAuthModal } from '@/lib/AuthModalProvider';

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Gated items pop the auth modal for logged-out users instead of navigating. */
  requiresAuth?: boolean;
  match: (pathname: string) => boolean;
};

const FeedIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
    <path d="M3 5h18M3 12h18M3 19h12" strokeLinecap="round" />
  </svg>
);

const FollowingIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
    <path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z" strokeLinejoin="round" />
  </svg>
);

const ProfileIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 4-7 8-7s8 3 8 7" strokeLinecap="round" />
  </svg>
);

const AboutIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" strokeLinecap="round" />
    <circle cx="12" cy="7.75" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

const NAV: NavItem[] = [
  {
    href: '/feed',
    label: 'Feed',
    icon: FeedIcon,
    match: (p) => p === '/feed' || p.startsWith('/story') || p.startsWith('/league') || p.startsWith('/team'),
  },
  {
    href: '/following',
    label: 'Following',
    icon: FollowingIcon,
    requiresAuth: true,
    match: (p) => p.startsWith('/following'),
  },
  {
    href: '/profile',
    label: 'Profile',
    icon: ProfileIcon,
    requiresAuth: true,
    match: (p) => p.startsWith('/profile'),
  },
  {
    href: '/about-us',
    label: 'About us',
    icon: AboutIcon,
    match: (p) => p.startsWith('/about-us'),
  },
];

function Sidebar() {
  const pathname = usePathname() ?? '';
  const { session } = useAuth();
  const { requireAuth } = useAuthModal();
  const letter = (session?.user?.email ?? '?').charAt(0).toUpperCase();
  const email = session?.user?.email;

  const itemClass = (active: boolean) =>
    active
      ? 'flex items-center gap-3 rounded-full bg-surface px-4 py-2.5 text-[15px] font-semibold text-text'
      : 'flex items-center gap-3 rounded-full px-4 py-2.5 text-[15px] font-medium text-muted hover:bg-surface/60 hover:text-text';

  return (
    <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:flex md:w-60 md:flex-col md:border-r md:border-border md:bg-bg lg:w-64">
      <Link href="/feed" className="flex h-16 items-center gap-2 px-6 text-xl font-bold text-text">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-icon.svg" alt="" width={28} height={28} className="h-7 w-7" />
        Footshorts
      </Link>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV.map((item) => {
          const active = item.match(pathname);
          const icon = <span className={active ? 'text-accent' : ''}>{item.icon}</span>;
          if (item.requiresAuth && !session) {
            return (
              <button
                key={item.href}
                type="button"
                onClick={() => requireAuth(item.href)}
                className={`${itemClass(active)} w-full text-left`}
              >
                {icon}
                {item.label}
              </button>
            );
          }
          return (
            <Link key={item.href} href={item.href} className={itemClass(active)}>
              {icon}
              {item.label}
            </Link>
          );
        })}
      </nav>
      {session ? (
        <Link
          href="/profile"
          className="m-3 flex items-center gap-3 rounded-full border border-border bg-surface px-3 py-2 hover:border-muted"
          aria-label="Profile"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-bg text-sm font-semibold text-text">
            {letter}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-muted">{email ?? 'Account'}</span>
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => requireAuth('/profile')}
          className="m-3 flex items-center gap-3 rounded-full border border-border bg-surface px-3 py-2 text-left hover:border-muted"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-bg text-sm font-semibold text-text">
            {letter}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">Sign in</span>
        </button>
      )}
    </aside>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="md:pl-60 lg:pl-64">
      <Sidebar />
      {children}
    </div>
  );
}
