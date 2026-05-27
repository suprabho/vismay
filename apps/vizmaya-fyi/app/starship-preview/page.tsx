'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import type { StarshipMaterial, StarshipMode } from '@vismay/starship-viz/types'

/**
 * Standalone 4-mode preview for `starship:viewer` — bypasses the story
 * shell entirely so we can see every mode at once on /starship-preview.
 *
 * The R3F scene is dynamic-imported with `ssr: false` because Next 16's
 * server pass otherwise tries to render `<Canvas>` server-side, which
 * doesn't have a DOM/WebGL context. SSR'ing R3F also disables the auto
 * resize observer that sizes the canvas to its parent on first mount.
 *
 * Scrub slider drives a 0..1 progress value for explode/bellyflop. Material
 * toggle is global to all four scenes so the comparison stays apples-to-apples.
 *
 * This is a developer/QA route — keep it out of the main nav and out of
 * the sitemap (no `metadata.robots`, no link from `/`).
 */

const StarshipScene = dynamic(
  () => import('@vismay/starship-viz/web').then((m) => m.StarshipScene),
  { ssr: false },
)

const MODES: StarshipMode[] = ['rotate', 'explode', 'bellyflop', 'inspect']

export default function StarshipPreviewPage() {
  const [progress, setProgress] = useState(0)
  const [material, setMaterial] = useState<StarshipMaterial>('metal')

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0a0e14',
        color: '#e0ddd5',
        padding: 24,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Starship preview</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <span style={{ opacity: 0.6 }}>material</span>
          {(['metal', 'black'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMaterial(m)}
              style={{
                padding: '4px 10px',
                borderRadius: 4,
                border: '1px solid #2c303a',
                background: material === m ? '#d8804a' : 'transparent',
                color: material === m ? '#0a0e14' : '#e0ddd5',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {m}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <span style={{ opacity: 0.6 }}>scrub</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={progress}
            onChange={(e) => setProgress(parseFloat(e.target.value))}
            style={{ width: 200 }}
          />
          <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.6 }}>
            {progress.toFixed(2)}
          </span>
        </div>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 16,
        }}
      >
        {MODES.map((mode) => (
          <div
            key={mode}
            style={{
              position: 'relative',
              aspectRatio: '4 / 3',
              border: '1px solid #2c303a',
              borderRadius: 6,
              overflow: 'hidden',
              background:
                'radial-gradient(ellipse at 50% 60%, rgba(40,52,68,0.4) 0%, rgba(10,14,20,0.92) 70%)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 8,
                left: 10,
                fontSize: 11,
                letterSpacing: 1,
                textTransform: 'uppercase',
                color: '#a8a39a',
                zIndex: 1,
                pointerEvents: 'none',
              }}
            >
              {mode}
            </div>
            <StarshipScene mode={mode} progress={progress} material={material} />
          </div>
        ))}
      </div>

      <p style={{ marginTop: 16, fontSize: 12, opacity: 0.55 }}>
        Drag inside the inspect panel to orbit. The scrub slider drives explode/bellyflop;
        rotate and inspect ignore it.
      </p>
    </main>
  )
}
