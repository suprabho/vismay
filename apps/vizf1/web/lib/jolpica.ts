import type { ZodTypeAny, z } from 'zod'

/**
 * Jolpica-F1 — the community Ergast successor.
 *
 * Every endpoint wraps payload in `{ MRData: { ...Table: { rows[] } } }`.
 * `fetchJolpica` does the HTTP + envelope unwrap; callers pass the inner
 * extractor (`(m) => m.RaceTable.Races`) and a Zod schema for one row.
 */
const BASE_URL = 'https://api.jolpi.ca/ergast/f1'

export type MRDataEnvelope<T> = {
  MRData: T
}

export class JolpicaError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'JolpicaError'
  }
}

export async function fetchJolpica<TRow, TInner>(
  path: string,
  pickRows: (mrData: TInner) => unknown[],
  rowSchema: ZodTypeAny,
): Promise<TRow[]> {
  const url = `${BASE_URL}/${path}.json`
  const res = await fetch(url)
  if (!res.ok) {
    throw new JolpicaError(`Jolpica ${res.status} ${path}`, res.status)
  }
  const json = (await res.json()) as MRDataEnvelope<TInner>
  if (!json.MRData) {
    throw new JolpicaError(`Jolpica ${path}: missing MRData envelope`)
  }
  const rows = pickRows(json.MRData)
  if (!Array.isArray(rows)) {
    throw new JolpicaError(`Jolpica ${path}: extractor did not return an array`)
  }
  return rows.map((row) => rowSchema.parse(row) as TRow)
}

/**
 * Helper for endpoints whose response includes pagination — currently only
 * `/laps.json` matters. Jolpica caps at 100 lap timings per page; bigger
 * races (Monaco at 78 laps × 20 drivers) span 16 pages.
 */
export async function fetchJolpicaPaginated<TRow, TInner>(
  path: string,
  pickRows: (mrData: TInner) => unknown[],
  rowSchema: ZodTypeAny,
  pageSize = 100,
): Promise<TRow[]> {
  const all: TRow[] = []
  let offset = 0
  // Hard cap so a bad extractor can't infinite-loop.
  for (let i = 0; i < 50; i += 1) {
    const sep = path.includes('?') ? '&' : '?'
    const pagedPath = `${path}${sep}limit=${pageSize}&offset=${offset}`
    const page = await fetchJolpica<TRow, TInner>(pagedPath, pickRows, rowSchema)
    all.push(...page)
    if (page.length < pageSize) break
    offset += pageSize
  }
  return all
}

export type InferSchema<T extends ZodTypeAny> = z.infer<T>
