import { ImageResponse } from 'next/og'
import { ChequeredFlagMarkGradient, VF1Monogram } from '@vizf1/brand/logos'

export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'VizF1 — Data journalism for Formula 1'

// Brand tokens inlined — satori can't read the app's CSS variables.
const BG = '#0b0d12'
const TEXT = '#f5f5f5'
const MUTED = '#8e8e99'
const ACCENT = '#ff4346'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: BG,
          color: TEXT,
          padding: '72px 80px',
        }}
      >
        {/* Chequered flag waves off the top-right, tinted brand red. */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', color: ACCENT }}>
          <ChequeredFlagMarkGradient width={420} height={246} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <VF1Monogram width={280} height={120} />
          <div style={{ display: 'flex', width: 96, height: 8, background: ACCENT, borderRadius: 4 }} />
          <div style={{ display: 'flex', fontSize: 34, color: MUTED }}>
            Data journalism for Formula 1
          </div>
        </div>
      </div>
    ),
    size
  )
}
