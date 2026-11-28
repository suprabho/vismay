import Link from 'next/link'

/** Underlined tab row, one link per tab; the page re-renders server-side on switch. */
export function Tabs({ label, tabs }: { label: string; tabs: Array<{ href: string; label: string; active: boolean }> }) {
  return (
    <nav aria-label={label} className="flex border-b border-border">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          replace
          scroll={false}
          aria-current={t.active ? 'page' : undefined}
          className={`-mb-px flex min-h-11 flex-1 items-center justify-center border-b-2 text-[13.5px] ${
            t.active ? 'border-text font-semibold text-text' : 'border-transparent font-medium text-muted hover:text-text'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}

/** Switch between the two tables that live under For you. */
export function TableSwitch({ active }: { active: 'nba' | 'cup' }) {
  const items = [
    { key: 'nba', href: '/for-you/standings', label: 'NBA' },
    { key: 'cup', href: '/for-you/cup', label: 'NBA Cup' },
  ] as const
  return (
    <nav aria-label="Tables" className="flex gap-1.5">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          aria-current={active === i.key ? 'page' : undefined}
          className={`rounded-full border px-3.5 py-2 text-[12.5px] leading-none ${
            active === i.key
              ? 'border-text bg-text/8 font-semibold text-text'
              : 'border-border bg-surface font-medium text-muted hover:text-text'
          }`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  )
}
