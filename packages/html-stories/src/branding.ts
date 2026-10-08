/**
 * Site chrome for agent-authored HTML stories, wrapped around whatever the
 * agent posted: for vizmaya a header with the animated Rive logo and a footer
 * with the static logo mark; for footshorts the app's mark and navigation in
 * its dark bar; for vizf1 the chequered-flag mark and the app's navigation in
 * its paddock-dark bar; for viznba the ball mark and the app's navigation in
 * its court-dark bar. Applied when the page is served (`/s/<slug>`) and in the
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
:host{all:initial;display:block;position:relative;z-index:1;background:var(--bg);color:var(--fg);font:14px/1.4 'Space Grotesk',-apple-system,'Segoe UI',Roboto,sans-serif}
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
.brand svg{width:34px;height:34px}
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
:host{all:initial;display:block;position:relative;z-index:1;background:var(--bg);color:var(--fg);font:14px/1.4 Saira,-apple-system,'Segoe UI',Roboto,sans-serif}
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
  /** The ball's colour: the page's accent, else the brand orange. */
  mark: string
  /** The seams, cut in the bar's own background so the ball reads on any palette. */
  ink: string
}

/**
 * Used when the page doesn't declare its palette: the app's own bar
 * (apps/viznba/web/app/globals.css) with the ball in the brand orange.
 */
const VIZNBA_HOME_LOOK: ViznbaLook = {
  header: { bg: '#0b0d12', fg: '#f5f5f5', link: '#8e8e99', line: '#1f2330' },
  footer: { bg: '#13161d', fg: '#f5f5f5', link: '#8e8e99', line: '#1f2330' },
  mark: '#ff8a3d',
  ink: '#0b0d12',
}

/** The bars in the page's own palette. */
function viznbaThemedLook(t: ThemeColors): ViznbaLook {
  const bg = t.background!
  const surface = t.surface ?? bg
  const line = t.line ?? t.muted!
  return {
    header: { bg, fg: t.text!, link: t.muted!, line },
    footer: { bg: surface, fg: t.text!, link: t.muted!, line },
    mark: t.accent ?? VIZNBA_HOME_LOOK.mark,
    ink: bg,
  }
}

/**
 * The ball mark (apps/viznba/web/components/Logo.tsx): a disc in --mark with
 * its seams in --ink, inlined like the other marks.
 */
const VIZNBA_MARK = `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="var(--mark)"/><path d="M16 1v30M1 16h30M6 5.5c4 3 6 6.5 6 10.5s-2 7.5-6 10.5M26 5.5c-4 3-6 6.5-6 10.5s2 7.5 6 10.5" fill="none" stroke="var(--ink)" stroke-width="1.6"/></svg>`

function viznbaBarStyle(c: BarColors, look: ViznbaLook): string {
  return `:host{--bg:${c.bg};--fg:${c.fg};--link:${c.link};--line:${c.line};--mark:${look.mark};--ink:${look.ink}}${VIZF1_BAR_STYLE}
.brand{font-style:normal;font-weight:800;letter-spacing:-.01em;font-stretch:80%}
.brand svg{width:28px;height:28px}`
}

function viznbaHeaderHtml(site: string, look: ViznbaLook): string {
  const meta = HTML_STORY_APP_META.viznba
  return `<viznba-header><template shadowrootmode="open"><style>${viznbaBarStyle(look.header, look)}
:host{border-bottom:1px solid var(--line)}
.bar{height:60px}
.brand{font-size:20px}
.links{display:flex;gap:20px}
@media (max-width:480px){.bar{height:52px}.brand{font-size:18px}.brand svg{width:24px;height:24px}}
</style><div class="bar" role="banner"><a class="brand" href="${site}/" aria-label="VizNBA home">${VIZNBA_MARK}<span>VizNBA</span></a><nav class="links mono" aria-label="viznba"><a class="link" href="${site}/calendar">Calendar</a><a class="link" href="${site}${meta.storiesPath}">${meta.storiesLabel}</a></nav></div></template></viznba-header>`
}

function viznbaFooterHtml(site: string, look: ViznbaLook): string {
  const year = new Date().getUTCFullYear()
  const meta = HTML_STORY_APP_META.viznba
  return `<viznba-footer><template shadowrootmode="open"><style>${viznbaBarStyle(look.footer, look)}
:host{border-top:1px solid var(--line)}
.bar{flex-wrap:wrap;padding-top:28px;padding-bottom:28px}
.brand svg{width:34px;height:34px}
.name{font-size:18px;line-height:1.1}
.tag{color:var(--link);margin-top:4px;font-weight:400;font-stretch:100%}
.links{display:flex;flex-wrap:wrap;gap:12px 20px}
</style><div class="bar" role="contentinfo"><a class="brand" href="${site}/">${VIZNBA_MARK}<span><span class="name" style="display:block">VizNBA</span><span class="mono tag" style="display:block">The NBA, read through the numbers · © ${year} VizNBA</span></span></a><nav class="links mono" aria-label="viznba"><a class="link" href="${site}/">Feed</a><a class="link" href="${site}/calendar">Calendar</a><a class="link" href="${site}${meta.storiesPath}">${meta.storiesLabel}</a></nav></div></template></viznba-footer>`
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
  } else if (app === 'vizf1') {
    const look = theme ? vizf1ThemedLook(theme) : VIZF1_HOME_LOOK
    header = chromeHeightStyle(app) + (aura ? auraHtml(aura, theme) : '') + vizf1HeaderHtml(site, look)
    footer = vizf1FooterHtml(site, look)
  } else if (app === 'viznba') {
    const look = theme ? viznbaThemedLook(theme) : VIZNBA_HOME_LOOK
    header = chromeHeightStyle(app) + (aura ? auraHtml(aura, theme) : '') + viznbaHeaderHtml(site, look)
    footer = viznbaFooterHtml(site, look)
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
