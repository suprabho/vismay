'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { ROCKET_MODELS } from '@vismay/starship-viz/types'
import type {
  RocketModel,
  StarshipMaterial,
  StarshipMode,
} from '@vismay/starship-viz/types'

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
const MODELS = Object.keys(ROCKET_MODELS) as RocketModel[]

// Build an `rgba(r,g,b,a)` string from a `#rrggbb` hex + alpha. Used so the
// stage opacity slider can dim the panel bg without forcing a separate alpha
// input on the color picker.
function hexWithAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export default function StarshipPreviewPage() {
  const [progress, setProgress] = useState(0)
  const [material, setMaterial] = useState<StarshipMaterial>('metal')
  const [model, setModel] = useState<RocketModel>('starship')
  const [stageColor, setStageColor] = useState('#0a0e14')
  const [stageOpacity, setStageOpacity] = useState(1)
  const [groundColor, setGroundColor] = useState('#0a0d12')
  const [groundOpacity, setGroundOpacity] = useState(0.55)
  const [showGround, setShowGround] = useState(true)

  const copyYaml = async () => {
    const yaml = formatPreviewAsYaml({
      model,
      material,
      stageColor,
      stageOpacity,
      groundColor,
      groundOpacity,
      showGround,
    })
    try {
      await navigator.clipboard.writeText(yaml)
      // eslint-disable-next-line no-alert
      alert('YAML copied to clipboard.')
    } catch {
      // eslint-disable-next-line no-alert
      alert(`Clipboard blocked. Here it is:\n\n${yaml}`)
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0a0e14',
        color: '#e0ddd5',
        padding: 24,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 20, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Rocket preview</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <span style={{ opacity: 0.6 }}>rocket</span>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as RocketModel)}
            style={{
              background: 'transparent',
              border: '1px solid #2c303a',
              color: '#e0ddd5',
              padding: '3px 8px',
              borderRadius: 4,
              fontSize: 12,
            }}
          >
            {MODELS.map((m) => (
              <option key={m} value={m} style={{ background: '#0a0e14' }}>
                {ROCKET_MODELS[m].label}
              </option>
            ))}
          </select>
        </div>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <span style={{ opacity: 0.6 }}>stage</span>
          <input
            type="color"
            value={stageColor}
            onChange={(e) => setStageColor(e.target.value)}
            style={{ width: 32, height: 22, border: '1px solid #2c303a', borderRadius: 4, background: 'transparent', padding: 0 }}
          />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={stageOpacity}
            onChange={(e) => setStageOpacity(parseFloat(e.target.value))}
            style={{ width: 90 }}
            title="stage opacity"
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <span style={{ opacity: 0.6 }}>ground</span>
          <input
            type="checkbox"
            checked={showGround}
            onChange={(e) => setShowGround(e.target.checked)}
            title="show ground"
          />
          <input
            type="color"
            value={groundColor}
            onChange={(e) => setGroundColor(e.target.value)}
            disabled={!showGround}
            style={{ width: 32, height: 22, border: '1px solid #2c303a', borderRadius: 4, background: 'transparent', padding: 0, opacity: showGround ? 1 : 0.4 }}
          />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={groundOpacity}
            onChange={(e) => setGroundOpacity(parseFloat(e.target.value))}
            disabled={!showGround}
            style={{ width: 90, opacity: showGround ? 1 : 0.4 }}
            title="ground opacity"
          />
        </div>
        <button
          type="button"
          onClick={copyYaml}
          style={{
            marginLeft: 'auto',
            padding: '5px 12px',
            borderRadius: 4,
            border: '1px solid transparent',
            background: '#d8804a',
            color: '#0a0e14',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Copy YAML
        </button>
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
              background: hexWithAlpha(stageColor, stageOpacity),
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
            <StarshipScene
              key={`${model}-${mode}`}
              model={model}
              mode={mode}
              progress={progress}
              material={material}
              showGround={showGround}
              groundColor={groundColor}
              groundOpacity={groundOpacity}
            />
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

/**
 * Emit the preview's current toolbar state as YAML for pasting into a
 * `- type: starship:viewer` block in `<slug>.config.yaml`.
 *
 * `type / model / material` round-trip through the live parseConfig today.
 * `ground` is forward-looking (parseConfig ignores it until wired through
 * StarshipScene). `stage` is a story-shell concern — applies to the layer's
 * wrapper, not the viewer — so it's emitted as a comment for context.
 */
function formatPreviewAsYaml(s: {
  model: RocketModel
  material: StarshipMaterial
  stageColor: string
  stageOpacity: number
  groundColor: string
  groundOpacity: number
  showGround: boolean
}): string {
  const lines: string[] = [
    '# Copied from /starship-preview — paste into a `- type: starship:viewer`',
    '# block in your story config.yaml.',
    '#',
    '# LIVE (honored by parseConfig today): type, model, material, stage, ground.',
    '',
    'type: starship:viewer',
    `model: ${s.model}`,
    '# mode: rotate          # author-set per story unit — rotate | explode | bellyflop | inspect',
    `material: ${s.material}`,
    '# scrubSteps: 1         # only meaningful for mode: explode | bellyflop',
    '',
    '# Wrapper background painted around the canvas. Omit `stage` entirely to',
    '# let the section bg show through (the common case).',
    'stage:',
    `  color: '${s.stageColor}'`,
    `  opacity: ${fmtNum(s.stageOpacity)}`,
    '',
    'ground:',
    `  show: ${s.showGround}`,
    `  color: '${s.groundColor}'`,
    `  opacity: ${fmtNum(s.groundOpacity)}`,
  ]
  return lines.join('\n')
}

/** Trim trailing zeros from a fixed-precision number so the YAML stays tidy. */
function fmtNum(n: number): string {
  if (n === 0) return '0'
  const s = n.toFixed(4)
  return s.replace(/\.?0+$/, '') || '0'
}
