import { createGateway, type GatewayProvider } from '@ai-sdk/gateway'

/**
 * Lazily-instantiated Vercel AI Gateway provider.
 *
 * Auth model:
 *   - Local dev: AI_GATEWAY_API_KEY in .env.local.
 *   - Vercel deploy: omit the var and the gateway picks up the OIDC token
 *     injected by the Vercel runtime — no key rotation, no secrets in the
 *     project settings.
 *
 * Resolved once per process; safe to share across request handlers.
 */
let cached: GatewayProvider | null = null

/**
 * Long structured generations (whole-story outlines, dense sections, video) can
 * take minutes before the gateway returns the FIRST response headers — a
 * non-streaming generateObject holds the connection until the model finishes.
 * That blows past undici's default headers timeout, surfacing as
 * "Gateway request timed out: Headers Timeout Error".
 *
 * We route gateway traffic through an undici Agent with generous header + body
 * timeouts (default 10 min, override with AI_GATEWAY_TIMEOUT_MS). undici is
 * loaded lazily and the wrapper degrades to plain fetch if it's unavailable, so
 * non-Node runtimes still work. See
 * https://vercel.com/docs/ai-gateway/.../extending-timeouts-for-node.js
 */
const TIMEOUT_MS = Number(process.env.AI_GATEWAY_TIMEOUT_MS) || 600_000

let agentPromise: Promise<unknown> | null = null
async function getAgent(): Promise<unknown> {
  if (!agentPromise) {
    agentPromise = import('undici')
      .then((u) => new u.Agent({ headersTimeout: TIMEOUT_MS, bodyTimeout: TIMEOUT_MS }))
      .catch(() => null)
  }
  return agentPromise
}

const longTimeoutFetch = (async (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => {
  const agent = await getAgent()
  // Node's undici-based fetch honours a per-call `dispatcher` (not in the DOM
  // RequestInit type, hence the cast). Falls back to the default dispatcher.
  return globalThis.fetch(
    input,
    agent ? ({ ...init, dispatcher: agent } as unknown as RequestInit) : init,
  )
}) as typeof fetch

export function getGatewayClient(): GatewayProvider {
  if (cached) return cached
  const apiKey = process.env.AI_GATEWAY_API_KEY
  cached = createGateway({
    ...(apiKey ? { apiKey } : {}),
    fetch: longTimeoutFetch,
  })
  return cached
}

/** For tests that need to drop the cached client between runs. */
export function _resetGatewayClientForTesting(): void {
  cached = null
}
