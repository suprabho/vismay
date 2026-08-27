import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { searchAssetEntities } from '@vismay/content-source/footshortsData'
import { AssetStudio } from '@/components/footshorts/asset-studio/AssetStudio'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ appSlug: string }>
}

/**
 * Footshorts-only "Asset studio" tab — preview a team / competition's primary
 * brand color across every viz component and theme, then persist it to
 * `entities.primary_color` (which the live app + recaps read). Reuses the
 * footshorts viz components and the `@footshorts/brand` themes.
 */
export default async function AssetStudioPage({ params }: Props) {
  const { appSlug } = await params
  if (!(await isAuthed())) redirect(`/login?next=/${appSlug}/asset-studio`)
  // Asset studio is wired to footshorts' entities table; no other vertical has it.
  if (appSlug !== 'footshorts') notFound()

  // Seed the picker with the first page of teams. Degrade to an empty list
  // rather than 500-ing the tab if the entities table is unreachable locally;
  // the client lets the user search to (re)load.
  let initialEntities: Awaited<ReturnType<typeof searchAssetEntities>> = []
  try {
    initialEntities = await searchAssetEntities({ type: 'team', limit: 40 })
  } catch (e) {
    console.error('asset-studio: failed to load entities', e)
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 text-neutral-100">
        <h1 className="text-lg font-semibold">Asset studio</h1>
        <p className="mt-0.5 text-sm text-neutral-400">
          Pick a team or competition, then set two colors saved to the live entity: its{' '}
          <span className="text-neutral-300">primary color</span> (card glow, borders and match-tile
          gradients, previewed below across each theme) and a dedicated{' '}
          <span className="text-neutral-300">avatar background</span> for the feed story-ring and
          card disc behind the crest. Leave the avatar background unset to fall back to the primary
          color.
        </p>
        <div className="mt-5">
          <AssetStudio initialEntities={initialEntities} />
        </div>
      </div>
    </div>
  )
}
