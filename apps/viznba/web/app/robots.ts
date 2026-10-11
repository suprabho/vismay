import type { MetadataRoute } from 'next'
import { siteOrigin } from '@vismay/html-stories/seo'

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin('viznba')
  return {
    // /for-you and /teams aren't blocked: they carry noindex, which a crawler
    // only sees if it may fetch them.
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/'] }],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  }
}
