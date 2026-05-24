import Link from 'next/link'
import { notFound } from 'next/navigation'
import { stringify as stringifyYaml } from 'yaml'
import { getVizModule, loadVertical } from '@vismay/viz-engine'
import { AdminFormFields } from '@vismay/viz-admin'
import { findCatalogEntry } from '@/lib/catalogModules'
import VizModulePreview from '@/components/VizModulePreview'
import MetaPills from '@/components/MetaPills'
import SampleYamlBlock from '@/components/SampleYamlBlock'

interface PageProps {
  params: Promise<{ type: string }>
}

export default async function ModuleDetailPage({ params }: PageProps) {
  await Promise.all([loadVertical('f1'), loadVertical('footshorts')])
  const { type: encoded } = await params
  const type = decodeURIComponent(encoded)
  const entry = findCatalogEntry(type)
  if (!entry) notFound()
  const vizModule = getVizModule(type)
  if (!vizModule) notFound()

  let parsedConfig: unknown
  let parseError: string | null = null
  try {
    parsedConfig = vizModule.parseConfig(entry.sample, { slug: 'catalog-preview', label: type })
  } catch (e) {
    parseError = e instanceof Error ? e.message : String(e)
  }

  const adminFields =
    parsedConfig !== undefined && vizModule.adminForm ? vizModule.adminForm(parsedConfig as never) : null

  const slot = vizModule.slots[0] ?? 'foreground'
  const yamlSnippet = stringifyYaml(
    { [slot]: [entry.sample] },
    { lineWidth: 120 },
  )

  const hasIntrospect = typeof vizModule.introspect === 'function'
  const hasCollectAssetKeys = typeof vizModule.collectAssetKeys === 'function'
  const hasStableIdentity = typeof vizModule.stableIdentity === 'function'

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <nav className="mb-6">
        <Link
          href="/"
          className="text-xs font-mono uppercase tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-text)]"
        >
          ← Catalog
        </Link>
      </nav>

      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-wider text-[color:var(--color-muted)] mb-1">
          {entry.category}
        </p>
        <h1 className="text-3xl font-medium">{vizModule.label}</h1>
        <code className="font-mono text-sm text-[color:var(--color-muted)]">{type}</code>
      </header>

      <section className="mb-8">
        <h2 className="text-xs font-mono uppercase tracking-wider text-[color:var(--color-muted)] mb-3">
          Preview
        </h2>
        <div className="relative aspect-video w-full max-w-3xl bg-[color:var(--color-surface)] rounded-lg border border-[color:var(--color-line)] overflow-hidden">
          <VizModulePreview type={type} sample={entry.sample} previewNotice={entry.previewNotice} />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xs font-mono uppercase tracking-wider text-[color:var(--color-muted)] mb-3">
          Module
        </h2>
        <dl className="grid grid-cols-[180px_1fr] gap-y-2 text-sm">
          <dt className="text-[color:var(--color-muted)]">Slots</dt>
          <dd>
            <MetaPills slots={vizModule.slots} mountingMode={vizModule.mountingMode} />
          </dd>
          <dt className="text-[color:var(--color-muted)]">Readiness profile</dt>
          <dd className="font-mono text-xs">{vizModule.readinessProfile ?? '(default)'}</dd>
          <dt className="text-[color:var(--color-muted)]">Capabilities</dt>
          <dd className="font-mono text-xs">
            {[
              hasIntrospect ? 'introspect' : null,
              hasCollectAssetKeys ? 'collectAssetKeys' : null,
              hasStableIdentity ? 'stableIdentity' : null,
            ]
              .filter(Boolean)
              .join(', ') || '(none)'}
          </dd>
        </dl>
      </section>

      <section className="mb-8">
        <h2 className="text-xs font-mono uppercase tracking-wider text-[color:var(--color-muted)] mb-3">
          Admin form schema
        </h2>
        {parseError ? (
          <p className="text-sm text-[color:var(--color-muted)]">
            Cannot derive admin form — sample failed parseConfig: <code>{parseError}</code>
          </p>
        ) : adminFields ? (
          <AdminFormFields
            fields={adminFields}
            values={parsedConfig as Record<string, unknown>}
          />
        ) : (
          <p className="text-sm text-[color:var(--color-muted)]">
            This vizModule does not declare an admin form schema.
          </p>
        )}
      </section>

      <section>
        <h2 className="text-xs font-mono uppercase tracking-wider text-[color:var(--color-muted)] mb-3">
          Sample YAML
        </h2>
        <SampleYamlBlock yaml={yamlSnippet} />
      </section>
    </main>
  )
}
