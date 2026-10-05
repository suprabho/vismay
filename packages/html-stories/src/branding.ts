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
 * sandbox, so every asset is an absolute URL: the Rive runtime comes from a
 * CDN and the `.riv` from the site, which serves it with CORS for this.
 */

/** Pinned to the version the apps' `@rive-app/canvas` resolves to. */
const RIVE_RUNTIME = 'https://cdn.jsdelivr.net/npm/@rive-app/canvas@2.37.7/rive.js'

export interface BrandingOptions {
  /** e.g. https://vizmaya.fyi. Logo assets and links resolve against it. */
  siteUrl: string
}

const BAR_STYLE = `
:host{all:initial;display:block;position:relative;z-index:1;background:#0a0e14;color:#e0ddd5;font:14px/1.4 Inter,-apple-system,'Segoe UI',Roboto,sans-serif}
*{box-sizing:border-box}
a{color:inherit;text-decoration:none}
.bar{display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:1600px;margin:0 auto;padding:0 clamp(16px,4vw,40px)}
.mono{font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;letter-spacing:.15em;text-transform:uppercase}
.link{color:#8a989e;transition:color .2s}
.link:hover,.link:focus-visible{color:#D85A30}
a:focus-visible{outline:2px solid #D85A30;outline-offset:3px;border-radius:4px}
`

function headerHtml(site: string): string {
  return `<vizmaya-header><template shadowrootmode="open"><style>${BAR_STYLE}
:host{border-bottom:1px solid #1a2830}
.bar{height:64px}
.home{position:relative;display:block;width:180px;height:44px}
canvas{display:block;width:100%;height:100%}
.fallback{position:absolute;inset:0;display:flex;align-items:center;gap:10px}
.fallback img{width:32px;height:32px}
.fallback span{font-family:Fraunces,Georgia,serif;font-size:22px;letter-spacing:-.01em}
:host([data-ready]) .fallback{display:none}
@media (max-width:480px){.home{width:150px;height:36px}.bar{height:56px}}
</style><div class="bar" role="banner"><a class="home" href="${site}/" aria-label="vizmaya home"><canvas aria-hidden="true"></canvas><span class="fallback" aria-hidden="true"><img src="${site}/vizmaya-logo-01.svg" alt=""><span>Vizmaya</span></span></a><a class="mono link" href="${site}/stories">All stories</a></div></template></vizmaya-header>`
}

function footerHtml(site: string): string {
  const year = new Date().getUTCFullYear()
  return `<vizmaya-footer><template shadowrootmode="open"><style>${BAR_STYLE}
:host{border-top:1px solid #1a2830}
.bar{flex-wrap:wrap;padding-top:32px;padding-bottom:32px}
.brand{display:flex;align-items:center;gap:12px}
.brand img{width:40px;height:40px}
.name{font-family:Fraunces,Georgia,serif;font-size:20px;line-height:1.1}
.tag{color:#5a6a70;margin-top:4px}
.links{display:flex;flex-wrap:wrap;gap:12px 20px}
</style><div class="bar" role="contentinfo"><a class="brand" href="${site}/"><img src="${site}/vizmaya-logo-01.svg" alt=""><span><span class="name">Vizmaya</span><span class="mono tag" style="display:block">Data stories · © ${year} Vizmaya Labs</span></span></a><nav class="links mono" aria-label="vizmaya"><a class="link" href="${site}/stories">All stories</a><a class="link" href="https://theasymmetryletter.substack.com" target="_blank" rel="noopener">Newsletter</a><a class="link" href="https://linkedin.com/company/vizmaya-labs" target="_blank" rel="noopener">LinkedIn</a><a class="link" href="https://instagram.com/vizzmaya" target="_blank" rel="noopener">Instagram</a></nav></div></template></vizmaya-footer>`
}

/**
 * Loads the Rive runtime and plays the logo. The static fallback stays if
 * anything fails, and for reduced-motion readers (the logo's first frame is
 * the empty start of its intro, so a paused player would show nothing).
 */
function riveScript(site: string): string {
  const cfg = JSON.stringify({ runtime: RIVE_RUNTIME, src: `${site}/vizmaya-logo.riv` })
  return `<script>(function(c){try{
var host=document.querySelector('vizmaya-header'),root=host&&host.shadowRoot,canvas=root&&root.querySelector('canvas');
if(!canvas||(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches))return;
var s=document.createElement('script');s.src=c.runtime;s.async=true;
s.onload=function(){try{
var r=new window.rive.Rive({src:c.src,canvas:canvas,autoplay:true,autoBind:true,onLoad:function(){
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
