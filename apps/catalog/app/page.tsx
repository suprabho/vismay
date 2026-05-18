import CatalogGrid from '@/components/CatalogGrid'
import { catalogModules } from '@/lib/catalogModules'

export default function HomePage() {
  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <header className="mb-10">
        <h1 className="text-2xl font-medium">Vismay catalog</h1>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">
          {catalogModules.length} viz modules available across core, F1, and Footshort verticals.
          Click any card for the adminForm schema + sample YAML.
        </p>
      </header>
      <CatalogGrid />
    </main>
  )
}
