import { signOutputUrl } from '@vismay/admin-core/signedUrl'
import { vizmayaPublicUrl } from './publicSite'

/**
 * Shared TTL for admin → consumer "open in tab" links. 24h gives a
 * comfortable admin session window without re-signing; URLs refresh on
 * every server-render anyway. If an admin leaves the page open past TTL
 * and clicks, they 401 once and a reload fixes it.
 */
const LINK_TTL_SECONDS = 24 * 60 * 60

export interface SignedStoryLinks {
  /** /story/<slug>/autoplay (gated render route on consumer domain) */
  autoplay: string
  /** /story/<slug>/share (gated render route on consumer domain) */
  share: string
}

export function signStoryLinks(
  slug: string,
  baseUrl: string = vizmayaPublicUrl
): SignedStoryLinks {
  return {
    autoplay: signOutputUrl({
      baseUrl,
      path: `/story/${slug}/autoplay`,
      ttlSeconds: LINK_TTL_SECONDS,
    }),
    share: signOutputUrl({
      baseUrl,
      path: `/story/${slug}/share`,
      ttlSeconds: LINK_TTL_SECONDS,
    }),
  }
}
