import { ImageResponse } from 'next/og'
import { StoryOgCard } from '@/components/seo/StoryOgCard'

export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'vizmaya — Visual Stories'

export default async function Image() {
  return new ImageResponse(
    (
      <StoryOgCard
        title="vizmaya"
        subtitle="Data-driven narratives on geopolitics, technology, and the asymmetries that reshape markets."
        byline="vizmaya"
        date={new Date().toISOString()}
        colors={{
          background: '#0d1220',
          text: '#e4e8f0',
          accent: '#d9a84a',
          accent2: '#4f8aa8',
          surface: '#1a2133',
          muted: '#7f8a9c',
        }}
      />
    ),
    { ...size }
  )
}
