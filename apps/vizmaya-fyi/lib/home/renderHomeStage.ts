import { FORMAT_RUNTIME_MAJOR } from '@vismay/html-stories/formats'
import {
  HOME_STAGE_MESSAGE,
  MARK,
  PALETTE,
  STUDIO,
  storyHref,
  storyMetaBits,
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

const P = PALETTE

/** The runtime controls' colours (the format reads them as --vz-*). */
const THEME_META = `background:${P.bg}; surface:${P.surface}; text:${P.text}; muted:${P.muted}; line:#2a2c31; accent:${P.signal}; accent2:${P.sky}; teal:${P.mint}`

const FONTS =
  'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Instrument+Sans:wght@400..700&family=Geist+Mono:wght@400;500&display=swap'
const PHOSPHOR = 'https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.2/src/regular/style.css'
const D3 = 'https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js'

const ACCENTS = [P.signal, P.sky, P.mint]

const BASE_CSS = `
:root{
  --bg:${P.bg};--surface:${P.surface};--surface2:${P.surface2};--text:${P.text};--muted:${P.muted};--dim:${P.dim};
  --line:${P.line};--line2:${P.line2};--signal:${P.signal};--sky:${P.sky};--mint:${P.mint};
  --paper:${P.paper};--paper-ink:${P.paperInk};--paper-muted:${P.paperMuted};
  --serif:'Instrument Serif',Georgia,serif;--sans:'Instrument Sans',-apple-system,'Segoe UI',sans-serif;--mono:'Geist Mono',ui-monospace,monospace;
  --vz-accent:var(--signal);
}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--text)}
body{font-family:var(--sans);-webkit-font-smoothing:antialiased}
a{color:inherit}
em{font-style:italic}
:focus-visible{outline:2px solid var(--signal);outline-offset:3px}
.meta{font:400 11px/1.4 var(--mono);letter-spacing:.06em;text-transform:uppercase;margin:0}
.clamp{display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden}
.c1{-webkit-line-clamp:1}.c2{-webkit-line-clamp:2}.c3{-webkit-line-clamp:3}.c4{-webkit-line-clamp:4}.c5{-webkit-line-clamp:5}.c6{-webkit-line-clamp:6}
.read{display:inline-flex;align-items:center;gap:8px;text-decoration:none;font:500 14px/1 var(--sans);padding:12px 18px;border-radius:999px;background:var(--paper-ink);color:var(--paper)}
.read:hover{background:var(--signal);color:var(--bg)}
.pic{position:relative;overflow:hidden;background:var(--sb,var(--surface2))}
.pic img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.pic .glyph{position:absolute;inset:0;display:grid;place-items:center;font:400 180px/1 var(--ss,var(--serif));font-style:italic;color:var(--sa,var(--signal));
  background:radial-gradient(circle at 30% 25%,color-mix(in srgb,var(--sa,var(--signal)) 28%,transparent),transparent 60%),var(--sb,var(--surface2))}
`

/** The Penrose mark: the studio's three mysteries, in the logo's own colours. */
function penrose(size: number, line = 'rgba(238,232,221,.3)'): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 150 150" aria-hidden="true"><path d="M75 28L28 122M75 28l47 94M28 122h94" stroke="${line}" stroke-width="1.2" fill="none"/><circle cx="75" cy="28" r="15" fill="${MARK.teal}"/><circle cx="28" cy="122" r="15" fill="${MARK.pink}"/><circle cx="122" cy="122" r="15" fill="${MARK.blue}"/></svg>`
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

function storyMeta(s: HomeStory): string {
  return storyMetaBits(s).map(esc).join(' · ')
}

/** The statement, with its last three words set in the signal italic. */
function statement(): string {
  const words = STUDIO.statement.split(' ')
  return `${esc(words.slice(0, -3).join(' '))} <em class="hi">${esc(words.slice(-3).join(' '))}</em>`
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
:root{--book-paper:var(--paper);--book-table:radial-gradient(ellipse 70% 60% at 50% 45%,#1d2026 0%,var(--bg) 72%);--book-head:var(--paper-muted)}
.page{position:relative;color:var(--paper-ink);background:var(--paper);font-size:16px;line-height:1.5;padding:46px 40px 52px}
html:not(.book-on) .page{min-height:580px}
.page h2{font:400 36px/1.02 var(--ss,var(--serif));letter-spacing:-.01em;margin:0 0 14px}
.page p{margin:0 0 .7em}
.page .meta{color:var(--paper-muted)}
.vz-head{font-family:var(--serif);font-size:15px}
/* cover and back cover */
.cover,.backcover{background:var(--surface)!important;color:var(--text);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:18px}
.cover-frame{position:absolute;inset:16px;border:1px solid color-mix(in srgb,var(--signal) 55%,transparent);pointer-events:none}
.cover-frame::after{content:'';position:absolute;inset:6px;border:1px solid color-mix(in srgb,var(--signal) 20%,transparent)}
.cover h1{font:400 66px/.92 var(--serif);letter-spacing:-.02em;margin:0;max-width:6ch}
.cover h1 em,.backcover h2 em{color:var(--signal)}
.cover-sub{font:400 16px/1.45 var(--sans);color:var(--muted);max-width:24ch;margin:0}
.cover .meta{color:var(--dim);margin-top:6px}
.backcover h2{color:var(--text);font-size:40px;max-width:10ch;margin:0}
.backcover p{color:var(--muted);max-width:26ch}
.backcover .read{background:var(--signal);color:var(--bg)}
.backcover .read.ghost{background:transparent;color:var(--text);border:1px solid var(--line2)}
/* endpaper: how to read */
.endpaper{background:#e8e2d6;display:flex;align-items:center;justify-content:center}
.bookplate{border:1px solid rgba(23,24,28,.2);padding:26px 24px;max-width:300px}
.bookplate h3{font:400 28px/1.05 var(--serif);margin:0 0 14px}
.bookplate ul{list-style:none;margin:0;padding:0;display:grid;gap:12px;font-size:15px;line-height:1.4}
.bookplate li{display:grid;grid-template-columns:26px 1fr;gap:8px}
.bookplate i{font-size:20px;color:var(--signal)}
/* contents */
.toc-title{font:400 44px/1 var(--serif);letter-spacing:-.02em;margin:0 0 18px}
.toc{list-style:none;margin:0;padding:0;border-top:1px solid rgba(23,24,28,.15)}
.toc button{all:unset;cursor:pointer;display:grid;grid-template-columns:28px 1fr auto;gap:10px;align-items:baseline;width:100%;padding:8px 0;border-bottom:1px solid rgba(23,24,28,.1);font-size:15px;line-height:1.3}
.toc button:hover .toc-t{color:var(--signal)}
.toc button:focus-visible{outline:2px solid var(--signal);outline-offset:2px}
.toc-n,.toc-p{font:400 11px/1 var(--mono);color:var(--paper-muted);font-variant-numeric:tabular-nums}
.toc-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* epigraph */
.epigraph{display:flex;flex-direction:column;justify-content:center;background:#e8e2d6}
.epigraph blockquote{margin:0;font:400 36px/1.08 var(--serif);letter-spacing:-.01em}
.epigraph blockquote em{color:var(--signal)}
.epigraph footer{margin-top:18px;font:400 11px/1.4 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--paper-muted)}
/* a story: a plate on the left, its page on the right */
.plate-page{padding:0;background:var(--sb);color:var(--st)}
.plate-page .pic{position:absolute;inset:0 0 120px 0}
.plate-num{position:absolute;left:30px;bottom:24px;font:400 96px/.86 var(--ss,var(--serif));font-style:italic;color:var(--sa);letter-spacing:-.03em}
.story-page{border-top:6px solid var(--sa)}
.story-page .dek{font:400 16.5px/1.55 var(--sans);color:#45423c}
.story-foot{position:absolute;left:40px;right:40px;bottom:52px;display:flex;align-items:flex-end;justify-content:space-between;gap:12px}
.story-foot .meta{max-width:22ch}
/* doom v boom and epics */
.score{display:flex;align-items:flex-end;gap:14px;margin:4px 0 12px}
.score .big{font:400 116px/.82 var(--serif);letter-spacing:-.04em;color:var(--signal);font-variant-numeric:lining-nums}
.score .of{font:400 11px/1.5 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--paper-muted);padding-bottom:6px}
.score .of b{display:block;font:400 24px/1.1 var(--serif);letter-spacing:0;text-transform:none;color:var(--paper-ink)}
.headline{font:400 22px/1.2 var(--serif)}
.epic-list{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:12px}
.epic-list a{display:block;text-decoration:none;padding:0 0 12px 14px;border-left:3px solid var(--ea);border-bottom:1px solid rgba(23,24,28,.1)}
.epic-list b{display:block;font:400 24px/1.1 var(--serif)}
.epic-list span{font-size:14px;line-height:1.4;color:#55524c}
.epic-list a:hover b{color:var(--signal)}
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
  ${penrose(84)}
  <h1>The <em>Front</em> Page</h1>
  <p class="cover-sub">${topic ? `Every ${esc(topic)} story we have published, bound as a book` : 'Every story we have published, bound as a book'}</p>
  <p class="meta">${esc(STUDIO.name)} · Volume ${esc(year)} · ${esc(today)}</p>
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
  <h2 class="toc-title">${p ? 'Contents, <em>continued</em>' : 'Contents'}</h2>
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
  <blockquote>The map does the argument. The prose does <em>the meaning.</em></blockquote>
  <footer>${esc(STUDIO.name)}</footer>
</article>`)
  }

  stories.forEach((s, i) => {
    const num = storyNumber(i)
    pages.push(`<article class="page plate-page bare" data-unit data-label="${num}" style="${storyVars(s, i)}">
  <div class="pic">${picture(s)}</div>
  <span class="plate-num">${num}</span>
</article>`)
    pages.push(`<article class="page story-page" data-unit data-head="${esc(s.topic || 'Stories')}" data-label="${esc(s.title)}" style="${storyVars(s, i)}">
  <h2 class="clamp c5">${esc(s.title)}</h2>
  ${s.subtitle ? `<p class="dek clamp c6">${esc(s.subtitle)}</p>` : ''}
  <div class="story-foot"><p class="meta">${storyMeta(s)}</p><a class="read" href="${esc(storyHref(s))}">Read <i class="ph ph-arrow-right" aria-hidden="true"></i></a></div>
</article>`)
  })

  if (edition) {
    pages.push(`<article class="page" data-unit data-head="Every morning" data-label="Doom v Boom">
  <h2>Doom v Boom, <em>this morning</em></h2>
  <div class="score"><span class="big">${edition.score != null ? `<span data-count="${edition.score}">${edition.score}</span>` : '—'}</span><span class="of">Boom Score${edition.score != null ? ' / 100' : ''}<b>${esc(edition.word)}</b></span></div>
  <p class="headline clamp c4">${esc(edition.headline)}</p>
  <p class="meta">${esc(edition.date)}${edition.number != null ? ` · No. ${edition.number}` : ''}</p>
  <p style="margin-top:16px"><a class="read" href="${esc(edition.href)}">Read the edition <i class="ph ph-arrow-right" aria-hidden="true"></i></a></p>
</article>`)
  }

  if (shelf.length) {
    pages.push(`<article class="page" data-unit data-head="The epics" data-label="Epics">
  <h2>The epics</h2>
  <ul class="epic-list">
    ${shelf
      .map(
        (e, i) =>
          `<li><a href="/${esc(e.slug)}" style="--ea:${ACCENTS[i % 3]}"><b>${esc(e.name)}</b>${e.description ? `<span class="clamp c2">${esc(e.description)}</span>` : ''}</a></li>`
      )
      .join('\n    ')}
  </ul>
</article>`)
  }

  // The back cover lands on the back of the last sheet: an even page count.
  if ((pages.length + 1) % 2 === 1) {
    pages.push(`<article class="page epigraph bare book-only" data-unit data-label="Notes">
  <blockquote style="font-size:30px">${esc(STUDIO.motto)}</blockquote>
  <footer>${esc(STUDIO.name)}</footer>
</article>`)
  }

  pages.push(`<article class="page backcover bare" data-unit data-label="Back cover">
  ${penrose(60)}
  <h2>There is more where <em>these</em> came from</h2>
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
:root{--deck-table:radial-gradient(ellipse 80% 70% at 50% 40%,#1d2026,var(--bg) 75%);--deck-folio:var(--dim)}
.slide{background:var(--sb,var(--surface));color:var(--st,var(--text));border:1px solid var(--line)}
.slide h1{font:400 92px/.94 var(--serif);letter-spacing:-.025em;margin:0}
.slide h2{font:400 66px/.98 var(--ss,var(--serif));letter-spacing:-.02em;margin:0}
.slide p{margin:0}
.slide em.hi,.slide h2 em{color:var(--signal)}
.slide .meta{color:var(--sm,var(--muted))}
.slide .vz-folio{color:color-mix(in srgb,var(--st,var(--text)) 45%,transparent);font-family:var(--mono)}
.s-title .in{justify-content:flex-end;padding-bottom:84px}
.s-title .mark{position:absolute;right:72px;top:64px}
.s-title h1{max-width:14ch}
.s-title .lede{font:400 21px/1.55 var(--sans);color:var(--muted);max-width:52ch;margin-top:26px}
.s-title .meta{margin-top:26px;color:var(--dim)}
.story-cols{grid-template-columns:1fr 1.08fr;gap:56px}
.story-cols .pic{border-radius:8px}
.story .txt{justify-content:center;gap:20px}
.story .dek{font:400 21px/1.5 var(--sans);color:var(--sm)}
.story .foot{display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-top:8px}
.story .read{background:var(--sa);color:var(--sb)}
.story .read:hover{background:var(--st);color:var(--sb)}
.s-daily .in{justify-content:center}
.s-daily .row{display:grid;grid-template-columns:auto 1fr;gap:56px;align-items:center;margin-top:28px}
.s-daily .big{font:400 240px/.8 var(--serif);letter-spacing:-.05em;color:var(--signal);font-variant-numeric:lining-nums}
.s-daily .word{font:400 34px/1.05 var(--serif)}
.s-daily .headline{font:400 28px/1.2 var(--serif);margin:14px 0 14px;max-width:30ch;color:var(--muted)}
.s-daily .read{background:var(--signal);color:var(--bg);margin-top:18px}
.s-epics h2{margin:0 0 28px}
.epic-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;flex:1 1 auto;min-height:0}
.epic-grid a{display:flex;flex-direction:column;justify-content:flex-end;gap:8px;text-decoration:none;padding:22px 24px;border-radius:8px;background:var(--surface2);border:1px solid var(--line);border-top:3px solid var(--ea)}
.epic-grid a:hover{background:#23272d}
.epic-grid b{font:400 32px/1.02 var(--serif)}
.epic-grid span{font-size:16px;line-height:1.45;color:var(--muted)}
.s-end .in{justify-content:center;align-items:flex-start;gap:22px}
.s-end h2{max-width:13ch}
.s-end p{font:400 21px/1.5 var(--sans);color:var(--muted);max-width:44ch}
.s-end .btns{display:flex;gap:12px;flex-wrap:wrap}
.s-end .read{background:var(--signal);color:var(--bg)}
.s-end .read.ghost{background:transparent;color:var(--text);border:1px solid var(--line2)}
@container slide (orientation: portrait){
  .slide h1{font-size:50px}
  .slide h2{font-size:38px}
  .s-title .mark{right:28px;top:36px;width:72px;height:72px}
  .s-title .in{padding-bottom:64px}
  .s-title .lede{font-size:16.5px;margin-top:16px}
  .s-title .meta{margin-top:18px}
  .story-cols{grid-template-columns:1fr;grid-template-rows:40% 1fr;gap:20px}
  .story-cols .pic{order:-1}
  .story .txt{justify-content:flex-start;gap:12px}
  .story .dek{font-size:16px}
  .pic .glyph{font-size:120px}
  .s-daily .row{grid-template-columns:1fr;gap:12px;margin-top:16px}
  .s-daily .big{font-size:140px}
  .s-daily .word{font-size:26px}
  .s-daily .headline{font-size:21px;margin:8px 0 10px}
  .s-epics h2{margin:0 0 16px}
  .epic-grid{grid-template-columns:1fr;gap:10px}
  .epic-grid a{padding:14px 16px;justify-content:center}
  .epic-grid b{font-size:24px}
  .epic-grid span{font-size:14px}
  .s-end p{font-size:16.5px}
}
`

function renderDeck(input: HomeStageInput): string {
  const { stories, total, topic, epics, edition, today } = input
  const slides: string[] = []

  slides.push(`<section class="slide s-title bare" data-unit aria-label="Title" style="--sb:${P.bg}">
  <div class="mark">${penrose(120)}</div>
  <div class="in">
    <h1>${statement()}</h1>
    <p class="lede">${esc(STUDIO.deck)}</p>
    <p class="meta"><span data-count="${stories.length}">${stories.length}</span> ${topic ? `${esc(topic)} ` : ''}stories · ${esc(today)}</p>
  </div>
</section>`)

  stories.forEach((s, i) => {
    slides.push(`<section class="slide story" data-unit aria-label="${esc(`No. ${storyNumber(i)}: ${s.title}`)}" style="${storyVars(s, i)}">
  <div class="in">
    <div class="cols story-cols">
      <div class="txt">
        <h2 class="clamp c4">${esc(s.title)}</h2>
        ${s.subtitle ? `<p class="dek clamp c4">${esc(s.subtitle)}</p>` : ''}
        <div class="foot"><a class="read" href="${esc(storyHref(s))}">Read the story <i class="ph ph-arrow-right" aria-hidden="true"></i></a><span class="meta">${storyMeta(s)}</span></div>
      </div>
      <div class="pic">${picture(s)}</div>
    </div>
  </div>
</section>`)
  })

  if (edition) {
    slides.push(`<section class="slide s-daily" data-unit aria-label="Doom v Boom" style="--sb:${P.surface}">
  <div class="in">
    <h2>Doom v Boom, <em>this morning</em></h2>
    <div class="row">
      <span class="big">${edition.score != null ? `<span data-count="${edition.score}">${edition.score}</span>` : '—'}</span>
      <div>
        <p class="word">${esc(edition.word)}</p>
        <p class="headline clamp c3">${esc(edition.headline)}</p>
        <p class="meta">${esc(edition.date)}${edition.number != null ? ` · No. ${edition.number}` : ''}${edition.score != null ? ' · Boom Score / 100' : ''}</p>
        <a class="read" href="${esc(edition.href)}">Read this morning’s edition <i class="ph ph-arrow-right" aria-hidden="true"></i></a>
      </div>
    </div>
  </div>
</section>`)
  }

  const shelf = epics.slice(0, 4)
  if (shelf.length) {
    slides.push(`<section class="slide s-epics" data-unit aria-label="Epics" style="--sb:${P.surface}">
  <div class="in">
    <h2>The epics</h2>
    <div class="epic-grid">
      ${shelf
        .map(
          (e, i) =>
            `<a href="/${esc(e.slug)}" style="--ea:${ACCENTS[i % 3]}"><b>${esc(e.name)}</b>${e.description ? `<span class="clamp c2">${esc(e.description)}</span>` : ''}</a>`
        )
        .join('\n      ')}
    </div>
  </div>
</section>`)
  }

  slides.push(`<section class="slide s-end bare" data-unit aria-label="The end" style="--sb:${P.bg}">
  <div class="in">
    ${penrose(64)}
    <h2>There is more where <em>these</em> came from</h2>
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
  --board-felt:${P.surface};--board-felt-2:${P.surface2};--board-edge:#2a2d33;
  --board-string:${P.signal};--board-pin:${P.sky};--board-label:var(--muted);
  --board-paper:${P.paper};--board-card:#f7f3ec;--board-ink:${P.paperInk};--board-ink-muted:${P.paperMuted};
  --sticky-gold:#f3d98b;--sticky-rose:#f7bba7;--sticky-blue:#c3d6ff;--sticky-sage:#bfe8d6;
}
.item h3{font:400 36px/1.02 var(--ss,var(--serif));letter-spacing:-.01em;margin:0 0 10px}
.item h3 a{text-decoration:none}
.item h3 a:hover{text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:5px}
.item p{margin:0 0 .5em;font-size:17px;line-height:1.45}
.item .meta{font-size:13px;margin:8px 0 0}
.title-card{color:var(--text)}
.stage[data-surface="whiteboard"] .title-card{color:${P.paperInk}}
.title-card h1{font:400 112px/.92 var(--serif);letter-spacing:-.03em;margin:0 0 26px}
.title-card h1 em{color:var(--signal)}
.title-card p{font-size:24px;line-height:1.45;max-width:36ch;color:var(--board-label)}
.title-card .meta{font-size:15px;margin-top:18px}
.count .big{display:block;font:400 132px/.8 var(--serif);letter-spacing:-.04em;color:var(--paper-ink)}
.count p{font:400 26px/1.15 var(--serif)}
.story-card .pic{margin:-6px -8px 18px;height:var(--ph,250px);border-radius:3px}
.story-card{border-top:6px solid var(--sa)}
.story-card .sub{color:#45423c}
.story-card .go{display:inline-flex;align-items:center;gap:6px;font:500 15px/1 var(--sans);text-decoration:none;color:var(--paper-ink);margin-top:12px}
.story-card .go:hover{color:var(--signal)}
.story-card.lead h3{font-size:56px}
.story-card.lead .sub{font-size:21px}
.topic p{font:400 30px/1.05 var(--serif);margin:0}
.topic .meta{color:rgba(23,24,28,.6);font-size:12px}
.daily .big{display:block;font:400 136px/.82 var(--serif);letter-spacing:-.04em;color:var(--signal);margin:2px 0 6px}
.daily b{font:400 26px/1.1 var(--serif)}
.daily a,.epics a{color:var(--paper-ink)}
.epics ul{list-style:none;margin:0;padding:0}
.epics li{font-size:17px;line-height:28px}
.epics li a{text-decoration:none;font-weight:600}
.epics li a:hover{color:var(--signal)}
.vz-panel .tour h2{font:400 32px/1.02 var(--serif)}
.vz-panel .tour h2 em{color:var(--signal)}
.vz-panel .tour p{color:var(--muted)}
.vz-panel .tour .meta{color:var(--dim);margin-bottom:10px}
.tour-link{display:inline-flex;align-items:center;gap:6px;font:500 14px/1 var(--sans);color:var(--signal);text-decoration:none;margin:2px 0 10px}
.tour-link:hover{text-decoration:underline;text-underline-offset:4px}
`

const TILTS = [-1.2, 0.8, -0.4, 1.4, -1.6, 0.5, 1.1, -0.8, 0.3, -1.3, 1.6, -0.5]

function boardCard(s: HomeStory, i: number, id: string, pos: { x: number; y: number; w: number }, lead: boolean, pinTo: string | null): string {
  return `<div class="item paper story-card${lead ? ' lead' : ''}" id="${id}"${pinTo ? ` data-pin-to="${pinTo}"` : ''} style="--x:${pos.x};--y:${pos.y};--w:${pos.w};--r:${TILTS[i % TILTS.length]};--ph:${lead ? 520 : 250}px;${storyVars(s, i)}">
  <div class="pic">${picture(s)}</div>
  <h3 class="clamp c3"><a href="${esc(storyHref(s))}">${esc(s.title)}</a></h3>
  ${s.subtitle ? `<p class="sub clamp ${lead ? 'c4' : 'c3'}">${esc(s.subtitle)}</p>` : ''}
  <p class="meta">${storyMeta(s)}</p>
  <a class="go" href="${esc(storyHref(s))}">Read the story <i class="ph ph-arrow-right" aria-hidden="true"></i></a>
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
  <h1>The front page, <em>pinned</em></h1>
  <p>${esc(STUDIO.statement)}</p>
  <p class="meta">${esc(STUDIO.name)} · ${esc(today)}</p>
</div>`)
  items.push(`<div class="item sticky gold count" id="it-count" style="--x:820;--y:520;--w:300;--r:3">
  <span class="big"><span data-count="${total}">${total}</span></span>
  <p>stories published${topic ? `, ${stories.length} of them ${esc(topic)}` : ''}</p>
</div>`)

  // The lead story, large, on the left; the rest in a grid on the right.
  let leftBottom = 700
  if (lead) {
    items.push(boardCard(lead, 0, 'st-0', { x: 140, y: 760, w: 1000 }, true, topicId(lead.topic)))
    leftBottom = 760 + 1000
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
  <h3>Doom v Boom</h3>
  <span class="big">${edition.score != null ? `<span data-count="${edition.score}">${edition.score}</span>` : '—'}</span>
  <p><b>${esc(edition.word)}</b></p>
  <p class="clamp c3">${esc(edition.headline)}</p>
  <p class="meta">${esc(edition.date)}${edition.number != null ? ` · No. ${edition.number}` : ''}</p>
  <p><a href="${esc(edition.href)}">Read the edition →</a></p>
</div>`)
    extras.push('it-daily')
  }
  const shelf = epics.slice(0, 6)
  if (shelf.length) {
    items.push(`<div class="item index epics" id="it-epics" style="--x:${edition ? 700 : 140};--y:${y};--w:460;--r:1.5">
  <h3>The epics</h3>
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
  <h2>Every story, <em>pinned</em> to one board</h2>
  <p>Follow the tour, or drag the board and pinch (or hold ⌘/Ctrl and scroll) to look around. Click any card to fly to it.</p>
</li>`)
  stories.forEach((s, i) => {
    tour.push(`<li data-unit data-target="st-${i}">
  <h2>${esc(s.title)}</h2>
  ${s.subtitle ? `<p>${esc(s.subtitle)}</p>` : ''}
  <p class="meta">${storyMeta(s)}</p>
  <a class="tour-link" href="${esc(storyHref(s))}">Read the story <i class="ph ph-arrow-right" aria-hidden="true"></i></a>
</li>`)
  })
  if (topics.length) {
    tour.push(`<li data-unit data-target="${topics.map((_, k) => `tp-${k}`).join(' ')}">
  <h2>${topics.length === 1 ? 'One topic' : `${topics.length} topics`}</h2>
  <p>Each string runs from a story to its topic.</p>
</li>`)
  }
  if (extras.length) {
    tour.push(`<li data-unit data-target="${extras.join(' ')}">
  <h2>${edition ? 'A daily score, and the epics' : 'The epics'}</h2>
  <p>${edition ? 'Every morning we read the previous day of AI data-centre news and score it out of 100. ' : ''}${shelf.length ? 'The epics are investigations we keep returning to.' : ''}</p>
</li>`)
  }
  tour.push(`<li data-unit data-target="board">
  <h2>There is more where <em>these</em> came from</h2>
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
