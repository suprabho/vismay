/**
 * Test helper: run the whole MCP sign-in the way a client and a person would,
 * against the real handlers (./oauth.ts) and admin's real signing
 * (@vismay/admin-core/mcpConsent), with no network. Used by oauth.test.ts and
 * hosted.test.ts; not part of the server.
 */
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { approveMcpConsentRequest, mcpConsentDecisionUrl } from '@vismay/admin-core/mcpConsent'
import { authorize, callback, registerClient, token } from './oauth'

export const ORIGIN = 'https://vizmaya.fyi'
export const REDIRECT = 'https://claude.ai/api/mcp/auth_callback'

export function pkce() {
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export async function register(meta: Record<string, unknown> = {}) {
  const res = await registerClient(
    new Request(`${ORIGIN}/api/mcp/oauth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'Claude', redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none', ...meta }),
    }),
  )
  return { res, body: (await res.json()) as Record<string, any> }
}

export function authorizeUrl(params: Record<string, string>) {
  const url = new URL(`${ORIGIN}/api/mcp/oauth/authorize`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return url
}

/** The admin consent page's path → the signed request in it. */
export function requestFromConsentRedirect(res: Response): string {
  assert.equal(res.status, 302, 'authorize redirects to admin')
  const location = new URL(res.headers.get('location')!)
  const match = /^\/mcp\/authorize\/(.+)$/.exec(location.pathname)
  assert.ok(match, `goes to the consent page, got ${location}`)
  return match[1]!
}

/** What admin's Allow does: sign an approval and follow the decision URL to vizmaya.fyi's callback. */
export function approve(request: string): Response {
  const approval = approveMcpConsentRequest(request)
  assert.ok(approval, 'admin can approve a valid request')
  return callback(new Request(mcpConsentDecisionUrl(request, { approval })!))
}

export async function exchange(params: Record<string, string>, headers: Record<string, string> = {}) {
  const res = await token(
    new Request(`${ORIGIN}/api/mcp/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
      body: new URLSearchParams(params).toString(),
    }),
  )
  return { res, body: (await res.json()) as Record<string, any> }
}

/** The happy path end to end: a public client, signed in, with its tokens. */
export async function signIn() {
  const { body: client } = await register()
  const { verifier, challenge } = pkce()
  const request = requestFromConsentRedirect(
    authorize(
      new Request(
        authorizeUrl({
          response_type: 'code',
          client_id: client.client_id,
          redirect_uri: REDIRECT,
          code_challenge: challenge,
          code_challenge_method: 'S256',
          state: 'st-1',
          resource: `${ORIGIN}/api/mcp`,
        }),
      ),
    ),
  )
  const back = new URL(approve(request).headers.get('location')!)
  const code = back.searchParams.get('code')!
  const { body } = await exchange({
    grant_type: 'authorization_code',
    code,
    client_id: client.client_id,
    redirect_uri: REDIRECT,
    code_verifier: verifier,
    resource: `${ORIGIN}/api/mcp`,
  })
  return { clientId: client.client_id as string, access: body.access_token as string, refresh: body.refresh_token as string }
}
