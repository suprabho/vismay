import type { Metadata } from 'next'
import { AppShell } from '@/components/AppShell'
import { EditorialMagazine } from '@/components/EditorialMagazine'
import { loadEditorialStories, type EditorialGrid } from '@/lib/editorialStories'
import { getHtmlStoryCards } from '@/lib/htmlStoryCards'

export const revalidate = 300

export const metadata: Metadata = {
  title: 'F1 Editorial: race analysis, strategy and data stories',
  description:
    'Formula 1 data stories from the VizF1 desk: race recaps, tyre strategy, telemetry and the championship, told in charts.',
  // Replaces the root layout's alternates, so the RSS link is repeated here.
  alternates: { canonical: '/editorial', types: { 'application/rss+xml': '/editorial/rss.xml' } },
  openGraph: { type: 'website', siteName: 'VizF1', url: '/editorial' },
}

// The shell lives here (not in a layout) so /editorial/[slug] renders the
// story full-screen with only its own back button + logo chrome.
export default async function EditorialPage() {
  // Agent-authored HTML stories (vizf1.com/s/<slug>) sit in the same grid,
  // newest first alongside the viz-engine stories. Independent reads: either
  // failing leaves the grid with the other.
  const [editorial, htmlCards] = await Promise.all([
    loadEditorialStories().catch((err) => {
      console.error('[editorial] failed to load stories', err)
      return null
    }),
    getHtmlStoryCards(),
  ])
  const grid: EditorialGrid | null =
    editorial || htmlCards.length
      ? {
          stories: [...(editorial?.stories ?? []), ...htmlCards].sort(
            (a, b) => Date.parse(b.date) - Date.parse(a.date),
          ),
          fontUrls: editorial?.fontUrls ?? [],
        }
      : null
  return (
    <AppShell>
      <main className="mx-auto max-w-6xl px-4 py-4 pb-12">
        <h1 className="mb-3 text-lg font-semibold text-text">Editorial</h1>
        <p className="mb-4 text-xs text-muted">Vizmaya stories and epics — F1.</p>
        <EditorialMagazine grid={grid} />
      </main>
    </AppShell>
  )
}
