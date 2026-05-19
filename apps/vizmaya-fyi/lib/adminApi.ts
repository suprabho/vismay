/**
 * Server-side proxy to the admin app at admin.vizmaya.fyi.
 *
 * After the admin lift (commit 74a66d8), the admin write endpoints moved out
 * of this app into `apps/admin/app/api/vizmaya/...`. The edit surfaces that
 * still live here (share, autoplay, cues) keep calling stable `/api/admin/...`
 * paths in this app — those paths now proxy the request through, sidestepping
 * the cross-origin CORS preflight the browser would otherwise force.
 *
 * `ADMIN_INTERNAL_URL` points at the admin origin (no NEXT_PUBLIC_ prefix —
 * this runs server-side only). Defaults to localhost:3001 to match the dev
 * port set in the admin lift commit.
 */
const ADMIN_BASE = (process.env.ADMIN_INTERNAL_URL || 'http://localhost:3001').replace(/\/$/, '')

export async function proxyToAdmin(req: Request, adminPath: string): Promise<Response> {
  const normalized = adminPath.startsWith('/') ? adminPath : `/${adminPath}`
  const url = `${ADMIN_BASE}${normalized}`

  // Forward the cookie verbatim so the admin's auth gate sees the user's
  // session. In prod the cookie is Domain=.vizmaya.fyi (shared across both
  // hosts); in dev it's host-only on localhost (which is shared across ports).
  const headers = new Headers()
  const cookie = req.headers.get('cookie')
  if (cookie) headers.set('cookie', cookie)
  const contentType = req.headers.get('content-type')
  if (contentType) headers.set('content-type', contentType)

  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer()

  const upstream = await fetch(url, {
    method: req.method,
    headers,
    body,
    redirect: 'manual',
  })

  // Strip hop-by-hop headers and pass the rest through so JSON / status codes
  // round-trip cleanly back to the client.
  const responseHeaders = new Headers(upstream.headers)
  responseHeaders.delete('content-encoding')
  responseHeaders.delete('content-length')
  responseHeaders.delete('transfer-encoding')

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  })
}
