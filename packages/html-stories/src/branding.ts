/**
 * Site chrome for agent-authored HTML stories, wrapped around whatever the
 * agent posted: for vizmaya a header with the animated Rive logo and a footer
 * with the static logo mark; for footshorts the app's mark and navigation in
 * its dark bar; for vizf1 the chequered-flag mark and the app's navigation in
 * its paddock-dark bar; for viznba the app's ball-and-hoop mark and navigation in
 * its court-dark bar; for travel a compass mark on the scrapbook's paper,
 * linking back to the trip's journey map. Applied when the page is served
 * (`/s/<slug>`) and in the admin preview, never to the stored HTML, so every
 * published story picks it up without a re-post and the stored HTML stays
 * exactly what the agent wrote.
 *
 * Both bars live in declarative shadow roots, so the story's CSS (a global
 * `header {}` or `a {}` rule) can't restyle them and its scripts don't find
 * them with `document.querySelector`. The page runs in an opaque-origin
 * sandbox, so the static mark is inlined, the Rive runtime comes from a CDN
 * and the `.riv` from the site, which serves it with CORS for this.
 */

import { auraCaptureUrl, auraEmbedUrl } from '@vismay/viz-engine/src/lib/aura'
import { DEFAULT_HTML_STORY_APP, HTML_STORY_APP_META, type HtmlStoryApp } from './apps'
import { mapboxTokenScript, storyMapboxToken } from './mapbox'
import { extractThemeMeta, extractTripMeta, type ThemeColors } from './meta'

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
 * Used when the page doesn't declare its palette: the studio's cream look, a
 * cream nav with the logo in ink, over an ink footer.
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
  /**
   * Serve the page as a picture of itself (`?preview=1`, the vizmaya.fyi home
   * wall's tiles): a paged format's own controls are hidden too, so a board
   * is just the board. Default false.
   */
  preview?: boolean
  /**
   * The public Mapbox token to inject as `window.MAPBOX_ACCESS_TOKEN` (./mapbox)
   * when the page uses Mapbox. Omit for the configured one; null for none.
   */
  mapboxToken?: string | null
}

/** Shared by both bars; each passes its colours in as custom properties. */
function barStyle(c: BarColors): string {
  return `:host{--bg:${c.bg};--fg:${c.fg};--link:${c.link};--line:${c.line}}${BAR_STYLE}`
}

const BAR_STYLE = `
:host{all:initial;display:block;position:sticky;top:0;z-index:30;background:var(--bg);color:var(--fg);font:14px/1.4 Inter,-apple-system,'Segoe UI',Roboto,sans-serif}
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
}

/**
 * Used when the page doesn't declare its palette: the app's `classic` theme
 * (apps/footshorts/brand/src/themes/classic.ts) — the same near-black bar the
 * feed sits under.
 */
const FOOTSHORTS_HOME_LOOK: FootshortsLook = {
  header: { bg: '#0B0B0F', fg: '#F4F4F5', link: '#8E8E99', line: '#24242E' },
  footer: { bg: '#16161D', fg: '#F4F4F5', link: '#8E8E99', line: '#24242E' },
}

/** The bars in the page's own palette. */
function footshortsThemedLook(t: ThemeColors): FootshortsLook {
  const bg = t.background!
  const surface = t.surface ?? bg
  const line = t.line ?? t.muted!
  return {
    header: { bg, fg: t.text!, link: t.muted!, line },
    footer: { bg: surface, fg: t.text!, link: t.muted!, line },
  }
}

/**
 * public/brand/logo-icon.svg from the footshorts web app — the icon the app's
 * sidebar, feed and the mobile app use — inlined for the same reason the
 * vizmaya mark is: the page's opaque origin can't load it from a protected
 * preview deployment. It keeps its own colours whatever the page's palette.
 */
const FOOTSHORTS_LOGO = `<svg viewBox="0 0 512 512" fill="none" aria-hidden="true"><path d="M0 204.8C0 108.256 0 59.9845 29.9923 29.9923C59.9845 0 108.256 0 204.8 0H307.2C403.744 0 452.015 0 482.008 29.9923C512 59.9845 512 108.256 512 204.8V307.2C512 403.744 512 452.015 482.008 482.008C452.015 512 403.744 512 307.2 512H204.8C108.256 512 59.9845 512 29.9923 482.008C0 452.015 0 403.744 0 307.2V204.8Z" fill="#F5845E"/><g clip-path="url(#clip0_51_203)"><path d="M-60.1999 -108.202L-113.941 -77.2022V-15.2022L-60.1999 15.7978M-60.1999 15.7978L-6.44031 -15.2022M-60.1999 15.7978V77.7978M47.301 -108.202L-6.44031 -77.2022V-15.2022M-6.44031 -15.2022L47.301 15.7978M47.301 15.7978L101.061 -15.2022M47.301 15.7978V77.7978M154.802 -108.202L101.061 -77.2022V-15.2022M101.061 -15.2022L154.802 15.7978M154.802 15.7978L208.543 -15.2022M154.802 15.7978V77.7978M262.303 -108.202L208.543 -77.2022V-15.2022M208.543 -15.2022L262.303 15.7978M262.303 15.7978L316.044 -15.2022M262.303 15.7978V77.7978M369.804 -108.202L316.044 -77.2022V-15.2022M316.044 -15.2022L369.804 15.7978M369.804 15.7978L423.545 -15.2022M369.804 15.7978V77.7978M477.305 -108.202L423.545 -77.2022V-15.2022M423.545 -15.2022L477.305 15.7978M477.305 15.7978L531.046 -15.2022M477.305 15.7978V77.7978M584.806 -108.202L531.046 -77.2022V-15.2022M531.046 -15.2022L584.806 15.7978M584.806 15.7978L638.547 -15.2022M584.806 15.7978V77.7978M-60.1999 77.7978L-6.44031 108.798M-60.1999 77.7978L-113.941 108.798V170.798L-60.1999 201.798M-6.44031 108.798L47.301 77.7978M-6.44031 108.798V170.798M47.301 77.7978L101.061 108.798M101.061 108.798L154.802 77.7978M101.061 108.798V170.798M154.802 77.7978L208.543 108.798M208.543 108.798L262.303 77.7978M208.543 108.798V170.798M262.303 77.7978L316.044 108.798M316.044 108.798L369.804 77.7978M316.044 108.798V170.798M369.804 77.7978L423.545 108.798M423.545 108.798L477.305 77.7978M423.545 108.798V170.798M477.305 77.7978L531.046 108.798M531.046 108.798L584.806 77.7978M531.046 108.798V170.798M584.806 77.7978L638.547 108.798M-60.1999 201.798L-6.44031 170.798M-60.1999 201.798V263.798M-6.44031 170.798L47.301 201.798M47.301 201.798L101.061 170.798M47.301 201.798V263.798M101.061 170.798L154.802 201.798M154.802 201.798L208.543 170.798M154.802 201.798V263.798M208.543 170.798L262.303 201.798M262.303 201.798L316.044 170.798M262.303 201.798V263.798M316.044 170.798L369.804 201.798M369.804 201.798L423.545 170.798M369.804 201.798V263.798M423.545 170.798L477.305 201.798M477.305 201.798L531.046 170.798M477.305 201.798V263.798M531.046 170.798L584.806 201.798M584.806 201.798L638.547 170.798M584.806 201.798V263.798M-60.1999 263.798L-6.44031 294.798M-60.1999 263.798L-113.941 294.798V356.798L-60.1999 387.798M-6.44031 294.798L47.301 263.798M-6.44031 294.798V356.798M47.301 263.798L101.061 294.798M101.061 294.798L154.802 263.798M101.061 294.798V356.798M154.802 263.798L208.543 294.798M208.543 294.798L262.303 263.798M208.543 294.798V356.798M262.303 263.798L316.044 294.798M316.044 294.798L369.804 263.798M316.044 294.798V356.798M369.804 263.798L423.545 294.798M423.545 294.798L477.305 263.798M423.545 294.798V356.798M477.305 263.798L531.046 294.798M531.046 294.798L584.806 263.798M531.046 294.798V356.798M584.806 263.798L638.547 294.798M-60.1999 387.798L-6.44031 356.798M-60.1999 387.798V449.798M-6.44031 356.798L47.301 387.798M47.301 387.798L101.061 356.798M47.301 387.798V449.798M101.061 356.798L154.802 387.798M154.802 387.798L208.543 356.798M154.802 387.798V449.798M208.543 356.798L262.303 387.798M262.303 387.798L316.044 356.798M262.303 387.798V449.798M316.044 356.798L369.804 387.798M369.804 387.798L423.545 356.798M369.804 387.798V449.798M423.545 356.798L477.305 387.798M477.305 387.798L531.046 356.798M477.305 387.798V449.798M531.046 356.798L584.806 387.798M584.806 387.798L638.547 356.798M584.806 387.798V449.798M-60.1999 449.798L-6.44031 480.798M-60.1999 449.798L-113.941 480.798V542.798L-60.1999 573.798M-6.44031 480.798L47.301 449.798M-6.44031 480.798V542.798M47.301 449.798L101.061 480.798M101.061 480.798L154.802 449.798M101.061 480.798V542.798M154.802 449.798L208.543 480.798M208.543 480.798L262.303 449.798M208.543 480.798V542.798M262.303 449.798L316.044 480.798M316.044 480.798L369.804 449.798M316.044 480.798V542.798M369.804 449.798L423.545 480.798M423.545 480.798L477.305 449.798M423.545 480.798V542.798M477.305 449.798L531.046 480.798M531.046 480.798L584.806 449.798M531.046 480.798V542.798M584.806 449.798L638.547 480.798M-60.1999 573.798L-6.44031 542.798M-60.1999 573.798V635.798M-6.44031 542.798L47.301 573.798M47.301 573.798L101.061 542.798M47.301 573.798V635.798M101.061 542.798L154.802 573.798M154.802 573.798L208.543 542.798M154.802 573.798V635.798M208.543 542.798L262.303 573.798M262.303 573.798L316.044 542.798M262.303 573.798V635.798M316.044 542.798L369.804 573.798M369.804 573.798L423.545 542.798M369.804 573.798V635.798M423.545 542.798L477.305 573.798M477.305 573.798L531.046 542.798M477.305 573.798V635.798M531.046 542.798L584.806 573.798M584.806 573.798L638.547 542.798M584.806 573.798V635.798M-60.1999 635.798L-6.44031 666.798M-60.1999 635.798L-113.941 666.798V728.798L-60.1999 759.798M-6.44031 666.798L47.301 635.798M-6.44031 666.798V728.798L47.301 759.798M47.301 635.798L101.061 666.798M101.061 666.798L154.802 635.798M101.061 666.798V728.798L154.802 759.798M154.802 635.798L208.543 666.798M208.543 666.798L262.303 635.798M208.543 666.798V728.798L262.303 759.798M262.303 635.798L316.044 666.798M316.044 666.798L369.804 635.798M316.044 666.798V728.798L369.804 759.798M369.804 635.798L423.545 666.798M423.545 666.798L477.305 635.798M423.545 666.798V728.798L477.305 759.798M477.305 635.798L531.046 666.798M531.046 666.798L584.806 635.798M531.046 666.798V728.798L584.806 759.798M584.806 635.798L638.547 666.798" stroke="url(#paint0_linear_51_203)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></g><circle cx="269.671" cy="293.681" r="140.8" transform="rotate(21.3703 269.671 293.681)" fill="#FEB299"/><path d="M356.364 182.968C387.288 206.976 405.464 241.316 409.807 277.338L382.774 275.19C360.671 273.433 348.268 250.119 336.294 231.457C330.005 221.228 320.11 213.272 306.609 207.591C293.109 201.909 281.694 200.185 272.367 202.421C263.208 204.253 256.765 209.599 253.038 218.456C248.971 228.118 249.671 236.943 255.138 244.93C260.775 252.515 269.46 260.199 281.194 267.981L295.674 277.629C314.98 290.493 331.631 303.899 345.626 317.845C360.166 331.547 369.686 346.69 374.183 363.274C376.379 370.39 377.261 377.942 376.829 385.93C328.259 442.569 243.255 451.657 183.677 405.403C154.353 382.638 136.491 350.581 131.018 316.61L153.833 319.535C174.634 322.203 186.451 342.795 191.478 363.156C194.464 373.891 199.696 382.964 207.171 390.375C215.191 397.541 224.639 403.413 235.514 407.99C252.015 414.934 265.473 417.044 275.89 414.319C286.476 411.192 293.718 404.999 297.615 395.739C301.512 386.479 300.728 377.855 295.261 369.867C289.963 361.477 279.741 352.199 264.596 342.034L250.116 332.386C232.31 320.153 216.784 307.221 203.539 293.59C190.463 279.557 181.676 264.248 177.178 247.664C172.68 231.08 174.582 212.924 182.885 193.197C185.185 187.73 187.729 182.645 190.511 177.94C239.652 144.312 306.805 144.493 356.364 182.968Z" fill="url(#paint1_linear_51_203)"/><path d="M502.13 63.9999C508.49 83.6614 510.751 108.78 511.554 141.999C507.89 143.133 504.041 143.726 500.127 143.718L207.533 143.1C179.692 143.041 156.907 165.24 156.24 193.073L155.825 210.353C138.346 233.811 128 262.898 128 294.4C128 326.43 138.697 355.961 156.711 379.619L155.083 511.798C115.366 511.263 86.3141 509.31 64.1716 502.185L69.8776 177.178C70.9806 114.353 122.225 64.0002 185.059 63.9999H502.13Z" fill="#C2410C"/><path d="M154.802 68.534L167.853 188.719" stroke="url(#paint2_linear_51_203)" stroke-width="25.6" stroke-linecap="round"/><path d="M24.2549 268.97L105.933 260.615" stroke="url(#paint3_linear_51_203)" stroke-width="25.6" stroke-linecap="round"/><path d="M31.0766 194.156L142.903 228.968" stroke="url(#paint4_linear_51_203)" stroke-width="25.6" stroke-linecap="round"/><path d="M67.2461 104.97L145.062 208.362" stroke="url(#paint5_linear_51_203)" stroke-width="25.6" stroke-linecap="round"/><defs><linearGradient id="paint0_linear_51_203" x1="-1188.71" y1="-81.4069" x2="-1158.51" y2="723.846" gradientUnits="userSpaceOnUse"><stop stop-color="#FEB299"/><stop offset="1" stop-color="#FEB299" stop-opacity="0"/></linearGradient><linearGradient id="paint1_linear_51_203" x1="358.947" y1="184.973" x2="177.801" y2="416.118" gradientUnits="userSpaceOnUse"><stop stop-color="#06140C"/><stop offset="1" stop-color="#257A49"/></linearGradient><linearGradient id="paint2_linear_51_203" x1="136.161" y1="72.2441" x2="166.843" y2="174.711" gradientUnits="userSpaceOnUse"><stop stop-color="#FEB299"/><stop offset="1" stop-color="#FEB299" stop-opacity="0"/></linearGradient><linearGradient id="paint3_linear_51_203" x1="16.1502" y1="273.601" x2="116.301" y2="260.615" gradientUnits="userSpaceOnUse"><stop stop-color="#FEB299"/><stop offset="1" stop-color="#FEB299" stop-opacity="0"/></linearGradient><linearGradient id="paint4_linear_51_203" x1="41.613" y1="157.913" x2="108.01" y2="213.389" gradientUnits="userSpaceOnUse"><stop stop-color="#FEB299"/><stop offset="1" stop-color="#FEB299" stop-opacity="0"/></linearGradient><linearGradient id="paint5_linear_51_203" x1="69.3489" y1="126.457" x2="135.746" y2="181.933" gradientUnits="userSpaceOnUse"><stop stop-color="#FEB299"/><stop offset="1" stop-color="#FEB299" stop-opacity="0"/></linearGradient><clipPath id="clip0_51_203"><rect width="357" height="372" fill="white" transform="translate(154.955 139.351)"/></clipPath></defs></svg>`

const FOOTSHORTS_BAR_STYLE = `
:host{all:initial;display:block;position:sticky;top:0;z-index:30;background:var(--bg);color:var(--fg);font:14px/1.4 'Space Grotesk',-apple-system,'Segoe UI',Roboto,sans-serif}
*{box-sizing:border-box}
a{color:inherit;text-decoration:none}
svg{display:block}
.bar{display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:1600px;margin:0 auto;padding:0 clamp(16px,4vw,48px)}
.mono{font-family:'Space Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;letter-spacing:1.6px;text-transform:uppercase}
.link{color:var(--link);transition:color .2s}
.link:hover,.link:focus-visible{color:var(--fg)}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:-.01em}
.brand svg{width:28px;height:28px}
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
</style><div class="bar" role="banner"><a class="brand" href="${site}/feed" aria-label="Footshorts home">${FOOTSHORTS_LOGO}<span>Footshorts</span></a><nav class="links mono" aria-label="footshorts"><a class="link" href="${site}/feed">Feed</a><a class="link" href="${site}${meta.storiesPath}">${meta.storiesLabel}</a></nav></div></template></footshorts-header>`
}

function footshortsFooterHtml(site: string, look: FootshortsLook): string {
  const year = new Date().getUTCFullYear()
  const meta = HTML_STORY_APP_META.footshorts
  return `<footshorts-footer><template shadowrootmode="open"><style>${footshortsBarStyle(look.footer)}
:host{border-top:1px solid var(--line)}
.bar{flex-wrap:wrap;padding-top:28px;padding-bottom:28px}
.brand svg{width:38px;height:38px}
.name{font-size:18px;line-height:1.1}
.tag{color:var(--link);margin-top:4px;font-weight:400}
.links{display:flex;flex-wrap:wrap;gap:12px 20px}
</style><div class="bar" role="contentinfo"><a class="brand" href="${site}/feed">${FOOTSHORTS_LOGO}<span><span class="name" style="display:block">Footshorts</span><span class="mono tag" style="display:block">Football, in short · © ${year} Footshorts</span></span></a><nav class="links mono" aria-label="footshorts"><a class="link" href="${site}/feed">Feed</a><a class="link" href="${site}${meta.storiesPath}">${meta.storiesLabel}</a><a class="link" href="${site}/about-us">About us</a><a class="link" href="${site}/privacy">Privacy</a></nav></div></template></footshorts-footer>`
}

// ── VizF1 chrome ─────────────────────────────────────────────────────────────

interface Vizf1Look {
  header: BarColors
  footer: BarColors
  /** The flag mark's colour: the page's accent, else the brand coral red. */
  mark: string
}

/**
 * Used when the page doesn't declare its palette: the app's own bar
 * (@vizf1/brand `F1_BRAND.colors`, the Paddock story theme) with the mark in
 * the brand's coral red.
 */
const VIZF1_HOME_LOOK: Vizf1Look = {
  header: { bg: '#0b0d12', fg: '#f5f5f5', link: '#8e8e99', line: '#1f2330' },
  footer: { bg: '#13161d', fg: '#f5f5f5', link: '#8e8e99', line: '#1f2330' },
  mark: '#ff4346',
}

/** The bars in the page's own palette. */
function vizf1ThemedLook(t: ThemeColors): Vizf1Look {
  const bg = t.background!
  const surface = t.surface ?? bg
  const line = t.line ?? t.muted!
  return {
    header: { bg, fg: t.text!, link: t.muted!, line },
    footer: { bg: surface, fg: t.text!, link: t.muted!, line },
    mark: t.accent ?? VIZF1_HOME_LOOK.mark,
  }
}

/**
 * The chequered-flag mark (@vizf1/brand `ChequeredFlagMark`, also
 * public/brand/flag-mark.svg in the vizf1 web app) in `currentColor`, inlined
 * for the same reason the other marks are: the page's opaque origin can't load
 * it from a protected preview deployment.
 */
const VIZF1_MARK = `<svg viewBox="0 0 406.319 238.021" fill="none" aria-hidden="true"><path d="M12.0213 226L108.191 129.83" stroke="currentColor" stroke-width="24.0426" stroke-linecap="round"/><path d="M146.66 115.404H103.383L114.525 104.792C133.302 86.9103 158.237 76.9362 184.166 76.9362H204.362L176.505 103.466C168.459 111.13 157.772 115.404 146.66 115.404Z" fill="currentColor"/><path d="M242.83 76.9362H199.553L227.409 50.4065C235.456 42.7427 246.143 38.4681 257.255 38.4681H300.532L272.676 64.9978C264.629 72.6615 253.942 76.9362 242.83 76.9362Z" fill="currentColor"/><path d="M276.489 115.404H223.596L257.936 82.6995C261.82 78.9998 266.98 76.9362 272.345 76.9362H276.491C293.853 76.9362 302.327 98.124 289.754 110.098C286.178 113.504 281.428 115.404 276.489 115.404Z" fill="currentColor"/><path d="M222.634 38.4681H175.511C201.44 13.7738 235.874 0 271.681 0H276.489L245.848 29.1827C239.589 35.1434 231.277 38.4681 222.634 38.4681Z" fill="currentColor"/><path d="M165.405 153.872H163.873C148.976 153.872 141.705 135.693 152.492 125.42C159.243 118.99 168.208 115.404 177.531 115.404H223.596L196.094 141.597C187.819 149.477 176.831 153.872 165.405 153.872Z" fill="currentColor"/><path d="M344.77 38.4681H305.34L330.411 14.5913C340.246 5.22456 353.308 0 366.889 0H406.319L381.249 23.8767C371.413 33.2435 358.352 38.4681 344.77 38.4681Z" fill="currentColor"/></svg>`

const VIZF1_BAR_STYLE = `
:host{all:initial;display:block;position:sticky;top:0;z-index:30;background:var(--bg);color:var(--fg);font:14px/1.4 Saira,-apple-system,'Segoe UI',Roboto,sans-serif}
*{box-sizing:border-box}
a{color:inherit;text-decoration:none}
svg{display:block}
.bar{display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:1600px;margin:0 auto;padding:0 clamp(16px,4vw,48px)}
.mono{font-family:'Martian Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;letter-spacing:1.4px;text-transform:uppercase}
.link{color:var(--link);transition:color .2s}
.link:hover,.link:focus-visible{color:var(--fg)}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-style:italic;letter-spacing:-.01em}
.brand svg{width:40px;height:24px;color:var(--mark)}
a:focus-visible{outline:2px solid var(--mark);outline-offset:3px;border-radius:4px}
`

function vizf1BarStyle(c: BarColors, mark: string): string {
  return `:host{--bg:${c.bg};--fg:${c.fg};--link:${c.link};--line:${c.line};--mark:${mark}}${VIZF1_BAR_STYLE}`
}

function vizf1HeaderHtml(site: string, look: Vizf1Look): string {
  const meta = HTML_STORY_APP_META.vizf1
  return `<vizf1-header><template shadowrootmode="open"><style>${vizf1BarStyle(look.header, look.mark)}
:host{border-bottom:1px solid var(--line)}
.bar{height:60px}
.brand{font-size:20px}
.links{display:flex;gap:20px}
@media (max-width:480px){.bar{height:52px}.brand{font-size:18px}.brand svg{width:34px;height:20px}}
</style><div class="bar" role="banner"><a class="brand" href="${site}/" aria-label="VizF1 home">${VIZF1_MARK}<span>VizF1</span></a><nav class="links mono" aria-label="vizf1"><a class="link" href="${site}/schedule">Schedule</a><a class="link" href="${site}${meta.storiesPath}">${meta.storiesLabel}</a></nav></div></template></vizf1-header>`
}

function vizf1FooterHtml(site: string, look: Vizf1Look): string {
  const year = new Date().getUTCFullYear()
  const meta = HTML_STORY_APP_META.vizf1
  return `<vizf1-footer><template shadowrootmode="open"><style>${vizf1BarStyle(look.footer, look.mark)}
:host{border-top:1px solid var(--line)}
.bar{flex-wrap:wrap;padding-top:28px;padding-bottom:28px}
.brand svg{width:48px;height:28px}
.name{font-size:18px;line-height:1.1}
.tag{color:var(--link);margin-top:4px;font-weight:400;font-style:normal}
.links{display:flex;flex-wrap:wrap;gap:12px 20px}
</style><div class="bar" role="contentinfo"><a class="brand" href="${site}/">${VIZF1_MARK}<span><span class="name" style="display:block">VizF1</span><span class="mono tag" style="display:block">Data journalism for Formula 1 · © ${year} VizF1</span></span></a><nav class="links mono" aria-label="vizf1"><a class="link" href="${site}/feed">Feed</a><a class="link" href="${site}/schedule">Schedule</a><a class="link" href="${site}${meta.storiesPath}">${meta.storiesLabel}</a><a class="link" href="${site}/about-us">About us</a></nav></div></template></vizf1-footer>`
}

// ── VizNBA chrome ────────────────────────────────────────────────────────────

interface ViznbaLook {
  header: BarColors
  footer: BarColors
}

/**
 * Used when the page doesn't declare its palette: the app's own bar
 * (apps/viznba/web/app/globals.css).
 */
const VIZNBA_HOME_LOOK: ViznbaLook = {
  header: { bg: '#0b0d12', fg: '#f5f5f5', link: '#8e8e99', line: '#1f2330' },
  footer: { bg: '#13161d', fg: '#f5f5f5', link: '#8e8e99', line: '#1f2330' },
}

/** The bars in the page's own palette. */
function viznbaThemedLook(t: ThemeColors): ViznbaLook {
  const bg = t.background!
  const surface = t.surface ?? bg
  const line = t.line ?? t.muted!
  return {
    header: { bg, fg: t.text!, link: t.muted!, line },
    footer: { bg: surface, fg: t.text!, link: t.muted!, line },
  }
}

/**
 * The VizNBA mark (apps/viznba/web/components/Logo.tsx, Figma "Vismay Brands"
 * 393:546): the ball dropping through the hoop, inlined like the other marks.
 * The ball and net keep the brand colours on any palette; the rim draws in
 * currentColor, set to the bar's text colour. The gradient ids stay unique
 * because the header and footer are separate shadow roots.
 */
const VIZNBA_MARK = `<svg viewBox="20 20 200 200" aria-hidden="true"><defs><radialGradient id="vn-logo-ball" cx="0" cy="0" r="1" gradientTransform="matrix(42.8577 143.817 -143.566 42.9327 77.1773 37.4426)" gradientUnits="userSpaceOnUse"><stop stop-color="#F08855" /><stop offset="1" stop-color="#CA5400" /></radialGradient><linearGradient id="vn-logo-net" x1="119.525" y1="106.46" x2="119.525" y2="218.54" gradientUnits="userSpaceOnUse"><stop stop-color="#135472" /><stop offset="1" stop-color="#7BAFCE" /></linearGradient></defs><path d="M40.05 102.47L40.09 98.27L40.35 94.08L40.83 89.9L41.39 86.44L42.27 82.32L43.17 78.93L44.44 74.91L45.66 71.61L47.32 67.73L48.86 64.56L50.88 60.85L52.72 57.84L55.1 54.34L57.22 51.52L59.93 48.26L62.31 45.65L65.33 42.67L68.5 39.85L71.81 37.2L74.68 35.12L78.25 32.8L81.31 31.02L85.08 29.06L88.3 27.58L92.25 25.99L95.6 24.83L99.68 23.64L103.13 22.81L107.32 22.02L110.83 21.53L115.07 21.15L118.62 21.01L122.17 21.03L126.42 21.26L129.95 21.62L134.16 22.26L137.64 22.96L141.76 24.01L145.15 25.05L149.15 26.5L152.43 27.86L156.27 29.69L159.39 31.36L163.03 33.56L165.97 35.53L169.38 38.06L172.65 40.77L175.77 43.65L178.25 46.17L181.07 49.33L183.29 52.07L185.79 55.49L187.73 58.44L189.89 62.07L191.54 65.19L193.33 69.01L194.67 72.27L196.08 76.24L197.1 79.61L198.12 83.69L198.81 87.13L199.43 91.29L199.84 95.47L200.02 99.67L200.01 103.17L199.8 107.35L199.45 110.83L198.84 114.97L198.16 118.39L197.16 122.44L195.95 126.44L194.53 130.36L193.19 133.57L191.41 137.33L189.44 141L187.28 144.55L185.34 147.42L182.86 150.75L180.21 153.94L177.4 156.99L174.95 159.42L171.87 162.18L169.19 164.36L165.87 166.82L163 168.73L159.47 170.86L155.82 172.81L152.09 174.56L148.91 175.87L145.03 177.26L141.08 178.45L137.07 179.43L133.7 180.09L129.63 180.69L125.53 181.08L121.41 181.26L117.29 181.23L113.18 180.98L109.09 180.52L105.7 179.97L101.66 179.13L97.68 178.08L93.75 176.82L90.53 175.62L86.73 174L83.03 172.18L79.42 170.17L76.49 168.36L73.09 166.02L70.34 163.93L67.17 161.28L64.63 158.94L61.72 155.99L58.96 152.89L56.37 149.65L54.33 146.85L52.06 143.38L49.96 139.79L48.05 136.09L46.6 132.93L45.05 129.06L43.7 125.11L42.56 121.1L41.77 117.71L41.01 113.59L40.54 110.13L40.18 105.96L40.05 102.47Z" fill="#F05417" /><path d="M40.05 102.47L40.09 98.27L40.35 94.08L40.83 89.9L41.39 86.44L42.27 82.32L43.17 78.93L44.44 74.91L45.66 71.61L47.32 67.73L48.86 64.56L50.88 60.85L52.72 57.84L55.1 54.34L57.22 51.52L59.93 48.26L62.31 45.65L65.33 42.67L68.5 39.85L71.81 37.2L74.68 35.12L78.25 32.8L81.31 31.02L85.08 29.06L88.3 27.58L92.25 25.99L95.6 24.83L99.68 23.64L103.13 22.81L107.32 22.02L110.83 21.53L115.07 21.15L118.62 21.01L122.17 21.03L126.42 21.26L129.95 21.62L134.16 22.26L137.64 22.96L141.76 24.01L145.15 25.05L149.15 26.5L152.43 27.86L156.27 29.69L159.39 31.36L163.03 33.56L165.97 35.53L169.38 38.06L172.65 40.77L175.77 43.65L178.25 46.17L181.07 49.33L183.29 52.07L185.79 55.49L187.73 58.44L189.89 62.07L191.54 65.19L193.33 69.01L194.67 72.27L196.08 76.24L197.1 79.61L198.12 83.69L198.81 87.13L199.43 91.29L199.84 95.47L200.02 99.67L200.01 103.17L199.8 107.35L199.45 110.83L198.84 114.97L198.16 118.39L197.16 122.44L195.95 126.44L194.53 130.36L193.19 133.57L191.41 137.33L189.44 141L187.28 144.55L185.34 147.42L182.86 150.75L180.21 153.94L177.4 156.99L174.95 159.42L171.87 162.18L169.19 164.36L165.87 166.82L163 168.73L159.47 170.86L155.82 172.81L152.09 174.56L148.91 175.87L145.03 177.26L141.08 178.45L137.07 179.43L133.7 180.09L129.63 180.69L125.53 181.08L121.41 181.26L117.29 181.23L113.18 180.98L109.09 180.52L105.7 179.97L101.66 179.13L97.68 178.08L93.75 176.82L90.53 175.62L86.73 174L83.03 172.18L79.42 170.17L76.49 168.36L73.09 166.02L70.34 163.93L67.17 161.28L64.63 158.94L61.72 155.99L58.96 152.89L56.37 149.65L54.33 146.85L52.06 143.38L49.96 139.79L48.05 136.09L46.6 132.93L45.05 129.06L43.7 125.11L42.56 121.1L41.77 117.71L41.01 113.59L40.54 110.13L40.18 105.96L40.05 102.47Z" fill="url(#vn-logo-ball)" /><path fill-rule="evenodd" clip-rule="evenodd" d="M137.15 24.24L140.84 25.07L144.58 26.18L152.35 29.22L159.69 32.99L166.59 37.4L172.97 42.4L179.12 48.35L183.9 54.16L186.24 57.7L187.51 60.13L188.41 63.67L188.68 68.96L188.12 75.18L186.81 82.23L184.63 90.62L181.92 99.06L178.48 108.34L174.44 117.99L177.82 118L182.67 117.23L185.68 116.29L189.78 114.44L193.27 112.25L196.18 109.82L198.59 107.02L199.8 104.6L199.31 111.6L198.02 119.04L195.95 126.41L195.34 127.58L194.28 128.91L192.15 130.85L189.32 132.9L185.97 134.94L181.89 137.1L172.94 141.04L167.33 143.09L162.66 144.51L161.02 144.68L160.39 144.58L159.52 143.93L159.17 142.66L159.62 139.4L162 132.14L171.29 107.12L175.87 93.47L178.09 86.31L179.96 79.12L181.35 72.14L182.14 66.06L182.44 59.83L181.68 57.68L180.6 55.96L179.17 54.18L175.25 50.47L170.19 46.8L164.9 43.69L159.28 40.93L152.71 38.21L145.43 35.65L144.01 31.49L142.38 28.43L140.44 26.37L137.15 24.24ZM132.54 23.41L135.61 25.51L137.93 27.99L139.9 31.26L141.04 34.65L133.05 33.58L129.78 33.52L128.33 33.85L129.86 37.16L131.74 42.02L133.32 46.82L135.14 53.23L137.8 64.79L140.16 78.45L141.78 91.73L142.78 104.57L143.23 119.03L142.98 132.11L149.16 131.46L153.6 130.77L157.1 129.95L159.21 129.14L156.83 135.81L155.63 141.09L155.57 143.28L155.82 144.45L156.69 145.65L157.67 146L151.36 147.42L142.98 148.44L133.25 148.82L122.5 148.54L120.93 134.49L134.66 132.94L133.77 124.83L132.11 113.79L130.09 102.76L127.85 92.18L125.07 80.42L121.91 68.47L118.82 57.95L115.5 47.83L110.85 35.73L108.27 36L105.95 36.47L100.57 38.12L94.56 40.73L89.4 43.61L86.56 41.12L83.96 37.86L82.21 34.5L81.66 32.69L81.54 31.48L87.35 28.66L93.92 26.15L100.59 24.23L107.13 22.94L114.33 22.13L121.76 21.96L126.48 22.21L131.04 22.69L132.54 23.41ZM40.12 97.48L40.41 98.6L41.21 100.24L44.01 104.59L47.86 109.52L51.23 113.28L55.55 117.6L58.57 120.3L65.25 125.47L68.89 127.86L72.71 130.06L76.7 132.03L80.86 133.74L85.18 135.14L89.64 136.2L94.25 136.87L99 137.12L103.88 136.91L103.35 135.05L101.73 131.13L99.47 127L96.64 122.76L91.6 116.39L87.86 112.29L83.95 108.41L79.43 104.39L74.19 100.31L68.87 96.91L62.15 93.62L56.9 90.51L49.24 85.19L42.87 79.99L45.16 72.93L48.23 65.82L51.97 59.03L56.39 52.61L56.3 53.4L56.58 54.64L58.4 58.49L62.11 64.11L66.28 69.41L71.73 75.56L76.1 80.06L91.84 94.74L96.52 99.96L99.14 103.32L102.49 108.11L107.27 116.34L109.81 121.74L111.88 126.95L113.52 131.93L115.23 138.78L115.94 142.86L116.48 148.14L109.12 148.32L99.45 147.82L88.13 146.53L80.06 145.19L67.84 142.41L60.1 140.07L53.14 137.4L50.16 135.97L48.09 134.75L46.95 133.71L45.05 129.06L43.11 123.12L41.77 117.71L40.81 112.21L40.28 107.36L40.05 102.46L40.12 97.48Z" fill="#571200" /><path fill-rule="evenodd" clip-rule="evenodd" d="M189.93 140.09L190.47 139.11L190.05 138.77L189.78 138.18L189.81 137.53L190.05 137.07L201.1 127.03L199.26 130.42L196.58 133.97L193.46 137.16L189.93 140.09ZM198.82 114.97L199.71 108.15L198.86 107.58L198.66 107.1L198.69 106.46L199.72 108.08L200.52 109.54L198.82 114.97ZM53.87 158.34L48.02 148.78L54.85 153.05L56.38 156.83L57.33 158.19L57.45 158.12L55.57 153.45L60 155.69L64.24 157.57L67.16 160.61L67.66 160.65L68.15 160.95L68.57 162.08L78.96 172.88L85.71 164.19L89.61 164.98L81.22 175.21L102.12 196.33L115.59 183.1L94.21 165.77L100.96 166.69L118.06 180.85L134.68 167.13L141.2 166.43L120.55 183.09L134.96 196.92L155.6 176.49L145.9 165.76L150.01 165.06L157.89 174.2L173.47 158.51L178.87 156.23L183.81 153.8L188.35 151.21L192.26 148.61L177.53 171.21L164.47 199.5L163.94 199.82L163.32 199.85L162.76 199.59L162.4 199.09L161.51 191.89L146.36 213.02L145.4 213.58L144.75 213.48L144.22 213.09L134.9 201.28L119.7 218.13L118.86 218.54L118.2 218.44L117.74 218.13L102.2 200.74L93.66 212.11L93.13 212.51L92.49 212.61L91.56 212.1L76.86 190.92L76.59 197.44L76.27 197.96L75.74 198.28H75.01L74.48 197.96L62.45 170.47L53.87 158.34ZM176.94 165.95L181.54 155.17H181.53L174.72 161.96L172.69 171.76L176.94 165.95ZM159.67 176.94L162.87 185.18L169.31 176.38L171.65 165.01L159.67 176.94ZM163.95 188.51L164.41 193.69L169.48 182.57L168.61 182.17L163.95 188.51ZM145.23 209.97L160.88 187.93L157.25 179.33L136.95 199.13L145.23 209.97ZM118.07 185.24L104.15 198.51L118.73 215.11L132.91 199.09L118.07 185.24ZM77.16 186.43L81.16 192.24L92.65 208.95L100.17 198.57L79.8 178.26L77.16 186.43ZM69.63 167.85L71.58 178.47L75.08 183.45L77.3 175.75L69.63 167.85ZM70.1 181.29L69.97 181.36L74.17 191.08L74.21 187.1L70.1 181.29ZM60.32 158.27L64.2 167.95L68.33 173.85L66.66 164.8L60.32 158.27ZM37.95 124.38L48.19 133.41L48 133.63L47.92 134.39L47.49 134.95L48.65 137.35L41.1 130.91L39.27 127.75L37.95 124.38Z" fill="url(#vn-logo-net)" /><path fill-rule="evenodd" clip-rule="evenodd" d="M31.61 129.04L30.54 125.26L30 121.04L30.15 116.91L30.93 112.93L32.28 109.13L34.36 105.15L36.98 101.43L40.08 97.97L40.03 102.72L42.57 104.78L40.82 107.26L39.39 109.79L38.3 112.37L37.64 114.64L37.22 117.27L37.16 119.59L37.39 121.93L37.93 124.3L38.79 126.71L39.81 128.8L41.34 131.27L42.97 133.4L47.12 137.65L52.52 141.81L56.24 144.15L59.77 146.07L67.71 149.64L76.75 152.75L86.72 155.29L97.45 157.16L107.75 158.24L119.25 158.69L129.81 158.41L139.25 157.59L148.39 156.25L157.07 154.43L165.95 151.92L173.31 149.25L180.51 145.95L186.7 142.35L192.27 138.22L196.27 134.32L199.26 130.42L201.3 126.57L202.55 122.47L202.82 120.45L202.87 118.13L202.63 115.82L202.11 113.54L200.42 109.35L197.6 104.97L199.99 103.05L199.95 97.97L204.05 102.74L205.82 105.38L207.12 107.75L208.36 110.63L209.18 113.19L209.74 115.83L210.02 118.55L209.85 123.19L208.95 127.43L207.33 131.67L204.99 135.86L201.91 139.94L198.1 143.88L193.58 147.65L188.35 151.21L182.44 154.52L175.87 157.54L168.71 160.24L161.88 162.33L153.74 164.32L146.17 165.72L138.35 166.77L130.35 167.45L122.25 167.74L114.13 167.66L106.07 167.19L97.17 166.21L89.48 164.96L81.18 163.13L74.18 161.17L66.8 158.6L60.73 156.03L54.49 152.86L48.93 149.42L44.06 145.75L39.9 141.88L36.46 137.87L33.76 133.73L31.61 129.04Z" fill="currentColor" /></svg>`

function viznbaBarStyle(c: BarColors): string {
  return `:host{--bg:${c.bg};--fg:${c.fg};--link:${c.link};--line:${c.line}}${VIZF1_BAR_STYLE}
.brand{font-style:normal;font-weight:800;letter-spacing:-.01em;font-stretch:80%}
.brand svg{width:30px;height:30px;color:var(--fg)}`
}

function viznbaHeaderHtml(site: string, look: ViznbaLook): string {
  const meta = HTML_STORY_APP_META.viznba
  return `<viznba-header><template shadowrootmode="open"><style>${viznbaBarStyle(look.header)}
:host{border-bottom:1px solid var(--line)}
.bar{height:60px}
.brand{font-size:20px}
.links{display:flex;gap:20px}
@media (max-width:480px){.bar{height:52px}.brand{font-size:18px}.brand svg{width:26px;height:26px}}
</style><div class="bar" role="banner"><a class="brand" href="${site}/" aria-label="VizNBA home">${VIZNBA_MARK}<span>VizNBA</span></a><nav class="links mono" aria-label="viznba"><a class="link" href="${site}/calendar">Calendar</a><a class="link" href="${site}${meta.storiesPath}">${meta.storiesLabel}</a></nav></div></template></viznba-header>`
}

function viznbaFooterHtml(site: string, look: ViznbaLook): string {
  const year = new Date().getUTCFullYear()
  const meta = HTML_STORY_APP_META.viznba
  return `<viznba-footer><template shadowrootmode="open"><style>${viznbaBarStyle(look.footer)}
:host{border-top:1px solid var(--line)}
.bar{flex-wrap:wrap;padding-top:28px;padding-bottom:28px}
.brand svg{width:38px;height:38px}
.name{font-size:18px;line-height:1.1}
.tag{color:var(--link);margin-top:4px;font-weight:400;font-stretch:100%}
.links{display:flex;flex-wrap:wrap;gap:12px 20px}
</style><div class="bar" role="contentinfo"><a class="brand" href="${site}/">${VIZNBA_MARK}<span><span class="name" style="display:block">VizNBA</span><span class="mono tag" style="display:block">The NBA, read through the numbers · © ${year} VizNBA</span></span></a><nav class="links mono" aria-label="viznba"><a class="link" href="${site}/">Feed</a><a class="link" href="${site}/calendar">Calendar</a><a class="link" href="${site}${meta.storiesPath}">${meta.storiesLabel}</a></nav></div></template></viznba-footer>`
}

// ── Travel chrome ────────────────────────────────────────────────────────────

/**
 * Used when the page doesn't declare its palette: the travel app's paper look
 * (apps/travel/web/app/globals.css, the trip pages' header) with the compass in
 * the scrapbook's terracotta.
 */
const TRAVEL_HOME_LOOK: Vizf1Look = {
  header: { bg: '#fffdf8', fg: '#2b2419', link: '#8a8172', line: '#e2d9c8' },
  footer: { bg: '#f6f1e7', fg: '#2b2419', link: '#8a8172', line: '#e2d9c8' },
  mark: '#c94f2c',
}

/** The bars in the page's own palette, the compass in its accent. */
function travelThemedLook(t: ThemeColors): Vizf1Look {
  const bg = t.background!
  const surface = t.surface ?? bg
  const line = t.line ?? t.muted!
  return {
    header: { bg: surface, fg: t.text!, link: t.muted!, line },
    footer: { bg, fg: t.text!, link: t.muted!, line },
    mark: t.accent ?? TRAVEL_HOME_LOOK.mark,
  }
}

/** A compass rose in `currentColor`: the travel app's 🧭, drawn so it takes the page's accent. */
const TRAVEL_MARK = `<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="16" cy="16" r="13.5" stroke="currentColor" stroke-width="2"/><path d="M16 6.5 19 16h-6z" fill="currentColor"/><path d="M13 16h6l-3 9.5z" fill="currentColor" opacity=".4"/><circle cx="16" cy="16" r="1.5" fill="var(--bg)"/></svg>`

const TRAVEL_BAR_STYLE = `
:host{all:initial;display:block;position:sticky;top:0;z-index:30;background:var(--bg);color:var(--fg);font:14px/1.4 Manrope,-apple-system,'Segoe UI',Roboto,sans-serif}
*{box-sizing:border-box}
a{color:inherit;text-decoration:none}
svg{display:block}
.bar{display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:1600px;margin:0 auto;padding:0 clamp(16px,4vw,48px)}
.mono{font-family:'Space Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;letter-spacing:1.4px;text-transform:uppercase}
.link{color:var(--link);transition:color .2s;display:inline-flex;align-items:center;gap:6px}
.link:hover,.link:focus-visible{color:var(--fg)}
.brand{display:flex;align-items:center;gap:10px;font:600 19px/1 Lora,Georgia,serif;letter-spacing:-.01em}
.brand svg{width:26px;height:26px;color:var(--mark)}
a:focus-visible{outline:2px solid var(--mark);outline-offset:3px;border-radius:4px}
`

function travelBarStyle(c: BarColors, mark: string): string {
  return `:host{--bg:${c.bg};--fg:${c.fg};--link:${c.link};--line:${c.line};--mark:${mark}}${TRAVEL_BAR_STYLE}`
}

/**
 * The header links back to the trip the page names (<meta name="travel:trip">):
 * its journey map, behind the same password. Without one, just the brand.
 */
function travelHeaderHtml(site: string, look: Vizf1Look, trip: string | null): string {
  const back = trip ? `<a class="link mono" href="${site}/t/${trip}">Journey map <span aria-hidden="true">&rarr;</span></a>` : ''
  return `<travel-header><template shadowrootmode="open"><style>${travelBarStyle(look.header, look.mark)}
:host{border-bottom:1px solid var(--line)}
.bar{height:56px}
@media (max-width:480px){.bar{height:48px}.brand{font-size:17px}.brand svg{width:22px;height:22px}}
</style><div class="bar" role="banner"><a class="brand" href="${trip ? `${site}/t/${trip}` : `${site}/`}" aria-label="Trips home">${TRAVEL_MARK}<span>Trips</span></a><nav aria-label="trip">${back}</nav></div></template></travel-header>`
}

function travelFooterHtml(site: string, look: Vizf1Look, trip: string | null): string {
  const year = new Date().getUTCFullYear()
  const links = trip
    ? `<a class="link" href="${site}/t/${trip}">Journey map</a><a class="link" href="${site}/t/${trip}/story">Scrapbook</a>`
    : `<a class="link" href="${site}/">Trips</a>`
  return `<travel-footer><template shadowrootmode="open"><style>${travelBarStyle(look.footer, look.mark)}
:host{border-top:1px solid var(--line)}
.bar{flex-wrap:wrap;padding-top:28px;padding-bottom:28px}
.brand svg{width:30px;height:30px}
.tag{color:var(--link);margin-top:6px;font-weight:400}
.links{display:flex;flex-wrap:wrap;gap:12px 20px}
</style><div class="bar" role="contentinfo"><span class="brand">${TRAVEL_MARK}<span><span style="display:block">Trips</span><span class="mono tag" style="display:block">Shared with friends and family · © ${year}</span></span></span><nav class="links mono" aria-label="trip">${links}</nav></div></template></travel-footer>`
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
  vizf1: { wide: 61, narrow: 53 },
  viznba: { wide: 61, narrow: 53 },
  travel: { wide: 57, narrow: 49 },
}

function chromeHeightStyle(app: HtmlStoryApp): string {
  const h = CHROME_HEIGHT[app]
  return `<style>:root{--vizmaya-chrome-h:${h.wide}px}@media (max-width:480px){:root{--vizmaya-chrome-h:${h.narrow}px}}</style>`
}

/**
 * A preview hides what a format's runtime adds for the reader to press: every
 * control is marked `.vz-only`, in `.vz-tools` or `.vz-controls`, and
 * `.vz-hint` is the board's gesture hint. With its tour panel hidden the
 * board's camera uses the whole frame, so the board sits centred.
 */
const PREVIEW_STYLE = '<style>.vz-only,.vz-tools,.vz-controls,.vz-hint{display:none!important}</style>'

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
  { siteUrl, aura, app = DEFAULT_HTML_STORY_APP, chrome = true, preview = false, mapboxToken }: BrandingOptions,
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
  } else if (app === 'vizf1') {
    const look = theme ? vizf1ThemedLook(theme) : VIZF1_HOME_LOOK
    header = chromeHeightStyle(app) + (aura ? auraHtml(aura, theme) : '') + vizf1HeaderHtml(site, look)
    footer = vizf1FooterHtml(site, look)
  } else if (app === 'viznba') {
    const look = theme ? viznbaThemedLook(theme) : VIZNBA_HOME_LOOK
    header = chromeHeightStyle(app) + (aura ? auraHtml(aura, theme) : '') + viznbaHeaderHtml(site, look)
    footer = viznbaFooterHtml(site, look)
  } else if (app === 'travel') {
    const look = theme ? travelThemedLook(theme) : TRAVEL_HOME_LOOK
    const trip = extractTripMeta(html)
    header = chromeHeightStyle(app) + (aura ? auraHtml(aura, theme) : '') + travelHeaderHtml(site, look, trip)
    footer = travelFooterHtml(site, look, trip)
  } else {
    const look = theme ? themedLook(theme) : HOME_LOOK
    header = chromeHeightStyle(app) + (aura ? auraHtml(aura, theme) : '') + headerHtml(site, look)
    footer = footerHtml(site, look) + riveScript(site, look)
  }

  if (preview) header = PREVIEW_STYLE + header

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
  out = out.slice(0, at) + footer + out.slice(at)

  // The Mapbox token goes first in <head>, so it is set before any of the
  // story's scripts read it.
  const tokenScript = mapboxTokenScript(html, storyMapboxToken(mapboxToken))
  if (!tokenScript) return out
  const open = /<head\b[^>]*>/i.exec(out) ?? /<html\b[^>]*>/i.exec(out) ?? /<!doctype[^>]*>/i.exec(out)
  const headAt = open ? open.index + open[0].length : 0
  return out.slice(0, headAt) + tokenScript + out.slice(headAt)
}
