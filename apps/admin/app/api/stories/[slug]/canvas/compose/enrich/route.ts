import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isAuthed } from '@/lib/adminAuth'
import { generateText, tool } from '@vismay/ai-gateway'
import { insertStorySource, listStorySources } from '@vismay/content-source/storySources'
import { searchLibrary, extractLibraryItem } from '@/lib/libraryProviders'

/**
 * AI dataset research — the second consumer of the shared library query layer
 * (the picker's live search is the first). Runs a small tool-using agent that
 * queries the app's datasets (IEA news, document corpora, song catalogues) for
 * material relevant to the draft + an optional focus, reads the promising hits,
 * and writes a synthesised, cited brief. The brief is snapshotted as a normal
 * `text` source so it flows into angles/outline like any other research.
 *
 * Tools are the SAME query functions the picker uses (`searchLibrary` /
 * `extractLibraryItem`), so the agent can only surface what a human could.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const SYSTEM = `You are a research assistant for a data-storytelling team.
You have tools to search the available datasets and read individual items.
Workflow:
1. Call search_datasets with focused keyword queries (try a few angles).
2. Call get_dataset_item on the most relevant hits to read their full text.
3. Write a concise markdown research brief of ONLY the material you actually
   retrieved — grouped by theme, each point followed by a short citation
   (item title + dataset). Do not invent facts or cite anything you didn't read.
If nothing relevant exists in the datasets, reply with exactly: NO_RESULTS`

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params

  let body: { focus?: string }
  try {
    body = (await req.json().catch(() => ({}))) as { focus?: string }
  } catch {
    body = {}
  }
  const focus = typeof body.focus === 'string' ? body.focus.trim() : ''

  // Context: titles of what's already attached, so the agent complements rather
  // than duplicates the existing research.
  const existing = await listStorySources(slug)
  const existingTitles = existing
    .map((s) => s.title)
    .filter((t): t is string => !!t)
    .slice(0, 30)

  const tools = {
    search_datasets: tool({
      description:
        'Search the available datasets for items matching a keyword query. Returns hits with providerKey + itemId to read next.',
      inputSchema: z.object({ query: z.string().describe('keywords to search for') }),
      execute: async ({ query }: { query: string }) => {
        const groups = await searchLibrary(slug, query)
        const hits = groups.flatMap((g) =>
          g.items.slice(0, 8).map((it) => ({
            providerKey: g.key,
            dataset: g.label,
            itemId: it.id,
            title: it.title,
            subtitle: it.subtitle ?? null,
          })),
        )
        return hits.length ? hits : 'No matches. Try different keywords, or stop if datasets seem irrelevant.'
      },
    }),
    get_dataset_item: tool({
      description: 'Fetch the full text of one dataset item by providerKey + itemId (from a search_datasets hit).',
      inputSchema: z.object({ providerKey: z.string(), itemId: z.string() }),
      execute: async ({ providerKey, itemId }: { providerKey: string; itemId: string }) => {
        const ex = await extractLibraryItem(providerKey, itemId)
        if (!ex) return { error: 'not found' }
        return { title: ex.title, text: ex.text.slice(0, 6000) }
      },
    }),
  }

  const prompt = [
    focus ? `Research focus: ${focus}` : 'Research focus: surface dataset material relevant to this draft.',
    existingTitles.length ? `Already attached (avoid duplicating):\n- ${existingTitles.join('\n- ')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  let text: string
  try {
    const { result } = await generateText({
      model: 'text.claude',
      system: SYSTEM,
      prompt,
      tools,
      maxSteps: 8,
      metadata: { feature: 'compose-dataset-enrich' },
    })
    text = (result ?? '').trim()
  } catch (e) {
    return NextResponse.json(
      { error: `research failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }

  // The agent signals an empty search rather than fabricating a source.
  if (!text || /^NO_RESULTS\b/.test(text)) {
    return NextResponse.json({ ok: false, message: 'No relevant dataset material found.' })
  }

  const source = await insertStorySource({
    storySlug: slug,
    kind: 'text',
    title: focus ? `Dataset research: ${focus}` : 'Dataset research',
    byline: 'AI · datasets',
    extractedText: text,
    status: 'extracted',
  })
  return NextResponse.json({ ok: true, source })
}
