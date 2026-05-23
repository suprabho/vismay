// Smoke test for the signed-URL round-trip. Not a unit test — there's no
// test runner in this repo yet. Run with:
//
//   pnpm --filter @vismay/admin-core exec tsx src/signedUrl.smoke.ts
//
// Exits non-zero if any check fails.

import { signOutputUrl, verifySignedRequest } from './signedUrl'

process.env.ADMIN_SESSION_SECRET = 'test-secret-do-not-use'

function ctxFromUrl(urlStr: string) {
  const u = new URL(urlStr)
  return { pathname: u.pathname, searchParams: u.searchParams }
}

function check(name: string, condition: boolean) {
  if (condition) console.log(`  ✓ ${name}`)
  else { console.error(`  ✗ ${name}`); process.exitCode = 1 }
}

console.log('1. happy path')
const url1 = signOutputUrl({
  baseUrl: 'https://vizmaya.fyi',
  path: '/story/foo/share',
  ttlSeconds: 60,
  query: { ratio: '1:1' },
})
check('signed URL starts with baseUrl + path', url1.startsWith('https://vizmaya.fyi/story/foo/share?'))
check('has t param', url1.includes('t='))
check('has exp param', url1.includes('exp='))
check('has ratio param', url1.includes('ratio=1%3A1'))
check('verifies', verifySignedRequest(ctxFromUrl(url1)) === true)

console.log('2. tamper: path changed')
const tampered = url1.replace('/share', '/autoplay')
check('rejects path-tampered URL', verifySignedRequest(ctxFromUrl(tampered)) === false)

console.log('3. tamper: exp pushed out')
const u3 = new URL(url1)
u3.searchParams.set('exp', String(Math.floor(Date.now() / 1000) + 999999))
check('rejects exp-tampered URL', verifySignedRequest(ctxFromUrl(u3.toString())) === false)

console.log('4. tamper: token swapped')
const u4 = new URL(url1)
const t = u4.searchParams.get('t') as string
u4.searchParams.set('t', 'AAAA' + t.slice(4))
check('rejects token-tampered URL', verifySignedRequest(ctxFromUrl(u4.toString())) === false)

console.log('5. expired')
const u5 = signOutputUrl({
  baseUrl: 'https://vizmaya.fyi',
  path: '/story/foo/share',
  ttlSeconds: -10,
})
check('rejects expired URL', verifySignedRequest(ctxFromUrl(u5)) === false)

console.log('6. missing secret on verify')
delete process.env.ADMIN_SESSION_SECRET
check('returns false when secret missing (never throws)',
  verifySignedRequest(ctxFromUrl(url1)) === false)

console.log('7. extra query params allowed (cache-bust)')
process.env.ADMIN_SESSION_SECRET = 'test-secret-do-not-use'
const u7 = new URL(url1)
u7.searchParams.set('_v', '42')
check('accepts URL with extra query params', verifySignedRequest(ctxFromUrl(u7.toString())) === true)

console.log('\nDone.')
