import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { RecipesClient } from '@/components/umami/RecipesClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ appSlug: string }>
}

// Recipe-corpora coverage + browse for the food vertical. The tables behind
// it are food-generic but the corpora currently serve the umami app only, so
// the tab is scoped accordingly (unlike /pipeline, whose stats are
// footshorts-wide regardless of slug).
export default async function AppRecipesPage({ params }: Props) {
  const { appSlug } = await params
  if (appSlug !== 'umami') notFound()
  if (!(await isAuthed())) redirect(`/login?next=/${appSlug}/recipes`)
  return (
    <main className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-4 text-lg font-semibold text-white">Recipe corpora</h1>
        <RecipesClient />
      </div>
    </main>
  )
}
