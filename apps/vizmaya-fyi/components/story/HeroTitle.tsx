'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { Icon, type IconifyIcon } from '@iconify/react'
import gsap from 'gsap'

import krFlag from '@iconify-icons/circle-flags/kr'
import brainIcon from '@iconify-icons/noto/brain'
import shipIcon from '@iconify-icons/noto/ship'
import oilDrumIcon from '@iconify-icons/noto/oil-drum'
import boltIcon from '@iconify-icons/noto/high-voltage'

// ── Segment types ──────────────────────────────────────────────
export type TitleSegment =
  | { type: 'text'; content: string }
  | { type: 'pill'; icon: IconifyIcon; text: string; color?: string }
  | { type: 'icon-pill'; icon: IconifyIcon; text: string; color: string; noFilter?: boolean }
  | { type: 'break' }

// ── Internal tokens ────────────────────────────────────────────
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

// ── Hex color → CSS hue-rotate offset ─────────────────────────
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
  // sepia base hue is ~50°, so offset from that
  return h - 50
}

// ── Canvas text measurement ────────────────────────────────────
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

// ── Tokenizer ──────────────────────────────────────────────────
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

// ── Line wrapper ───────────────────────────────────────────────
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

// ── Component ──────────────────────────────────────────────────
interface HeroTitleProps {
  segments: TitleSegment[]
  portraitSegments?: TitleSegment[]
  lineHeight?: number
}

export default function HeroTitle({ segments, portraitSegments, lineHeight = 1.2 }: HeroTitleProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [lines, setLines] = useState<RenderedLine[]>([])
  const [fontSize, setFontSize] = useState(42)
  const [viewWidth, setViewWidth] = useState(780)

  const plainText = segments.map((s) => s.type === 'break' ? ' ' : s.type === 'text' ? s.content : s.text).join('')

  const computeLayout = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const baseSize = parseFloat(getComputedStyle(el).fontSize)
    const w = el.clientWidth
    const h = el.closest('section')?.clientHeight || window.innerHeight
    const aspect = w / h
    const scale = Math.min(Math.max(aspect * 0.8, 0.6), 1)
    const size = baseSize * scale
    setFontSize(size)

    const serifFamily = getComputedStyle(el).getPropertyValue('--font-serif').trim() || 'Georgia, "Times New Roman", serif'
    const font = `bold ${size}px ${serifFamily}`
    const maxW = Math.min(w, 780)
    setViewWidth(maxW)

    const activeSegments = aspect < 1 && portraitSegments ? portraitSegments : segments
    setLines(wrapTokens(tokenize(activeSegments, font, size), maxW))
  }, [segments, portraitSegments])

  useEffect(() => {
    computeLayout()
    window.addEventListener('resize', computeLayout)
    return () => window.removeEventListener('resize', computeLayout)
  }, [computeLayout])

  // GSAP stagger
  useEffect(() => {
    const svg = svgRef.current
    if (!svg || lines.length === 0) return
    const tokens = svg.querySelectorAll('.hero-token')
    gsap.set(tokens, { opacity: 0, y: 20 })
    gsap.to(tokens, {
      opacity: 1,
      y: 0,
      duration: 0.5,
      stagger: 0.06,
      ease: 'power3.out',
      delay: 0.3,
    })
  }, [lines])

  const lh = fontSize * lineHeight
  const iconSize = fontSize * 0.7
  const pillH = fontSize
  const pillPadX = fontSize * 0.12
  const pillGap = fontSize * 0.1
  const pillRadius = pillH / 2

  // Compute actual height per line based on tallest token
  const lineHeights = lines.map((line) => {
    const hasIconPill = line.some((t) => t.kind === 'icon-pill')
    if (hasIconPill) {
      const ipPad = fontSize * 0.1
      const maxBoxH = Math.max(...line.filter((t) => t.kind === 'icon-pill').map((t) => ('width' in t ? t.width : 0) + ipPad))
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
    <div
      ref={containerRef}
      className="font-[family-name:var(--font-serif)] tracking-tight text-[clamp(2rem,4.2vw,5rem)] font-bold max-w-[780px]"
      style={{ lineHeight }}
    >
      {lines.length > 0 ? (
        <svg
          ref={svgRef}
          width="100%"
          height={svgHeight}
          viewBox={`0 0 ${viewWidth} ${svgHeight}`}
          aria-label={plainText}
          role="heading"
          aria-level={1}
        >
          {lines.map((line, li) => {
            let x = 0
            const baseY = lineYs[li]

            return (
              <g key={li} className="hero-line">
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
                    const textColor = token.color ? 'white' : 'var(--color-bg, #0A0A0A)'
                    const borderColor = token.color
                      ? `${token.color}55`
                      : 'rgba(255,255,255,0.15)'

                    return (
                      <g key={ti} className="hero-token">
                        {/* Pill background */}
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
                        {/* Icon via foreignObject */}
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
                        {/* Pill text */}
                        <text
                          x={tx + pillPadX + iconSize + pillGap}
                          y={pillY + pillH / 2}
                          dominantBaseline="central"
                          fill={textColor}
                          fontFamily='var(--font-mono), monospace'
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
                      <g key={ti} className="hero-token">
                        <rect
                          x={tx}
                          y={ipY}   
                          width={token.width + ipPad }
                          height={token.width + ipPad }
                          rx={token.width * 0.2}
                          ry={token.width * 0.2}
                          fill={`${token.color}1F`}
                          stroke={`${token.color}55`}
                          strokeWidth={1.2}
                          style={{ backdropFilter: 'blur(1.2px)' }}
                          
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
                          fontFamily='var(--font-mono), monospace'
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
                      className="hero-token"
                      x={tx}
                      y={baseY + fontSize}
                      fill="var(--color-text)"
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
      ) : (
        <h1 className="text-white invisible">{plainText}</h1>
      )}
    </div>
  )
}

// ── Re-export icons for use in Hero.tsx ────────────────────────
export { krFlag, brainIcon, shipIcon, oilDrumIcon, boltIcon }
