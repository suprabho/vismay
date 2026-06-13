/**
 * Self-contained CSS for the bento story grid + themed cards + carousel chrome.
 *
 * Everything is scoped under `.vzg` and the wrapper re-declares the base design
 * tokens, so the grid renders identically whether it sits inside the vizmaya.fyi
 * `.vz` shell (which also gets the `vzg` class) or standalone in the admin app
 * (which has no `.vz` ancestor). Render `<StoryGridStyles />` once per page.
 */
export const storyGridCss = `
.vzg{
  --ink:#0C0C10;--cream:#F4F1EC;--muted:#4A4742;--soft:#2A2824;
  --line:rgba(12,12,16,.08);--line2:rgba(12,12,16,.14);
  --teal:#0BBFAB;--pink:#E84D7A;--blue:#2B4ACF;--accent:#0BBFAB;
  --d:'Fraunces',Georgia,serif;--e:'Fraunces',Georgia,serif;
  --b:'Libre Franklin',-apple-system,sans-serif;--m:'JetBrains Mono',ui-monospace,monospace;
  --gap:16px;
}
.vzg *{box-sizing:border-box}
.vzg a{text-decoration:none;color:inherit}

/* carousel of bento pages */
.vzg .carousel{display:flex;flex-direction:column;gap:18px;height:clamp(460px,calc(100vh - 200px),700px)}
.vzg .carousel-vp{flex:1;overflow:hidden;min-height:0}
.vzg .carousel-track{display:flex;height:100%;transition:transform .55s cubic-bezier(.22,1,.36,1)}
.vzg .carousel-slide{flex:0 0 auto;height:100%}
.vzg .bento-slide{height:100%;display:grid;grid-template-columns:repeat(6,1fr);grid-template-rows:1.08fr 1fr;gap:var(--gap)}
.vzg .bento-slide .bcard.big{grid-column:span 3}
.vzg .bento-slide .bcard.sm{grid-column:span 2}
/* 4-card first page: an asymmetric bento. A wide+tall hero (1) beside a
   narrow+tall card (2), then a wide+short (3) beside a narrow+short (4).
   The top row runs ~2× the bottom; left column ~2× the right. */
.vzg .bento-slide.four{grid-template-rows:2fr 1fr}
.vzg .bento-slide.four .bcard:nth-child(1){grid-column:span 4}
.vzg .bento-slide.four .bcard:nth-child(2){grid-column:span 2}
.vzg .bento-slide.four .bcard:nth-child(3){grid-column:span 4}
.vzg .bento-slide.four .bcard:nth-child(4){grid-column:span 2}

/* Stacked mode (admin) — show every page in a vertical column so all cards are
   on screen at once and drag-reorder works across the whole sequence. */
.vzg.stacked .carousel{height:auto;gap:var(--gap)}
.vzg.stacked .carousel-vp{flex:none;overflow:visible}
.vzg.stacked .carousel-track{flex-direction:column;height:auto;transform:none!important;width:100%!important;gap:var(--gap)}
.vzg.stacked .carousel-slide{width:100%!important;height:auto}
.vzg.stacked .bento-slide,.vzg.stacked .bento-slide.four{height:clamp(420px,58vh,560px)}

/* bento card — every card is themed: a dark base + accent glow (set inline
   from the story/epic theme), rendered in that theme's own typefaces.
   The --bn-* custom properties are supplied per card; site fonts/ink are the
   fallback so an un-themed card still renders. The transition lives on the card
   itself (not the <a>) so a non-anchor wrapper still animates on hover. */
.vzg .bcard{position:relative;display:flex;flex-direction:column;justify-content:space-between;background:#fff;border:1px solid var(--line);border-radius:6px;overflow:hidden;isolation:isolate;min-height:0;transition:transform .35s cubic-bezier(.22,1,.36,1),box-shadow .35s,opacity .3s,border-color .3s}
.vzg .bcard.big{padding:22px 24px}
.vzg .bcard.sm{padding:15px 17px}
.vzg .bcard > *{position:relative;z-index:1}
.vzg .bcard:hover{transform:translateY(-3px);box-shadow:0 18px 42px -20px rgba(0,0,0,.55);opacity:1}
.vzg .bcard.themed{border-color:color-mix(in srgb,var(--bn-text,#fff) 12%,transparent)}
.vzg .bcard-rule{position:absolute;top:0;left:0;right:0;height:3px;background:var(--bn-accent,var(--accent));z-index:3}
.vzg .bcard-k{display:flex;align-items:center;gap:9px;font-family:var(--bn-mono,var(--m));font-size:10px;letter-spacing:1.3px;text-transform:uppercase;color:color-mix(in srgb,var(--bn-text,var(--muted)) 65%,transparent);margin-bottom:10px}
.vzg .bcard.epic .bcard-k{display:block;white-space:nowrap;margin-top:3px;color:var(--bn-accent,var(--accent))}
.vzg .bcard-n{color:var(--bn-accent,var(--accent));font-weight:600}
.vzg .bcard-topic{padding:2px 7px;border:1px solid color-mix(in srgb,var(--bn-text,#000) 25%,transparent);border-radius:999px;font-size:8.5px;letter-spacing:1.1px}
.vzg .bcard-date{margin-left:auto;opacity:.7}
.vzg .bcard-h{font-family:var(--bn-serif,var(--e));font-style:italic;font-weight:400;color:var(--bn-text,var(--ink));line-height:1.14;text-wrap:pretty;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical}
.vzg .bcard.big .bcard-h{font-size:26px;-webkit-line-clamp:3;margin-bottom:8px}
.vzg .bcard.sm .bcard-h{font-size:19px;-webkit-line-clamp:3}
.vzg .bcard-p{font-family:var(--bn-sans,var(--b));font-size:13px;line-height:1.55;color:color-mix(in srgb,var(--bn-text,var(--muted)) 80%,transparent);text-wrap:pretty;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.vzg .bcard-a{margin-top:12px;font-family:var(--bn-mono,var(--m));font-size:10px;letter-spacing:1.3px;text-transform:uppercase;color:var(--bn-accent,var(--accent));opacity:.65}
.vzg .bcard:hover .bcard-a{opacity:1}
.vzg .bcard-foot{display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-family:var(--bn-mono,var(--m));font-size:9.5px;letter-spacing:1.2px;text-transform:uppercase}
.vzg .bcard-meta{color:color-mix(in srgb,var(--bn-text,var(--muted)) 70%,transparent)}
.vzg .bcard.epic .bcard-a{font-weight:600;opacity:1}

/* live aura layered over the themed base for the stories that have one */
.vzg .bcard .bn-aura{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden;border-radius:inherit}
.vzg .bcard .bn-aura iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block;background:transparent}
.vzg .bcard .bn-aura::after{content:'';position:absolute;inset:0;background:linear-gradient(to bottom,color-mix(in srgb,var(--bn-bg,#000) 50%,transparent) 0%,transparent 38%),linear-gradient(to top,color-mix(in srgb,var(--bn-bg,#000) 72%,transparent) 0%,color-mix(in srgb,var(--bn-bg,#000) 24%,transparent) 55%,transparent 100%)}

/* static cover image when no aura is set — shown at full strength with no card
   overlay; the story's own thumbnail carries the look (and text legibility). */
.vzg .bcard .bn-thumb{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden;border-radius:inherit}
.vzg .bcard .bn-thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}

/* carousel controls */
.vzg .carousel-ctrl{display:flex;justify-content:space-between;align-items:center;gap:16px}
.vzg .carousel-dots{display:flex;gap:7px}
.vzg .cdot{width:7px;height:7px;border-radius:999px;border:none;background:rgba(12,12,16,.18);padding:0;cursor:pointer;transition:all .3s}
.vzg .cdot.on{background:var(--accent);transform:scale(1.25)}
.vzg .carousel-nav{display:flex;align-items:center;gap:14px}
.vzg .carousel-all{font-family:var(--m);font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--line2);padding-bottom:2px}
.vzg .carousel-all:hover{color:var(--accent);border-color:var(--accent);opacity:1}
.vzg .carr{width:34px;height:34px;border-radius:999px;border:1px solid var(--line2);background:transparent;font-size:16px;line-height:1;color:var(--ink);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .25s}
.vzg .carr:hover:not(:disabled){background:var(--ink);color:var(--cream);border-color:var(--ink)}
.vzg .carr:disabled{opacity:.3;cursor:default}
.vzg .carousel-count{font-family:var(--m);font-size:11px;letter-spacing:1px;color:var(--muted);min-width:56px;text-align:center}
.vzg .carousel-count i{font-style:normal;opacity:.5;margin:0 2px}

@media(max-width:820px){
  /* Phone: keep the bento carousel PAGINATED — each page reflows the 6-col bento
     into 2 columns: big cards span full width on top, small cards two-up. */
  .vzg .carousel{height:auto;gap:14px}
  .vzg .carousel-vp{flex:none;overflow:hidden}
  .vzg .carousel-track{height:auto}
  .vzg .carousel-slide{height:auto;min-width:0}
  .vzg .bento-slide{height:auto;grid-template-columns:repeat(2,1fr);grid-template-rows:none;grid-auto-rows:minmax(120px,auto);gap:10px}
  .vzg .bento-slide .bcard{min-width:0}
  .vzg .bento-slide .bcard.big{grid-column:span 2}
  .vzg .bento-slide .bcard.sm{grid-column:span 1}
  .vzg .bento-slide.four{grid-template-rows:none}
  .vzg .bento-slide.four .bcard:nth-child(1){grid-column:span 2}
  .vzg .bento-slide.four .bcard:nth-child(2){grid-column:span 1}
  .vzg .bento-slide.four .bcard:nth-child(3){grid-column:span 1}
  .vzg .bento-slide.four .bcard:nth-child(4){grid-column:span 2}
  .vzg .carr,.vzg .carousel-count{display:none}
  .vzg .carousel-ctrl{order:-1;justify-content:space-between;margin:0}
  /* stacked admin grid keeps content-height rows on mobile too */
  .vzg.stacked .bento-slide,.vzg.stacked .bento-slide.four{height:auto}
}
@media(max-width:520px){
  .vzg .bcard.big .bcard-h{font-size:23px}
}
`

export function StoryGridStyles() {
  return <style dangerouslySetInnerHTML={{ __html: storyGridCss }} />
}

export default StoryGridStyles
