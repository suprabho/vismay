import Link from 'next/link'
import { listForegroundLayouts } from '@vismay/viz-engine'
import LayoutPreview from '@/components/LayoutPreview'

export default function LayoutsPage() {
  const layouts = listForegroundLayouts()
  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <nav className="mb-6">
        <Link
          href="/"
          className="text-xs font-mono uppercase tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-text)]"
        >
          ← Catalog
        </Link>
      </nav>
      <header className="mb-8">
        <h1 className="text-2xl font-medium">Deck layouts</h1>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">
          {layouts.length} foreground layouts. Each card shows the layout&apos;s named regions —
          authors target them via the <code>regions:</code> map (or pass a flat <code>foreground:</code>{' '}
          array, which fills <code>default</code>).
        </p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {layouts.map((l) => {
          const named = Object.keys(l.regions).filter((k) => k !== 'default')
          return (
            <Link
              key={l.name}
              href={`/layouts/${encodeURIComponent(l.name)}`}
              className="block rounded-lg border border-[color:var(--color-line)] p-3 transition-colors hover:border-[color:var(--color-muted)]"
            >
              <LayoutPreview regions={l.regions} />
              <div className="mt-2 font-mono text-xs text-[color:var(--color-text)]">{l.name}</div>
              <div className="text-[11px] text-[color:var(--color-muted)]">
                {named.length ? named.join(' · ') : 'default (free-positioned)'}
              </div>
            </Link>
          )
        })}
      </div>
    </main>
  )
}
