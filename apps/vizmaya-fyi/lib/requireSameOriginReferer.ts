/**
 * Lightweight gate for internal-tooling routes (the /reports builder + its
 * config API). Not real auth — just a "same-origin or 404" check so the
 * pages don't show up to random visitors who type the URL.
 *
 * Returns `null` when the request passes; returns a 404 Response otherwise.
 *
 * Same-origin policy: the Referer header must match the host of the request
 * URL. Direct navigation (no Referer) is allowed in dev only — see comment
 * below. In production the absence of a Referer fails closed.
 */

export function checkSameOriginReferer(req: Request): Response | null {
  const url = new URL(req.url)
  const referer = req.headers.get('referer')

  // Dev mode: allow direct navigation so authors can paste the URL into the
  // address bar. The builder is meant to be used locally; a Referer-only
  // gate would lock the author out of their own tool.
  if (process.env.NODE_ENV !== 'production') {
    return null
  }

  if (!referer) {
    return new Response('Not Found', { status: 404 })
  }
  try {
    const refUrl = new URL(referer)
    if (refUrl.host !== url.host) {
      return new Response('Not Found', { status: 404 })
    }
  } catch {
    return new Response('Not Found', { status: 404 })
  }
  return null
}
