import type { ReactNode } from 'react'

interface Props {
  title: string
  count: number
  children: ReactNode
}

export default function CategorySection({ title, count, children }: Props) {
  return (
    <section className="mb-12">
      <header className="mb-4 flex items-baseline gap-3">
        <h2 className="text-lg font-medium">{title}</h2>
        <span className="font-mono text-xs uppercase tracking-wider text-[color:var(--color-muted)]">
          {count} {count === 1 ? 'module' : 'modules'}
        </span>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {children}
      </div>
    </section>
  )
}
