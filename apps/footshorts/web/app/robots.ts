import type { MetadataRoute } from 'next';
import { siteOrigin } from '@vismay/html-stories/seo';

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin('footshorts');
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // ?embed=1 story copies aren't blocked: they carry noindex, which a
        // crawler only sees if it may fetch them.
        disallow: ['/api/', '/auth/', '/login', '/onboarding/', '/profile', '/following'],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
