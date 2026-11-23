/**
 * fetch for the tools' calls to the story sites (publish, assets, randomizer,
 * context briefs), with redirects handled on purpose.
 *
 * fetch drops the Authorization header when a redirect changes host, so a
 * site URL that redirects (vizmaya.fyi → www.vizmaya.fyi, footshorts.com →
 * www.footshorts.com) turned every token-carrying call into the site's
 * "unauthorized", with nothing pointing at the redirect. Here:
 *   - a redirect on the same origin is followed, token and all;
 *   - a redirect to another host is followed only when the request carries
 *     no token (the public brief); with a token it fails with an error that
 *     names the host to configure, instead of a misleading 401.
 * The token is never sent to the new host on its own, so a redirect can't
 * hand it to anyone.
 */

const MAX_HOPS = 5

function hasAuthorization(init: RequestInit): boolean {
  return new Headers(init.headers).has('authorization')
}

export async function siteFetch(url: string | URL, init: RequestInit = {}, configHint?: string): Promise<Response> {
  let current = new URL(url)
  let request: RequestInit = { ...init }
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const res = await fetch(current, { ...request, redirect: 'manual' })
    const location = res.headers.get('location')
    if (res.status < 300 || res.status > 399 || !location) return res
    const next = new URL(location, current)
    if (next.origin !== current.origin && hasAuthorization(request)) {
      throw new Error(
        `${current.origin} redirects to ${next.origin}, and the publish token isn't sent to another host` +
          (configHint ? `: set ${configHint} to ${next.origin} (or leave it unset for the default)` : '') +
          '.',
      )
    }
    // 307/308 keep the method and body; the others turn into a GET, as browsers do.
    if (res.status !== 307 && res.status !== 308) {
      const { body: _dropped, ...rest } = request
      request = { ...rest, method: 'GET' }
    }
    current = next
  }
  throw new Error(`${new URL(url).origin}: too many redirects.`)
}
