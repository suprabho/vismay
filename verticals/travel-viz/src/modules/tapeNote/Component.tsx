'use client'

import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { enterStyle } from '../../lib/enter'
import type { TapeNoteLayerConfig } from './index'

/**
 * `travel:tapeNote` — handwritten note on a paper scrap. Pure DOM/CSS: torn
 * edge via clip-path (scrap), ruled lines via repeating gradient (index),
 * warm yellow stock (sticky). Caveat is loaded by the travel app's
 * globals.css; fallbacks keep it legible elsewhere.
 */

const TORN_EDGE =
  'polygon(0% 4%, 3% 1%, 9% 3%, 16% 0%, 25% 2%, 34% 0%, 43% 3%, 52% 1%, 61% 3%, 70% 0%, 79% 2%, 88% 0%, 95% 3%, 100% 1%, 100% 96%, 97% 99%, 90% 97%, 82% 100%, 73% 98%, 64% 100%, 55% 97%, 46% 99%, 37% 97%, 28% 100%, 19% 98%, 10% 100%, 4% 97%, 0% 99%)'

const PAPERS: Record<'scrap' | 'index' | 'sticky', CSSProperties> = {
  scrap: {
    background: '#fdfcf8',
    clipPath: TORN_EDGE,
    padding: '1.4em 1.5em 1.6em',
  },
  index: {
    background:
      'repeating-linear-gradient(#ffffff, #ffffff 1.55em, #d8e4ef 1.55em, #d8e4ef calc(1.55em + 1px))',
    borderTop: '3px solid #e8b1ab',
    borderRadius: 3,
    padding: '1.2em 1.4em 1.4em',
  },
  sticky: {
    background: 'linear-gradient(180deg, #fbf3c2 0%, #f7ecae 100%)',
    borderRadius: 2,
    padding: '1.2em 1.3em 1.5em',
  },
}

export default function TapeNoteLayerComponent({
  config,
  noteReady,
}: VizRenderProps<TapeNoteLayerConfig>) {
  useEffect(() => {
    noteReady()
  }, [noteReady])

  const rotation = config.rotation ?? 0
  const paper = config.paper ?? 'scrap'
  const tape = config.tape ?? 'top'
  const ink = config.ink ?? '#42392c'

  // clip-path is applied after filters on the same element, which would clip
  // the shadow away — so the drop-shadow lives on this outer wrapper and the
  // paper (with its clip-path) is the child.
  const noteStyle: CSSProperties = {
    position: 'relative',
    maxWidth: '100%',
    maxHeight: '100%',
    transform: rotation ? `rotate(${rotation}deg)` : undefined,
    filter: 'drop-shadow(0 6px 16px rgba(20, 16, 8, 0.22))',
    ...enterStyle(config.enterDelay),
  }
  const paperStyle: CSSProperties = {
    position: 'relative',
    maxWidth: '100%',
    maxHeight: '100%',
    ...PAPERS[paper],
  }

  const tapeBase: CSSProperties = {
    position: 'absolute',
    background: 'rgba(232, 222, 184, 0.75)',
    boxShadow: '0 1px 2px rgba(20, 16, 8, 0.12)',
    pointerEvents: 'none',
  }
  const tapeStyle: CSSProperties | null =
    tape === 'top'
      ? { ...tapeBase, top: '-0.7em', left: '50%', width: '5.5em', height: '1.3em', transform: 'translateX(-50%) rotate(-2deg)' }
      : tape === 'corner'
        ? { ...tapeBase, top: '-0.8em', left: '-1.2em', width: '4.5em', height: '1.2em', transform: 'rotate(-40deg)' }
        : null

  const body = (
    <>
      {config.title && (
        <div
          style={{
            fontFamily: "'Space Mono', ui-monospace, monospace",
            fontSize: '0.62em',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: ink,
            opacity: 0.55,
            marginBottom: '0.5em',
          }}
        >
          {config.title}
        </div>
      )}
      <div
        style={{
          fontFamily: "'Caveat', 'Segoe Script', 'Bradley Hand', cursive",
          // vmin keeps the middle term live in both orientations (vw
          // collapsed to the floor on phones, so tips wrapped to 6+ lines).
          fontSize: 'clamp(14px, 2.4vmin, 25px)',
          lineHeight: 1.3,
          color: ink,
        }}
      >
        {config.text}
      </div>
    </>
  )

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={noteStyle}>
        <div style={paperStyle}>
          {config.href ? (
            <a
              href={config.href}
              style={{ textDecoration: 'none', pointerEvents: 'auto', display: 'block' }}
            >
              {body}
            </a>
          ) : (
            body
          )}
        </div>
        {tapeStyle && <div aria-hidden style={tapeStyle} />}
      </div>
    </div>
  )
}
