'use client'

import { useRef, useState, useEffect } from 'react'
import { Icon, type IconifyIcon } from '@iconify/react'
import type { TitleSegment } from '@/components/story/HeroTitle'
import {
  krFlag,
  brainIcon,
  shipIcon,
  oilDrumIcon,
  boltIcon,
} from '@/components/story/HeroTitle'

// ── Segment data (portrait layout for share cards) ────────────
const PORTRAIT_SEGMENTS: TitleSegment[] = [
  { type: 'pill', icon: krFlag, text: 'South Korea' },
  { type: 'break' },
  { type: 'text', content: 'Makes the ' },
  { type: 'pill', icon: brainIcon, text: 'Memory' },
  { type: 'text', content: ' &' },
  { type: 'break' },
  { type: 'text', content: 'Builds the ' },
  { type: 'pill', icon: shipIcon, text: 'Ships' },
  { type: 'break' },
  { type: 'text', content: 'It Just Lost All' },
  { type: 'break' },
  { type: 'pill', icon: boltIcon, text: '3 Energy Lines.' },
  { type: 'break' },
  { type: 'icon-pill', icon: oilDrumIcon, text: 'LNG', color: '#155dfc' },
  { type: 'text', content: ' ' },
  { type: 'icon-pill', icon: oilDrumIcon, text: 'Oil', color: '#f54900' },
  { type: 'text', content: ' ' },
  { type: 'icon-pill', icon: oilDrumIcon, text: 'He', color: '#2d7a4f' },
]

function buildSegments(title: string): TitleSegment[] {
  if (title.toLowerCase().includes('south korea')) return PORTRAIT_SEGMENTS
  return [{ type: 'text', content: title }]
}

// ── Canvas text measurement ───────────────────────────────────
let _canvas: HTMLCanvasElement | null = null
function getCtx() {
  if (!_canvas) _canvas = document.createElement('canvas')
  return _canvas.getContext('2d')!
}
function measureText(text: string, font: string): number {
  const ctx = getCtx()
  ctx.font = font
  return ctx.measureText(text).width
}

// ── Token types (mirroring HeroTitle) ─────────────────────────
type WordToken = { kind: 'word'; text: string; width: number }
type SpaceToken = { kind: 'space'; width: number }
type PillToken = {
  kind: 'pill'
  icon: IconifyIcon
  text: string
  color?: string
  width: number
  textWidth: number
}
type IconPillToken = {
  kind: 'icon-pill'
  icon: IconifyIcon
  text: string
  color: string
  width: number
  noFilter?: boolean
}
type BreakToken = { kind: 'break' }
type Token = WordToken | SpaceToken | PillToken | IconPillToken | BreakToken
type RenderedLine = Token[]

function isNearBlack(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return r < 50 && g < 50 && b < 50
}

function hexToHueRotate(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0
  if (max !== min) {
    const d = max - min
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
    else if (max === g) h = ((b - r) / d + 2) * 60
    else h = ((r - g) / d + 4) * 60
  }
  return h - 50
}

// ── Tokenizer ─────────────────────────────────────────────────
function tokenize(segments: TitleSegment[], font: string, fontSize: number): Token[] {
  const tokens: Token[] = []
  const monoFont = `bold ${fontSize}px monospace`
  const spaceW = measureText(' ', font)
  const iconSize = fontSize * 0.7
  const pillPadX = fontSize * 0.12
  const pillGap = fontSize * 0.1
  const iconPillSize = fontSize * 1.6
  const iconPillPad = fontSize * 0.15

  for (const seg of segments) {
    if (seg.type === 'pill') {
      const letterSpacingPx = 2
      const textW = measureText(seg.text, monoFont) + seg.text.length * letterSpacingPx
      const totalW = pillPadX + iconSize + pillGap + textW + pillPadX
      tokens.push({
        kind: 'pill',
        icon: seg.icon,
        text: seg.text,
        color: seg.color,
        width: totalW,
        textWidth: textW,
      })
    } else if (seg.type === 'icon-pill') {
      tokens.push({
        kind: 'icon-pill',
        icon: seg.icon,
        text: seg.text,
        color: seg.color,
        width: iconPillSize + iconPillPad * 2,
        noFilter: seg.noFilter,
      })
    } else if (seg.type === 'break') {
      tokens.push({ kind: 'break' })
    } else {
      const parts = seg.content.split(/(\s+)/)
      for (const p of parts) {
        if (!p) continue
        if (/^\s+$/.test(p)) {
          tokens.push({ kind: 'space', width: spaceW * p.length })
        } else {
          tokens.push({ kind: 'word', text: p, width: measureText(p, font) })
        }
      }
    }
  }
  return tokens
}

// ── Line wrapper ──────────────────────────────────────────────
function wrapTokens(tokens: Token[], maxWidth: number): RenderedLine[] {
  const lines: RenderedLine[] = [[]]
  let x = 0

  for (const token of tokens) {
    if (token.kind === 'break') {
      lines.push([])
      x = 0
      continue
    }
    if (token.kind === 'space') {
      if (lines[lines.length - 1].length > 0 && x + token.width <= maxWidth) {
        lines[lines.length - 1].push(token)
        x += token.width
      }
      continue
    }
    if (x + token.width > maxWidth && lines[lines.length - 1].length > 0) {
      lines.push([])
      x = 0
    }
    lines[lines.length - 1].push(token)
    x += token.width
  }
  return lines
}

// ── Component ─────────────────────────────────────────────────
interface Props {
  title: string
  /** Paragraph below the title (the "dek"). Optional. */
  dek?: string
}

const MAX_WIDTH = 310
const LINE_HEIGHT_RATIO = 1.2

export default function ShareHeroCard({ title, dek }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [lines, setLines] = useState<RenderedLine[]>([])
  const [fontSize, setFontSize] = useState(28)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    document.fonts.ready.then(() => {
      const serifFamily =
        getComputedStyle(el).getPropertyValue('--font-serif').trim() ||
        'Georgia, "Times New Roman", serif'
      const size = 28
      const font = `bold ${size}px ${serifFamily}`
      setFontSize(size)
      const segments = buildSegments(title)
      setLines(wrapTokens(tokenize(segments, font, size), MAX_WIDTH))
    })
  }, [title])

  const lh = fontSize * LINE_HEIGHT_RATIO
  const iconSize = fontSize * 0.7
  const pillH = fontSize
  const pillPadX = fontSize * 0.12
  const pillGap = fontSize * 0.1
  const pillRadius = pillH / 2

  const lineHeights = lines.map((line) => {
    const hasIconPill = line.some((t) => t.kind === 'icon-pill')
    if (hasIconPill) {
      const ipPad = fontSize * 0.1
      const maxBoxH = Math.max(
        ...line
          .filter((t) => t.kind === 'icon-pill')
          .map((t) => ('width' in t ? t.width : 0) + ipPad)
      )
      return maxBoxH + fontSize * 0.2
    }
    return lh
  })
  const lineYs: number[] = []
  let cumY = 0
  for (let i = 0; i < lines.length; i++) {
    const hasIconPill = lines[i].some((t) => t.kind === 'icon-pill')
    if (hasIconPill && i > 0) cumY += fontSize * 0.5
    lineYs.push(cumY)
    cumY += lineHeights[i]
  }
  const svgHeight = cumY

  return (
    <div ref={containerRef} className="flex flex-col justify-start h-full p-4">
      {lines.length > 0 && (
        <svg
          width={MAX_WIDTH}
          height={svgHeight}
          viewBox={`0 0 ${MAX_WIDTH} ${svgHeight}`}
          role="heading"
          aria-level={1}
          aria-label={title}
        >
          {lines.map((line, li) => {
            let x = 0
            const baseY = lineYs[li]

            return (
              <g key={li}>
                {line.map((token, ti) => {
                  const tx = x

                  if (token.kind === 'space') {
                    x += token.width
                    return null
                  }

                  if (token.kind === 'pill') {
                    x += token.width
                    const pillY = baseY + (lh - pillH) / 2
                    const bgColor = token.color ?? 'white'
                    const textColor = token.color
                      ? 'white'
                      : 'var(--color-bg, #0A0A0A)'
                    const borderColor = token.color
                      ? `${token.color}55`
                      : 'rgba(255,255,255,0.15)'

                    return (
                      <g key={ti}>
                        <rect
                          x={tx}
                          y={pillY}
                          width={token.width}
                          height={pillH}
                          rx={pillRadius}
                          ry={pillRadius}
                          fill={bgColor}
                          stroke={borderColor}
                          strokeWidth={1.2}
                        />
                        <foreignObject
                          x={tx + pillPadX}
                          y={pillY + (pillH - iconSize) / 2}
                          width={iconSize}
                          height={iconSize}
                        >
                          <div
                            style={{
                              width: iconSize,
                              height: iconSize,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Icon icon={token.icon} width={iconSize} height={iconSize} />
                          </div>
                        </foreignObject>
                        <text
                          x={tx + pillPadX + iconSize + pillGap}
                          y={pillY + pillH / 2}
                          dominantBaseline="central"
                          fill={textColor}
                          fontFamily="var(--font-mono), monospace"
                          fontSize={fontSize}
                          fontWeight="bold"
                          letterSpacing="2px"
                        >
                          {token.text}
                        </text>
                      </g>
                    )
                  }

                  if (token.kind === 'icon-pill') {
                    x += token.width
                    const ipPad = fontSize * 0.1
                    const boxW = token.width + ipPad
                    const boxH = token.width + ipPad
                    const ipY = baseY + (lh - pillH) / 2 + (pillH - boxH) / 2
                    const iconInner = token.width * 0.5
                    const labelFont = fontSize * 0.2
                    const labelW = token.width * 0.4
                    const labelH = fontSize * 0.3
                    const labelX = tx + (boxW - labelW) / 2
                    const labelY = ipY + (boxH - labelH) / 2

                    return (
                      <g key={ti}>
                        <rect
                          x={tx}
                          y={ipY}
                          width={boxW}
                          height={boxH}
                          rx={token.width * 0.2}
                          ry={token.width * 0.2}
                          fill={`${token.color}1F`}
                          stroke={`${token.color}55`}
                          strokeWidth={1.2}
                        />
                        <foreignObject
                          x={tx + (boxW - iconInner) / 2}
                          y={ipY + ipPad + (token.width - iconInner - labelH) / 2}
                          width={iconInner}
                          height={iconInner}
                        >
                          <div
                            style={{
                              width: iconInner,
                              height: iconInner,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              filter: token.noFilter
                                ? undefined
                                : isNearBlack(token.color)
                                  ? 'grayscale(1) brightness(0.2)'
                                  : `grayscale(1) brightness(0.6) sepia(1) hue-rotate(${hexToHueRotate(token.color)}deg) saturate(3) brightness(1.2)`,
                            }}
                          >
                            <Icon icon={token.icon} width={iconInner} height={iconInner} />
                          </div>
                        </foreignObject>
                        <rect
                          x={labelX}
                          y={labelY}
                          width={labelW}
                          height={labelH}
                          rx={2}
                          fill={token.color}
                        />
                        <text
                          x={labelX + labelW / 2}
                          y={labelY + labelH / 2}
                          dominantBaseline="central"
                          textAnchor="middle"
                          fill="#FFFFFF"
                          fontFamily="var(--font-mono), monospace"
                          fontSize={labelFont}
                          fontWeight="bold"
                          letterSpacing="3px"
                        >
                          {token.text}
                        </text>
                      </g>
                    )
                  }

                  if (token.kind === 'break') return null

                  // Word token
                  x += token.width
                  return (
                    <text
                      key={ti}
                      x={tx}
                      y={baseY + fontSize}
                      fill="white"
                      fontFamily="var(--font-serif)"
                      fontSize={fontSize}
                      fontWeight="bold"
                    >
                      {token.text}
                    </text>
                  )
                })}
              </g>
            )
          })}
        </svg>
      )}
      {dek && (
        <p
          className="font-serif text-[0.95rem] leading-[1.45] mt-4"
          style={{ color: 'var(--color-muted)' }}
        >
          {dek}
        </p>
      )}
    </div>
  )
}
