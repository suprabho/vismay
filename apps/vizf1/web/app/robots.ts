import type { MetadataRoute } from 'next'
import { siteOrigin } from '@vismay/html-stories/seo'

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin('vizf1')
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Embeds and ?embed=1 copies aren't blocked: they carry noindex, which a
        // crawler only sees if it may fetch them.
        disallow: ['/api/', '/auth/', '/login', '/onboarding/', '/following'],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  }
}
