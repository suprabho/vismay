import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getForegroundLayout } from '@vismay/viz-engine'
import LayoutPreview from '@/components/LayoutPreview'

interface PageProps {
  params: Promise<{ name: string }>
}

export default async function LayoutDetailPage({ params }: PageProps) {
  const { name: encoded } = await params
  const name = decodeURIComponent(encoded)
  const def = getForegroundLayout(name)
  if (!def) notFound()

  const regions = Object.entries(def.regions)

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <nav className="mb-6">
        <Link
          href="/layouts"
          className="text-xs font-mono uppercase tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-text)]"
        >
          ← Layouts
        </Link>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-medium">{name}</h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted)]">
          {regions.length} region{regions.length === 1 ? '' : 's'}
          {def.stackOnPortrait ? ' · stacks on portrait' : ''}
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-6 items-start mb-8">
        <div>
          <h2 className="text-xs font-mono uppercase tracking-wider text-[color:var(--color-muted)] mb-2">
            Landscape
          </h2>
          <LayoutPreview regions={def.regions} />
        </div>
        {def.portrait && (
          <div>
            <h2 className="text-xs font-mono uppercase tracking-wider text-[color:var(--color-muted)] mb-2">
              Portrait
            </h2>
            <div className="max-w-[220px]">
              <LayoutPreview regions={def.portrait.regions} portrait />
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xs font-mono uppercase tracking-wider text-[color:var(--color-muted)] mb-3">
          Regions
        </h2>
        <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
          {regions.map(([rname, rdef]) => (
            <FragmentRow
              key={rname}
              name={rname}
              accepts={rdef.accepts}
              isDefault={rname === 'default'}
            />
          ))}
        </dl>
      </section>
    </main>
  )
}

function FragmentRow({
  name,
  accepts,
  isDefault,
}: {
  name: string
  accepts?: readonly string[]
  isDefault: boolean
}) {
  return (
    <>
      <dt className="font-mono text-[color:var(--color-text)]">{name}</dt>
      <dd className="text-[color:var(--color-muted)]">
        {isDefault
          ? 'back-compat — a flat foreground array lands here (free-positioned)'
          : accepts && accepts.length
            ? `accepts: ${accepts.join(', ')}`
            : 'any foreground module'}
      </dd>
    </>
  )
}
