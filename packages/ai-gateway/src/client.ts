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

export function getGatewayClient(): GatewayProvider {
  if (cached) return cached
  const apiKey = process.env.AI_GATEWAY_API_KEY
  cached = createGateway(apiKey ? { apiKey } : {})
  return cached
}

/** For tests that need to drop the cached client between runs. */
export function _resetGatewayClientForTesting(): void {
  cached = null
}
