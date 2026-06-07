import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { ComposeCreateEntry } from '@/components/vizmaya/compose/ComposeCreateEntry'

export const dynamic = 'force-dynamic'

export default async function ComposePage() {
  if (!(await isAuthed())) redirect('/login?next=/vizmaya/compose')
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8 text-neutral-100">
        <h1 className="text-xl font-semibold">Compose a story from sources</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Start a draft and build it in the canvas — add sources, pick an angle, shape the outline,
          then write each section against a live preview.
        </p>
        <ComposeCreateEntry />
      </div>
    </div>
  )
}
