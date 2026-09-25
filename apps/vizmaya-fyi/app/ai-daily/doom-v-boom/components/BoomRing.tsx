'use client'

import { useEffect, useRef, useState } from 'react'
import { RING, boomShare, placeParticle, ringParticles, ringView, type RingParticle, type RingPoint } from './particleRing'

type Rgb = readonly [number, number, number]

/** Particles per CSS px of ring width: about 560 at 320px, 300 at 172px. */
const DENSITY = 1.75
/** Seconds for the particles to take their colour after the page loads. */
const INTRO_S = 1.6
const TAU = Math.PI * 2

/**
 * The Boom Score's ring: the beautiful-headers Particle Ring (particleRing.ts)
 * drawn on a 2D canvas, each particle one scored story's vote. The share of
 * --boom particles is the day's boom share and the rest are --doom; an
 * unscored day is a dim ring of --dim. On load the particles take their
 * colour out of the grey of the server-painted dots underneath (BoomScore),
 * which the canvas replaces once its first frame is drawn.
 *
 * It sizes itself to its parent, draws at up to 2× pixel ratio, stops while
 * the ring is off screen or the tab is hidden, draws one still frame under
 * prefers-reduced-motion, and re-reads the colour tokens when the theme
 * changes (the same observers as GeoMap).
 */
export default function BoomRing({ score, seed, className = 'boomscore-canvas' }: { score: number | null; seed: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [live, setLive] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const host = canvas?.parentElement
    const ctx = canvas?.getContext('2d')
    if (!canvas || !host || !ctx) return
    // The edition root, or any host that sets the ring tokens (the home cards).
    const root = canvas.closest('.dcd, [data-ring-palette]') ?? document.documentElement
    const probe = document.createElement('canvas').getContext('2d')
    const share = score == null ? null : boomShare(score)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    const scheme = window.matchMedia('(prefers-color-scheme: dark)')

    let still = reduce.matches
    let palette = readPalette(root, probe)
    let box = 0
    let particles: RingParticle[] = []
    let xs = new Float32Array(0)
    let ys = new Float32Array(0)
    let rs = new Float32Array(0)
    let styles: string[] = []
    let time = seed * 1.7
    let intro = still ? 1 : 0
    let last = 0
    let raf = 0
    let onScreen = true
    let shown = false
    const tilt = { x: 0, z: 0, toX: 0, toZ: 0 }
    const pt: RingPoint = { x: 0, y: 0, r: 0 }

    const styleOf = (p: RingParticle): string => {
      if (share == null) return palette.neutral.style
      const side = p.u < share ? palette.boom : palette.doom
      if (intro >= 1) return side.style
      let v = (intro - p.delay * 0.55) / 0.45
      v = v < 0 ? 0 : v > 1 ? 1 : v
      v = v * v * (3 - 2 * v)
      const n = palette.neutral.rgb
      return rgbStyle([n[0] + (side.rgb[0] - n[0]) * v, n[1] + (side.rgb[1] - n[1]) * v, n[2] + (side.rgb[2] - n[2]) * v])
    }

    const pass = (count: number, grow: number) => {
      let current = ''
      for (let i = 0; i < count; i++) {
        if (styles[i] !== current) {
          current = styles[i]
          ctx.fillStyle = current
        }
        ctx.beginPath()
        ctx.arc(xs[i], ys[i], rs[i] * grow, 0, TAU)
        ctx.fill()
      }
    }

    const paint = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const px = Math.round(box * dpr)
      if (canvas.width !== px || canvas.height !== px) {
        canvas.width = px
        canvas.height = px
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, box, box)
      const view = ringView(box, RING.tiltX + tilt.x, tilt.z)
      const count = particles.length
      for (let i = 0; i < count; i++) {
        placeParticle(particles[i], time, view, pt)
        xs[i] = pt.x
        ys[i] = pt.y
        rs[i] = pt.r
        styles[i] = styleOf(particles[i])
      }
      // A faint, wide pass first gives every particle a glow in its own colour.
      if (box >= 140) {
        ctx.globalAlpha = share == null ? 0.03 : 0.07
        pass(count, 2.8)
      }
      ctx.globalAlpha = share == null ? 0.5 : 0.85
      pass(count, 1)
      ctx.globalAlpha = 1
    }

    const frame = (now: number) => {
      raf = 0
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60
      last = now
      if (!still) {
        time += dt * RING.speed
        intro = Math.min(1, intro + dt / INTRO_S)
        tilt.x += (tilt.toX - tilt.x) * 0.08
        tilt.z += (tilt.toZ - tilt.z) * 0.08
      }
      if (box > 0) {
        paint()
        if (!shown) {
          shown = true
          setLive(true)
        }
      }
      if (!still && onScreen && !document.hidden) raf = requestAnimationFrame(frame)
    }
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame)
    }

    const resize = () => {
      const next = host.clientWidth
      if (!next || next === box) return
      box = next
      const count = Math.round(box * DENSITY)
      if (count !== particles.length) {
        particles = ringParticles(count, seed)
        xs = new Float32Array(count)
        ys = new Float32Array(count)
        rs = new Float32Array(count)
        styles = new Array<string>(count).fill('')
      }
      kick()
    }
    const onVisible = () => {
      if (document.hidden) return
      last = 0
      kick()
    }
    const onTheme = () => {
      palette = readPalette(root, probe)
      kick()
    }
    const onMotion = () => {
      still = reduce.matches
      if (still) {
        intro = 1
        tilt.x = tilt.z = tilt.toX = tilt.toZ = 0
      }
      last = 0
      kick()
    }
    const onPointer = (e: PointerEvent) => {
      if (still) return
      const b = host.getBoundingClientRect()
      if (!b.width || !b.height) return
      tilt.toX = ((e.clientY - b.top) / b.height - 0.5) * RING.pointerTilt
      tilt.toZ = -((e.clientX - b.left) / b.width - 0.5) * RING.pointerTilt
    }
    const onLeave = () => {
      tilt.toX = 0
      tilt.toZ = 0
    }

    const ro = new ResizeObserver(resize)
    ro.observe(host)
    const io = new IntersectionObserver((entries) => {
      onScreen = entries.some((en) => en.isIntersecting)
      if (onScreen) {
        last = 0
        kick()
      }
    })
    io.observe(canvas)
    const mo = new MutationObserver(onTheme)
    mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    if (root !== document.documentElement) mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    scheme.addEventListener('change', onTheme)
    reduce.addEventListener('change', onMotion)
    document.addEventListener('visibilitychange', onVisible)
    host.addEventListener('pointermove', onPointer)
    host.addEventListener('pointerleave', onLeave)
    resize()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      mo.disconnect()
      scheme.removeEventListener('change', onTheme)
      reduce.removeEventListener('change', onMotion)
      document.removeEventListener('visibilitychange', onVisible)
      host.removeEventListener('pointermove', onPointer)
      host.removeEventListener('pointerleave', onLeave)
    }
  }, [score, seed])

  return <canvas ref={canvasRef} className={live ? `${className} live` : className} aria-hidden="true" />
}

interface Swatch {
  rgb: Rgb
  style: string
}

/** The ring's three colours from the edition tokens, so theme overrides and light mode apply. */
function readPalette(root: Element, probe: CanvasRenderingContext2D | null): { doom: Swatch; boom: Swatch; neutral: Swatch } {
  const css = getComputedStyle(root)
  const read = (name: string, fallback: Rgb): Swatch => {
    const value = css.getPropertyValue(name).trim()
    let rgb: Rgb | null = null
    if (value && probe) {
      // The canvas normalises any CSS colour to #rrggbb (or rgba() with alpha).
      probe.fillStyle = '#000'
      probe.fillStyle = value
      rgb = parseRgb(String(probe.fillStyle))
    }
    const c = rgb ?? fallback
    return { rgb: c, style: rgbStyle(c) }
  }
  return {
    doom: read('--doom', [248, 113, 113]),
    boom: read('--boom', [74, 222, 128]),
    neutral: read('--dim', [95, 107, 118]),
  }
}

function parseRgb(value: string): Rgb | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return [n >> 16, (n >> 8) & 255, n & 255]
  }
  const fn = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(value)
  return fn ? [Number(fn[1]), Number(fn[2]), Number(fn[3])] : null
}

function rgbStyle(c: Rgb): string {
  return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`
}
