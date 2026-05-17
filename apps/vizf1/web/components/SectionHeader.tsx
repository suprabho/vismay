'use client'

import Link from 'next/link'

type Props = {
  title: string
  href?: string
  hint?: string
}

export function SectionHeader({ title, href, hint }: Props) {
  const inner = (
    <div className="flex items-baseline justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{title}</h2>
      {hint ? <span className="text-[11px] text-muted">{hint}</span> : null}
    </div>
  )
  if (!href) return <div className="mb-2 mt-6">{inner}</div>
  return (
    <Link href={href} className="mb-2 mt-6 block hover:text-text">
      {inner}
    </Link>
  )
}
