import { FORMAT_RUNTIME_MAJOR } from '@vismay/html-stories/formats'
import {
  BRAND,
  HOME_STAGE_MESSAGE,
  STUDIO,
  formatStoryDate,
  storyHref,
  storyNumber,
  storyPalette,
  type HomeDailyEdition,
  type HomeEpic,
  type HomeStageFormat,
  type HomeStory,
} from './homeShape'

/**
 * The home page's front page as an HTML story in one of the hosted formats:
 * a book you turn, a board you tour, a deck you step through. Each is one
 * complete document on the format runtimes (/formats/<format>@1.js, sources
 * in packages/html-stories/formats), served at /home-stage/<format> and
 * framed by the home page, which swaps between them.
 *
 * A runtime takes over the whole document it runs in (it keys its layout off
 * classes on <html> and starts once), so swapping formats means swapping
 * documents. Each one reports back to the page around it: `ready` once its
 * runtime is on, `linear` when the reader asks for the one-page view, which
 * the page answers with its own scrolling list (the fallback). Without the
 * runtime, every document still reads as one column.
 */

export interface HomeStageInput {
  /** The stories to bind, already filtered and capped, in order. */
  stories: HomeStory[]
  /** Every published story, for "All N stories". */
  total: number
  /** The topic the reader filtered by, if any. */
  topic: string | null
  epics: HomeEpic[]
  /** The latest Doom v Boom edition, if there is one. */
  edition: HomeDailyEdition | null
  /** Google Fonts links for the stories' own typefaces. */
  fontUrls: string[]
  /** Today, as the issue date: '9 Oct 2026'. */
  today: string
}

export function renderHomeStage(format: HomeStageFormat, input: HomeStageInput): string {
  if (format === 'book') return renderBook(input)
  if (format === 'board') return renderBoard(input)
  return renderDeck(input)
}

// ── escaping ──────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c])
}

/** Only absolute http(s) or root-relative URLs reach an attribute. */
function safeUrl(u: string | undefined): string | undefined {
  return u && /^(https?:\/\/|\/(?!\/))/i.test(u) ? u : undefined
}

/** A theme font name, as a CSS family list, or undefined if it isn't a plain name. */
function family(name: string | undefined, fallback: string): string | undefined {
  return name && /^[\w \-]{1,60}$/.test(name) ? `'${name}', ${fallback}` : undefined
}

// ── shared pieces ─────────────────────────────────────────────────────────

/** The runtime controls' colours (the format reads them as --vz-*). */
const THEME_META = `background:${BRAND.ink}; surface:#17171d; text:${BRAND.cream}; muted:#8d8a84; line:#2b2b33; accent:${BRAND.teal}; accent2:${BRAND.pink}; teal:${BRAND.teal}`

const FONTS =
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap'
const PHOSPHOR = 'https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.2/src/regular/style.css'
const D3 = 'https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js'

const BASE_CSS = `
:root{
  --ink:${BRAND.ink};--cream:${BRAND.cream};--paper:${BRAND.paper};--muted:${BRAND.muted};
  --teal:${BRAND.teal};--pink:${BRAND.pink};--blue:${BRAND.blue};
  --serif:'Fraunces',Georgia,serif;--sans:'Inter',-apple-system,'Segoe UI',sans-serif;--mono:'JetBrains Mono',ui-monospace,monospace;
  --vz-accent:var(--teal);
}
*{box-sizing:border-box}
html,body{margin:0;background:var(--ink);color:var(--cream)}
body{font-family:var(--sans);-webkit-font-smoothing:antialiased}
a{color:inherit}
:focus-visible{outline:2px solid var(--teal);outline-offset:3px}
.kick{font:500 11px/1.3 var(--mono);letter-spacing:.2em;text-transform:uppercase;margin:0}
.clamp{display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden}
.c1{-webkit-line-clamp:1}.c2{-webkit-line-clamp:2}.c3{-webkit-line-clamp:3}.c4{-webkit-line-clamp:4}.c5{-webkit-line-clamp:5}.c6{-webkit-line-clamp:6}
.pill{display:inline-block;font:500 10px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;padding:5px 8px;border-radius:99px;border:1px solid currentColor;opacity:.75}
.read{display:inline-flex;align-items:center;gap:8px;text-decoration:none;font:500 12px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;padding:12px 16px;border-radius:3px;background:var(--ink);color:var(--cream)}
.read:hover{background:var(--teal);color:var(--ink)}
.pic{position:relative;overflow:hidden;background:var(--sb,var(--ink))}
.pic img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.pic .glyph{position:absolute;inset:0;display:grid;place-items:center;font:600 160px/1 var(--ss,var(--serif));color:var(--sa,var(--teal));
  background:radial-gradient(circle at 30% 25%,color-mix(in srgb,var(--sa,var(--teal)) 30%,transparent),transparent 60%),var(--sb,var(--ink))}
`

/** The Penrose mark: the studio's three mysteries. */
function penrose(size: number, line = 'rgba(244,241,236,.28)'): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 150 150" aria-hidden="true"><path d="M75 28L28 122M75 28l47 94M28 122h94" stroke="${line}" stroke-width="1.2" fill="none"/><circle cx="75" cy="28" r="15" fill="${BRAND.teal}"/><circle cx="28" cy="122" r="15" fill="${BRAND.pink}"/><circle cx="122" cy="122" r="15" fill="${BRAND.blue}"/></svg>`
}

/** A story's own colours and title face, as custom properties for its unit. */
function storyVars(s: HomeStory, i: number): string {
  const p = storyPalette(s, i)
  const serif = family(s.theme?.fonts?.serif, 'Georgia, serif')
  return `--sb:${p.bg};--st:${p.text};--sm:${p.muted};--sa:${p.accent}${serif ? `;--ss:${esc(serif)}` : ''}`
}

/** The story's cover, or its initial in its own colours when it has none. */
function picture(s: HomeStory): string {
  const src = safeUrl(s.thumbnail)
  const initial = (s.title.trim()[0] ?? '·').toUpperCase()
  const glyph = `<span class="glyph" aria-hidden="true">${esc(initial)}</span>`
  // The initial sits under the image, so a cover that fails to load leaves it showing.
  return src ? `${glyph}<img src="${esc(src)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : glyph
}

function kicker(s: HomeStory, i: number): string {
  return `No. ${storyNumber(i)}${s.topic ? ` · ${esc(s.topic)}` : ''}`
}

function storyMeta(s: HomeStory): string {
  const date = formatStoryDate(s.date)
  return [date, s.format].filter(Boolean).map((x) => esc(x)).join(' · ')
}

function head(format: HomeStageFormat, title: string, fontUrls: string[], css: string): string {
  const runtime = `/formats/${format}@${FORMAT_RUNTIME_MAJOR}`
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="robots" content="noindex">
<meta name="vizmaya:theme" content="${THEME_META}">
<meta name="vizmaya:format" content="${format}">
<base target="_top">
<style>:root{--vizmaya-chrome-h:0px}</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
${fontUrls.map((u) => (safeUrl(u) ? `<link rel="stylesheet" href="${esc(u)}">` : '')).join('\n')}
<link rel="stylesheet" href="${PHOSPHOR}">
<link rel="stylesheet" href="${runtime}.css">
<style>${BASE_CSS}${css}</style>
</head>
<body>
`
}

/**
 * Tells the page around the stage when the runtime is on (`ready`) and when
 * the reader switches it to its one-page view (`linear`): the runtimes add
 * and remove html.vz-on for exactly that.
 */
function bridge(format: HomeStageFormat): string {
  return `<script>
(function () {
  var root = document.documentElement, parent = window.parent
  if (!parent || parent === window) return
  var on = false
  function send(event) {
    try { parent.postMessage({ type: ${JSON.stringify(HOME_STAGE_MESSAGE)}, event: event, format: ${JSON.stringify(format)} }, location.origin) } catch (e) {}
  }
  function check() {
    var now = root.classList.contains('vz-on')
    if (now === on) return
    on = now
    send(now ? 'ready' : 'linear')
  }
  new MutationObserver(check).observe(root, { attributes: true, attributeFilter: ['class'] })
  check()
})()
</script>`
}

function tail(format: HomeStageFormat): string {
  return `${format === 'board' ? `<script src="${D3}"></script>\n` : ''}<script src="/formats/${format}@${FORMAT_RUNTIME_MAJOR}.js"></script>
${bridge(format)}
</body>
</html>
`
}

// ── book ──────────────────────────────────────────────────────────────────

const BOOK_CSS = `
:root{--book-paper:var(--paper);--book-table:radial-gradient(ellipse 70% 60% at 50% 45%,#1f1f27 0%,var(--ink) 72%);--book-head:#8a867e}
.page{position:relative;color:var(--ink);background:var(--paper);font-size:16px;line-height:1.5;padding:46px 40px 52px}
html:not(.book-on) .page{min-height:580px}
.page h2{font:600 30px/1.1 var(--ss,var(--serif));letter-spacing:-.015em;margin:14px 0 12px}
.page p{margin:0 0 .7em}
.vz-head{font-family:var(--serif)}
/* cover and back cover: ink leather with a teal frame */
.cover,.backcover{background:var(--ink)!important;color:var(--cream);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:16px}
.cover-frame{position:absolute;inset:16px;border:1px solid rgba(11,191,171,.45);pointer-events:none}
.cover-frame::after{content:'';position:absolute;inset:6px;border:1px solid rgba(11,191,171,.18)}
.cover h1{font:600 52px/.98 var(--serif);letter-spacing:-.02em;margin:0;max-width:7ch}
.cover .kick{color:var(--teal)}
.cover-sub{font:400 17px/1.4 var(--serif);color:rgba(244,241,236,.72);max-width:24ch;margin:0}
.imprint{font:500 11px/1.4 var(--mono);letter-spacing:.18em;text-transform:uppercase;color:rgba(244,241,236,.5);margin:6px 0 0!important}
.backcover h2{color:var(--cream);font-size:34px;max-width:11ch;margin:0}
.backcover p{color:rgba(244,241,236,.7);max-width:26ch}
.backcover .read{background:var(--teal);color:var(--ink)}
.backcover .read.ghost{background:transparent;color:var(--cream);border:1px solid rgba(244,241,236,.3)}
/* endpaper: how to read */
.endpaper{background:#ece7de;display:flex;align-items:center;justify-content:center}
.bookplate{border:1px solid rgba(12,12,16,.2);padding:26px 24px;max-width:300px}
.bookplate h3{font:600 22px/1.15 var(--serif);margin:0 0 14px}
.bookplate ul{list-style:none;margin:0;padding:0;display:grid;gap:12px;font-size:15px;line-height:1.4}
.bookplate li{display:grid;grid-template-columns:26px 1fr;gap:8px}
.bookplate i{font-size:20px;color:var(--teal)}
/* contents */
.toc-title{font:600 34px/1 var(--serif);letter-spacing:-.02em;margin:8px 0 18px}
.toc{list-style:none;margin:0;padding:0;border-top:1px solid rgba(12,12,16,.15)}
.toc button{all:unset;cursor:pointer;display:grid;grid-template-columns:30px 1fr auto;gap:10px;align-items:baseline;width:100%;padding:8px 0;border-bottom:1px solid rgba(12,12,16,.1);font-size:15px;line-height:1.3}
.toc button:hover .toc-t{color:var(--teal)}
.toc button:focus-visible{outline:2px solid var(--teal);outline-offset:2px}
.toc-n{font:500 11px/1 var(--mono);color:#8a867e}
.toc-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.toc-p{font:500 12px/1 var(--mono);color:#8a867e;font-variant-numeric:tabular-nums}
/* epigraph */
.epigraph{display:flex;flex-direction:column;justify-content:center;background:#ece7de}
.epigraph blockquote{margin:0;font:500 30px/1.18 var(--serif);letter-spacing:-.01em}
.epigraph footer{margin-top:18px;font:500 11px/1.4 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:#8a867e}
/* a story: a plate on the left, its page on the right */
.plate-page{padding:0;background:var(--sb);color:var(--st)}
.plate-page .pic{position:absolute;inset:0 0 132px 0}
.plate-cap{position:absolute;left:30px;right:30px;bottom:30px;display:flex;align-items:flex-end;justify-content:space-between;gap:16px}
.plate-num{font:600 76px/.86 var(--ss,var(--serif));color:var(--sa);letter-spacing:-.03em}
.plate-cap .kick{color:var(--sm);text-align:right;max-width:20ch}
.story-page{border-top:6px solid var(--sa)}
.story-page .kick{color:#8a867e}
.story-page .dek{font:400 16.5px/1.5 var(--serif);color:#3d3a35}
.story-foot{position:absolute;left:40px;right:40px;bottom:52px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.story-foot .date{font:500 11px/1.3 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:#8a867e}
/* doom v boom and epics */
.score{display:flex;align-items:flex-end;gap:14px;margin:4px 0 12px}
.score .big{font:600 104px/.85 var(--serif);letter-spacing:-.04em;color:var(--teal);font-variant-numeric:lining-nums}
.score .of{font:500 11px/1.5 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:#8a867e;padding-bottom:6px}
.score .of b{display:block;font:600 19px/1.15 var(--serif);letter-spacing:0;text-transform:none;color:var(--ink)}
.headline{font:500 19px/1.3 var(--serif)}
.small{font:500 11px/1.4 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:#8a867e}
.epic-list{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:12px}
.epic-list a{display:block;text-decoration:none;padding:0 0 12px 14px;border-left:3px solid var(--ea);border-bottom:1px solid rgba(12,12,16,.1)}
.epic-list b{display:block;font:600 19px/1.2 var(--serif)}
.epic-list span{font-size:14px;line-height:1.4;color:#55524c}
.epic-list a:hover b{color:var(--teal)}
`

function renderBook(input: HomeStageInput): string {
  const { stories, total, topic, epics, edition, today } = input
  const year = today.slice(-4)
  const shelf = epics.slice(0, 5)

  // Contents: every story, then the daily and the epics, nine lines a page.
  const tocEntries: { n: string; title: string }[] = [
    ...stories.map((s, i) => ({ n: storyNumber(i), title: s.title })),
    ...(edition ? [{ n: '·', title: 'Doom v Boom, this morning' }] : []),
    ...(shelf.length ? [{ n: '·', title: 'The epics' }] : []),
  ]
  const tocPages = Math.max(1, Math.ceil(tocEntries.length / 9))
  // Cover (1), how to read (2), contents (3…). A story's plate is a left-hand
  // page (an even page number), so an epigraph fills the gap when needed.
  const afterToc = 2 + tocPages // 0-based index of the next page
  const epigraph = afterToc % 2 === 0
  const firstPlate = afterToc + (epigraph ? 1 : 0) + 1 // 1-based page number
  const pageOf = (i: number) => firstPlate + i * 2
  const dailyPage = firstPlate + stories.length * 2
  const epicsPage = dailyPage + (edition ? 1 : 0)
  const tocTargets = [
    ...stories.map((_, i) => pageOf(i)),
    ...(edition ? [dailyPage] : []),
    ...(shelf.length ? [epicsPage] : []),
  ]

  const pages: string[] = []
  pages.push(`<article class="page cover bare" data-unit data-label="Cover">
  <div class="cover-frame" aria-hidden="true"></div>
  <p class="kick">${esc(STUDIO.name)}</p>
  <h1>The Front Page</h1>
  <p class="cover-sub">${topic ? `Every ${esc(topic)} story we have published, bound as a book` : 'Every story we have published, bound as a book'}</p>
  ${penrose(110)}
  <p class="imprint">Volume ${esc(year)} · ${esc(today)}</p>
</article>`)

  pages.push(`<article class="page endpaper bare book-only" data-unit data-label="How to read">
  <div class="bookplate">
    <h3>How to read this book</h3>
    <ul>
      <li><i class="ph ph-hand-tap" aria-hidden="true"></i><span>Tap the right page to turn forward, the left page to go back.</span></li>
      <li><i class="ph ph-hand-grabbing" aria-hidden="true"></i><span>Or take hold of a page and drag it across.</span></li>
      <li><i class="ph ph-keyboard" aria-hidden="true"></i><span>The arrow keys work too, once you have clicked the book.</span></li>
      <li><i class="ph ph-list-numbers" aria-hidden="true"></i><span>The contents page jumps straight to a story.</span></li>
    </ul>
  </div>
</article>`)

  for (let p = 0; p < tocPages; p++) {
    const chunk = tocEntries.slice(p * 9, p * 9 + 9)
    pages.push(`<article class="page" data-unit data-head="Contents" data-label="Contents${p ? ', continued' : ''}">
  <p class="kick" style="color:#8a867e">${esc(STUDIO.name)} · ${esc(today)}</p>
  <h2 class="toc-title">${p ? 'Contents, continued' : 'Contents'}</h2>
  <ol class="toc">
    ${chunk
      .map((e, k) => {
        const target = tocTargets[p * 9 + k]
        return `<li><button type="button" data-goto="${target}"><span class="toc-n">${esc(e.n)}</span><span class="toc-t">${esc(e.title)}</span><span class="toc-p">${target}</span></button></li>`
      })
      .join('\n    ')}
  </ol>
</article>`)
  }

  if (epigraph) {
    pages.push(`<article class="page epigraph bare" data-unit data-label="Epigraph">
  <blockquote>The map does the argument. The prose does the meaning.</blockquote>
  <footer>${esc(STUDIO.name)}</footer>
</article>`)
  }

  stories.forEach((s, i) => {
    const num = storyNumber(i)
    pages.push(`<article class="page plate-page bare" data-unit data-label="${num}" style="${storyVars(s, i)}">
  <div class="pic">${picture(s)}</div>
  <div class="plate-cap"><span class="plate-num">${num}</span>${s.topic ? `<span class="kick">${esc(s.topic)}</span>` : ''}</div>
</article>`)
    pages.push(`<article class="page story-page" data-unit data-head="${esc(s.topic || 'Stories')}" data-label="${esc(s.title)}" style="${storyVars(s, i)}">
  <p class="kick">${kicker(s, i)}</p>
  <h2 class="clamp c5">${esc(s.title)}</h2>
  ${s.format ? `<span class="pill">${esc(s.format)}</span>` : ''}
  ${s.subtitle ? `<p class="dek clamp ${s.format ? 'c5' : 'c6'}" style="margin-top:12px">${esc(s.subtitle)}</p>` : ''}
  <div class="story-foot"><span class="date">${esc(formatStoryDate(s.date))}</span><a class="read" href="${esc(storyHref(s))}">Read <i class="ph ph-arrow-right" aria-hidden="true"></i></a></div>
</article>`)
  })

  if (edition) {
    pages.push(`<article class="page" data-unit data-head="Every morning" data-label="Doom v Boom">
  <p class="kick" style="color:#8a867e">AI Daily · Doom v Boom</p>
  <h2>A score for AI’s day, every morning</h2>
  <div class="score"><span class="big">${edition.score != null ? `<span data-count="${edition.score}">${edition.score}</span>` : '—'}</span><span class="of">Boom Score${edition.score != null ? ' / 100' : ''}<b>${esc(edition.word)}</b></span></div>
  <p class="headline clamp c4">${esc(edition.headline)}</p>
  <p class="small">${esc(edition.date)}${edition.number != null ? ` · No. ${edition.number}` : ''}</p>
  <a class="read" href="${esc(edition.href)}">Read the edition <i class="ph ph-arrow-right" aria-hidden="true"></i></a>
</article>`)
  }

  if (shelf.length) {
    const accents = [BRAND.teal, BRAND.pink, BRAND.blue]
    pages.push(`<article class="page" data-unit data-head="The epics" data-label="Epics">
  <p class="kick" style="color:#8a867e">Epics</p>
  <h2>Investigations we keep returning to</h2>
  <ul class="epic-list">
    ${shelf
      .map(
        (e, i) =>
          `<li><a href="/${esc(e.slug)}" style="--ea:${accents[i % 3]}"><b>${esc(e.name)}</b>${e.description ? `<span class="clamp c2">${esc(e.description)}</span>` : ''}</a></li>`
      )
      .join('\n    ')}
  </ul>
</article>`)
  }

  // The back cover lands on the back of the last sheet: an even page count.
  if ((pages.length + 1) % 2 === 1) {
    pages.push(`<article class="page epigraph bare book-only" data-unit data-label="Notes">
  <blockquote style="font-size:24px">${esc(STUDIO.motto)}</blockquote>
  <footer>${esc(STUDIO.name)}</footer>
</article>`)
  }

  pages.push(`<article class="page backcover bare" data-unit data-label="Back cover">
  ${penrose(64)}
  <h2>There is more where these came from</h2>
  <p>${total} stories in the archive, and a studio that makes them to order.</p>
  <a class="read" href="/stories">All ${total} stories <i class="ph ph-arrow-right" aria-hidden="true"></i></a>
  <a class="read ghost" href="mailto:${STUDIO.email}">Work with us</a>
</article>`)

  return (
    head('book', 'Vizmaya — the front page, as a book', input.fontUrls, BOOK_CSS) +
    `<main class="stage" aria-label="The Vizmaya front page, as a book">
<div class="pages" data-title="The Front Page">
${pages.join('\n')}
</div>
</main>
` +
    tail('book')
  )
}

// ── deck ──────────────────────────────────────────────────────────────────

const DECK_CSS = `
:root{--deck-table:radial-gradient(ellipse 80% 70% at 50% 40%,#1f1f27,var(--ink) 75%);--deck-folio:rgba(244,241,236,.45)}
.slide{background:var(--sb,#141419);color:var(--st,var(--cream));border:1px solid rgba(244,241,236,.06)}
.slide h1{font:600 74px/1 var(--serif);letter-spacing:-.025em;margin:0}
.slide h2{font:600 54px/1.04 var(--ss,var(--serif));letter-spacing:-.02em;margin:0}
.slide p{margin:0}
.slide .vz-folio{color:color-mix(in srgb,var(--st,var(--cream)) 50%,transparent)}
.s-title .in{justify-content:flex-end;padding-bottom:84px}
.s-title .mark{position:absolute;right:72px;top:64px;opacity:.95}
.s-title h1{max-width:15ch}
.s-title .kick{color:var(--teal);margin-bottom:24px}
.s-title .lede{font:400 21px/1.5 var(--sans);color:rgba(244,241,236,.72);max-width:52ch;margin-top:24px}
.s-title .meta{font:500 12px/1.4 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:rgba(244,241,236,.45);margin-top:28px}
.story-cols{grid-template-columns:1fr 1.08fr;gap:56px}
.story-cols .pic{border-radius:6px}
.story .txt{justify-content:center;gap:18px}
.story .kick{color:var(--sa)}
.story .dek{font:400 21px/1.5 var(--sans);color:var(--sm)}
.story .foot{display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-top:8px}
.story .date{font:500 12px/1.3 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--sm)}
.story .read{background:var(--sa);color:var(--sb)}
.story .read:hover{background:var(--st);color:var(--sb)}
.s-daily .in{justify-content:center}
.s-daily .kick{color:var(--teal)}
.s-daily .row{display:grid;grid-template-columns:auto 1fr;gap:56px;align-items:center;margin-top:28px}
.s-daily .big{font:600 220px/.8 var(--serif);letter-spacing:-.05em;color:var(--teal);font-variant-numeric:lining-nums}
.s-daily .word{font:600 30px/1.1 var(--serif)}
.s-daily .headline{font:500 26px/1.3 var(--serif);margin:14px 0 20px;max-width:30ch}
.s-daily .read{background:var(--teal);color:var(--ink)}
.s-epics .kick{color:var(--pink)}
.s-epics h2{margin:16px 0 28px}
.epic-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;flex:1 1 auto;min-height:0}
.epic-grid a{display:flex;flex-direction:column;justify-content:flex-end;gap:8px;text-decoration:none;padding:22px 24px;border-radius:6px;background:rgba(244,241,236,.04);border:1px solid rgba(244,241,236,.08);border-top:3px solid var(--ea)}
.epic-grid a:hover{background:rgba(244,241,236,.08)}
.epic-grid b{font:600 26px/1.1 var(--serif)}
.epic-grid span{font-size:16px;line-height:1.45;color:rgba(244,241,236,.62)}
.s-end .in{justify-content:center;align-items:flex-start;gap:22px}
.s-end h2{max-width:14ch}
.s-end p{font:400 21px/1.5 var(--sans);color:rgba(244,241,236,.7);max-width:44ch}
.s-end .btns{display:flex;gap:12px;flex-wrap:wrap}
.s-end .read{background:var(--teal);color:var(--ink)}
.s-end .read.ghost{background:transparent;color:var(--cream);border:1px solid rgba(244,241,236,.3)}
@container slide (orientation: portrait){
  .slide h1{font-size:40px}
  .slide h2{font-size:30px}
  .s-title .mark{right:28px;top:36px;width:84px;height:84px}
  .s-title .in{padding-bottom:64px}
  .s-title .lede{font-size:16.5px;margin-top:16px}
  .s-title .meta{margin-top:18px;font-size:11px}
  .story-cols{grid-template-columns:1fr;grid-template-rows:40% 1fr;gap:20px}
  .story-cols .pic{order:-1}
  .story .txt{justify-content:flex-start;gap:12px}
  .story .dek{font-size:16px}
  .pic .glyph{font-size:110px}
  .s-daily .row{grid-template-columns:1fr;gap:12px;margin-top:16px}
  .s-daily .big{font-size:132px}
  .s-daily .word{font-size:22px}
  .s-daily .headline{font-size:19px;margin:8px 0 14px}
  .s-epics h2{margin:12px 0 16px}
  .epic-grid{grid-template-columns:1fr;gap:10px}
  .epic-grid a{padding:14px 16px;justify-content:center}
  .epic-grid b{font-size:19px}
  .epic-grid span{font-size:14px}
  .s-end p{font-size:16.5px}
}
`

function renderDeck(input: HomeStageInput): string {
  const { stories, total, topic, epics, edition, today } = input
  const slides: string[] = []

  slides.push(`<section class="slide s-title bare" data-unit aria-label="Title" style="--sb:${BRAND.ink}">
  <div class="mark">${penrose(132)}</div>
  <div class="in">
    <p class="kick">${esc(STUDIO.name)} · The front page${topic ? ` · ${esc(topic)}` : ''}</p>
    <h1>${esc(STUDIO.statement)}</h1>
    <p class="lede">${esc(STUDIO.deck)}</p>
    <p class="meta"><span data-count="${stories.length}">${stories.length}</span> stories in this deck · ${esc(today)}</p>
  </div>
</section>`)

  stories.forEach((s, i) => {
    slides.push(`<section class="slide story" data-unit aria-label="${esc(`No. ${storyNumber(i)}: ${s.title}`)}" style="${storyVars(s, i)}">
  <div class="in">
    <div class="cols story-cols">
      <div class="txt">
        <p class="kick">${kicker(s, i)}</p>
        <h2 class="clamp c4">${esc(s.title)}</h2>
        ${s.subtitle ? `<p class="dek clamp c4">${esc(s.subtitle)}</p>` : ''}
        <div class="foot"><a class="read" href="${esc(storyHref(s))}">Read the story <i class="ph ph-arrow-right" aria-hidden="true"></i></a><span class="date">${storyMeta(s)}</span></div>
      </div>
      <div class="pic">${picture(s)}</div>
    </div>
  </div>
</section>`)
  })

  if (edition) {
    slides.push(`<section class="slide s-daily" data-unit aria-label="Doom v Boom" style="--sb:#0f1114">
  <div class="in">
    <p class="kick">AI Daily · Doom v Boom · ${esc(edition.date)}</p>
    <div class="row">
      <span class="big">${edition.score != null ? `<span data-count="${edition.score}">${edition.score}</span>` : '—'}</span>
      <div>
        <p class="word">${esc(edition.word)}${edition.score != null ? ' · Boom Score / 100' : ''}</p>
        <p class="headline clamp c3">${esc(edition.headline)}</p>
        <a class="read" href="${esc(edition.href)}">Read this morning’s edition <i class="ph ph-arrow-right" aria-hidden="true"></i></a>
      </div>
    </div>
  </div>
</section>`)
  }

  const shelf = epics.slice(0, 4)
  if (shelf.length) {
    const accents = [BRAND.teal, BRAND.pink, BRAND.blue]
    slides.push(`<section class="slide s-epics" data-unit aria-label="Epics" style="--sb:#121217">
  <div class="in">
    <p class="kick">Epics</p>
    <h2>Investigations we keep returning to</h2>
    <div class="epic-grid">
      ${shelf
        .map(
          (e, i) =>
            `<a href="/${esc(e.slug)}" style="--ea:${accents[i % 3]}"><b>${esc(e.name)}</b>${e.description ? `<span class="clamp c2">${esc(e.description)}</span>` : ''}</a>`
        )
        .join('\n      ')}
    </div>
  </div>
</section>`)
  }

  slides.push(`<section class="slide s-end bare" data-unit aria-label="The end" style="--sb:${BRAND.ink}">
  <div class="in">
    ${penrose(72)}
    <h2>There is more where these came from</h2>
    <p>${total} stories in the archive, and a studio that makes them to order for data companies, research institutions and think tanks.</p>
    <div class="btns"><a class="read" href="/stories">All ${total} stories <i class="ph ph-arrow-right" aria-hidden="true"></i></a><a class="read ghost" href="mailto:${STUDIO.email}">Work with us</a></div>
  </div>
</section>`)

  return (
    head('deck', 'Vizmaya — the front page, as a deck', input.fontUrls, DECK_CSS) +
    `<main class="stage" aria-label="The Vizmaya front page, as a deck">
<div class="deck" data-title="Vizmaya · The front page">
${slides.join('\n')}
</div>
</main>
` +
    tail('deck')
  )
}

// ── board ─────────────────────────────────────────────────────────────────

const BOARD_CSS = `
:root{
  --board-felt:#16161c;--board-felt-2:#1e1e26;--board-edge:#2a2a33;
  --board-string:${BRAND.pink};--board-pin:${BRAND.teal};--board-label:rgba(244,241,236,.7);
  --board-paper:#f4f1ec;--board-card:#fbf9f5;--board-ink:${BRAND.ink};--board-ink-muted:#6b675f;
  --sticky-gold:#f0dc8c;--sticky-rose:#f4b8c9;--sticky-blue:#bfc8f2;--sticky-sage:#b9e6dd;
}
.item h3{font:600 30px/1.12 var(--ss,var(--serif));letter-spacing:-.01em;margin:0 0 10px}
.item h3 a{text-decoration:none}
.item h3 a:hover{text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:4px}
.item p{margin:0 0 .5em;font-size:17px;line-height:1.45}
.item .meta{font:500 13px/1.3 var(--mono);letter-spacing:.1em;text-transform:uppercase;margin:6px 0 0}
.title-card{color:var(--cream)}
.stage[data-surface="whiteboard"] .title-card{color:#1d1d24}
.title-card .kick{color:var(--teal);font-size:16px;margin-bottom:20px}
.title-card h1{font:600 92px/.98 var(--serif);letter-spacing:-.03em;margin:0 0 22px}
.title-card p{font-size:24px;line-height:1.45;max-width:36ch;color:var(--board-label)}
.count .big{display:block;font:600 110px/.85 var(--serif);letter-spacing:-.04em;color:var(--ink)}
.count p{font:500 22px/1.3 var(--serif)}
.story-card .pic{margin:-6px -8px 18px;height:var(--ph,250px);border-radius:2px}
.story-card .kick{color:var(--board-ink-muted);font-size:13px;margin-bottom:10px}
.story-card{border-top:6px solid var(--sa)}
.story-card .sub{color:#45423c}
.story-card .go{display:inline-flex;align-items:center;gap:6px;font:500 13px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;text-decoration:none;color:var(--ink);margin-top:10px}
.story-card .go:hover{color:var(--teal)}
.story-card.lead h3{font-size:46px}
.story-card.lead .sub{font-size:21px}
.topic p{font:600 26px/1.15 var(--serif);margin:0}
.topic .meta{color:rgba(12,12,16,.6)}
.daily .big{display:block;font:600 120px/.85 var(--serif);letter-spacing:-.04em;color:#0a8f80;margin:6px 0 10px}
.daily b{font:600 22px/1.2 var(--serif)}
.daily a,.epics a{color:var(--ink)}
.epics ul{list-style:none;margin:0;padding:0}
.epics li{font-size:17px;line-height:28px}
.epics li a{text-decoration:none;font-weight:600}
.epics li a:hover{color:var(--teal)}
.vz-panel .tour h2{font:600 28px/1.1 var(--serif)}
.vz-panel .tour .kick{color:var(--teal);margin-bottom:10px}
.vz-panel .tour p{color:rgba(244,241,236,.78)}
.tour-link{display:inline-flex;align-items:center;gap:6px;font:500 12px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--teal);text-decoration:none;margin:2px 0 10px}
.tour-link:hover{text-decoration:underline;text-underline-offset:4px}
`

const TILTS = [-1.2, 0.8, -0.4, 1.4, -1.6, 0.5, 1.1, -0.8, 0.3, -1.3, 1.6, -0.5]

function boardCard(s: HomeStory, i: number, id: string, pos: { x: number; y: number; w: number }, lead: boolean, pinTo: string | null): string {
  return `<div class="item paper story-card${lead ? ' lead' : ''}" id="${id}"${pinTo ? ` data-pin-to="${pinTo}"` : ''} style="--x:${pos.x};--y:${pos.y};--w:${pos.w};--r:${TILTS[i % TILTS.length]};--ph:${lead ? 520 : 250}px;${storyVars(s, i)}">
  <div class="pic">${picture(s)}</div>
  <p class="kick">${kicker(s, i)}</p>
  <h3 class="clamp c3"><a href="${esc(storyHref(s))}">${esc(s.title)}</a></h3>
  ${s.subtitle ? `<p class="sub clamp ${lead ? 'c4' : 'c3'}">${esc(s.subtitle)}</p>` : ''}
  <p class="meta">${storyMeta(s)}</p>
  <a class="go" href="${esc(storyHref(s))}">Read <i class="ph ph-arrow-right" aria-hidden="true"></i></a>
</div>`
}

function renderBoard(input: HomeStageInput): string {
  const { stories, total, topic, epics, edition, today } = input
  const [lead, ...rest] = stories
  const items: string[] = []
  const tour: string[] = []

  // Topics get a sticky each (up to four); every story card runs a string to its own.
  const topics = Array.from(new Set(stories.map((s) => s.topic).filter((t): t is string => Boolean(t)))).slice(0, 4)
  const topicId = (t: string | undefined) => {
    const k = t ? topics.indexOf(t) : -1
    return k >= 0 ? `tp-${k}` : null
  }

  items.push(`<div class="item title-card bare" id="it-title" style="--x:140;--y:120;--w:1000">
  <p class="kick">${esc(STUDIO.name)} · ${esc(today)}</p>
  <h1>The front page, pinned</h1>
  <p>${esc(STUDIO.statement)}</p>
</div>`)
  items.push(`<div class="item sticky gold count" id="it-count" style="--x:820;--y:500;--w:300;--r:3">
  <span class="big"><span data-count="${total}">${total}</span></span>
  <p>stories published${topic ? `, ${stories.length} of them ${esc(topic)}` : ''}</p>
</div>`)

  // The lead story, large, on the left; the rest in a grid on the right.
  let leftBottom = 700
  if (lead) {
    items.push(boardCard(lead, 0, 'st-0', { x: 140, y: 740, w: 1000 }, true, topicId(lead.topic)))
    leftBottom = 740 + 1000
  }
  const COLS = [1320, 1840, 2360, 2880]
  const ROW_H = 760
  rest.forEach((s, k) => {
    const i = k + 1
    const pos = { x: COLS[k % 4], y: 140 + Math.floor(k / 4) * ROW_H, w: 440 }
    items.push(boardCard(s, i, `st-${i}`, pos, false, topicId(s.topic)))
  })
  const gridBottom = rest.length ? 140 + Math.ceil(rest.length / 4) * ROW_H : 0

  let y = leftBottom + 80
  if (topics.length) {
    items.push(`<div class="zone-label" style="--x:140;--y:${y - 56};font:500 18px/1 var(--mono);letter-spacing:.2em;text-transform:uppercase">Filed under</div>`)
    const colors = ['gold', 'rose', 'blue', 'sage']
    topics.forEach((t, k) => {
      const n = stories.filter((s) => s.topic === t).length
      items.push(`<div class="item sticky ${colors[k]} topic" id="tp-${k}" style="--x:${140 + k * 260};--y:${y};--w:230;--r:${k % 2 ? 2.5 : -2}">
  <p>${esc(t)}</p>
  <p class="meta">${n} ${n === 1 ? 'story' : 'stories'}</p>
</div>`)
    })
    y += 300
  }
  const extras: string[] = []
  if (edition) {
    items.push(`<div class="item index daily" id="it-daily" style="--x:140;--y:${y};--w:500;--r:-1">
  <p class="meta">AI Daily · Doom v Boom · ${esc(edition.date)}</p>
  <span class="big">${edition.score != null ? `<span data-count="${edition.score}">${edition.score}</span>` : '—'}</span>
  <p><b>${esc(edition.word)}</b></p>
  <p class="clamp c3">${esc(edition.headline)}</p>
  <p><a href="${esc(edition.href)}">Read the edition →</a></p>
</div>`)
    extras.push('it-daily')
  }
  const shelf = epics.slice(0, 6)
  if (shelf.length) {
    items.push(`<div class="item index epics" id="it-epics" style="--x:${edition ? 700 : 140};--y:${y};--w:460;--r:1.5">
  <p class="meta">Epics</p>
  <ul>
    ${shelf.map((e) => `<li><a href="/${esc(e.slug)}">${esc(e.name)}</a></li>`).join('\n    ')}
  </ul>
</div>`)
    extras.push('it-epics')
  }
  if (extras.length) y += 520
  const height = Math.max(2240, y + 120, gridBottom + 120)

  // The tour: the whole board, each story, the topics, the daily and epics, the archive.
  tour.push(`<li data-unit data-target="board">
  <p class="kick">The front page</p>
  <h2>Every story, pinned to one board</h2>
  <p>Follow the tour, or drag the board and pinch (or hold ⌘/Ctrl and scroll) to look around. Click any card to fly to it.</p>
</li>`)
  stories.forEach((s, i) => {
    tour.push(`<li data-unit data-target="st-${i}">
  <p class="kick">${kicker(s, i)}</p>
  <h2>${esc(s.title)}</h2>
  ${s.subtitle ? `<p>${esc(s.subtitle)}</p>` : ''}
  <a class="tour-link" href="${esc(storyHref(s))}">Read the story <i class="ph ph-arrow-right" aria-hidden="true"></i></a>
</li>`)
  })
  if (topics.length) {
    tour.push(`<li data-unit data-target="${topics.map((_, k) => `tp-${k}`).join(' ')}">
  <p class="kick">Filed under</p>
  <h2>${topics.length === 1 ? 'One topic' : `${topics.length} topics`}</h2>
  <p>Each string runs from a story to its topic.</p>
</li>`)
  }
  if (extras.length) {
    tour.push(`<li data-unit data-target="${extras.join(' ')}">
  <p class="kick">Beyond the stories</p>
  <h2>${edition ? 'A daily score, and the epics' : 'The epics'}</h2>
  <p>${edition ? 'Every morning we read the previous day of AI data-centre news and score it out of 100. ' : ''}${shelf.length ? 'The epics are investigations we keep returning to.' : ''}</p>
</li>`)
  }
  tour.push(`<li data-unit data-target="board">
  <p class="kick">That is the board</p>
  <h2>There is more where these came from</h2>
  <p>${total} stories in the archive, and a studio that makes them to order.</p>
  <a class="tour-link" href="/stories">All ${total} stories <i class="ph ph-arrow-right" aria-hidden="true"></i></a>
</li>`)

  return (
    head('board', 'Vizmaya — the front page, as a board', input.fontUrls, BOARD_CSS) +
    `<main class="stage" aria-label="The Vizmaya front page, as a pinned board">
<div class="world" data-width="3400" data-height="${height}">
${items.join('\n')}
</div>
<ol class="tour board-only">
${tour.join('\n')}
</ol>
</main>
` +
    tail('board')
  )
}
