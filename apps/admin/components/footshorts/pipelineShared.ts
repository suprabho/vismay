/**
 * Shared bits for the footshorts Pipeline tab panels (WorkersPanel,
 * MatchtimePanel): the GitHub last-run shape and its display helpers.
 * Mirrors the vizmaya pipeline's shared.tsx convention.
 */

export interface WorkerLastRun {
  status: string | null
  conclusion: string | null
  createdAt: string | null
  event: string | null
  url: string | null
}

export function relTime(iso: string | null): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'never'
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h ${mins % 60}m ago`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h ago`
}

/** Colour + label for a run's status/conclusion. */
export function runState(run: WorkerLastRun | null): { label: string; cls: string } {
  if (!run) return { label: 'no runs', cls: 'text-neutral-500' }
  if (run.status && run.status !== 'completed') {
    return { label: run.status.replace(/_/g, ' '), cls: 'text-sky-400' }
  }
  switch (run.conclusion) {
    case 'success':
      return { label: 'success', cls: 'text-emerald-400' }
    case 'failure':
      return { label: 'failed', cls: 'text-red-400' }
    case 'cancelled':
      return { label: 'cancelled', cls: 'text-neutral-400' }
    default:
      return { label: run.conclusion ?? 'unknown', cls: 'text-amber-400' }
  }
}
