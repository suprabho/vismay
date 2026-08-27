/**
 * Shared football-data.org helpers for the worker scripts (seed / fixtures / scores).
 *
 * One place for the auth'd fetch, free-tier pacing, and the 429-retry logic so it
 * lives in a single spot instead of being copy-pasted three ways. See
 * docs/football-data-api.md for the tier limits and rate-limit headers.
 */

export const FD_BASE = 'https://api.football-data.org/v4';
export const FD_TOKEN = process.env.FOOTBALL_DATA_TOKEN ?? '';

// Free tier: 10 req/min. Callers sleep ~6.5s between calls to stay clear.
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The token is shared across our scores + fixtures jobs, and a manual dispatch
// can overlap a scheduled run, so a 429 can land mid-run despite the 6.5s pacing.
const FD_MAX_RETRIES = 3;
// Cap the wait so a bogus/huge reset header can't stall a job past its timeout.
const FD_MAX_RETRY_WAIT_MS = 90 * 1000;

export async function fdFetch<T>(path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${FD_BASE}${path}`, {
      headers: { 'X-Auth-Token': FD_TOKEN },
    });
    if (res.ok) return res.json() as Promise<T>;

    // On a rate-limit, football-data returns seconds-until-reset in
    // X-RequestCounter-Reset; wait that long (plus a 1s buffer) and retry rather
    // than failing the whole competition. Fall back to the 60s window length
    // when the header is missing or unparseable.
    if (res.status === 429 && attempt < FD_MAX_RETRIES) {
      const reset = Number(res.headers.get('X-RequestCounter-Reset'));
      const waitMs = Math.min(
        (Number.isFinite(reset) && reset > 0 ? reset : 60) * 1000 + 1000,
        FD_MAX_RETRY_WAIT_MS,
      );
      console.warn(
        `  [football-data] rate-limited on ${path}; waiting ${Math.round(waitMs / 1000)}s then retrying (attempt ${attempt + 1}/${FD_MAX_RETRIES})`,
      );
      await sleep(waitMs);
      continue;
    }

    throw new Error(`football-data ${path} failed: ${res.status} ${res.statusText}`);
  }
}

/**
 * Restrict a per-competition job to a subset via `--competitions=A,B` (CLI flag,
 * wins) or the `COMPETITIONS=A,B` env var. Tokens match `keyOf(item)`
 * case-insensitively — scores keys by FD code (e.g. `WC`, `PL`), fixtures keys by
 * slug (e.g. `world-cup`, `premier-league`). No filter set → all items returned
 * unchanged. Unmatched tokens are warned about; if a filter is set but matches
 * nothing the caller receives an empty list (i.e. runs nothing).
 */
export function filterCompetitions<T>(
  items: T[],
  keyOf: (item: T) => string,
  label: string,
): T[] {
  const arg = process.argv.slice(2).find((a) => a.startsWith('--competitions='));
  const raw = (arg ? arg.slice('--competitions='.length) : process.env.COMPETITIONS) ?? '';
  const tokens = raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return items;

  const wanted = new Set(tokens.map((t) => t.toLowerCase()));
  const selected = items.filter((it) => wanted.has(keyOf(it).toLowerCase()));

  const matched = new Set(selected.map((it) => keyOf(it).toLowerCase()));
  const unknown = tokens.filter((t) => !matched.has(t.toLowerCase()));
  if (unknown.length) {
    console.warn(`[${label}] --competitions: no match for ${unknown.join(', ')}`);
  }
  console.log(
    `[${label}] filtered to ${selected.length}/${items.length} competitions` +
      (selected.length ? `: ${selected.map(keyOf).join(', ')}` : ''),
  );
  return selected;
}
