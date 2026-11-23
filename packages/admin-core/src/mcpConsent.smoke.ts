/**
 * Smoke test for mcpConsent.ts. Run with:
 *   pnpm exec tsx packages/admin-core/src/mcpConsent.smoke.ts
 *
 * Same style as actionToken.smoke.ts: a ✓/✗ line per check, non-zero exit on
 * any failure.
 */
import {
  approveMcpConsentRequest,
  mcpConsentDecisionUrl,
  readMcpConsentRequest,
  signMcpConsentRequest,
  verifyMcpConsentApproval,
} from './mcpConsent'

let failed = 0
function check(label: string, cond: boolean): void {
  console.log(`  ${cond ? '✓' : '✗'} ${label}`)
  if (!cond) failed += 1
}

process.env.ADMIN_SESSION_SECRET = 'smoke-secret'

const base = {
  clientName: 'Claude',
  redirectUri: 'https://claude.ai/api/mcp/auth_callback',
  callback: 'https://vizmaya.fyi/api/mcp/oauth/callback',
  scope: 'mcp',
  grant: { cid: 'abc', challenge: 'xyz', state: 's1' },
}

console.log('1. request round trip')
const token = signMcpConsentRequest(base)
const read = readMcpConsentRequest(token)
check('reads back', read?.clientName === 'Claude' && read.grant.state === 's1')
check('carries an expiry in the future', !!read && read.exp > Date.now() / 1000)

console.log('2. tampering')
const [v, payload, sig] = token.split('.')
const forged = Buffer.from(JSON.stringify({ ...read, callback: 'https://evil.example/cb' })).toString('base64url')
check('a changed payload fails', readMcpConsentRequest(`${v}.${forged}.${sig}`) === null)
check('a changed signature fails', readMcpConsentRequest(`${v}.${payload}.${sig!.slice(0, -2)}AA`) === null)
check('garbage fails', readMcpConsentRequest('nope') === null && readMcpConsentRequest('') === null)

console.log('3. expiry')
const expired = signMcpConsentRequest(base, -1)
check('an expired request fails', readMcpConsentRequest(expired) === null)
check('an expired request cannot be approved', approveMcpConsentRequest(expired) === null)

console.log('4. approval')
const approval = approveMcpConsentRequest(token)!
check('approves a valid request', typeof approval === 'string' && approval.length > 20)
check('the approval verifies for its request', verifyMcpConsentApproval(token, approval))
const other = signMcpConsentRequest({ ...base, grant: { ...base.grant, state: 's2' } })
check('the approval does not verify for another request', !verifyMcpConsentApproval(other, approval))
check('the request signature is not an approval', !verifyMcpConsentApproval(token, sig))

console.log('5. decision URL')
const yes = new URL(mcpConsentDecisionUrl(token, { approval })!)
check('goes to the callback', yes.origin + yes.pathname === base.callback)
check('carries the request and approval', yes.searchParams.get('request') === token && yes.searchParams.get('approval') === approval)
const no = new URL(mcpConsentDecisionUrl(token, { denied: true })!)
check('a denial carries denied=1 and no approval', no.searchParams.get('denied') === '1' && !no.searchParams.has('approval'))

console.log('6. callback must be https (or localhost)')
let threw = false
try {
  signMcpConsentRequest({ ...base, callback: 'javascript:alert(1)' })
} catch {
  threw = true
}
check('refuses a non-https callback', threw)

console.log('7. secret rotation')
process.env.ADMIN_SESSION_SECRET = 'rotated'
check('a request signed with the old secret fails', readMcpConsentRequest(token) === null)
check('so does its approval', !verifyMcpConsentApproval(token, approval))

if (failed) {
  console.log(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nall checks passed')
