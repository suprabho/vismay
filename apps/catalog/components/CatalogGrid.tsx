import { getVizModule, loadVertical } from '@vismay/viz-engine'
import { catalogModules, type CatalogCategory } from '../lib/catalogModules'
import CategorySection from './CategorySection'
import ModuleCard from './ModuleCard'

const CATEGORY_ORDER: CatalogCategory[] = ['Core', 'F1', 'Footshorts']

export default async function CatalogGrid() {
  // Layout boots verticals too, but awaiting here defends against any
  // Next.js dev-mode flow where the page renders before the layout's await
  // resolves on first compile. Both calls share the same cached load promise.
  await Promise.all([loadVertical('f1'), loadVertical('footshorts')])
  const byCategory = new Map<CatalogCategory, typeof catalogModules>()
  for (const cat of CATEGORY_ORDER) byCategory.set(cat, [])
  for (const entry of catalogModules) byCategory.get(entry.category)!.push(entry)

  return (
    <div>
      {CATEGORY_ORDER.map((cat) => {
        const entries = byCategory.get(cat)!
        if (entries.length === 0) return null
        return (
          <CategorySection key={cat} title={cat} count={entries.length}>
            {entries.map((entry) => {
              const vizModule = getVizModule(entry.type)
              if (!vizModule) {
                return (
                  <ModuleCard
                    key={entry.type}
                    type={entry.type}
                    label={entry.type}
                    slots={[]}
                    sample={entry.sample}
                    previewNotice={`Module '${entry.type}' is not registered`}
                  />
                )
              }
              return (
                <ModuleCard
                  key={entry.type}
                  type={entry.type}
                  label={vizModule.label}
                  slots={vizModule.slots}
                  mountingMode={vizModule.mountingMode}
                  sample={entry.sample}
                  previewNotice={entry.previewNotice}
                />
              )
            })}
          </CategorySection>
        )
      })}
    </div>
  )
}
