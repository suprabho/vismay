import { NextResponse } from 'next/server'
import {
  approveMcpConsentRequest,
  mcpConsentDecisionUrl,
} from '@vismay/admin-core/mcpConsent'
import { isAuthed } from '@/lib/adminAuth'

/**
 * The consent page's Allow / Cancel (app/mcp/authorize/[request]). Admin-auth
 * gated, same-origin only. Allow signs an approval for exactly the posted
 * request; either way the browser goes back (303) to the vizmaya.fyi callback
 * the signed request names, which finishes or cancels the app's sign-in.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { 'cache-control': 'no-store' } })
}

export async function POST(req: Request) {
  if (req.headers.get('origin') !== new URL(req.url).origin) return fail('Invalid request origin', 403)
  if (!(await isAuthed())) return fail('unauthorized', 401)

  const form = await req.formData().catch(() => null)
  const token = form?.get('request')
  const decision = form?.get('decision')
  if (typeof token !== 'string' || (decision !== 'allow' && decision !== 'deny')) return fail('Bad request', 400)

  let target: string | null
  if (decision === 'deny') {
    target = mcpConsentDecisionUrl(token, { denied: true })
  } else {
    const approval = approveMcpConsentRequest(token)
    target = approval ? mcpConsentDecisionUrl(token, { approval }) : null
  }
  // An expired or forged request: back to the page, which says so.
  if (!target) return NextResponse.redirect(new URL(`/mcp/authorize/${encodeURIComponent(token)}`, req.url), 303)
  return NextResponse.redirect(target, 303)
}
