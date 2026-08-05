'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { enterStyle } from '../../lib/enter'
import type { PostmarkLayerConfig } from './index'

/**
 * `travel:postmark` — rubber-stamp ring. Double ring + multiply blend give an
 * inked feel over the map; sizes off the smaller edge of its slot box and
 * caps at 150px so it stays a stamp, not a poster.
 */
export default function PostmarkLayerComponent({
  config,
  noteReady,
}: VizRenderProps<PostmarkLayerConfig>) {
  useEffect(() => {
    noteReady()
  }, [noteReady])

  const color = config.color ?? '#2ca068'
  const rotation = config.rotation ?? -8

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...enterStyle(config.enterDelay),
      }}
    >
      <div
        style={{
          width: 'min(100%, 150px)',
          aspectRatio: '1 / 1',
          border: `2.5px solid ${color}`,
          borderRadius: '50%',
          boxShadow: `inset 0 0 0 1px ${color}55`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.15em',
          transform: `rotate(${rotation}deg)`,
          color,
          opacity: 0.92,
          // Soft paper chip behind the ink so the stamp stays legible over
          // photos and busy map tiles alike.
          background: 'rgba(253, 252, 248, 0.62)',
          backdropFilter: 'blur(1.5px)',
          fontFamily: "'Space Mono', ui-monospace, monospace",
          textAlign: 'center',
          padding: '8%',
        }}
      >
        {config.emoji && <div style={{ fontSize: '1.3em', lineHeight: 1 }}>{config.emoji}</div>}
        {config.time && (
          <div style={{ fontSize: '0.95em', fontWeight: 700, letterSpacing: '0.04em' }}>
            {config.time}
          </div>
        )}
        <div
          style={{
            fontSize: '0.55em',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            lineHeight: 1.35,
            maxWidth: '100%',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {config.place}
        </div>
      </div>
    </div>
  )
}
