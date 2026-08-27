import type { MetadataRoute } from 'next'

// Web app manifest — lets mobile browsers "Add to Home Screen" as a proper
// standalone app. Next serves this at /manifest.webmanifest and auto-injects
// the <link rel="manifest"> tag. Icons are rasterized from the brand SVGs in
// public/brand (see icon-192/512 + the opaque maskable variant).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'VizF1',
    short_name: 'VizF1',
    description: 'Data journalism for Formula 1.',
    lang: 'en',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0b0d12',
    theme_color: '#0b0d12',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
