/**
 * Vizmaya chrome for agent-authored HTML stories: a header with the animated
 * Rive logo and a footer with the static logo mark, wrapped around whatever
 * the agent posted. Applied when the page is served (`/s/<slug>`) and in the
 * admin preview, never to the stored HTML, so every published story picks it
 * up without a re-post and the stored HTML stays exactly what the agent wrote.
 *
 * Both bars live in declarative shadow roots, so the story's CSS (a global
 * `header {}` or `a {}` rule) can't restyle them and its scripts don't find
 * them with `document.querySelector`. The page runs in an opaque-origin
 * sandbox, so the static mark is inlined, the Rive runtime comes from a CDN
 * and the `.riv` from the site, which serves it with CORS for this.
 */

/** Pinned to the version the apps' `@rive-app/canvas` resolves to. */
const RIVE_RUNTIME = 'https://cdn.jsdelivr.net/npm/@rive-app/canvas@2.37.7/rive.js'

/**
 * The home page's logo colours (apps/vizmaya-fyi/components/HomeClient.tsx),
 * keyed by the `.riv` view-model property each one drives.
 */
const LOGO_PALETTE: Record<string, string> = {
  textColor: '#111111',
  tealColor: '#0BBFAB',
  accentColor: '#E84D7A',
  accent2Color: '#2B4ACF',
  surfaceColor: '#FFFFFF',
  mutedColor: '#1D1D1D',
  lineColor: '#111111',
}

/**
 * public/vizmaya-logo-01.svg inlined (and recoloured to LOGO_PALETTE) rather
 * than linked: the page's opaque origin sends no cookies, so on a protected
 * Vercel preview an <img> pointing at the site gets a 401 and shows broken.
 */
const LOGO_MARK = `<svg viewBox="0 0 1080 1080" aria-hidden="true"><defs><radialGradient id="g1" cx="489.08" cy="736.38" fx="489.08" fy="736.38" r="340.35" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#f3f3f3" stop-opacity="0"/></radialGradient><radialGradient id="g2" cx="770.86" cy="454.6" fx="770.86" fy="454.6" r="376.42" href="#g1"/><radialGradient id="g3" cx="388.07" cy="341.62" fx="388.07" fy="341.62" r="350.66" href="#g1"/></defs><circle cx="316.43" cy="333.11" r="103" fill="${LOGO_PALETTE.tealColor}"/><circle cx="816.34" cy="394.1" r="103" fill="${LOGO_PALETTE.accentColor}"/><circle cx="513.59" cy="796.53" r="103" fill="${LOGO_PALETTE.accent2Color}"/><path d="M489.12,739.01c-2.77,1.18-5.65.77-6.72-.88-.08-.13-.15-.26-.21-.4l-17.12-32.04-144.06-269.68c24-1.05,47.71-10.47,66.39-28.24l94.39,290.79,11.2,34.5s.02.03.02.05l.13.41c.47,1.92-1.23,4.29-4.02,5.48Z" fill="url(#g1)" stroke="#20201e"/><path d="M778.76,444.05c-2.41-1.81-5.3-2.11-6.74-.76-.11.11-.21.22-.3.34l-24.32,26.99-204.64,227.16c23.05,6.79,43.79,21.63,57.65,43.37l161.51-259.59,19.16-30.8s.02-.03.04-.05l.23-.37c.92-1.75-.16-4.46-2.59-6.29Z" fill="url(#g2)" stroke="#20201e"/><path d="M378.48,340.7c.36-2.99,2.16-5.28,4.12-5.38.16,0,.3,0,.45.01l36.3,1.19,305.58,10.08c-11.09,21.31-14.79,46.55-8.74,71.61l-299.03-63.65-35.48-7.55s-.04,0-.06,0l-.42-.09c-1.9-.55-3.1-3.21-2.74-6.23Z" fill="url(#g3)" stroke="#20201e"/></svg>`

export interface BrandingOptions {
  /** e.g. https://vizmaya.fyi. Logo assets and links resolve against it. */
  siteUrl: string
}

/** Shared by both bars; each sets its own colours to match the home page's nav and footer. */
const BAR_STYLE = `
:host{all:initial;display:block;position:relative;z-index:1;font:14px/1.4 Inter,-apple-system,'Segoe UI',Roboto,sans-serif}
*{box-sizing:border-box}
a{color:inherit;text-decoration:none}
svg{display:block}
.bar{display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:1600px;margin:0 auto;padding:0 clamp(16px,4vw,48px)}
.mono{font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;letter-spacing:1.6px;text-transform:uppercase}
.link{transition:color .2s}
a:focus-visible{outline:2px solid #0BBFAB;outline-offset:3px;border-radius:4px}
`

function headerHtml(site: string): string {
  return `<vizmaya-header><template shadowrootmode="open"><style>${BAR_STYLE}
:host{background:#F4F1EC;color:#0C0C10;border-bottom:1px solid rgba(12,12,16,.1)}
.bar{height:64px}
.link{color:rgba(12,12,16,.45)}
.link:hover,.link:focus-visible{color:#0C0C10}
.home{position:relative;display:block;width:180px;height:44px}
canvas{display:block;width:100%;height:100%}
.fallback{position:absolute;inset:0;display:flex;align-items:center;gap:10px}
.fallback svg{width:32px;height:32px}
.fallback span{font-family:Fraunces,Georgia,serif;font-size:22px;letter-spacing:-.01em}
:host([data-ready]) .fallback{display:none}
@media (max-width:480px){.home{width:150px;height:36px}.bar{height:56px}}
</style><div class="bar" role="banner"><a class="home" href="${site}/" aria-label="vizmaya home"><canvas aria-hidden="true"></canvas><span class="fallback" aria-hidden="true">${LOGO_MARK}<span>Vizmaya</span></span></a><a class="mono link" href="${site}/stories">All stories</a></div></template></vizmaya-header>`
}

function footerHtml(site: string): string {
  const year = new Date().getUTCFullYear()
  return `<vizmaya-footer><template shadowrootmode="open"><style>${BAR_STYLE}
:host{background:#0C0C10;color:#F4F1EC;border-top:1px solid rgba(255,255,255,.06)}
.link{color:rgba(244,241,236,.4)}
.link:hover,.link:focus-visible{color:#F4F1EC}
.bar{flex-wrap:wrap;padding-top:32px;padding-bottom:32px}
.brand{display:flex;align-items:center;gap:12px}
.brand svg{width:40px;height:40px}
.name{font-family:Fraunces,Georgia,serif;font-size:20px;line-height:1.1}
.tag{color:rgba(244,241,236,.4);margin-top:4px}
.links{display:flex;flex-wrap:wrap;gap:12px 20px}
</style><div class="bar" role="contentinfo"><a class="brand" href="${site}/">${LOGO_MARK}<span><span class="name">Vizmaya</span><span class="mono tag" style="display:block">Data stories · © ${year} Vizmaya Labs</span></span></a><nav class="links mono" aria-label="vizmaya"><a class="link" href="${site}/stories">All stories</a><a class="link" href="https://theasymmetryletter.substack.com" target="_blank" rel="noopener">Newsletter</a><a class="link" href="https://linkedin.com/company/vizmaya-labs" target="_blank" rel="noopener">LinkedIn</a><a class="link" href="https://instagram.com/vizzmaya" target="_blank" rel="noopener">Instagram</a></nav></div></template></vizmaya-footer>`
}

/**
 * Loads the Rive runtime and plays the logo. The static fallback stays if
 * anything fails, and for reduced-motion readers (the logo's first frame is
 * the empty start of its intro, so a paused player would show nothing).
 */
function riveScript(site: string): string {
  const cfg = JSON.stringify({ runtime: RIVE_RUNTIME, src: `${site}/vizmaya-logo.riv`, palette: LOGO_PALETTE })
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

/** Wrap a story document in the vizmaya header and footer. */
export function brandHtmlStory(html: string, { siteUrl }: BrandingOptions): string {
  const site = siteUrl.replace(/\/$/, '')
  const header = headerHtml(site)
  const footer = footerHtml(site) + riveScript(site)

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
