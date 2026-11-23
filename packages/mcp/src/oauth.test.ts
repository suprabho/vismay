/** Checks for the hosted MCP's OAuth server: metadata, registration, the consent round trip, codes, tokens.
 *  (run: pnpm --filter @vismay/mcp test) */
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { approveMcpConsentRequest, mcpConsentDecisionUrl, signMcpConsentRequest } from '@vismay/admin-core/mcpConsent'
import {
  authorizationServerMetadata,
  authorize,
  callback,
  isAllowedRedirectUri,
  protectedResourceMetadata,
  verifyAccessToken,
} from './oauth'
import {
  authorizeUrl,
  exchange,
  ORIGIN,
  pkce,
  REDIRECT,
  register,
  requestFromConsentRedirect,
  signIn,
  approve,
} from './testOAuth'

process.env.ADMIN_SESSION_SECRET = 'oauth-test-secret'
process.env.NEXT_PUBLIC_ADMIN_URL = 'https://vismay.xyz'
delete process.env.MCP_TOKEN_GENERATION
const RESOURCE = `${ORIGIN}/api/mcp`

// Metadata: the protected resource names this issuer; the issuer lists its endpoints.
{
  const prm = (await protectedResourceMetadata(new Request(`${ORIGIN}/.well-known/oauth-protected-resource/api/mcp`)).json()) as any
  assert.equal(prm.resource, RESOURCE)
  assert.deepEqual(prm.authorization_servers, [ORIGIN])
  const as = (await authorizationServerMetadata(new Request(`${ORIGIN}/.well-known/oauth-authorization-server`)).json()) as any
  assert.equal(as.issuer, ORIGIN)
  assert.equal(as.authorization_endpoint, `${ORIGIN}/api/mcp/oauth/authorize`)
  assert.equal(as.token_endpoint, `${ORIGIN}/api/mcp/oauth/token`)
  assert.equal(as.registration_endpoint, `${ORIGIN}/api/mcp/oauth/register`)
  assert.deepEqual(as.code_challenge_methods_supported, ['S256'])
  // Previews and local dev get their own origin, no config needed.
  const local = (await protectedResourceMetadata(new Request('http://localhost:3077/.well-known/oauth-protected-resource')).json()) as any
  assert.equal(local.resource, 'http://localhost:3077/api/mcp')
}

// Redirect URIs: https, loopback http, native schemes; never script schemes, plain http or fragments.
for (const ok of [REDIRECT, 'http://localhost:51234/callback', 'http://127.0.0.1:8080/cb', 'cursor://anysphere.cursor-mcp/oauth/callback']) {
  assert.ok(isAllowedRedirectUri(ok), ok)
}
for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'http://evil.example/cb', 'https://claude.ai/cb#frag', 'not a url', 'file:///etc/passwd']) {
  assert.ok(!isAllowedRedirectUri(bad), bad)
}

// Registration: public client, no secret; secret clients get one; bad metadata refused.
{
  const { res, body } = await register()
  assert.equal(res.status, 201)
  assert.ok(body.client_id.startsWith('mcpc_'))
  assert.equal(body.client_secret, undefined)
  assert.equal(body.token_endpoint_auth_method, 'none')
  assert.deepEqual(body.redirect_uris, [REDIRECT])
  // Identical metadata in the same second still makes a distinct client (and secret).
  const twinA = await register({ token_endpoint_auth_method: 'client_secret_post' })
  const twinB = await register({ token_endpoint_auth_method: 'client_secret_post' })
  assert.notEqual(twinA.body.client_id, twinB.body.client_id)
  assert.notEqual(twinA.body.client_secret, twinB.body.client_secret)

  const secretClient = await register({ token_endpoint_auth_method: 'client_secret_post' })
  assert.equal(secretClient.res.status, 201)
  assert.equal(typeof secretClient.body.client_secret, 'string')
  // Omitted means client_secret_basic (RFC 7591's default).
  const { body: omitted } = await register({ token_endpoint_auth_method: undefined })
  assert.equal(omitted.token_endpoint_auth_method, 'client_secret_basic')

  assert.equal((await register({ redirect_uris: [] })).res.status, 400)
  assert.equal((await register({ redirect_uris: ['http://evil.example/cb'] })).body.error, 'invalid_redirect_uri')
  assert.equal((await register({ token_endpoint_auth_method: 'private_key_jwt' })).res.status, 400)
  assert.equal((await register({ grant_types: ['client_credentials'] })).res.status, 400)
  // A control-character name is cleaned for the consent page.
  const { body: named } = await register({ client_name: 'Clau\u0000de\n' })
  assert.equal(named.client_name, 'Claude')
}

// The happy path: register → authorize → admin consent → callback → code → tokens → verified.
{
  const { body: client } = await register()
  const { verifier, challenge } = pkce()
  const params = {
    response_type: 'code',
    client_id: client.client_id,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'st-1',
    resource: RESOURCE,
  }
  const res = authorize(new Request(authorizeUrl(params)))
  assert.ok(res.headers.get('location')!.startsWith('https://vismay.xyz/mcp/authorize/'), 'sends the person to admin')
  const request = requestFromConsentRedirect(res)

  const back = approve(request)
  assert.equal(back.status, 302)
  const to = new URL(back.headers.get('location')!)
  assert.equal(to.origin + to.pathname, REDIRECT, 'back to the app')
  assert.equal(to.searchParams.get('state'), 'st-1')
  const code = to.searchParams.get('code')!
  assert.ok(code.startsWith('mcpk_'))

  const { res: tokRes, body } = await exchange({
    grant_type: 'authorization_code',
    code,
    client_id: client.client_id,
    redirect_uri: REDIRECT,
    code_verifier: verifier,
    resource: RESOURCE,
  })
  assert.equal(tokRes.status, 200, JSON.stringify(body))
  assert.equal(tokRes.headers.get('cache-control'), 'no-store')
  assert.equal(body.token_type, 'Bearer')
  assert.equal(body.expires_in, 3600)
  assert.ok(body.access_token.startsWith('mcpa_') && body.refresh_token.startsWith('mcpr_'))
  assert.ok(verifyAccessToken(body.access_token, RESOURCE), 'the access token verifies for /api/mcp')
  assert.equal(verifyAccessToken(body.access_token, 'https://other.example/api/mcp'), null, 'and for nothing else')

  // A wrong verifier, another client, or another redirect gets nothing.
  const wrong = async (patch: Record<string, string>) => (await exchange({ grant_type: 'authorization_code', code, client_id: client.client_id, code_verifier: verifier, ...patch })).body.error
  assert.equal(await wrong({ code_verifier: pkce().verifier }), 'invalid_grant')
  assert.equal(await wrong({ client_id: (await register()).body.client_id }), 'invalid_grant')
  assert.equal(await wrong({ redirect_uri: 'https://claude.ai/other' }), 'invalid_grant')
  assert.equal(await wrong({ resource: 'https://other.example/api/mcp' }), 'invalid_target')
  assert.equal(await wrong({ code: code.slice(0, -3) + 'AAA' }), 'invalid_grant')
  assert.equal(await wrong({ client_id: 'mcpc_forged.sig' }), 'invalid_client')

  // Refresh: new tokens, still bound to the client.
  const refreshed = await exchange({ grant_type: 'refresh_token', refresh_token: body.refresh_token, client_id: client.client_id })
  assert.equal(refreshed.res.status, 200)
  assert.ok(verifyAccessToken(refreshed.body.access_token, RESOURCE))
  const stolen = await exchange({ grant_type: 'refresh_token', refresh_token: body.refresh_token, client_id: (await register()).body.client_id })
  assert.equal(stolen.body.error, 'invalid_grant', 'another client cannot use the refresh token')
  assert.equal((await exchange({ grant_type: 'password', client_id: client.client_id })).body.error, 'unsupported_grant_type')
}

// Errors before the redirect URI is trusted are a page, never a redirect.
{
  const { body: client } = await register()
  const { challenge } = pkce()
  const base = { response_type: 'code', client_id: client.client_id, code_challenge: challenge, code_challenge_method: 'S256' }
  const unknown = authorize(new Request(authorizeUrl({ ...base, client_id: 'mcpc_nope.nope' })))
  assert.equal(unknown.status, 400)
  assert.equal(unknown.headers.get('location'), null)
  const hijack = authorize(new Request(authorizeUrl({ ...base, redirect_uri: 'https://evil.example/cb' })))
  assert.equal(hijack.status, 400, 'an unregistered redirect URI is refused')
  assert.equal(hijack.headers.get('location'), null)
  // Once it is trusted, errors go back to the app.
  const noPkce = authorize(new Request(authorizeUrl({ ...base, code_challenge_method: 'plain' })))
  assert.equal(new URL(noPkce.headers.get('location')!).searchParams.get('error'), 'invalid_request')
  const wrongResource = authorize(new Request(authorizeUrl({ ...base, resource: 'https://other.example/api/mcp' })))
  assert.equal(new URL(wrongResource.headers.get('location')!).searchParams.get('error'), 'invalid_target')
  // A single registered redirect URI may be omitted.
  assert.ok(authorize(new Request(authorizeUrl(base))).headers.get('location')!.startsWith('https://vismay.xyz/'))
}

// The callback: no approval, a forged approval, a denial, an expired request.
{
  const { body: client } = await register()
  const { challenge } = pkce()
  const request = requestFromConsentRedirect(
    authorize(new Request(authorizeUrl({ response_type: 'code', client_id: client.client_id, code_challenge: challenge, code_challenge_method: 'S256', state: 's' }))),
  )
  const cb = (q: Record<string, string>) => callback(new Request(`${ORIGIN}/api/mcp/oauth/callback?${new URLSearchParams(q)}`))
  assert.equal(cb({ request }).status, 403, 'no approval, no code')
  assert.equal(cb({ request, approval: 'forged' }).status, 403)
  const other = signMcpConsentRequest({ clientName: 'x', redirectUri: REDIRECT, callback: `${ORIGIN}/api/mcp/oauth/callback`, scope: 'mcp', grant: { cid: 'a', ru: REDIRECT, cc: 'b', st: '', rs: `${ORIGIN}/api/mcp` } })
  assert.equal(cb({ request, approval: approveMcpConsentRequest(other)! }).status, 403, "another request's approval doesn't count")
  const denied = new URL(callback(new Request(mcpConsentDecisionUrl(request, { denied: true })!)).headers.get('location')!)
  assert.equal(denied.searchParams.get('error'), 'access_denied')
  assert.equal(denied.searchParams.get('code'), null)
  assert.equal(cb({ request: 'v1.garbage.sig' }).status, 400)
}

// A secret client must send its secret, by body or Basic.
{
  const { body: client } = await register({ token_endpoint_auth_method: 'client_secret_basic' })
  const { verifier, challenge } = pkce()
  const request = requestFromConsentRedirect(
    authorize(new Request(authorizeUrl({ response_type: 'code', client_id: client.client_id, code_challenge: challenge, code_challenge_method: 'S256' }))),
  )
  const code = new URL(approve(request).headers.get('location')!).searchParams.get('code')!
  const params = { grant_type: 'authorization_code', code, code_verifier: verifier }
  const noSecret = await exchange({ ...params, client_id: client.client_id })
  assert.equal(noSecret.body.error, 'invalid_client')
  const badBasic = await exchange(params, { authorization: `Basic ${Buffer.from(`${client.client_id}:wrong`).toString('base64')}` })
  assert.equal(badBasic.res.status, 401)
  const basic = await exchange(params, { authorization: `Basic ${Buffer.from(`${encodeURIComponent(client.client_id)}:${encodeURIComponent(client.client_secret)}`).toString('base64')}` })
  assert.equal(basic.res.status, 200, JSON.stringify(basic.body))
  const post = await exchange({ ...params, client_id: client.client_id, client_secret: client.client_secret })
  assert.equal(post.res.status, 200, 'client_secret_post works too')
}

// Expiry: an expired code is refused.
{
  const realNow = Date.now
  const { body: client } = await register()
  const { verifier, challenge } = pkce()
  const request = requestFromConsentRedirect(
    authorize(new Request(authorizeUrl({ response_type: 'code', client_id: client.client_id, code_challenge: challenge, code_challenge_method: 'S256' }))),
  )
  const code = new URL(approve(request).headers.get('location')!).searchParams.get('code')!
  Date.now = () => realNow() + 6 * 60 * 1000
  const late = await exchange({ grant_type: 'authorization_code', code, client_id: client.client_id, code_verifier: verifier })
  Date.now = realNow
  assert.equal(late.body.error, 'invalid_grant', 'a code lasts 5 minutes')
}

// Access tokens expire after an hour; refresh tokens can't outlive 90 days from sign-in.
{
  const realNow = Date.now
  const { access, refresh, clientId } = await signIn()
  Date.now = () => realNow() + 61 * 60 * 1000
  assert.equal(verifyAccessToken(access, RESOURCE), null, 'an hour later the access token is void')
  const renewed = await exchange({ grant_type: 'refresh_token', refresh_token: refresh, client_id: clientId })
  assert.equal(renewed.res.status, 200, 'and the refresh token renews it')
  Date.now = () => realNow() + 91 * 24 * 60 * 60 * 1000
  const tooOld = await exchange({ grant_type: 'refresh_token', refresh_token: renewed.body.refresh_token, client_id: clientId })
  Date.now = realNow
  assert.equal(tooOld.body.error, 'invalid_grant', 'after 90 days the app has to sign in again')
}

// MCP_TOKEN_GENERATION signs every app out.
{
  const { access, refresh, clientId } = await signIn()
  process.env.MCP_TOKEN_GENERATION = '2'
  assert.equal(verifyAccessToken(access, RESOURCE), null)
  assert.equal((await exchange({ grant_type: 'refresh_token', refresh_token: refresh, client_id: clientId })).body.error, 'invalid_grant')
  const fresh = await signIn()
  assert.ok(verifyAccessToken(fresh.access, RESOURCE), 'a new sign-in works under the new generation')
  delete process.env.MCP_TOKEN_GENERATION
}

// Without ADMIN_SESSION_SECRET nothing is issued.
{
  const saved = process.env.ADMIN_SESSION_SECRET
  delete process.env.ADMIN_SESSION_SECRET
  assert.equal((await register()).res.status, 503)
  assert.equal(authorize(new Request(authorizeUrl({ client_id: 'x' }))).status, 503)
  process.env.ADMIN_SESSION_SECRET = saved
}

// Tokens of one kind never pass for another.
{
  const { access, refresh } = await signIn()
  assert.equal(verifyAccessToken(refresh, RESOURCE), null)
  assert.equal(verifyAccessToken(access.replace('mcpa_', 'mcpr_'), RESOURCE), null)
  const forged = `mcpa_${Buffer.from(JSON.stringify({ aud: RESOURCE, sc: 'mcp', cid: 'x', exp: 9e9, g: '1' })).toString('base64url')}.${crypto.randomBytes(32).toString('base64url')}`
  assert.equal(verifyAccessToken(forged, RESOURCE), null)
}

console.log('oauth checks passed')
