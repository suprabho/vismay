import { FORMAT_RUNTIME_MAJOR } from '@vismay/html-stories/formats'
import {
  CONTACT,
  HOME_STAGE_MESSAGE,
  MARK,
  PALETTE,
  PROCESS,
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
 * The whole home page as an HTML story in one of the hosted formats: a book
 * you turn, a board you tour, a deck you step through. Each carries all of
 * it (the statement and the numbers, the stories, Doom v Boom, the epics, the
 * studio and how to reach it) as one complete document on the format runtimes
 * (/formats/<format>@1.js, sources in packages/html-stories/formats), served
 * at /home-stage/<format> and framed full-screen by the home page, which
 * swaps between them and its own scrolling version.
 *
 * A runtime takes over the whole document it runs in (it keys its layout off
 * classes on <html> and starts once), so swapping formats means swapping
 * documents. Each one reports back to the page around it: `ready` once its
 * runtime is on, `linear` when the reader asks for the one-page view, which
 * the page answers with its scroll version (the fallback). Without the
 * runtime, every document still reads as one column.
 */

export interface HomeStageInput {
  /** The newest stories, capped, in order. */
  stories: HomeStory[]
  /** Every published story, for "All N stories". */
  total: number
  epics: HomeEpic[]
  /** The latest Doom v Boom editions, newest first. */
  editions: HomeDailyEdition[]
  /** The lede's numbers (homeStats). */
  stats: { n: number; label: string }[]
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
.c1{-webkit-line-clamp:1}.c2{-webkit-line-clamp:2}.c3{-webkit-line-clamp:3}.c4{-webkit-line-clamp:4}.c5{-webkit-line-clamp:5}.c6{-webkit-line-clamp:6}.c7{-webkit-line-clamp:7}
.read{display:inline-flex;align-items:center;gap:8px;text-decoration:none;font:500 14px/1 var(--sans);padding:12px 18px;border-radius:999px;background:var(--paper-ink);color:var(--paper);white-space:nowrap}
.read:hover{background:var(--signal);color:var(--bg)}
.read.hot{background:var(--signal);color:var(--bg)}
.read.hot:hover{background:var(--text)}
.read.ghost{background:transparent;color:inherit;border:1px solid currentColor}
.btns{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.socials{display:flex;gap:16px;font-size:22px}
.socials a{text-decoration:none;opacity:.7}
.socials a:hover{opacity:1;color:var(--signal)}
.pic{position:relative;overflow:hidden;background:var(--sb,var(--surface2))}
.pic img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.pic .glyph{position:absolute;inset:0;display:grid;place-items:center;font:400 180px/1 var(--ss,var(--serif));font-style:italic;color:var(--sa,var(--signal));
  background:radial-gradient(circle at 30% 25%,color-mix(in srgb,var(--sa,var(--signal)) 28%,transparent),transparent 60%),var(--sb,var(--surface2))}
.hi,h1 em,h2 em,h3 em,blockquote em{color:var(--signal)}
.stats{display:grid;grid-template-columns:1fr 1fr;gap:18px 24px;margin:0}
.stats div{margin:0}
.stats dd{margin:0}
.stats b{display:block;font:400 56px/.85 var(--serif);letter-spacing:-.02em;font-variant-numeric:lining-nums}
.stats span{display:block;font-size:14px;margin-top:6px;opacity:.7}
.steps{list-style:none;margin:0;padding:0;display:grid;gap:18px}
.steps li{display:grid;grid-template-columns:48px 1fr;gap:10px}
.steps i{font:400 34px/.8 var(--serif);font-style:italic;color:var(--signal)}
.steps b{display:block;font:400 24px/1.05 var(--serif)}
.steps span{display:block;font-size:14.5px;line-height:1.5;opacity:.75;margin-top:4px}
.earlier{list-style:none;margin:0;padding:0}
.earlier a{display:grid;grid-template-columns:36px 1fr;gap:10px;align-items:baseline;text-decoration:none;padding:7px 0;border-top:1px solid color-mix(in srgb,currentColor 15%,transparent)}
.earlier b{font:400 24px/1 var(--serif);color:var(--signal)}
.earlier span{font-size:14px;line-height:1.35;opacity:.8}
.earlier a:hover span{opacity:1;text-decoration:underline}
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
  return `${esc(words.slice(0, -3).join(' '))} <em>${esc(words.slice(-3).join(' '))}</em>`
}

function statsList(stats: HomeStageInput['stats']): string {
  return `<dl class="stats">${stats
    .map((s) => `<div><dt class="sr">${esc(s.label)}</dt><dd><b data-count="${s.n}">${s.n}</b><span>${esc(s.label)}</span></dd></div>`)
    .join('')}</dl>`
}

function stepsList(): string {
  return `<ol class="steps">${PROCESS.map((p) => `<li><i>${p.n}</i><span><b>${esc(p.title)}</b><span>${esc(p.body)}</span></span></li>`).join('')}</ol>`
}

function score(e: HomeDailyEdition): string {
  return e.score != null ? `<span data-count="${e.score}">${e.score}</span>` : '—'
}

function earlierList(editions: HomeDailyEdition[]): string {
  if (!editions.length) return ''
  return `<ul class="earlier">${editions
    .map((e) => `<li><a href="${esc(e.href)}"><b>${e.score ?? '—'}</b><span class="clamp c1">${esc(e.date)}: ${esc(e.headline)}</span></a></li>`)
    .join('')}</ul>`
}

function socials(): string {
  return `<div class="socials"><a href="${STUDIO.youtube}" aria-label="YouTube"><i class="ph ph-youtube-logo"></i></a><a href="${STUDIO.linkedin}" aria-label="LinkedIn"><i class="ph ph-linkedin-logo"></i></a><a href="${STUDIO.x}" aria-label="X"><i class="ph ph-x-logo"></i></a></div>`
}

function contactButtons(total: number, withArchive: boolean): string {
  return `<div class="btns"><a class="read hot" href="mailto:${STUDIO.email}"><i class="ph ph-envelope-simple" aria-hidden="true"></i> Get in touch</a><a class="read ghost" href="${STUDIO.newsletter}">The Asymmetry Letter <i class="ph ph-arrow-up-right" aria-hidden="true"></i></a>${
    withArchive ? `<a class="read ghost" href="/stories">All ${total} stories <i class="ph ph-arrow-right" aria-hidden="true"></i></a>` : ''
  }</div>`
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
<style>${BASE_CSS}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}${css}</style>
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
/* dark pages: cover, title page, contact, back cover */
.dark{background:var(--surface)!important;color:var(--text)}
.dark .meta{color:var(--dim)}
.cover,.backcover,.titlepage{display:flex;flex-direction:column;justify-content:center;gap:18px}
.cover,.backcover{align-items:center;text-align:center}
.cover-frame{position:absolute;inset:16px;border:1px solid color-mix(in srgb,var(--signal) 55%,transparent);pointer-events:none}
.cover-frame::after{content:'';position:absolute;inset:6px;border:1px solid color-mix(in srgb,var(--signal) 20%,transparent)}
.cover h1{font:400 66px/.92 var(--serif);letter-spacing:-.02em;margin:0;max-width:6ch}
.cover-sub{font:400 16px/1.45 var(--sans);color:var(--muted);max-width:24ch;margin:0}
.titlepage h1{font:400 46px/.95 var(--serif);letter-spacing:-.02em;margin:0}
.foreword p{font:400 15.5px/1.6 var(--sans);color:#3d3a35}
.foreword .stats{border-top:1px solid rgba(23,24,28,.15);padding-top:18px;margin-top:20px}
.backcover h2{color:var(--text);font-size:40px;max-width:10ch;margin:0}
.backcover p{color:var(--muted);max-width:26ch}
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
.epigraph footer{margin-top:18px;font:400 11px/1.4 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--paper-muted)}
/* a story: a plate on the left, its page on the right */
.plate-page{padding:0;background:var(--sb);color:var(--st)}
.plate-page .pic{position:absolute;inset:0 0 120px 0}
.plate-num{position:absolute;left:30px;bottom:24px;font:400 96px/.86 var(--ss,var(--serif));font-style:italic;color:var(--sa);letter-spacing:-.03em}
.story-page{border-top:6px solid var(--sa)}
.story-page .dek{font:400 16.5px/1.55 var(--sans);color:#45423c}
.story-foot{position:absolute;left:40px;right:40px;bottom:52px;display:flex;align-items:flex-end;justify-content:space-between;gap:12px}
.story-foot .meta{max-width:22ch}
/* doom v boom, epics, the studio */
.score{display:flex;align-items:flex-end;gap:14px;margin:0 0 10px}
.score .big{font:400 100px/.82 var(--serif);letter-spacing:-.04em;color:var(--signal);font-variant-numeric:lining-nums}
.score .of{font:400 11px/1.5 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--paper-muted);padding-bottom:6px}
.score .of b{display:block;font:400 24px/1.1 var(--serif);letter-spacing:0;text-transform:none;color:var(--paper-ink)}
.headline{font:400 21px/1.18 var(--serif);margin-bottom:6px!important}
.daily-page .read{margin:10px 0 14px}
.epic-list{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:12px}
.epic-list a{display:block;text-decoration:none;padding:0 0 12px 14px;border-left:3px solid var(--ea);border-bottom:1px solid rgba(23,24,28,.1)}
.epic-list b{display:block;font:400 24px/1.1 var(--serif)}
.epic-list span{font-size:14px;line-height:1.4;color:#55524c}
.epic-list a:hover b{color:var(--signal)}
.quote-page{display:flex;flex-direction:column;justify-content:center;background:#e8e2d6}
.quote-page blockquote{margin:0 0 18px;font:400 36px/1.04 var(--serif);letter-spacing:-.01em}
.quote-page p{font-size:14.5px;line-height:1.55;color:#45423c}
.quote-page a{font-weight:500;text-decoration-color:var(--signal);text-underline-offset:4px}
.contact-page h2{font-size:38px}
.contact-page p{font-size:14.5px;line-height:1.55;color:var(--muted)}
.contact-page .btns{flex-direction:column;align-items:flex-start;margin:16px 0 22px}
`

function renderBook(input: HomeStageInput): string {
  const { stories, total, epics, editions, stats, today } = input
  const [edition, ...earlier] = editions
  const shelf = epics.slice(0, 5)
  const year = today.slice(-4)

  // Page numbers are only known once every page is in, so the contents and
  // anything else that points ahead carries a {{page:key}} token, filled last.
  const pages: string[] = []
  const at: Record<string, number> = {}
  const add = (html: string, key?: string) => {
    pages.push(html)
    if (key) at[key] = pages.length
  }
  // A story's plate is a left-hand page: page 2, 4, 6… (an odd 0-based index).
  const fillToLeft = () => {
    if (pages.length % 2 === 0)
      add(`<article class="page epigraph bare" data-unit data-label="Epigraph">
  <blockquote>The map does the argument. The prose does <em>the meaning.</em></blockquote>
  <footer>${esc(STUDIO.name)}</footer>
</article>`)
  }

  add(`<article class="page cover dark bare" data-unit data-label="Cover">
  <div class="cover-frame" aria-hidden="true"></div>
  ${penrose(84)}
  <h1><em>Vizmaya</em> Labs</h1>
  <p class="cover-sub">Visual stories on geopolitics, technology and the asymmetries that reshape markets</p>
  <p class="meta">Volume ${esc(year)} · ${esc(today)}</p>
</article>`)

  add(`<article class="page endpaper bare book-only" data-unit data-label="How to read">
  <div class="bookplate">
    <h3>How to read this book</h3>
    <ul>
      <li><i class="ph ph-hand-tap" aria-hidden="true"></i><span>Tap the right page to turn forward, the left page to go back.</span></li>
      <li><i class="ph ph-hand-grabbing" aria-hidden="true"></i><span>Or take hold of a page and drag it across.</span></li>
      <li><i class="ph ph-keyboard" aria-hidden="true"></i><span>The arrow keys work too.</span></li>
      <li><i class="ph ph-list-numbers" aria-hidden="true"></i><span>The contents page jumps straight to a story.</span></li>
    </ul>
  </div>
</article>`)

  add(`<article class="page titlepage dark bare" data-unit data-label="Title page">
  ${penrose(52)}
  <h1>${statement()}</h1>
  <p class="meta">By the Vizmaya studio · Updated ${esc(today)}</p>
</article>`)

  add(`<article class="page foreword" data-unit data-head="Foreword" data-label="Foreword">
  <h2>A two-person <em>studio</em></h2>
  <p>${esc(STUDIO.deck)}</p>
  ${statsList(stats)}
</article>`)

  // Contents: every story, then the rest of the book, nine lines a page.
  const toc: { n: string; title: string; key: string }[] = [
    ...stories.map((s, i) => ({ n: storyNumber(i), title: s.title, key: `story-${i}` })),
    ...(edition ? [{ n: '·', title: 'Doom v Boom, this morning', key: 'daily' }] : []),
    ...(shelf.length ? [{ n: '·', title: 'The epics', key: 'epics' }] : []),
    { n: '·', title: 'The studio', key: 'studio' },
    { n: '·', title: 'Work with us', key: 'contact' },
  ]
  const tocPages = Math.ceil(toc.length / 9)
  for (let p = 0; p < tocPages; p++) {
    add(`<article class="page" data-unit data-head="Contents" data-label="Contents${p ? ', continued' : ''}">
  <h2 class="toc-title">${p ? 'Contents, <em>continued</em>' : 'Contents'}</h2>
  <ol class="toc">
    ${toc
      .slice(p * 9, p * 9 + 9)
      .map((e) => `<li><button type="button" data-goto="{{page:${e.key}}}"><span class="toc-n">${esc(e.n)}</span><span class="toc-t">${esc(e.title)}</span><span class="toc-p">{{page:${e.key}}}</span></button></li>`)
      .join('\n    ')}
  </ol>
</article>`)
  }

  fillToLeft()
  stories.forEach((s, i) => {
    const num = storyNumber(i)
    add(
      `<article class="page plate-page bare" data-unit data-label="${num}" style="${storyVars(s, i)}">
  <div class="pic">${picture(s)}</div>
  <span class="plate-num">${num}</span>
</article>`,
      `story-${i}`
    )
    add(`<article class="page story-page" data-unit data-head="${esc(s.topic || 'Stories')}" data-label="${esc(s.title)}" style="${storyVars(s, i)}">
  <h2 class="clamp c5">${esc(s.title)}</h2>
  ${s.subtitle ? `<p class="dek clamp c6">${esc(s.subtitle)}</p>` : ''}
  <div class="story-foot"><p class="meta">${storyMeta(s)}</p><a class="read" href="${esc(storyHref(s))}">Read <i class="ph ph-arrow-right" aria-hidden="true"></i></a></div>
</article>`)
  })

  if (edition) {
    add(
      `<article class="page daily-page" data-unit data-head="Every morning" data-label="Doom v Boom">
  <h2>Doom v Boom, <em>this morning</em></h2>
  <div class="score"><span class="big">${score(edition)}</span><span class="of">Boom Score${edition.score != null ? ' / 100' : ''}<b>${esc(edition.word)}</b></span></div>
  <p class="headline clamp c3">${esc(edition.headline)}</p>
  <p class="meta">${esc(edition.date)}${edition.number != null ? ` · No. ${edition.number}` : ''}</p>
  <a class="read" href="${esc(edition.href)}">Read the edition <i class="ph ph-arrow-right" aria-hidden="true"></i></a>
  ${earlierList(earlier.slice(0, 2))}
</article>`,
      'daily'
    )
  }

  if (shelf.length) {
    add(
      `<article class="page" data-unit data-head="The epics" data-label="Epics">
  <h2>The <em>epics</em></h2>
  <ul class="epic-list">
    ${shelf
      .map(
        (e, i) =>
          `<li><a href="/${esc(e.slug)}" style="--ea:${ACCENTS[i % 3]}"><b>${esc(e.name)}</b>${e.description ? `<span class="clamp c2">${esc(e.description)}</span>` : ''}</a></li>`
      )
      .join('\n    ')}
  </ul>
</article>`,
      'epics'
    )
  }

  // The studio as a spread: the quote on the left, how we work on the right.
  fillToLeft()
  add(
    `<article class="page quote-page" data-unit data-head="The studio" data-label="The studio">
  <blockquote>The map does the argument. The prose does <em>the meaning.</em></blockquote>
  <p>Vizmaya ${esc(STUDIO.motto.charAt(0).toLowerCase() + STUDIO.motto.slice(1))} Two people who make data stories for others, and publish their own.</p>
  <p><a href="/s/vizmaya-studio">The studio’s own story, as a board →</a></p>
</article>`,
    'studio'
  )
  add(`<article class="page" data-unit data-head="The studio" data-label="How we work">
  <h2>How we <em>work</em></h2>
  ${stepsList()}
</article>`)

  add(
    `<article class="page contact-page dark" data-unit data-head="Work with us" data-label="Work with us">
  <h2>${esc(CONTACT.title.replace(/ better story\?$/, ''))} <em>better story?</em></h2>
  <p class="clamp c7">${esc(CONTACT.body)}</p>
  ${contactButtons(total, false)}
  ${socials()}
</article>`,
    'contact'
  )

  // The back cover lands on the back of the last sheet: an even page count.
  if ((pages.length + 1) % 2 === 1) {
    add(`<article class="page epigraph bare book-only" data-unit data-label="Notes">
  <blockquote style="font-size:30px">${esc(STUDIO.motto)}</blockquote>
  <footer>${esc(STUDIO.name)}</footer>
</article>`)
  }
  add(`<article class="page backcover dark bare" data-unit data-label="Back cover">
  ${penrose(60)}
  <h2>There is more where <em>these</em> came from</h2>
  <p>${total} stories in the archive.</p>
  <a class="read hot" href="/stories">All ${total} stories <i class="ph ph-arrow-right" aria-hidden="true"></i></a>
</article>`)

  const body = pages.join('\n').replace(/\{\{page:([\w-]+)\}\}/g, (_, k: string) => String(at[k] ?? 1))
  return (
    head('book', 'Vizmaya Labs, as a book', input.fontUrls, BOOK_CSS) +
    `<main class="stage" aria-label="Vizmaya Labs, as a book">
<div class="pages" data-title="Vizmaya Labs">
${body}
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
.slide .meta{color:var(--sm,var(--muted))}
.slide .vz-folio{color:color-mix(in srgb,var(--st,var(--text)) 45%,transparent);font-family:var(--mono)}
.s-title .in{justify-content:flex-end;padding-bottom:84px}
.s-title .mark{position:absolute;right:72px;top:64px;width:120px}
.s-title .mark svg{display:block;width:100%;height:auto}
.s-title h1{max-width:14ch}
.s-title .lede{font:400 21px/1.55 var(--sans);color:var(--muted);max-width:52ch;margin-top:26px}
.s-title .meta{margin-top:26px;color:var(--dim)}
.s-stats .in{justify-content:center;gap:56px}
.s-stats .stats{grid-template-columns:repeat(4,1fr)}
.s-stats .stats b{font-size:150px}
.s-stats .stats span{font-size:18px;color:var(--muted);opacity:1}
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
.s-daily .headline{font:400 28px/1.2 var(--serif);margin:12px 0;max-width:30ch;color:var(--muted)}
.s-daily .read{margin:16px 0 18px}
.s-daily .earlier{max-width:640px}
.s-epics h2{margin:0 0 28px}
.epic-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;flex:1 1 auto;min-height:0}
.epic-grid a{display:flex;flex-direction:column;justify-content:flex-end;gap:8px;text-decoration:none;padding:22px 24px;border-radius:8px;background:var(--surface2);border:1px solid var(--line);border-top:3px solid var(--ea)}
.epic-grid a:hover{background:#23272d}
.epic-grid b{font:400 32px/1.02 var(--serif)}
.epic-grid span{font-size:16px;line-height:1.45;color:var(--muted)}
.s-studio .cols{grid-template-columns:1.1fr 1fr;align-items:center}
.s-studio blockquote{margin:0;font:400 64px/1 var(--serif);letter-spacing:-.015em}
.s-studio .cap{font-size:18px;line-height:1.6;color:var(--muted);margin-top:22px;max-width:44ch}
.s-studio .steps b{font-size:30px}
.s-studio .steps span{font-size:16px}
.s-contact .in{justify-content:center;align-items:flex-start;gap:22px}
.s-contact h2{max-width:14ch;font-size:84px}
.s-contact p{font:400 19px/1.55 var(--sans);color:var(--muted);max-width:60ch}
@container slide (orientation: portrait){
  .slide h1{font-size:50px}
  .slide h2{font-size:38px}
  .s-title .mark{right:28px;top:36px;width:72px;height:72px}
  .s-title .in{padding-bottom:64px}
  .s-title .lede{font-size:16.5px;margin-top:16px}
  .s-title .meta{margin-top:18px}
  .s-stats .in{gap:28px}
  .s-stats .stats{grid-template-columns:1fr 1fr;gap:28px 20px}
  .s-stats .stats b{font-size:84px}
  .s-stats .stats span{font-size:15px}
  .story-cols{grid-template-columns:1fr;grid-template-rows:40% 1fr;gap:20px}
  .story-cols .pic{order:-1}
  .story .txt{justify-content:flex-start;gap:12px}
  .story .dek{font-size:16px}
  .pic .glyph{font-size:120px}
  .s-daily .row{grid-template-columns:1fr;gap:10px;margin-top:14px}
  .s-daily .big{font-size:130px}
  .s-daily .word{font-size:26px}
  .s-daily .headline{font-size:20px;margin:6px 0}
  .s-daily .read{margin:10px 0 12px}
  .s-epics h2{margin:0 0 16px}
  .epic-grid{grid-template-columns:1fr;gap:10px}
  .epic-grid a{padding:14px 16px;justify-content:center}
  .epic-grid b{font-size:24px}
  .epic-grid span{font-size:14px}
  .s-studio .cols{grid-template-columns:1fr;grid-template-rows:auto 1fr;gap:22px;align-items:start}
  .s-studio blockquote{font-size:36px}
  .s-studio .steps{gap:12px}
  .s-studio .steps b{font-size:22px}
  .s-studio .steps span{font-size:14px}
  .s-contact h2{font-size:44px}
  .s-contact p{font-size:15px}
}
`

function renderDeck(input: HomeStageInput): string {
  const { stories, total, epics, editions, stats, today } = input
  const [edition, ...earlier] = editions
  const slides: string[] = []

  slides.push(`<section class="slide s-title bare" data-unit aria-label="Vizmaya Labs" style="--sb:${P.bg}">
  <div class="mark">${penrose(120)}</div>
  <div class="in">
    <h1>${statement()}</h1>
    <p class="lede">${esc(STUDIO.deck)}</p>
    <p class="meta">By the Vizmaya studio · Updated ${esc(today)}</p>
  </div>
</section>`)

  slides.push(`<section class="slide s-stats" data-unit aria-label="In numbers" style="--sb:${P.surface}">
  <div class="in">
    <h2>A two-person studio, <em>in numbers</em></h2>
    ${statsList(stats)}
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
      <span class="big">${score(edition)}</span>
      <div>
        <p class="word">${esc(edition.word)}</p>
        <p class="headline clamp c3">${esc(edition.headline)}</p>
        <p class="meta">${esc(edition.date)}${edition.number != null ? ` · No. ${edition.number}` : ''}${edition.score != null ? ' · Boom Score / 100' : ''}</p>
        <a class="read hot" href="${esc(edition.href)}">Read this morning’s edition <i class="ph ph-arrow-right" aria-hidden="true"></i></a>
        ${earlierList(earlier.slice(0, 2))}
      </div>
    </div>
  </div>
</section>`)
  }

  const shelf = epics.slice(0, 4)
  if (shelf.length) {
    slides.push(`<section class="slide s-epics" data-unit aria-label="Epics" style="--sb:${P.surface}">
  <div class="in">
    <h2>The <em>epics</em></h2>
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

  slides.push(`<section class="slide s-studio" data-unit aria-label="The studio" style="--sb:${P.surface}">
  <div class="in">
    <div class="cols">
      <div>
        <blockquote>The map does the argument. The prose does <em>the meaning.</em></blockquote>
        <p class="cap hide-portrait">Vizmaya ${esc(STUDIO.motto.charAt(0).toLowerCase() + STUDIO.motto.slice(1))} Two people who make data stories for others, and publish their own.</p>
      </div>
      ${stepsList()}
    </div>
  </div>
</section>`)

  slides.push(`<section class="slide s-contact bare" data-unit aria-label="Work with us" style="--sb:${P.bg}">
  <div class="in">
    ${penrose(64)}
    <h2>${esc(CONTACT.title.replace(/ better story\?$/, ''))} <em>better story?</em></h2>
    <p>${esc(CONTACT.body)}</p>
    ${contactButtons(total, true)}
    ${socials()}
  </div>
</section>`)

  return (
    head('deck', 'Vizmaya Labs, as a deck', input.fontUrls, DECK_CSS) +
    `<main class="stage" aria-label="Vizmaya Labs, as a deck">
<div class="deck" data-title="Vizmaya Labs">
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
.bare-text{color:var(--text)}
.stage[data-surface="whiteboard"] .bare-text{color:${P.paperInk}}
.title-card h1{font:400 104px/.92 var(--serif);letter-spacing:-.03em;margin:0 0 30px}
.title-card p{font-size:23px;line-height:1.55;max-width:44ch;color:var(--board-label)}
.title-card .meta{font-size:15px;margin-top:18px}
.stat b{display:block;font:400 104px/.82 var(--serif);letter-spacing:-.03em}
.stat p{font:400 22px/1.15 var(--serif);margin:8px 0 0}
.story-card .pic{margin:-6px -8px 18px;height:var(--ph,250px);border-radius:3px}
.story-card{border-top:6px solid var(--sa)}
.story-card .sub{color:#45423c}
.go{display:inline-flex;align-items:center;gap:6px;font:500 15px/1 var(--sans);text-decoration:none;color:var(--paper-ink);margin-top:12px}
.go:hover{color:var(--signal)}
.story-card.lead h3{font-size:56px}
.story-card.lead .sub{font-size:21px}
.topic p{font:400 30px/1.05 var(--serif);margin:0}
.topic .meta{color:rgba(23,24,28,.6);font-size:12px}
.daily .big{display:block;font:400 136px/.82 var(--serif);letter-spacing:-.04em;color:var(--signal);margin:2px 0 6px}
.daily b{font:400 26px/1.1 var(--serif)}
.daily .earlier span{font-size:15px}
.daily a,.epics a{color:var(--paper-ink)}
.epics ul{list-style:none;margin:0;padding:0}
.epics li{font-size:17px;line-height:28px}
.epics li a{text-decoration:none;font-weight:600}
.epics li a:hover{color:var(--signal)}
.studio blockquote{margin:0 0 18px;font:400 52px/1 var(--serif);letter-spacing:-.015em}
.studio .cap{font-size:17px;color:#45423c;margin-bottom:24px}
.contact{background:var(--surface)!important;color:var(--text)!important;border:1px solid var(--line2)}
.contact h3{font-size:64px;margin-bottom:18px}
.contact p{color:var(--muted)}
.contact .btns{margin:22px 0 22px}
.vz-panel .tour h2{font:400 32px/1.02 var(--serif)}
.vz-panel .tour p{color:var(--muted)}
.vz-panel .tour .meta{color:var(--dim);margin-bottom:10px}
.tour-link{display:inline-flex;align-items:center;gap:6px;font:500 14px/1 var(--sans);color:var(--signal);text-decoration:none;margin:2px 0 10px}
.tour-link:hover{text-decoration:underline;text-underline-offset:4px}
`

const TILTS = [-1.2, 0.8, -0.4, 1.4, -1.6, 0.5, 1.1, -0.8, 0.3, -1.3, 1.6, -0.5]
const STICKIES = ['gold', 'rose', 'blue', 'sage']

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
  const { stories, total, epics, editions, stats, today } = input
  const [edition, ...earlier] = editions
  const [lead, ...rest] = stories
  const items: string[] = []
  const tour: string[] = []

  // Topics get a sticky each (up to four); every story card runs a string to its own.
  const topics = Array.from(new Set(stories.map((s) => s.topic).filter((t): t is string => Boolean(t)))).slice(0, 4)
  const topicId = (t: string | undefined) => {
    const k = t ? topics.indexOf(t) : -1
    return k >= 0 ? `tp-${k}` : null
  }

  // Left: the statement, the numbers, the lead story, the topics.
  items.push(`<div class="item title-card bare bare-text" id="it-title" style="--x:140;--y:120;--w:1040">
  <h1>${statement()}</h1>
  <p>${esc(STUDIO.deck)}</p>
  <p class="meta">By the Vizmaya studio · Updated ${esc(today)}</p>
</div>`)
  const statIds = stats.map((_, k) => `it-stat-${k}`)
  stats.forEach((s, k) => {
    items.push(`<div class="item sticky ${STICKIES[k % 4]} stat" id="it-stat-${k}" style="--x:${140 + k * 255};--y:860;--w:225;--r:${k % 2 ? 2.2 : -1.8}">
  <b data-count="${s.n}">${s.n}</b>
  <p>${esc(s.label)}</p>
</div>`)
  })
  let leftY = stats.length ? 1180 : 860
  if (lead) {
    items.push(boardCard(lead, 0, 'st-0', { x: 140, y: leftY, w: 1000 }, true, topicId(lead.topic)))
    leftY += 1000
  }
  if (topics.length) {
    topics.forEach((t, k) => {
      const n = stories.filter((s) => s.topic === t).length
      items.push(`<div class="item sticky ${STICKIES[k]} topic" id="tp-${k}" style="--x:${140 + k * 260};--y:${leftY + 60};--w:230;--r:${k % 2 ? 2.5 : -2}">
  <p>${esc(t)}</p>
  <p class="meta">${n} ${n === 1 ? 'story' : 'stories'}</p>
</div>`)
    })
    leftY += 300
  }

  // Right: the rest of the stories in a grid.
  const COLS = [1320, 1840, 2360, 2880]
  const ROW_H = 760
  rest.forEach((s, k) => {
    const i = k + 1
    items.push(boardCard(s, i, `st-${i}`, { x: COLS[k % 4], y: 140 + Math.floor(k / 4) * ROW_H, w: 440 }, false, topicId(s.topic)))
  })
  const gridBottom = rest.length ? 140 + Math.ceil(rest.length / 4) * ROW_H : 0

  // Along the bottom: the daily, the epics, the studio, and how to reach it.
  const y = Math.max(leftY, gridBottom) + 120
  if (edition) {
    items.push(`<div class="item index daily" id="it-daily" style="--x:140;--y:${y};--w:520;--r:-1">
  <h3>Doom v Boom, <em>this morning</em></h3>
  <span class="big">${score(edition)}</span>
  <p><b>${esc(edition.word)}</b></p>
  <p class="clamp c3">${esc(edition.headline)}</p>
  <p class="meta">${esc(edition.date)}${edition.number != null ? ` · No. ${edition.number}` : ''}</p>
  <p><a href="${esc(edition.href)}">Read the edition →</a></p>
  ${earlierList(earlier.slice(0, 2))}
</div>`)
  }
  const shelf = epics.slice(0, 6)
  if (shelf.length) {
    items.push(`<div class="item index epics" id="it-epics" style="--x:${edition ? 720 : 140};--y:${y};--w:460;--r:1.5">
  <h3>The <em>epics</em></h3>
  <ul>
    ${shelf.map((e) => `<li><a href="/${esc(e.slug)}">${esc(e.name)}</a></li>`).join('\n    ')}
  </ul>
</div>`)
  }
  items.push(`<div class="item paper studio" id="it-studio" style="--x:1320;--y:${y};--w:940;--r:-.6">
  <blockquote>The map does the argument. The prose does <em>the meaning.</em></blockquote>
  <p class="cap">Vizmaya ${esc(STUDIO.motto.charAt(0).toLowerCase() + STUDIO.motto.slice(1))} Two people who make data stories for others, and publish their own. <a href="/s/vizmaya-studio">The studio’s own story →</a></p>
  ${stepsList()}
</div>`)
  items.push(`<div class="item paper contact tape" id="it-contact" style="--x:2380;--y:${y};--w:900;--r:.8">
  <h3>${esc(CONTACT.title.replace(/ better story\?$/, ''))} <em>better story?</em></h3>
  <p>${esc(CONTACT.body)}</p>
  ${contactButtons(total, true)}
  ${socials()}
</div>`)
  const height = y + 980

  // The tour follows the page: the statement, each story, the topics, the rest.
  tour.push(`<li data-unit data-target="board">
  <h2>The whole studio, <em>pinned</em> to one board</h2>
  <p>Follow the tour, or drag the board and pinch (or hold ⌘/Ctrl and scroll) to look around. Click any card to fly to it.</p>
</li>`)
  tour.push(`<li data-unit data-target="it-title ${statIds.join(' ')}" data-target-sm="it-title">
  <h2>${statement()}</h2>
  <p>${esc(STUDIO.deck)}</p>
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
  <p>Each string runs from a story to its topic. <a class="tour-link" href="/stories">All ${total} stories →</a></p>
</li>`)
  }
  if (edition) {
    tour.push(`<li data-unit data-target="it-daily">
  <h2>Doom v Boom, <em>every morning</em></h2>
  <p>Each morning we read the previous day of AI data-centre, energy and sustainability news and score it out of 100, where 50 is balanced.</p>
</li>`)
  }
  if (shelf.length) {
    tour.push(`<li data-unit data-target="it-epics">
  <h2>The <em>epics</em></h2>
  <p>Investigations we keep returning to: each a collection of stories with a landing page of its own.</p>
</li>`)
  }
  tour.push(`<li data-unit data-target="it-studio">
  <h2>The <em>studio</em></h2>
  <p>A data brief, an editorial call, then two to four weeks.</p>
</li>`)
  tour.push(`<li data-unit data-target="it-contact">
  <h2>Have data that deserves a <em>better story?</em></h2>
  <p><a class="tour-link" href="mailto:${STUDIO.email}">Get in touch →</a></p>
</li>`)

  return (
    head('board', 'Vizmaya Labs, as a board', input.fontUrls, BOARD_CSS) +
    `<main class="stage" aria-label="Vizmaya Labs, as a pinned board">
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
