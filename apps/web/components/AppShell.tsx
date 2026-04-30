'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/AuthProvider';
import { AppHeader } from '@/components/AppHeader';

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
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

const AdminIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
    <path d="M4 19V9m6 10V5m6 14v-7m4 7H2" strokeLinecap="round" />
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
    match: (p) => p.startsWith('/following'),
  },
  {
    href: '/profile',
    label: 'Profile',
    icon: ProfileIcon,
    match: (p) => p.startsWith('/profile'),
  },
  {
    href: '/admin',
    label: 'Pipeline',
    icon: AdminIcon,
    match: (p) => p.startsWith('/admin'),
  },
];

function Sidebar() {
  const pathname = usePathname() ?? '';
  const { session } = useAuth();
  const letter = (session?.user?.email ?? '?').charAt(0).toUpperCase();
  const email = session?.user?.email;

  return (
    <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:flex md:w-60 md:flex-col md:border-r md:border-border md:bg-bg lg:w-64">
      <Link href="/feed" className="flex h-16 items-center px-6 text-xl font-bold text-text">
        ShortFoot
      </Link>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                active
                  ? 'flex items-center gap-3 rounded-full bg-surface px-4 py-2.5 text-[15px] font-semibold text-text'
                  : 'flex items-center gap-3 rounded-full px-4 py-2.5 text-[15px] font-medium text-muted hover:bg-surface/60 hover:text-text'
              }
            >
              <span className={active ? 'text-accent' : ''}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
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
    </aside>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="md:pl-60 lg:pl-64">
      <Sidebar />
      <div className="md:hidden">
        <AppHeader />
      </div>
      {children}
    </div>
  );
}
