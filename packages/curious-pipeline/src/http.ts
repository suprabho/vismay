/**
 * Polite fetching for every collector and verifier: one limiter per source
 * (a minimum gap plus a run-wide cooldown that doubles on each 429 and
 * honours Retry-After), timeouts, bounded retries on 5xx and network errors,
 * a branded user agent. The clock, sleep and fetch are injectable so the
 * tests run on a fake clock in no time at all.
 *
 * Ported from the limiter + getWithRetry pair in
 * apps/vizmaya-fyi/scripts/ai-data-centers/import-stock-prices.ts.
 */

export const USER_AGENT = 'vizmaya-curious/1.0 (+https://vizmaya.fyi)'

export interface Clock {
  now: () => number
  sleep: (ms: number) => Promise<void>
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
}

/** A clock the tests drive: `sleep` advances time instead of waiting. */
export function fakeClock(start = 0): Clock & { t: number } {
  const c = {
    t: start,
    now: () => c.t,
    sleep: async (ms: number) => {
      c.t += Math.max(0, ms)
    },
  }
  return c
}

export interface LimiterOptions {
  /** Minimum gap between two requests through this limiter. */
  minGapMs?: number
  /** Cooldown after the first 429 when the server sends no Retry-After. */
  baseCooldownMs?: number
  /** The cooldown never grows past this. */
  maxCooldownMs?: number
  clock?: Clock
}

export interface Limiter {
  /** Wait until the next request may go. */
  gate(): Promise<void>
  /** A 429 came back: escalate the cooldown (Retry-After wins when longer). */
  hit(retryAfterMs: number): void
  /** A request succeeded: reset the cooldown. */
  settle(): void
  /** A response came back (any status): the gap is measured from here. */
  done(): void
  readonly cooldownMs: number
}

/**
 * The gap is measured from the END of the previous request (its response),
 * not from its start: GDELT and its kind count from the last response they
 * sent, so a slow request followed by the next one "five seconds later"
 * would be refused if the clock started at the request.
 */
export function createLimiter(opts: LimiterOptions = {}): Limiter {
  const clock = opts.clock ?? realClock
  const minGapMs = opts.minGapMs ?? 0
  const baseCooldownMs = opts.baseCooldownMs ?? 10_000
  const maxCooldownMs = opts.maxCooldownMs ?? 120_000
  let waitUntil = 0
  let lastAt = -Infinity
  let cooldownMs = 0
  return {
    get cooldownMs() {
      return cooldownMs
    },
    async gate() {
      const next = Math.max(waitUntil, lastAt + minGapMs)
      const wait = next - clock.now()
      if (wait > 0) await clock.sleep(wait)
      // Until done() runs, the gap counts from the request start (a request that never answers).
      lastAt = clock.now()
    },
    hit(retryAfterMs) {
      lastAt = clock.now()
      cooldownMs = Math.min(Math.max(baseCooldownMs, cooldownMs * 2, retryAfterMs), maxCooldownMs)
      waitUntil = Math.max(waitUntil, lastAt + cooldownMs)
    },
    settle() {
      lastAt = clock.now()
      cooldownMs = 0
      waitUntil = 0
    },
    done() {
      lastAt = clock.now()
    },
  }
}

export function retryAfterMs(res: Response): number {
  const raw = res.headers.get('retry-after')
  if (!raw) return 0
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000
  const at = Date.parse(raw)
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : 0
}

export class HttpError extends Error {
  constructor(message: string, readonly status: number, readonly url: string, readonly bodySnippet: string) {
    super(message)
    this.name = 'HttpError'
  }
}

/** Every attempt answered 429: the source is throttling this IP. Callers keep what they have and stop. */
export class ThrottledError extends HttpError {
  constructor(label: string, url: string, bodySnippet: string, readonly attempts: number, readonly waitedMs: number) {
    super(`${label}: HTTP 429 Too Many Requests after ${attempts} attempts (${Math.round(waitedMs / 1000)} s of waiting)`, 429, url, bodySnippet)
    this.name = 'ThrottledError'
  }
}

export interface FetchOptions {
  fetch?: typeof fetch
  headers?: Record<string, string>
  timeoutMs?: number
  limiter?: Limiter
  /** Total attempts, counting the first. */
  attempts?: number
  label?: string
  clock?: Clock
  /** Base of the exponential backoff on 5xx and network errors. */
  backoffMs?: number
  /** Random extra wait per retry, so retries do not line up. 0 in tests. */
  jitterMs?: number
}

/**
 * Fetch with a limiter, timeout and retries. Returns on any status below 500
 * other than 429 (a 404 is the caller's to interpret); throws after the last
 * attempt with the last error.
 */
export async function fetchWithRetry(url: string, opts: FetchOptions = {}): Promise<Response> {
  const fetchImpl = opts.fetch ?? fetch
  const clock = opts.clock ?? realClock
  const attempts = Math.max(1, opts.attempts ?? 4)
  const label = opts.label ?? new URL(url).host
  const backoffMs = opts.backoffMs ?? 1500
  const jitterMs = opts.jitterMs ?? 500
  const headers = { 'user-agent': USER_AGENT, ...opts.headers }
  const started = clock.now()
  let lastErr: Error | null = null
  let throttled = 0
  let lastBody = ''
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (opts.limiter) await opts.limiter.gate()
    try {
      const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000) })
      if (res.status === 429) {
        throttled++
        lastBody = (await res.text()).slice(0, 200)
        const after = retryAfterMs(res)
        if (opts.limiter) opts.limiter.hit(after)
        else await clock.sleep(after || backoffMs * 2 ** attempt)
        lastErr = new HttpError(`${label}: HTTP 429 Too Many Requests`, 429, url, lastBody)
        continue
      }
      if (res.status >= 500) {
        opts.limiter?.done()
        lastErr = new HttpError(`${label}: HTTP ${res.status} ${res.statusText}`, res.status, url, (await res.text()).slice(0, 200))
        if (attempt < attempts - 1) await clock.sleep(backoffMs * 2 ** attempt + Math.random() * jitterMs)
        continue
      }
      opts.limiter?.settle()
      return res
    } catch (err) {
      if (err instanceof HttpError) throw err
      opts.limiter?.done()
      lastErr = err instanceof Error ? err : new Error(String(err))
      if (attempt < attempts - 1) await clock.sleep(backoffMs * 2 ** attempt + Math.random() * jitterMs)
    }
  }
  if (throttled === attempts) throw new ThrottledError(label, url, lastBody, attempts, clock.now() - started)
  throw lastErr ?? new Error(`${label}: fetch failed`)
}

/** JSON or throw; a non-2xx status is an HttpError with the body's start for the log. */
export async function getJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const res = await fetchWithRetry(url, { ...opts, headers: { accept: 'application/json', ...opts.headers } })
  const body = await res.text()
  if (!res.ok) throw new HttpError(`${opts.label ?? new URL(url).host}: HTTP ${res.status}`, res.status, url, body.slice(0, 200))
  try {
    return JSON.parse(body) as T
  } catch {
    throw new HttpError(`${opts.label ?? new URL(url).host}: not JSON (${body.slice(0, 120).replace(/\s+/g, ' ')})`, res.status, url, body.slice(0, 200))
  }
}

/** JSON, or null on 404. */
export async function getJsonOrNull<T>(url: string, opts: FetchOptions = {}): Promise<T | null> {
  try {
    return await getJson<T>(url, opts)
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return null
    throw e
  }
}

/** Text or throw. */
export async function getText(url: string, opts: FetchOptions = {}): Promise<{ text: string; contentType: string | null; finalUrl: string }> {
  const res = await fetchWithRetry(url, opts)
  const text = await res.text()
  if (!res.ok) throw new HttpError(`${opts.label ?? new URL(url).host}: HTTP ${res.status}`, res.status, url, text.slice(0, 200))
  return { text, contentType: res.headers.get('content-type'), finalUrl: res.url || url }
}

/** A bounded worker pool over a list, in order of start, stopping early when `stop()` says so. */
export async function pool<T>(items: T[], concurrency: number, work: (item: T, index: number) => Promise<void>, stop?: () => boolean): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (next < items.length) {
      if (stop?.()) return
      const i = next++
      await work(items[i], i)
    }
  })
  await Promise.all(workers)
}
