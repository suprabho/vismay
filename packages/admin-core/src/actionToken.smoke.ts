/**
 * Smoke test for actionToken.ts. Run with:
 *   ADMIN_SESSION_SECRET=test pnpm exec tsx packages/admin-core/src/actionToken.smoke.ts
 *
 * Not Jest — runtime here doesn't have a test setup yet. Each assertion logs
 * a ✓/✗ line; non-zero exit on any failure.
 */
import { signActionToken, verifyActionToken } from './actionToken'

let failed = 0
function check(label: string, cond: boolean): void {
  if (cond) {
    console.log(`  ✓ ${label}`)
  } else {
    console.log(`  ✗ ${label}`)
    failed += 1
  }
}

// Configure a secret for this run.
process.env.ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || 'smoke-secret'

console.log('1. happy path')
const t1 = signActionToken({
  scope: 'edit-story-map',
  subject: 'cookie-monster',
})
const parts = t1.split('.')
check('token has 5 parts', parts.length === 5)
check('token version is v1', parts[0] === 'v1')
check('exp is numeric', /^\d+$/.test(parts[1] ?? ''))
check('scope round-trips', parts[2] === 'edit-story-map')
check('subject round-trips', parts[3] === 'cookie-monster')
check(
  'verifies with matching scope/subject',
  verifyActionToken(t1, { scope: 'edit-story-map', subject: 'cookie-monster' })
)

console.log('2. tamper: scope swap')
check(
  'rejects token with mismatched scope',
  !verifyActionToken(t1, { scope: 'edit-story-content', subject: 'cookie-monster' })
)

console.log('3. tamper: subject swap')
check(
  'rejects token with mismatched subject',
  !verifyActionToken(t1, { scope: 'edit-story-map', subject: 'other-slug' })
)

console.log('4. tamper: signature changed')
const tampered =
  parts.slice(0, 4).join('.') +
  '.' +
  Buffer.from('forgery'.repeat(8))
    .toString('base64url')
    .slice(0, parts[4]!.length)
check(
  'rejects forged signature of same length',
  !verifyActionToken(tampered, { scope: 'edit-story-map', subject: 'cookie-monster' })
)

console.log('5. expired')
const t5 = signActionToken({
  scope: 'edit-story-map',
  subject: 'cookie-monster',
  ttlSeconds: -1,
})
check(
  'rejects expired token',
  !verifyActionToken(t5, { scope: 'edit-story-map', subject: 'cookie-monster' })
)

console.log('6. missing secret on verify')
const savedSecret = process.env.ADMIN_SESSION_SECRET
delete process.env.ADMIN_SESSION_SECRET
check(
  'returns false when secret missing (never throws)',
  !verifyActionToken(t1, { scope: 'edit-story-map', subject: 'cookie-monster' })
)
process.env.ADMIN_SESSION_SECRET = savedSecret

console.log('7. malformed inputs')
check('rejects null token', !verifyActionToken(null, { scope: 'x', subject: 'y' }))
check('rejects empty token', !verifyActionToken('', { scope: 'x', subject: 'y' }))
check(
  'rejects token with too few parts',
  !verifyActionToken('v1.123.foo.bar', { scope: 'foo', subject: 'bar' })
)
check(
  'rejects token with wrong version',
  !verifyActionToken('v2.99999999999.foo.bar.sig', { scope: 'foo', subject: 'bar' })
)

console.log('8. signing rejects unsafe scope/subject')
let threwOnBadScope = false
try {
  signActionToken({ scope: 'edit story', subject: 'ok' })
} catch {
  threwOnBadScope = true
}
check('signActionToken throws on scope with space', threwOnBadScope)

let threwOnBadSubject = false
try {
  signActionToken({ scope: 'ok', subject: 'foo.bar' })
} catch {
  threwOnBadSubject = true
}
check('signActionToken throws on subject with dot', threwOnBadSubject)

console.log(failed === 0 ? '\nDone.' : `\n${failed} check(s) failed.`)
process.exit(failed === 0 ? 0 : 1)
