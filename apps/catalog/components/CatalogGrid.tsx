import { getVizModule, loadVertical } from '@vismay/viz-engine'
import { catalogModules, catalogEntryId, type CatalogCategory } from '../lib/catalogModules'
import CategorySection from './CategorySection'
import ModuleCard from './ModuleCard'

const CATEGORY_ORDER: CatalogCategory[] = ['Core', 'F1', 'Footshorts', 'Starship', 'Kidzovo']

export default async function CatalogGrid() {
  // Layout boots verticals too, but awaiting here defends against any
  // Next.js dev-mode flow where the page renders before the layout's await
  // resolves on first compile. Both calls share the same cached load promise.
  await Promise.all([
    loadVertical('f1'),
    loadVertical('footshorts'),
    loadVertical('starship'),
    loadVertical('kidzovo'),
  ])
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
              const entryId = catalogEntryId(entry)
              const vizModule = getVizModule(entry.type)
              if (!vizModule) {
                return (
                  <ModuleCard
                    key={entryId}
                    type={entry.type}
                    routeId={entryId}
                    label={entry.label ?? entry.type}
                    slots={[]}
                    sample={entry.sample}
                    previewNotice={`Module '${entry.type}' is not registered`}
                  />
                )
              }
              return (
                <ModuleCard
                  key={entryId}
                  type={entry.type}
                  routeId={entryId}
                  label={entry.label ?? vizModule.label}
                  slots={vizModule.slots}
                  mountingMode={vizModule.mountingMode}
                  sample={entry.sample}
                  previewNotice={entry.previewNotice}
                  cardNotice={entry.cardNotice}
                />
              )
            })}
          </CategorySection>
        )
      })}
    </div>
  )
}
