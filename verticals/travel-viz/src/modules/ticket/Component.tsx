'use client'

import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { enterStyle } from '../../lib/enter'
import type { TicketLayerConfig } from './index'

/**
 * `travel:ticket` — perforated admission stub. The perforation is a column of
 * punched holes rendered with a repeating radial-gradient down the left edge;
 * the accent bar and stamp pick up the day color.
 */
export default function TicketLayerComponent({
  config,
  noteReady,
}: VizRenderProps<TicketLayerConfig>) {
  useEffect(() => {
    noteReady()
  }, [noteReady])

  const color = config.color ?? '#2ca068'
  const rotation = config.rotation ?? 0

  const ticketStyle: CSSProperties = {
    position: 'relative',
    display: 'flex',
    maxWidth: '100%',
    background: '#fffdf6',
    borderRadius: 6,
    transform: rotation ? `rotate(${rotation}deg)` : undefined,
    boxShadow: '0 8px 22px rgba(20, 16, 8, 0.25)',
    overflow: 'hidden',
    ...enterStyle(config.enterDelay),
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Space Mono', ui-monospace, monospace",
      }}
    >
      <div style={ticketStyle}>
        {/* Perforated tear-off edge */}
        <div
          aria-hidden
          style={{
            width: '1.6em',
            borderRight: '2px dashed rgba(43, 36, 25, 0.25)',
            background: `repeating-radial-gradient(circle at 50% 0.8em, rgba(43,36,25,0.18) 0 0.16em, transparent 0.22em 100%) 0 0 / 100% 1.6em`,
          }}
        />
        {/* Accent bar */}
        <div aria-hidden style={{ width: '0.5em', background: color }} />

        <div
          style={{
            padding: '1.1em 1.4em 1.2em',
            paddingRight: config.stampText ? '7em' : '1.4em',
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: '0.6em',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'rgba(43, 36, 25, 0.5)',
              marginBottom: '0.6em',
            }}
          >
            {config.venue ?? 'New York · Mar 2026'}
          </div>
          <div
            style={{
              fontSize: 'clamp(15px, 1.5vw, 21px)',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#2b2419',
              lineHeight: 1.2,
            }}
          >
            {config.title}
          </div>
          {config.line && (
            <div
              style={{
                fontSize: 'clamp(12px, 1vw, 15px)',
                color: 'rgba(43, 36, 25, 0.75)',
                marginTop: '0.5em',
              }}
            >
              {config.line}
            </div>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '1.2em',
              marginTop: '0.8em',
            }}
          >
            {config.time && (
              <div style={{ fontSize: 'clamp(18px, 2vw, 28px)', fontWeight: 700, color }}>
                {config.time}
              </div>
            )}
            {config.price && (
              <div style={{ fontSize: 'clamp(12px, 1vw, 15px)', color: 'rgba(43, 36, 25, 0.6)' }}>
                {config.price}
              </div>
            )}
          </div>
        </div>

        {config.stampText && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              right: '0.8em',
              top: '50%',
              width: '5.2em',
              height: '5.2em',
              transform: 'translateY(-50%) rotate(12deg)',
              border: `2px solid ${color}`,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              fontSize: '0.62em',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color,
              opacity: 0.65,
              mixBlendMode: 'multiply',
              padding: '0.4em',
            }}
          >
            {config.stampText}
          </div>
        )}
      </div>
    </div>
  )
}
