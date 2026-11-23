/**
 * Diagnostics for the hosted MCP: one JSON line per sign-in step and per MCP
 * request, in the deployment's logs (Vercel → vizmaya-fyi → Logs, search
 * `[mcp]`). Refusals log at warn with a `reason` naming the check that failed,
 * so a connection that fails in Claude can be traced to the step and the
 * cause.
 *
 * Never logged: tokens, codes, client secrets, client ids, publish tokens,
 * tool arguments, IP addresses. `from` only says whether the request came
 * from Anthropic's published egress range (where Claude's servers connect
 * from) or elsewhere (a browser, another client).
 */

export type LogValue = string | number | boolean | null | undefined | string[]
export type LogFields = Record<string, LogValue>

/** Anthropic's outbound range for connector traffic, per its connector docs: 160.79.104.0/21. */
const ANTHROPIC_NET = ipv4ToInt('160.79.104.0')!
const ANTHROPIC_MASK = (0xffffffff << (32 - 21)) >>> 0

function ipv4ToInt(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip)
  if (!m) return null
  const parts = m.slice(1).map(Number)
  if (parts.some((p) => p > 255)) return null
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0
}

export function fromAnthropic(ip: string): boolean {
  const n = ipv4ToInt(ip.replace(/^::ffff:/, ''))
  return n !== null && (n & ANTHROPIC_MASK) >>> 0 === ANTHROPIC_NET
}

/** Where a request came from, without the address itself. */
export function requestFields(req: Request): LogFields {
  const ip = (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '').split(',')[0]?.trim() ?? ''
  return {
    host: new URL(req.url).host,
    from: ip ? (fromAnthropic(ip) ? 'anthropic' : 'other') : 'unknown',
    ua: req.headers.get('user-agent')?.slice(0, 80) || undefined,
  }
}

/** The host (or scheme and host) of a URI, for logging where something points without the rest of it. */
export function hostOf(uri: string | null | undefined): string | undefined {
  if (!uri) return undefined
  try {
    const u = new URL(uri)
    return u.host ? u.host : u.protocol
  } catch {
    return 'unparseable'
  }
}

export type Outcome = 'ok' | 'refused' | 'error'

/** Write one line. Refusals and errors go to warn so they can be filtered by level. */
export function mcpLog(event: string, outcome: Outcome, fields: LogFields = {}): void {
  const clean: LogFields = {}
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== '') clean[k] = v
  const line = `[mcp] ${JSON.stringify({ event, outcome, ...clean })}`
  if (outcome === 'ok') console.log(line)
  else console.warn(line)
}
