import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { listAppStories, type AppStory } from '@vismay/content-source/apps'
import { isHeygenConfigured } from '@vismay/content-source/heygenTemplate'
import { HeygenStudio } from '@/components/footshorts/heygen/HeygenStudio'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ appSlug: string }>
}

/**
 * Footshorts-only "HeyGen Studio" tab — a native UI over the HeyGen Template
 * API (packages/content-source/heygenTemplate). Pick a template, fill its
 * variables, choose a story to attach to, generate, watch progress, and preview
 * the result. Finished MP4s are downloaded to the `story-video` bucket and
 * tracked in `heygen_renders` keyed by the story slug.
 */
export default async function HeygenStudioPage({ params }: Props) {
  const { appSlug } = await params
  if (!(await isAuthed())) redirect(`/login?next=/${appSlug}/heygen-studio`)
  // Scoped to footshorts, and only when a HeyGen key is configured.
  if (appSlug !== 'footshorts') notFound()
  if (!isHeygenConfigured()) notFound()

  // Degrade to an empty picker rather than 500-ing the tab if Supabase is
  // unreachable locally.
  let stories: AppStory[] = []
  try {
    stories = await listAppStories(appSlug)
  } catch (e) {
    console.error('heygen-studio: failed to load stories', e)
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 text-neutral-100">
        <h1 className="text-lg font-semibold">HeyGen Studio</h1>
        <p className="mt-0.5 text-sm text-neutral-400">
          Pick a HeyGen template, fill in its variables, and generate a video attached to a story.
          Finished renders are saved to our storage and listed per story.
        </p>
        <div className="mt-5">
          <HeygenStudio appSlug={appSlug} stories={stories} />
        </div>
      </div>
    </div>
  )
}
