import Link from 'next/link'
import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { createServerSupabase } from '@/lib/supabaseServer'
import { RecapMarkdown } from '@/components/section/RecapMarkdown'
import { CopyMarkdownButton } from '@/components/section/CopyMarkdownButton'
import { TriggerRecapButton } from '@/components/footshorts/TriggerRecapButton'
import { AdminTable } from '@/components/admin'

export const dynamic = 'force-dynamic'

type RecapMeta = {
  id: string
  scope: string
  window_hours: number
  model: string | null
  fixture_count: number
  article_count: number
  generated_at: string
}

type Recap = RecapMeta & { markdown: string }

function scopeLabel(scope: string): string {
  if (scope === 'all') return 'All competitions'
  return scope
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

interface Props {
  params: Promise<{ appSlug: string }>
  searchParams: Promise<{ id?: string }>
}

export default async function AppRecapsPage({ params, searchParams }: Props) {
  const { appSlug } = await params
  if (!(await isAuthed())) redirect(`/login?next=/${appSlug}/recaps`)
  const { id } = await searchParams

  const supabase = await createServerSupabase()

  const { data: listData, error: listError } = await supabase
    .from('daily_recaps')
    .select('id, scope, window_hours, model, fixture_count, article_count, generated_at')
    .order('generated_at', { ascending: false })

  const list = (listData ?? []) as RecapMeta[]

  // Default to the newest snapshot when none is selected via the query string.
  const selId = id ?? list[0]?.id ?? null

  let recap: Recap | null = null
  if (selId) {
    const { data } = await supabase
      .from('daily_recaps')
      .select('id, scope, window_hours, model, fixture_count, article_count, generated_at, markdown')
      .eq('id', selId)
      .maybeSingle()
    recap = (data ?? null) as Recap | null
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="shrink-0 px-4 py-5 border-b border-white/5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Recaps</h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            Rolling match recaps · {list.length} total
          </p>
        </div>
        <TriggerRecapButton />
      </div>

      {listError ? (
        <div className="px-4 py-10 text-sm text-amber-400 text-center">
          Could not load recaps: {listError.message}
        </div>
      ) : list.length === 0 ? (
        <div className="px-4 py-10 text-sm text-neutral-500 text-center">
          No recaps yet. Generate one with{' '}
          <code className="font-mono text-neutral-400">pnpm recap</code> in the footshorts
          worker — it runs automatically off the scores workflow and covers the last 24 hours.
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-[minmax(360px,420px)_1fr] max-md:grid-cols-1">
          {/* List */}
          <div className="min-h-0 overflow-auto border-r border-white/5 max-md:border-r-0 max-md:border-b">
            <AdminTable
              rows={list}
              rowKey={(recap) => recap.id}
              caption="Generated recaps"
              minWidth="none"
              empty="No recaps yet."
              getRowClassName={(recap) => recap.id === selId ? 'bg-white/[0.04]' : ''}
              columns={[
                {
                  key: 'generated',
                  label: 'Generated',
                  render: (recap) => (
                    <Link href={`/${appSlug}/recaps?id=${recap.id}`} className="block hover:text-white">
                      <div className="text-xs font-semibold text-white">{new Date(recap.generated_at).toLocaleString()}</div>
                      <div className="mt-1 text-[11px] text-neutral-500">Last {recap.window_hours}h</div>
                    </Link>
                  ),
                },
                {
                  key: 'scope',
                  label: 'Scope',
                  responsive: 'secondary',
                  className: 'text-xs text-neutral-400',
                  render: (recap) => scopeLabel(recap.scope),
                },
                {
                  key: 'records',
                  label: 'Records',
                  responsive: 'secondary',
                  className: 'text-right text-xs tabular-nums text-neutral-400',
                  render: (recap) => `${recap.fixture_count} matches · ${recap.article_count} stories`,
                },
                {
                  key: 'action',
                  label: '',
                  sticky: true,
                  className: 'w-10 text-right',
                  render: () => <span className="text-xs text-neutral-500">›</span>,
                },
              ]}
            />
          </div>

          {/* Detail */}
          <div className="min-h-0 overflow-y-auto p-5">
            {recap ? (
              <article className="mx-auto max-w-3xl">
                <div className="mb-4 flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <span className="text-xs text-neutral-500">
                    {recap.model ? `Narrative: ${recap.model}` : 'Deterministic only'} · last{' '}
                    {recap.window_hours}h · generated {new Date(recap.generated_at).toLocaleString()}
                  </span>
                  <CopyMarkdownButton markdown={recap.markdown} />
                </div>
                <RecapMarkdown markdown={recap.markdown} />
              </article>
            ) : (
              <p className="text-sm text-neutral-500">Select a recap.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
