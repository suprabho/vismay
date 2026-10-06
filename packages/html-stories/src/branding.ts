/**
 * Site chrome for agent-authored HTML stories, wrapped around whatever the
 * agent posted: for vizmaya a header with the animated Rive logo and a footer
 * with the static logo mark; for footshorts the app's mark and navigation in
 * its dark bar. Applied when the page is served (`/s/<slug>`) and in the
 * admin preview, never to the stored HTML, so every published story picks it
 * up without a re-post and the stored HTML stays exactly what the agent wrote.
 *
 * Both bars live in declarative shadow roots, so the story's CSS (a global
 * `header {}` or `a {}` rule) can't restyle them and its scripts don't find
 * them with `document.querySelector`. The page runs in an opaque-origin
 * sandbox, so the static mark is inlined, the Rive runtime comes from a CDN
 * and the `.riv` from the site, which serves it with CORS for this.
 */

import { auraCaptureUrl, auraEmbedUrl } from '@vismay/viz-engine/src/lib/aura'
import { DEFAULT_HTML_STORY_APP, HTML_STORY_APP_META, type HtmlStoryApp } from './apps'
import { extractThemeMeta, type ThemeColors } from './meta'

/** Pinned to the version the apps' `@rive-app/canvas` resolves to. */
const RIVE_RUNTIME = 'https://cdn.jsdelivr.net/npm/@rive-app/canvas@2.37.7/rive.js'

interface BarColors {
  bg: string
  fg: string
  link: string
  line: string
}

interface Look {
  header: BarColors
  footer: BarColors
  /** Logo colours keyed by the `.riv` view-model property each one drives. */
  logo: Record<'textColor' | 'tealColor' | 'accentColor' | 'accent2Color' | 'surfaceColor' | 'mutedColor' | 'lineColor', string>
}

/**
 * Used when the page doesn't declare its palette: the home page's look
 * (apps/vizmaya-fyi/components/HomeClient.tsx), a cream nav with the logo in
 * ink, over an ink footer.
 */
const HOME_LOOK: Look = {
  header: { bg: '#F4F1EC', fg: '#0C0C10', link: 'rgba(12,12,16,.45)', line: 'rgba(12,12,16,.1)' },
  footer: { bg: '#0C0C10', fg: '#F4F1EC', link: 'rgba(244,241,236,.4)', line: 'rgba(255,255,255,.06)' },
  logo: {
    textColor: '#111111',
    tealColor: '#0BBFAB',
    accentColor: '#E84D7A',
    accent2Color: '#2B4ACF',
    surfaceColor: '#FFFFFF',
    mutedColor: '#1D1D1D',
    lineColor: '#111111',
  },
}

/**
 * The bars in the page's own palette (its `vizmaya:theme` meta tag): the
 * header on the page background, the footer on its surface, and the logo
 * tinted slot-for-slot the way the story reader tints it from a story theme.
 */
function themedLook(t: ThemeColors): Look {
  const bg = t.background!
  const surface = t.surface ?? bg
  const line = t.line ?? t.muted!
  return {
    header: { bg, fg: t.text!, link: t.muted!, line },
    footer: { bg: surface, fg: t.text!, link: t.muted!, line },
    logo: {
      textColor: t.text!,
      tealColor: t.teal!,
      accentColor: t.accent!,
      accent2Color: t.accent2!,
      surfaceColor: surface,
      mutedColor: t.muted!,
      lineColor: line,
    },
  }
}

/**
 * public/vizmaya-logo-01.svg inlined (and recoloured to the look) rather
 * than linked: the page's opaque origin sends no cookies, so on a protected
 * Vercel preview an <img> pointing at the site gets a 401 and shows broken.
 */
const logoMark = (logo: Look['logo']) => `<svg viewBox="0 0 1080 1080" aria-hidden="true"><defs><radialGradient id="g1" cx="489.08" cy="736.38" fx="489.08" fy="736.38" r="340.35" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#f3f3f3" stop-opacity="0"/></radialGradient><radialGradient id="g2" cx="770.86" cy="454.6" fx="770.86" fy="454.6" r="376.42" href="#g1"/><radialGradient id="g3" cx="388.07" cy="341.62" fx="388.07" fy="341.62" r="350.66" href="#g1"/></defs><circle cx="316.43" cy="333.11" r="103" fill="${logo.tealColor}"/><circle cx="816.34" cy="394.1" r="103" fill="${logo.accentColor}"/><circle cx="513.59" cy="796.53" r="103" fill="${logo.accent2Color}"/><path d="M489.12,739.01c-2.77,1.18-5.65.77-6.72-.88-.08-.13-.15-.26-.21-.4l-17.12-32.04-144.06-269.68c24-1.05,47.71-10.47,66.39-28.24l94.39,290.79,11.2,34.5s.02.03.02.05l.13.41c.47,1.92-1.23,4.29-4.02,5.48Z" fill="url(#g1)" stroke="#20201e"/><path d="M778.76,444.05c-2.41-1.81-5.3-2.11-6.74-.76-.11.11-.21.22-.3.34l-24.32,26.99-204.64,227.16c23.05,6.79,43.79,21.63,57.65,43.37l161.51-259.59,19.16-30.8s.02-.03.04-.05l.23-.37c.92-1.75-.16-4.46-2.59-6.29Z" fill="url(#g2)" stroke="#20201e"/><path d="M378.48,340.7c.36-2.99,2.16-5.28,4.12-5.38.16,0,.3,0,.45.01l36.3,1.19,305.58,10.08c-11.09,21.31-14.79,46.55-8.74,71.61l-299.03-63.65-35.48-7.55s-.04,0-.06,0l-.42-.09c-1.9-.55-3.1-3.21-2.74-6.23Z" fill="url(#g3)" stroke="#20201e"/></svg>`

export interface BrandingOptions {
  /** e.g. https://vizmaya.fyi. Logo assets and links resolve against it. */
  siteUrl: string
  /** Whose chrome to wrap the page in. Default vizmaya-fyi. */
  app?: HtmlStoryApp
  /** Aura scene slug (html_stories.aura) to lay behind the page, if any. */
  aura?: string | null
  /**
   * False drops the header and footer and keeps only the aura: the page as a
   * host app embeds it (`/s/<slug>?embed=1`, the footshorts app's WebView),
   * under the host's own chrome. Default true.
   */
  chrome?: boolean
}

/** Shared by both bars; each passes its colours in as custom properties. */
function barStyle(c: BarColors): string {
  return `:host{--bg:${c.bg};--fg:${c.fg};--link:${c.link};--line:${c.line}}${BAR_STYLE}`
}

const BAR_STYLE = `
:host{all:initial;display:block;position:relative;z-index:1;background:var(--bg);color:var(--fg);font:14px/1.4 Inter,-apple-system,'Segoe UI',Roboto,sans-serif}
*{box-sizing:border-box}
a{color:inherit;text-decoration:none}
svg{display:block}
.bar{display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:1600px;margin:0 auto;padding:0 clamp(16px,4vw,48px)}
.mono{font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;letter-spacing:1.6px;text-transform:uppercase}
.link{color:var(--link);transition:color .2s}
.link:hover,.link:focus-visible{color:var(--fg)}
a:focus-visible{outline:2px solid #0BBFAB;outline-offset:3px;border-radius:4px}
`

function headerHtml(site: string, look: Look): string {
  return `<vizmaya-header><template shadowrootmode="open"><style>${barStyle(look.header)}
:host{border-bottom:1px solid var(--line)}
.bar{height:64px}
.home{position:relative;display:block;width:180px;height:44px}
canvas{display:block;width:100%;height:100%}
.fallback{position:absolute;inset:0;display:flex;align-items:center;gap:10px}
.fallback svg{width:32px;height:32px}
.fallback span{font-family:Fraunces,Georgia,serif;font-size:22px;letter-spacing:-.01em}
:host([data-ready]) .fallback{display:none}
@media (max-width:480px){.home{width:150px;height:36px}.bar{height:56px}}
</style><div class="bar" role="banner"><a class="home" href="${site}/" aria-label="vizmaya home"><canvas aria-hidden="true"></canvas><span class="fallback" aria-hidden="true">${logoMark(look.logo)}<span>Vizmaya</span></span></a><a class="mono link" href="${site}/stories">All stories</a></div></template></vizmaya-header>`
}

function footerHtml(site: string, look: Look): string {
  const year = new Date().getUTCFullYear()
  return `<vizmaya-footer><template shadowrootmode="open"><style>${barStyle(look.footer)}
:host{border-top:1px solid var(--line)}
.bar{flex-wrap:wrap;padding-top:32px;padding-bottom:32px}
.brand{display:flex;align-items:center;gap:12px}
.brand svg{width:40px;height:40px}
.name{font-family:Fraunces,Georgia,serif;font-size:20px;line-height:1.1}
.tag{color:var(--link);margin-top:4px}
.links{display:flex;flex-wrap:wrap;gap:12px 20px}
</style><div class="bar" role="contentinfo"><a class="brand" href="${site}/">${logoMark(look.logo)}<span><span class="name">Vizmaya</span><span class="mono tag" style="display:block">Data stories · © ${year} Vizmaya Labs</span></span></a><nav class="links mono" aria-label="vizmaya"><a class="link" href="${site}/stories">All stories</a><a class="link" href="https://theasymmetryletter.substack.com" target="_blank" rel="noopener">Newsletter</a><a class="link" href="https://linkedin.com/company/vizmaya-labs" target="_blank" rel="noopener">LinkedIn</a><a class="link" href="https://instagram.com/vizzmaya" target="_blank" rel="noopener">Instagram</a></nav></div></template></vizmaya-footer>`
}

/**
 * Loads the Rive runtime and plays the logo. The static fallback stays if
 * anything fails, and for reduced-motion readers (the logo's first frame is
 * the empty start of its intro, so a paused player would show nothing).
 */
function riveScript(site: string, look: Look): string {
  const cfg = JSON.stringify({ runtime: RIVE_RUNTIME, src: `${site}/vizmaya-logo.riv`, palette: look.logo })
  return `<script>(function(c){try{
var host=document.querySelector('vizmaya-header'),root=host&&host.shadowRoot,canvas=root&&root.querySelector('canvas');
if(!canvas||(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches))return;
var s=document.createElement('script');s.src=c.runtime;s.async=true;
s.onload=function(){try{
var r=new window.rive.Rive({src:c.src,canvas:canvas,autoplay:true,onLoad:function(){
try{var vm=r.defaultViewModel(),inst=vm&&vm.defaultInstance();if(inst){for(var k in c.palette){var p=inst.color(k),h=parseInt(c.palette[k].slice(1),16);if(p)p.rgba(h>>16&255,h>>8&255,h&255,255)}r.bindViewModelInstance(inst)}}catch(e){}
r.resizeDrawingSurfaceToCanvas();host.setAttribute('data-ready','');
window.addEventListener('resize',function(){r.resizeDrawingSurfaceToCanvas()})}});
}catch(e){}};
document.head.appendChild(s);
}catch(e){}})(${cfg});</script>`
}

// ── Footshorts chrome ────────────────────────────────────────────────────────

interface FootshortsLook {
  header: BarColors
  footer: BarColors
  /** The F mark's fill. */
  mark: string
}

/**
 * Used when the page doesn't declare its palette: the app's `classic` theme
 * (apps/footshorts/brand/src/themes/classic.ts) — the same near-black bar the
 * feed sits under, with the brand orange-red mark.
 */
const FOOTSHORTS_HOME_LOOK: FootshortsLook = {
  header: { bg: '#0B0B0F', fg: '#F4F4F5', link: '#8E8E99', line: '#24242E' },
  footer: { bg: '#16161D', fg: '#F4F4F5', link: '#8E8E99', line: '#24242E' },
  mark: '#F26A3C',
}

/** The bars in the page's own palette; the mark takes its accent. */
function footshortsThemedLook(t: ThemeColors): FootshortsLook {
  const bg = t.background!
  const surface = t.surface ?? bg
  const line = t.line ?? t.muted!
  return {
    header: { bg, fg: t.text!, link: t.muted!, line },
    footer: { bg: surface, fg: t.text!, link: t.muted!, line },
    mark: t.accent!,
  }
}

/**
 * public/brand/mark-f.svg from the footshorts web app, inlined and recoloured
 * for the same reason the vizmaya mark is: the page's opaque origin can't load
 * it from a protected preview deployment.
 */
const footshortsMark = (fill: string) =>
  `<svg viewBox="0 0 215.073 260.428" aria-hidden="true"><path d="M 180.211 38.9 C 175.957 43.647 169.878 46.349 163.505 46.325 L 83.484 46.028 C 67.282 45.968 54.007 58.88 53.619 75.078 L 52.946 103.15 L 137.655 103.15 L 101.195 149.071 L 69.018 149.071 C 60.87 149.071 54.237 155.623 54.137 163.77 L 52.946 260.428 L 0 260.428 L 3.417 65.792 C 4.058 29.271 33.847 0 70.374 0 L 215.073 0 L 180.211 38.9 Z" fill="${fill}"/></svg>`

const FOOTSHORTS_BAR_STYLE = `
:host{all:initial;display:block;position:relative;z-index:1;background:var(--bg);color:var(--fg);font:14px/1.4 'Space Grotesk',-apple-system,'Segoe UI',Roboto,sans-serif}
*{box-sizing:border-box}
a{color:inherit;text-decoration:none}
svg{display:block}
.bar{display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:1600px;margin:0 auto;padding:0 clamp(16px,4vw,48px)}
.mono{font-family:'Space Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;letter-spacing:1.6px;text-transform:uppercase}
.link{color:var(--link);transition:color .2s}
.link:hover,.link:focus-visible{color:var(--fg)}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:-.01em}
.brand svg{width:22px;height:27px}
a:focus-visible{outline:2px solid #00D26A;outline-offset:3px;border-radius:4px}
`

function footshortsBarStyle(c: BarColors): string {
  return `:host{--bg:${c.bg};--fg:${c.fg};--link:${c.link};--line:${c.line}}${FOOTSHORTS_BAR_STYLE}`
}

function footshortsHeaderHtml(site: string, look: FootshortsLook): string {
  const meta = HTML_STORY_APP_META.footshorts
  return `<footshorts-header><template shadowrootmode="open"><style>${footshortsBarStyle(look.header)}
:host{border-bottom:1px solid var(--line)}
.bar{height:60px}
.brand{font-size:19px}
.links{display:flex;gap:20px}
@media (max-width:480px){.bar{height:52px}.brand{font-size:17px}}
</style><div class="bar" role="banner"><a class="brand" href="${site}/feed" aria-label="Footshorts home">${footshortsMark(look.mark)}<span>Footshorts</span></a><nav class="links mono" aria-label="footshorts"><a class="link" href="${site}/feed">Feed</a><a class="link" href="${site}${meta.storiesPath}">${meta.storiesLabel}</a></nav></div></template></footshorts-header>`
}

function footshortsFooterHtml(site: string, look: FootshortsLook): string {
  const year = new Date().getUTCFullYear()
  const meta = HTML_STORY_APP_META.footshorts
  return `<footshorts-footer><template shadowrootmode="open"><style>${footshortsBarStyle(look.footer)}
:host{border-top:1px solid var(--line)}
.bar{flex-wrap:wrap;padding-top:28px;padding-bottom:28px}
.brand svg{width:28px;height:34px}
.name{font-size:18px;line-height:1.1}
.tag{color:var(--link);margin-top:4px;font-weight:400}
.links{display:flex;flex-wrap:wrap;gap:12px 20px}
</style><div class="bar" role="contentinfo"><a class="brand" href="${site}/feed">${footshortsMark(look.mark)}<span><span class="name" style="display:block">Footshorts</span><span class="mono tag" style="display:block">Football, in short · © ${year} Footshorts</span></span></a><nav class="links mono" aria-label="footshorts"><a class="link" href="${site}/feed">Feed</a><a class="link" href="${site}${meta.storiesPath}">${meta.storiesLabel}</a><a class="link" href="${site}/about-us">About us</a><a class="link" href="${site}/privacy">Privacy</a></nav></div></template></footshorts-footer>`
}

/**
 * Each site's header height, its 1px bottom border included, on wide screens
 * and under 480px (the bars' own breakpoint). The page gets it as
 * --vizmaya-chrome-h, so a paged story's stage (book, board, deck: ./formats)
 * fills exactly the rest of the screen and the footer is one scroll away.
 */
export const CHROME_HEIGHT: Record<HtmlStoryApp, { wide: number; narrow: number }> = {
  'vizmaya-fyi': { wide: 65, narrow: 57 },
  footshorts: { wide: 61, narrow: 53 },
}

function chromeHeightStyle(app: HtmlStoryApp): string {
  const h = CHROME_HEIGHT[app]
  return `<style>:root{--vizmaya-chrome-h:${h.wide}px}@media (max-width:480px){:root{--vizmaya-chrome-h:${h.narrow}px}}</style>`
}

/** Served chrome-less (embed), there's no header to leave room for. */
const NO_CHROME_HEIGHT_STYLE = '<style>:root{--vizmaya-chrome-h:0px}</style>'

/** How much of the page background washes over the aura, so text written for that background stays legible. */
const AURA_VEIL_OPACITY = 0.35

/**
 * The story's aura scene as a fixed full-viewport backdrop behind the page,
 * like the viz-engine stories' page backdrop. The capture still paints first
 * (and stays if the live embed never loads, or for reduced-motion readers),
 * the animated embed goes over it, and a veil of the page background over
 * both. The page's own html/body backgrounds are cleared so it shows through;
 * sections that paint their own background still cover it. A format runtime
 * finds the <vizmaya-aura> element and clears its stage too (the board's felt
 * and the deck's table stay at 85%).
 */
function auraHtml(slug: string, theme: ThemeColors | null): string {
  const bg = theme?.background
  const still = auraCaptureUrl(slug, { w: 1920, h: 1080 })
  const embed = auraEmbedUrl(slug)
  return `<style>html,body{background:transparent!important}</style><vizmaya-aura aria-hidden="true"><template shadowrootmode="open"><style>
:host{all:initial;display:block;position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none${bg ? `;background:${bg}` : ''}}
img,iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block;object-fit:cover;background:transparent}
.veil{position:absolute;inset:0${bg ? `;background:${bg};opacity:${AURA_VEIL_OPACITY}` : ''}}
@media (prefers-reduced-motion:reduce){iframe{display:none}}
</style><img src="${escapeAttr(still)}" alt="" onerror="this.remove()"><iframe src="${escapeAttr(embed)}" title="" tabindex="-1" loading="lazy"></iframe><div class="veil"></div></template></vizmaya-aura>`
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/**
 * Wrap a story document in its site's header and footer, in the palette the
 * page declares (`<meta name="vizmaya:theme">`) or else the site's home look,
 * with the story's aura scene behind it when one is set, and the header's
 * height as --vizmaya-chrome-h (0px when served without chrome).
 */
export function brandHtmlStory(
  html: string,
  { siteUrl, aura, app = DEFAULT_HTML_STORY_APP, chrome = true }: BrandingOptions,
): string {
  const site = siteUrl.replace(/\/$/, '')
  const theme = extractThemeMeta(html)
  let header: string
  let footer: string
  if (!chrome) {
    // No header, so a paged stage takes the whole screen rather than stopping
    // short by the formats' 64px/56px fallback.
    header = NO_CHROME_HEIGHT_STYLE + (aura ? auraHtml(aura, theme) : '')
    footer = ''
  } else if (app === 'footshorts') {
    const look = theme ? footshortsThemedLook(theme) : FOOTSHORTS_HOME_LOOK
    header = chromeHeightStyle(app) + (aura ? auraHtml(aura, theme) : '') + footshortsHeaderHtml(site, look)
    footer = footshortsFooterHtml(site, look)
  } else {
    const look = theme ? themedLook(theme) : HOME_LOOK
    header = chromeHeightStyle(app) + (aura ? auraHtml(aura, theme) : '') + headerHtml(site, look)
    footer = footerHtml(site, look) + riveScript(site, look)
  }

  let out = html
  const bodyOpen = /<body\b[^>]*>/i.exec(out)
  if (bodyOpen) {
    const at = bodyOpen.index + bodyOpen[0].length
    out = out.slice(0, at) + header + out.slice(at)
  } else {
    // No <body> tag: the parser opens one at the first content, so the header
    // still lands at the top once it follows </head> (or leads the document).
    const headClose = /<\/head\s*>/i.exec(out)
    const at = headClose ? headClose.index + headClose[0].length : 0
    out = out.slice(0, at) + header + out.slice(at)
  }

  const bodyClose = out.toLowerCase().lastIndexOf('</body')
  const htmlClose = out.toLowerCase().lastIndexOf('</html')
  const at = bodyClose !== -1 ? bodyClose : htmlClose !== -1 ? htmlClose : out.length
  return out.slice(0, at) + footer + out.slice(at)
}
