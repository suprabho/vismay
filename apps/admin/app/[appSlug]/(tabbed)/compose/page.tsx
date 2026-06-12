import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { ComposeCreateEntry } from '@/components/compose/ComposeCreateEntry'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ appSlug: string }>
}

/**
 * Per-app Compose tab (footshorts, vizf1, …) — the generic-app mirror of
 * `app/vizmaya/compose`. The entry tags the draft to this app (route 0 sets
 * `app_slug` + seeds the matching `vertical` frontmatter) and lands on the
 * universal `/<appSlug>/<slug>/canvas` route. The owning app's existence is
 * validated in the section layout (getApp → notFound); auth is enforced by
 * middleware, with this redirect as a lightweight backstop.
 */
export default async function AppComposePage({ params }: Props) {
  const { appSlug } = await params
  if (!(await isAuthed())) redirect(`/login?next=/${appSlug}/compose`)
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8 text-neutral-100">
        <h1 className="text-xl font-semibold">Compose a story from sources</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Start a draft and build it in the canvas — add sources, pick an angle, shape the outline,
          then write each section against a live preview.
        </p>
        <ComposeCreateEntry appSlug={appSlug} />
      </div>
    </div>
  )
}
