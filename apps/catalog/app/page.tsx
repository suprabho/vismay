import Link from 'next/link'
import CatalogGrid from '@/components/CatalogGrid'
import { catalogModules } from '@/lib/catalogModules'

export default function HomePage() {
  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <header className="mb-10">
        <h1 className="text-2xl font-medium">Vismay catalog</h1>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">
          {catalogModules.length} viz modules available across core, F1, Footshorts, and Starship verticals.
          Click any card for the adminForm schema + sample YAML.
        </p>
        <p className="mt-3 text-sm">
          <Link
            href="/layouts"
            className="text-[color:var(--color-text)] underline underline-offset-4 decoration-[color:var(--color-line)] hover:decoration-[color:var(--color-muted)]"
          >
            Browse deck layouts →
          </Link>
        </p>
      </header>
      <CatalogGrid />
    </main>
  )
}
