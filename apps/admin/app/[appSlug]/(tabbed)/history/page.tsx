import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { HistoryClient } from '@/components/umami/HistoryClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ appSlug: string }>
}

// Review queue for the AI-extracted dish & ingredient history events
// (food_history_events, migration 071) — umami-only, like /recipes.
export default async function AppHistoryPage({ params }: Props) {
  const { appSlug } = await params
  if (appSlug !== 'umami') notFound()
  if (!(await isAuthed())) redirect(`/login?next=/${appSlug}/history`)
  return (
    <main className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-4 text-lg font-semibold text-white">Dish & ingredient history</h1>
        <HistoryClient />
      </div>
    </main>
  )
}
