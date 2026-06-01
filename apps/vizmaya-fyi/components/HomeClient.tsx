'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import VizmayaLogo from '@/components/VizmayaLogo'
import AuraBackground from '@/components/AuraBackground'
import type { Theme } from '@vismay/viz-engine'

export interface HomeStory {
  slug: string
  title: string
  subtitle: string
  date: string
  byline: string
  aura?: string
  theme?: Theme
  /** Optional editorial topic — drives the card pill and rail filter chips. */
  topic?: string
  /** Optional cover image URL shown as the card thumbnail background. */
  thumbnail?: string
  /** Optional text colour for the card when a thumbnail is shown — overrides
   *  `--bn-text` so the title/READ stay legible over the cover image. */
  thumbnailTextColor?: string
}

export interface HomeEpic {
  slug: string
  name: string
  description: string | null
  /** Per-epic theme override (loose jsonb; may be `{}`). */
  theme?: Record<string, unknown>
}


/* The studio voice — static brand copy shown in the sticky rail. */
const STUDIO = {
  kicker: 'Vizmaya Labs',
  statement: 'We turn complex data into stories impossible to ignore.',
  deck: 'A two-person data-journalism studio. The map does the argument, the prose does the meaning — and we refuse to let the distance between what is true and what is understood be someone else’s problem.',
}

/* Each story card renders in its own theme — a dark base with an accent glow,
   and the theme's own typefaces. */
interface CardTheme {
  bg: string
  text: string
  muted: string
  accent: string
  serif?: string
  sans?: string
  mono?: string
}

function withFallback(name: string | undefined, kind: 'serif' | 'sans' | 'mono'): string | undefined {
  if (!name) return undefined
  if (kind === 'serif') return `${name}, Georgia, serif`
  if (kind === 'sans') return `${name}, -apple-system, 'Segoe UI', Helvetica, sans-serif`
  return `${name}, 'Courier New', monospace`
}

/* Stories carry a full viz-engine Theme (colors + fonts). */
function storyCardTheme(theme: Theme): CardTheme {
  return {
    bg: theme.colors.background,
    text: theme.colors.text,
    muted: theme.colors.muted,
    accent: theme.colors.accent,
    serif: withFallback(theme.fonts.serif, 'serif'),
    sans: withFallback(theme.fonts.sans, 'sans'),
    mono: withFallback(theme.fonts.mono, 'mono'),
  }
}

/* Brand tricolor, cycled across epics whose theme has no accent of its own. */
const EPIC_ACCENTS = ['#0BBFAB', '#E84D7A', '#2B4ACF']

/* Epic themes are a loose, often-sparse jsonb (`ink`/`surface`/`accent`/
   `bone`/`fonts`); fall back to the brand tricolor + a dark base when absent.
   Epstein's theme uses `ember` (not `accent`) as its primary accent key, so
   we check that too before reaching for the EPIC_ACCENTS fallback. */
function epicCardTheme(raw: Record<string, unknown> | undefined, index: number): CardTheme {
  const t = (raw ?? {}) as {
    ink?: string
    surface?: string
    bone?: string
    muted?: string
    accent?: string
    ember?: string  // Epstein primary accent
    fonts?: { serif?: string; sans?: string; mono?: string }
  }
  const fonts = t.fonts ?? {}
  return {
    bg: t.ink || t.surface || '#0C0C10',
    text: t.bone || '#FFFFFF',
    muted: t.muted || 'rgba(255,255,255,.7)',
    accent: t.accent || t.ember || EPIC_ACCENTS[index % EPIC_ACCENTS.length],
    serif: withFallback(fonts.serif, 'serif'),
    sans: withFallback(fonts.sans, 'sans'),
    mono: withFallback(fonts.mono, 'mono'),
  }
}

/* Inline CSS custom properties + dark gradient base for a themed card. */
function cardThemeStyle(ct: CardTheme, textColor?: string): CSSProperties {
  const text = textColor ?? ct.text
  return {
    ['--bn-bg']: ct.bg,
    ['--bn-text']: text,
    ['--bn-muted']: ct.muted,
    ['--bn-accent']: ct.accent,
    ...(ct.serif ? { ['--bn-serif']: ct.serif } : {}),
    ...(ct.sans ? { ['--bn-sans']: ct.sans } : {}),
    ...(ct.mono ? { ['--bn-mono']: ct.mono } : {}),
    background: ct.bg,
    backgroundImage:
      `radial-gradient(120% 90% at 85% 8%, ${ct.accent}55 0%, ${ct.accent}14 34%, transparent 62%),` +
      `radial-gradient(90% 80% at 8% 100%, ${ct.accent}30 0%, transparent 55%)`,
    color: text,
  } as CSSProperties
}

const css = `
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
.vz{
  --ink:#0C0C10;--cream:#F4F1EC;--muted:#4A4742;--soft:#2A2824;
  --line:rgba(12,12,16,.08);--line2:rgba(12,12,16,.14);
  --teal:#0BBFAB;--pink:#E84D7A;--blue:#2B4ACF;--accent:#0BBFAB;
  --d:'Fraunces',Georgia,serif;--e:'Fraunces',Georgia,serif;
  --b:'Libre Franklin',-apple-system,sans-serif;--m:'JetBrains Mono',ui-monospace,monospace;
  --gap:16px;
  background:var(--cream);color:var(--ink);font-family:var(--b);-webkit-font-smoothing:antialiased;
  min-height:100vh;
}
.vz ::selection{background:var(--teal);color:var(--ink)}
.vz a{text-decoration:none;color:inherit;transition:opacity .3s,color .3s,background .3s,border-color .3s,transform .35s cubic-bezier(.22,1,.36,1),box-shadow .35s}
.vz button{cursor:pointer;font-family:inherit}
.vz em{font-style:italic}

/* reveal — content always ends visible; gentle entrance for lower editorial */
.vz .rv{opacity:0;transform:translateY(16px);transition:opacity .7s cubic-bezier(.22,1,.36,1),transform .7s cubic-bezier(.22,1,.36,1)}
.vz .rv.v{opacity:1;transform:translateY(0)}
.vz .rv[data-d="1"]{transition-delay:.08s}.vz .rv[data-d="2"]{transition-delay:.16s}.vz .rv[data-d="3"]{transition-delay:.24s}

/* kicker */
.vz .kick{font-family:var(--m);font-size:10.5px;letter-spacing:2.6px;text-transform:uppercase;color:var(--accent);display:inline-flex;align-items:center;gap:10px;font-weight:500}
.vz .kick::before{content:'';width:18px;height:1px;background:currentColor;display:inline-block}
.vz .kick.teal{color:var(--teal)}
.vz .kick.pink{color:var(--pink)}

/* ── NAV ─────────────────────────────────────────── */
.vz .vznav{position:fixed;top:0;left:0;right:0;z-index:300;display:flex;justify-content:space-between;align-items:center;padding:14px clamp(20px,4vw,48px);background:transparent;border-bottom:1px solid transparent;transition:background .4s,border-color .4s,backdrop-filter .4s}
.vz .vznav.scrolled{background:rgba(244,241,236,.9);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.vz .vznav-logo{display:flex;align-items:center;background:none;border:none;padding:0;cursor:pointer}
.vz .vznav-r{display:flex;gap:26px;align-items:center}
.vz .vznav-link{font-family:var(--m);font-size:10px;letter-spacing:1.6px;text-transform:uppercase;color:rgba(12,12,16,.45);cursor:pointer}
.vz .vznav-link:hover{color:var(--ink);opacity:1}
.vz .vznav-cta{font-family:var(--m);font-size:9.5px;letter-spacing:1.8px;text-transform:uppercase;color:var(--cream);background:var(--ink);padding:9px 17px;border-radius:3px;font-weight:500}
.vz .vznav-cta:hover{opacity:.9}

/* ── RAIL + CAROUSEL REGION ──────────────────────── */
.vz .region{padding:96px clamp(20px,5vw,56px) 40px;max-width:1240px;margin:0 auto}
.vz .idx-region{max-width:1240px;padding-top:104px}
.vz .idx-wrap{display:grid;grid-template-columns:340px 1fr;gap:clamp(32px,5vw,72px);align-items:start}
.vz .idx-rail{position:sticky;top:92px}
.vz .idx-h1{font-family:var(--d);font-weight:600;font-size:clamp(30px,3.4vw,46px);line-height:1.04;letter-spacing:-.02em;margin:18px 0 18px;text-wrap:balance}
.vz .idx-deck{font-family:var(--b);font-size:13.5px;line-height:1.7;color:var(--muted);max-width:34ch}
.vz .idx-stats{display:flex;gap:26px;margin:26px 0 28px}
.vz .idx-stat b{font-family:var(--d);font-weight:600;font-size:24px;display:block}
.vz .idx-stat span{font-family:var(--m);font-size:8.5px;letter-spacing:1.1px;text-transform:uppercase;color:var(--muted)}
.vz .idx-filter{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:24px}
.vz .idx-chip{font-family:var(--m);font-size:9.5px;letter-spacing:1.3px;text-transform:uppercase;color:var(--muted);background:transparent;border:1px solid var(--line2);border-radius:999px;padding:6px 13px;transition:all .25s}
.vz .idx-chip:hover{border-color:var(--ink);color:var(--ink)}
.vz .idx-chip.on{background:var(--ink);color:var(--cream);border-color:var(--ink)}
.vz .idx-about{font-family:var(--m);font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:var(--accent)}
.vz .idx-about:hover{opacity:1;text-decoration:underline;text-underline-offset:4px}

/* carousel of bento pages */
.vz .carousel{display:flex;flex-direction:column;gap:18px;height:clamp(460px,calc(100vh - 200px),700px)}
.vz .carousel-vp{flex:1;overflow:hidden;min-height:0}
.vz .carousel-track{display:flex;height:100%;transition:transform .55s cubic-bezier(.22,1,.36,1)}
.vz .carousel-slide{flex:0 0 auto;height:100%}
.vz .bento-slide{height:100%;display:grid;grid-template-columns:repeat(6,1fr);grid-template-rows:1.08fr 1fr;gap:var(--gap)}
.vz .bento-slide .bcard.big{grid-column:span 3}
.vz .bento-slide .bcard.sm{grid-column:span 2}

/* bento card — every card is themed: a dark base + accent glow (set inline
   from the story/epic theme), rendered in that theme's own typefaces.
   The --bn-* custom properties are supplied per card; site fonts/ink are the
   fallback so an un-themed card still renders. */
.vz .bcard{position:relative;display:flex;flex-direction:column;justify-content:space-between;background:#fff;border:1px solid var(--line);border-radius:6px;overflow:hidden;isolation:isolate;min-height:0}
.vz .bcard.big{padding:22px 24px}
.vz .bcard.sm{padding:15px 17px}
.vz .bcard > *{position:relative;z-index:1}
.vz .bcard:hover{transform:translateY(-3px);box-shadow:0 18px 42px -20px rgba(0,0,0,.55);opacity:1}
.vz .bcard.themed{border-color:color-mix(in srgb,var(--bn-text,#fff) 12%,transparent)}
.vz .bcard-rule{position:absolute;top:0;left:0;right:0;height:3px;background:var(--bn-accent,var(--accent));z-index:3}
.vz .bcard-k{display:flex;align-items:center;gap:9px;font-family:var(--bn-mono,var(--m));font-size:10px;letter-spacing:1.3px;text-transform:uppercase;color:color-mix(in srgb,var(--bn-text,var(--muted)) 65%,transparent);margin-bottom:10px}
.vz .bcard.epic .bcard-k{display:block;white-space:nowrap;margin-top:3px;color:var(--bn-accent,var(--accent))}
.vz .bcard-n{color:var(--bn-accent,var(--accent));font-weight:600}
.vz .bcard-topic{padding:2px 7px;border:1px solid color-mix(in srgb,var(--bn-text,#000) 25%,transparent);border-radius:999px;font-size:8.5px;letter-spacing:1.1px}
.vz .bcard-date{margin-left:auto;opacity:.7}
.vz .bcard-h{font-family:var(--bn-serif,var(--e));font-style:italic;font-weight:400;color:var(--bn-text,var(--ink));line-height:1.14;text-wrap:pretty;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical}
.vz .bcard.big .bcard-h{font-size:26px;-webkit-line-clamp:3;margin-bottom:8px}
.vz .bcard.sm .bcard-h{font-size:19px;-webkit-line-clamp:3}
.vz .bcard-p{font-family:var(--bn-sans,var(--b));font-size:13px;line-height:1.55;color:color-mix(in srgb,var(--bn-text,var(--muted)) 80%,transparent);text-wrap:pretty;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.vz .bcard-a{margin-top:12px;font-family:var(--bn-mono,var(--m));font-size:10px;letter-spacing:1.3px;text-transform:uppercase;color:var(--bn-accent,var(--accent));opacity:.65}
.vz .bcard:hover .bcard-a{opacity:1}
.vz .bcard-foot{display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-family:var(--bn-mono,var(--m));font-size:9.5px;letter-spacing:1.2px;text-transform:uppercase}
.vz .bcard-meta{color:color-mix(in srgb,var(--bn-text,var(--muted)) 70%,transparent)}
.vz .bcard.epic .bcard-a{font-weight:600;opacity:1}

/* live aura layered over the themed base for the stories that have one */
.vz .bcard .bn-aura{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden;border-radius:inherit}
.vz .bcard .bn-aura iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block;background:transparent}
.vz .bcard .bn-aura::after{content:'';position:absolute;inset:0;background:linear-gradient(to bottom,color-mix(in srgb,var(--bn-bg,#000) 50%,transparent) 0%,transparent 38%),linear-gradient(to top,color-mix(in srgb,var(--bn-bg,#000) 72%,transparent) 0%,color-mix(in srgb,var(--bn-bg,#000) 24%,transparent) 55%,transparent 100%)}

/* static cover image when no aura is set — shown at full strength with no card
   overlay; the story's own thumbnail carries the look (and text legibility). */
.vz .bcard .bn-thumb{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden;border-radius:inherit}
.vz .bcard .bn-thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}

/* carousel controls */
.vz .carousel-ctrl{display:flex;justify-content:space-between;align-items:center;gap:16px}
.vz .carousel-dots{display:flex;gap:7px}
.vz .cdot{width:7px;height:7px;border-radius:999px;border:none;background:rgba(12,12,16,.18);padding:0;transition:all .3s}
.vz .cdot.on{background:var(--accent);transform:scale(1.25)}
.vz .carousel-nav{display:flex;align-items:center;gap:14px}
.vz .carousel-all{font-family:var(--m);font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--line2);padding-bottom:2px}
.vz .carousel-all:hover{color:var(--accent);border-color:var(--accent);opacity:1}
.vz .carr{width:34px;height:34px;border-radius:999px;border:1px solid var(--line2);background:transparent;font-size:16px;line-height:1;color:var(--ink);display:flex;align-items:center;justify-content:center;transition:all .25s}
.vz .carr:hover:not(:disabled){background:var(--ink);color:var(--cream);border-color:var(--ink)}
.vz .carr:disabled{opacity:.3;cursor:default}
.vz .carousel-count{font-family:var(--m);font-size:11px;letter-spacing:1px;color:var(--muted);min-width:56px;text-align:center}
.vz .carousel-count i{font-style:normal;opacity:.5;margin:0 2px}

/* ── EPICS ROW (below the header) ────────────────── */
.vz .epics-section{max-width:1240px;margin:0 auto;padding:20px clamp(20px,5vw,56px) 64px;border-top:1px solid var(--line)}
.vz .region-head{display:flex;justify-content:space-between;align-items:baseline;gap:20px;margin:64px 0 26px;flex-wrap:wrap}
.vz .region-sub{font-family:var(--e);font-style:italic;font-size:19px;color:var(--muted)}
.vz .epics-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(248px,1fr));gap:var(--gap)}
.vz .epics-row .bcard{min-height:212px}

/* ── STORY EMBED — sticky scroll-sync ────────────── */
.vz .story-embed{border-top:1px solid var(--line)}
.vz .story-embed-sticky{position:sticky;top:0;height:100svh;display:flex;flex-direction:column;justify-content:center;padding:clamp(20px,4vh,48px) clamp(20px,5vw,56px)}
.vz .story-embed-inner{max-width:1240px;margin:0 auto;width:100%}
.vz .story-embed-head{margin-bottom:24px}
.vz .story-embed-frame{border-radius:10px;overflow:hidden;box-shadow:0 32px 80px -20px rgba(12,12,16,.22),0 0 0 1px var(--line2)}
.vz .story-embed-bar{height:38px;background:var(--soft);display:flex;align-items:center;padding:0 14px;gap:7px;border-bottom:1px solid rgba(12,12,16,.12);flex-shrink:0}
.vz .story-embed-dot{width:10px;height:10px;border-radius:999px}
.vz .story-embed-dot:nth-child(1){background:#ff5f57}
.vz .story-embed-dot:nth-child(2){background:#febc2e}
.vz .story-embed-dot:nth-child(3){background:#28c840}
.vz .story-embed-url{flex:1;margin:0 12px;height:22px;background:rgba(12,12,16,.12);border-radius:4px;display:flex;align-items:center;justify-content:center;font-family:var(--m);font-size:9px;letter-spacing:.5px;color:rgba(12,12,16,.35);overflow:hidden;white-space:nowrap}
.vz .story-embed-iframe-wrap{position:relative}
.vz .story-embed-iframe-wrap iframe{display:block;width:100%;height:clamp(400px,72vh,820px);border:0}
/* Transparent overlay so wheel events bubble to the page scroller rather than
   being captured by the iframe. Sits above the iframe, z-index keeps it on top. */
.vz .story-embed-scroll-cap{position:absolute;inset:0;z-index:1}

/* ── CONTACT ─────────────────────────────────────── */
.vz .contact{padding:130px clamp(20px,5vw,56px);background:var(--ink);color:var(--cream);text-align:center;border-top:3px solid var(--teal)}
.vz .contact .kick{justify-content:center}
.vz .contact-h{font-family:var(--e);font-style:italic;font-weight:400;font-size:clamp(30px,4.4vw,52px);line-height:1.12;color:var(--cream);max-width:18ch;margin:22px auto 24px}
.vz .contact-p{font-family:var(--b);font-size:14px;line-height:1.85;color:rgba(244,241,236,.62);max-width:52ch;margin:0 auto 38px}
.vz .contact-row{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
.vz .cbtn{font-family:var(--m);font-size:11px;letter-spacing:1.6px;text-transform:uppercase;padding:15px 28px;border-radius:3px;border:1px solid transparent}
.vz .cbtn.teal{background:var(--teal);color:var(--ink)}
.vz .cbtn.ghost{background:transparent;color:var(--cream);border-color:rgba(244,241,236,.3)}
.vz .cbtn.ghost:hover{border-color:var(--cream);opacity:1}

/* ── FOOTER ──────────────────────────────────────── */
.vz .vzfoot{background:var(--ink);padding:28px clamp(20px,5vw,56px);border-top:1px solid rgba(255,255,255,.06);display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap}
.vz .vzfoot-l{display:flex;align-items:center;gap:12px}
.vz .vzfoot-mark{font-family:var(--e);font-style:italic;font-size:16px;color:rgba(244,241,236,.6)}
.vz .vzfoot-loc{font-family:var(--m);font-size:9px;letter-spacing:1px;text-transform:uppercase;color:rgba(244,241,236,.28);max-width:38ch}
.vz .vzfoot-links{display:flex;gap:22px}
.vz .vzfoot-links a{font-family:var(--m);font-size:9.5px;letter-spacing:1.6px;text-transform:uppercase;color:rgba(244,241,236,.4)}
.vz .vzfoot-links a:hover{color:var(--teal);opacity:1}

/* ── RESPONSIVE ──────────────────────────────────── */
@media(max-width:980px){
  .vz .idx-wrap{grid-template-columns:1fr;gap:32px}
  .vz .idx-rail{position:static}
}
@media(max-width:820px){
  /* The carousel can't page horizontally on a phone — unroll it into a single
     vertical feed. Override the inline track width/transform (hence !important),
     stack the slides, and drop each bento page to one column. */
  .vz .carousel{height:auto;gap:0}
  .vz .carousel-vp{overflow:visible}
  .vz .carousel-track{width:100%!important;transform:none!important;flex-direction:column;gap:var(--gap)}
  .vz .carousel-slide{width:100%!important;height:auto}
  .vz .bento-slide{grid-template-columns:1fr;grid-template-rows:none;grid-auto-rows:minmax(150px,auto)}
  .vz .bento-slide .bcard.big,.vz .bento-slide .bcard.sm{grid-column:span 1}
  /* paging controls are meaningless once unrolled — keep only the archive link */
  .vz .carousel-dots,.vz .carr,.vz .carousel-count{display:none}
  .vz .carousel-ctrl{justify-content:flex-end;margin-top:18px}
  .vz .vznav-link{display:none}
}
@media(max-width:520px){
  .vz .bcard.big .bcard-h{font-size:23px}
  .vz .region{padding-top:88px}
}
`

/* ── Penrose mark (the studio's three-mysteries logo) ───────── */
function PenroseMark({ size = 20, dark = false }: { size?: number; dark?: boolean }) {
  const line = dark ? 'rgba(255,255,255,.22)' : 'rgba(12,12,16,.18)'
  return (
    <svg width={size} height={size} viewBox="0 0 150 150" aria-hidden style={{ display: 'block' }}>
      <line x1="75" y1="28" x2="28" y2="122" stroke={line} strokeWidth="1" />
      <line x1="75" y1="28" x2="122" y2="122" stroke={line} strokeWidth="1" />
      <line x1="28" y1="122" x2="122" y2="122" stroke={line} strokeWidth="1" />
      <circle cx="75" cy="28" r="15" fill="#0BBFAB" />
      <circle cx="28" cy="122" r="15" fill="#E84D7A" />
      <circle cx="122" cy="122" r="15" fill="#2B4ACF" />
    </svg>
  )
}

const fmtMonth = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

const DEFAULT_CARD_THEME: CardTheme = {
  bg: '#0C0C10',
  text: '#FFFFFF',
  muted: 'rgba(255,255,255,.7)',
  accent: '#0BBFAB',
}

/* A carousel item is a story plus its index in the full list. */
type CarouselItem = { data: HomeStory; n: number }

function StoryCard({ item, big }: { item: CarouselItem; big: boolean }) {
  const s = item.data
  const ct = s.theme ? storyCardTheme(s.theme) : DEFAULT_CARD_THEME
  const hasAura = Boolean(s.aura)
  const hasThumb = !hasAura && Boolean(s.thumbnail)
  // A cover thumbnail carries its own look; an optional per-story text colour
  // keeps the card's title/READ legible over it without recolouring the body.
  const textColor = hasThumb ? s.thumbnailTextColor : undefined
  return (
    <Link
      className={`bcard story themed ${big ? 'big' : 'sm'}`}
      href={`/story/${s.slug}`}
      style={cardThemeStyle(ct, textColor)}
    >
      {hasAura && s.aura && <AuraBackground slug={s.aura} />}
      {hasThumb && s.thumbnail && (
        <div className="bn-thumb" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.thumbnail} alt="" loading="lazy" />
        </div>
      )}
      <div className="bcard-top">
        <div className="bcard-k">
          <span className="bcard-n">{String(item.n + 1).padStart(2, '0')}</span>
          {s.topic && <span className="bcard-topic">{s.topic}</span>}
          <span className="bcard-date">{fmtMonth(s.date)}</span>
        </div>
        <h3 className="bcard-h">{s.title}</h3>
        {big && <p className="bcard-p">{s.subtitle}</p>}
      </div>
      <div className="bcard-a">Read →</div>
    </Link>
  )
}

/* The running epics, as a themed row just below the header. */
function EpicsSection({ epics }: { epics: HomeEpic[] }) {
  if (!epics.length) return null
  return (
    <section id="epics" className="epics-section">
      <div className="region-head">
        <div className="kick pink">Epics</div>
        <span className="region-sub">Investigations we keep returning to</span>
      </div>
      <div className="epics-row">
        {epics.map((e, i) => (
          <Link
            key={e.slug}
            className="bcard epic themed big"
            href={`/${e.slug}`}
            style={cardThemeStyle(epicCardTheme(e.theme, i))}
          >
            <div className="bcard-rule" />
            <div className="bcard-top">
              <div className="bcard-k">Epic · {String(i + 1).padStart(2, '0')}</div>
              <h3 className="bcard-h">{e.name}</h3>
              {e.description && <p className="bcard-p">{e.description}</p>}
            </div>
            <div className="bcard-foot">
              <span className="bcard-meta">Collection</span>
              <span className="bcard-a">Enter →</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default function HomeClient({
  stories,
  epics = [],
  fontUrls = [],
}: {
  stories: HomeStory[]
  epics?: HomeEpic[]
  fontUrls?: string[]
}) {
  const [filter, setFilter] = useState('All')
  const [page, setPage] = useState(0)

  const embedWrapperRef = useRef<HTMLElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const sectionCountRef = useRef(10) // updated when story posts viz-story-ready

  // Topic chips are derived from whatever topics the stories actually carry —
  // empty until stories are tagged, at which point they light up automatically.
  const topics = useMemo(
    () => Array.from(new Set(stories.map((s) => s.topic).filter((t): t is string => Boolean(t)))),
    [stories]
  )
  const chips = useMemo(() => ['All', ...topics], [topics])

  const visibleStories = useMemo(() => {
    if (filter === 'All') return stories
    return stories.filter((s) => s.topic === filter)
  }, [filter, stories])

  // The carousel is stories-only; chunk into bento pages of 5 — the first two
  // render big (top row), the next three small.
  const items: CarouselItem[] = useMemo(
    () => visibleStories.map((s) => ({ data: s, n: stories.indexOf(s) })),
    [visibleStories, stories]
  )

  const slides = useMemo(() => {
    const out: CarouselItem[][] = []
    for (let i = 0; i < items.length; i += 5) out.push(items.slice(i, i + 5))
    if (!out.length) out.push([])
    return out
  }, [items])

  const total = slides.length

  // Reset to the first page whenever the filter repaginates the carousel —
  // adjusted during render (not in an effect) per React's guidance.
  const [pageFilter, setPageFilter] = useState(filter)
  if (pageFilter !== filter) {
    setPageFilter(filter)
    setPage(0)
  }
  const cur = Math.min(page, total - 1)

  // Nav background on scroll + gentle reveal for the lower editorial sections.
  useEffect(() => {
    const nav = document.getElementById('vznav')
    const onScroll = () => nav?.classList.toggle('scrolled', window.scrollY > 50)
    window.addEventListener('scroll', onScroll)
    const obs = new IntersectionObserver(
      (es) => es.forEach((e) => { if (e.isIntersecting) e.target.classList.add('v') }),
      { threshold: 0, rootMargin: '0px 0px -64px 0px' }
    )
    document.querySelectorAll('.rv').forEach((el) => obs.observe(el))

    // Story posts its section count once mounted so we can size the wrapper.
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== 'viz-story-ready') return
      const n = Number(e.data.sectionCount)
      if (n > 0) {
        sectionCountRef.current = n
        const wrapper = embedWrapperRef.current
        if (wrapper) wrapper.style.setProperty('--embed-sections', String(n))
      }
    }
    window.addEventListener('message', onMessage)

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('message', onMessage)
      obs.disconnect()
    }
  }, [])

  // Continuous scroll-sync (`viz-story-progress`).
  // The page is the only scroller. As it scrolls through the tall wrapper the
  // sticky frame stays pinned, and we mirror the page's progress through the
  // pinned range (a 0..1 fraction) into the iframe, which maps it onto the
  // story's own scroll range. Because it's plain native page scroll, wheel and
  // touch behave identically — no hijacking, no locks, no per-device code — and
  // the page owns its own boundaries: scrolling up continues up the page,
  // scrolling past the wrapper releases the sticky into the contact section.
  useEffect(() => {
    let raf = 0
    let snapTimer: ReturnType<typeof setTimeout> | undefined
    let snapping = false // true while our own snap scroll is animating

    // Geometry of the pinned range: how far the page scrolls while the frame
    // stays pinned (wrapper height minus one viewport). null when not pinnable.
    const pinnedRange = () => {
      const wrapper = embedWrapperRef.current
      if (!wrapper) return null
      const { top, height } = wrapper.getBoundingClientRect()
      const pinned = height - window.innerHeight
      if (pinned <= 0) return null
      return { top, pinned }
    }

    const compute = () => {
      raf = 0
      const r = pinnedRange()
      if (!r) return
      // Skip while the wrapper is entirely off-screen — no point streaming
      // progress the reader can't see.
      if (r.top > window.innerHeight || -r.top > r.pinned + window.innerHeight) return
      const fraction = Math.max(0, Math.min(1, -r.top / r.pinned))
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'viz-story-progress', value: fraction },
        '*'
      )
    }

    // After scrolling settles, rest on the nearest section. We nudge the PAGE
    // (the single source of truth) and let the progress mirror above carry the
    // story smoothly into place — no separate seek message, nothing to fight.
    const snapToNearest = () => {
      const r = pinnedRange()
      if (!r) return
      const count = sectionCountRef.current
      if (count < 2) return
      // Only snap while genuinely inside the pinned range — never yank the
      // reader back when they've scrolled above or below the embed.
      if (r.top > 0 || -r.top >= r.pinned) return
      const fraction = -r.top / r.pinned
      const idx = Math.round(fraction * (count - 1))
      const wrapperTop = r.top + window.scrollY
      const target = wrapperTop + (idx / (count - 1)) * r.pinned
      if (Math.abs(target - window.scrollY) > 1) {
        snapping = true
        window.scrollTo({ top: target, behavior: 'smooth' })
        setTimeout(() => { snapping = false }, 600)
      }
    }

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(compute)
      if (snapping) return // ignore the scroll events our own snap produces
      if (snapTimer) clearTimeout(snapTimer)
      snapTimer = setTimeout(snapToNearest, 140)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    compute() // sync once in case we mount already scrolled into the wrapper
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
      if (snapTimer) clearTimeout(snapTimer)
    }
  }, [])

  const go = (d: number) => setPage((p) => Math.min(total - 1, Math.max(0, p + d)))
  const archiveLabel = `All ${stories.length} →`

  return (
    <div className="vz">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..900;1,9..144,400..700&family=Libre+Franklin:ital,wght@0,300..800;1,400&family=JetBrains+Mono:wght@400;500;600&display=swap"
        rel="stylesheet"
      />
      {/* per-card theme typefaces (each story/epic renders in its own fonts) */}
      {fontUrls.map((u) => (
        <link key={u} href={u} rel="stylesheet" />
      ))}
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <nav className="vznav" id="vznav">
        <button
          className="vznav-logo"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Vizmaya Labs"
        >
          <VizmayaLogo
            className="w-[170px] h-[42px]"
            palette={{
              text: '#111111',
              teal: '#0BBFAB',
              accent: '#E84D7A',
              accent2: '#2B4ACF',
              surface: '#FFFFFF',
              muted: '#1D1D1D',
              line: '#111111',
            }}
          />
        </button>
        <div className="vznav-r">
          <a className="vznav-link" href="#work">Work</a>
          <a className="vznav-link" href="#epics">Epics</a>
          <Link className="vznav-link" href="/stories">Archive</Link>
          <a className="vznav-link" href="#contact">Contact</a>
          <a className="vznav-cta" href="https://www.youtube.com/@Vizmayaa" target="_blank" rel="noreferrer">Subscribe</a>
        </div>
      </nav>

      {/* WORK — sticky studio rail + carousel of bento pages */}
      <section id="work" className="region idx-region grid-region">
        <div className="idx-wrap">
          <aside className="idx-rail">
            <div className="kick">{STUDIO.kicker}</div>
            <h1 className="idx-h1">{STUDIO.statement}</h1>
            <p className="idx-deck">{STUDIO.deck}</p>
            <div className="idx-stats">
              <div className="idx-stat"><b>{stories.length}</b><span>stories published</span></div>
              <div className="idx-stat"><b>{epics.length}</b><span>running epics</span></div>
              <div className="idx-stat"><b>2</b><span>people</span></div>
            </div>
            <div className="idx-filter">
              {chips.map((c) => (
                <button key={c} className={'idx-chip' + (filter === c ? ' on' : '')} onClick={() => setFilter(c)}>{c}</button>
              ))}
            </div>
            <a className="idx-about" href="#contact">More about the studio →</a>
          </aside>

          <div className="carousel">
            <div className="carousel-vp">
              <div
                className="carousel-track"
                style={{ width: `${total * 100}%`, transform: `translateX(-${cur * (100 / total)}%)` }}
              >
                {slides.map((sl, si) => (
                  <div className="carousel-slide" key={si} style={{ width: `${100 / total}%` }}>
                    <div className="bento-slide">
                      {sl.map((it, idx) => (
                        <StoryCard key={it.data.slug} item={it} big={idx < 2} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="carousel-ctrl">
              <div className="carousel-dots">
                {slides.map((_, si) => (
                  <button
                    key={si}
                    className={'cdot' + (si === cur ? ' on' : '')}
                    onClick={() => setPage(si)}
                    aria-label={`Page ${si + 1}`}
                  />
                ))}
              </div>
              <div className="carousel-nav">
                <Link className="carousel-all" href="/stories">{archiveLabel}</Link>
                <button className="carr" onClick={() => go(-1)} disabled={cur === 0} aria-label="Previous">‹</button>
                <span className="carousel-count">{String(cur + 1).padStart(2, '0')} <i>/</i> {String(total).padStart(2, '0')}</span>
                <button className="carr" onClick={() => go(1)} disabled={cur === total - 1} aria-label="Next">›</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* EPICS — running collections, as a row below the header */}
      <EpicsSection epics={epics} />

      {/* STUDIO STORY EMBED — tall wrapper drives page scroll; frame is sticky */}
      <section
        ref={embedWrapperRef}
        className="story-embed"
        style={{ height: `calc(var(--embed-sections, 6) * 100svh)` }}
      >
        <div className="story-embed-sticky">
          <div className="story-embed-inner">
            <div className="story-embed-head">
              <div className="kick">The Studio</div>
            </div>
            <div className="story-embed-frame">
              <div className="story-embed-bar">
                <span className="story-embed-dot" />
                <span className="story-embed-dot" />
                <span className="story-embed-dot" />
                <span className="story-embed-url">vizmaya.fyi/story/vizmaya-studio</span>
              </div>
              <div className="story-embed-iframe-wrap">
                <iframe
                  ref={iframeRef}
                  src="/story/vizmaya-studio?embed=1"
                  title="Vizmaya Studio"
                  loading="lazy"
                />
                {/* Transparent overlay so wheel/touch land on the page (not the
                    iframe's own scroller); native page scroll then drives the story. */}
                <div className="story-embed-scroll-cap" aria-hidden />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section className="contact" id="contact">
        <div className="kick teal rv">Work with us</div>
        <h2 className="contact-h rv" data-d="1">Have data that deserves a better story?</h2>
        <p className="contact-p rv" data-d="2">
          We work with B2B data companies, research institutions, and think tanks who have findings worth
          publishing but need the storytelling and design layer to make them travel. A typical engagement
          starts with a data brief and an editorial call. Turnaround is two to four weeks.
        </p>
        <div className="contact-row rv" data-d="3">
          <a className="cbtn teal" href="mailto:vizmaya@promad.design">Get in touch&nbsp;&nbsp;→</a>
          <a className="cbtn ghost" href="https://theasymmetryletter.substack.com" target="_blank" rel="noreferrer">Read The Asymmetry Letter</a>
        </div>
      </section>

      <footer className="vzfoot">
        <div className="vzfoot-l">
          <PenroseMark size={20} dark />
          <span className="vzfoot-mark">Vizmaya Labs</span>
          <span className="vzfoot-loc">Sits at the border between what is true and what is understood</span>
        </div>
        <div className="vzfoot-links">
          <a href="https://www.youtube.com/@Vizmayaa" target="_blank" rel="noreferrer">YouTube</a>
          <a href="https://www.linkedin.com/company/vizmaya/" target="_blank" rel="noreferrer">LinkedIn</a>
          <a href="https://x.com/VizmayaFyi" target="_blank" rel="noreferrer">X</a>
        </div>
      </footer>
    </div>
  )
}
