import type { MetadataRoute } from 'next';

// Web app manifest — lets mobile browsers "Add to Home Screen" as a proper
// standalone app. Next serves this at /manifest.webmanifest and auto-injects
// the <link rel="manifest"> tag. Icons are generated from app/icon.svg into
// public/icons (see icon-192/512 + the opaque maskable variant).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Footshorts',
    short_name: 'Footshorts',
    description:
      '60-word football stories. Swipe the day’s news and follow your leagues, teams and players.',
    lang: 'en',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0B0B0F',
    theme_color: '#0B0B0F',
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
  };
}
