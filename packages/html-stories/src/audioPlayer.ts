/**
 * The "Listen" player /s/<slug> injects into a story that has section audio
 * (./audio). A small pill, fixed to the corner in its own shadow root so the
 * page's CSS can't touch it (nor it the page's): play / pause, previous and
 * next section, the section's label and progress.
 *
 * It finds the page's sections with the same rule as ./narration (the
 * outermost [data-unit], else [data-step], else <section>), while the
 * document is still parsing, so before a format runtime moves anything. If
 * the count differs from the manifest's, the page has changed under it and
 * the player stays away.
 *
 * Playing starts at the section the reader is on (the unit a format last
 * entered, or the one across the middle of the screen) and runs on to the
 * end, bringing each section into view as its clip starts: a page turn or a
 * slide in a paged format (by pressing → / ← for the reader, the runtimes'
 * own keys), a scroll otherwise. When the reader turns away from the section
 * being read, the voice follows them to the page they turned to.
 *
 * Builds a string; no Supabase, no cheerio.
 */

import type { HtmlStoryAudioSection } from './audio'
import { NARRATION_SECTION_SELECTORS } from './narrationRule'
import type { ThemeColors } from './meta'

export interface AudioPlayerLook {
  background: string
  text: string
  muted: string
  accent: string
}

const DEFAULT_LOOK: AudioPlayerLook = { background: '#0a0e14', text: '#e0ddd5', muted: '#8a8f98', accent: '#D85A30' }

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** The page's palette (hex only: it goes into CSS) over the default look. */
export function audioPlayerLook(theme: ThemeColors | null): AudioPlayerLook {
  const pick = (v: string | undefined, d: string) => (v && HEX.test(v) ? v : d)
  return {
    background: pick(theme?.background, DEFAULT_LOOK.background),
    text: pick(theme?.text, DEFAULT_LOOK.text),
    muted: pick(theme?.muted, DEFAULT_LOOK.muted),
    accent: pick(theme?.accent, DEFAULT_LOOK.accent),
  }
}

/** JSON safe inside a <script> element. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

const PLAYER_CSS = `
:host{all:initial;position:fixed;left:max(12px,env(safe-area-inset-left));bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483000;font:500 13px/1.3 -apple-system,'Segoe UI',Inter,system-ui,sans-serif;color:var(--fg)}
.bar{display:flex;align-items:center;gap:4px;padding:4px;border-radius:999px;background:var(--bg);border:1px solid color-mix(in srgb,var(--fg) 18%,transparent);box-shadow:0 6px 24px rgba(0,0,0,.28);max-width:calc(100vw - 24px);box-sizing:border-box}
button{all:unset;box-sizing:border-box;display:inline-grid;place-items:center;height:36px;min-width:36px;border-radius:999px;cursor:pointer;color:var(--fg)}
button:focus-visible{outline:2px solid var(--ac);outline-offset:2px}
button:hover{background:color-mix(in srgb,var(--fg) 10%,transparent)}
button[disabled]{opacity:.35;cursor:default;background:none}
.play{background:var(--ac);color:var(--bg);padding:0 14px 0 10px;gap:6px;grid-auto-flow:column}
.play:hover{background:color-mix(in srgb,var(--ac) 85%,var(--fg))}
.bar:not(.on) .play{padding-right:16px}
.icon{width:18px;height:18px;display:block}
.info{display:none;flex-direction:column;min-width:0;max-width:min(240px,46vw);padding:0 6px 0 4px}
.on .info{display:flex}
.label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.meta{font-size:11px;color:var(--mu);font-variant-numeric:tabular-nums}
.track{height:2px;margin-top:4px;border-radius:2px;background:color-mix(in srgb,var(--fg) 15%,transparent);overflow:hidden}
.fill{height:100%;width:0;background:var(--ac)}
.step{display:none}
.on .step{display:inline-grid}
.hint{font-weight:600}
.on .hint{display:none}
@media print{:host{display:none}}
`

/*
 * ES5 on purpose: it runs on every story, in browsers as old as the pages'.
 * Placeholders: __DATA__ (the manifest), __SELECTORS__, __CSS__.
 */
const PLAYER_JS = `(function () {
  'use strict'
  var doc = document, root = doc.documentElement
  var data, node = doc.getElementById('vz-narration')
  try { data = JSON.parse(node.textContent) } catch (e) { return }
  if (!data || !data.sections || !window.HTMLAudioElement || !doc.body.attachShadow) return

  function outermost(sel) {
    var all = [].slice.call(doc.querySelectorAll(sel))
    return all.filter(function (el) {
      for (var p = el.parentElement; p; p = p.parentElement) if (all.indexOf(p) !== -1) return false
      return true
    })
  }
  var units = []
  var sels = __SELECTORS__
  for (var s = 0; s < sels.length && !units.length; s++) units = outermost(sels[s])
  // The page changed since its audio was made: say nothing rather than read the wrong page.
  if (units.length !== data.count) return
  var list = data.sections.filter(function (x) { return x.url && units[x.index] })
  if (!list.length) return

  var reduced = false
  try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches } catch (e) {}

  // -- the pill --
  var host = doc.createElement('vizmaya-listen')
  var shadow = host.attachShadow({ mode: 'open' })
  var ico = function (d) { return '<svg class="icon" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="' + d + '"/></svg>' }
  var I_PLAY = 'M232.4,114.49,88.32,26.35a16,16,0,0,0-16.2-.3A15.86,15.86,0,0,0,64,39.87V216.13A15.94,15.94,0,0,0,80,232a16.07,16.07,0,0,0,8.36-2.35L232.4,141.51a15.81,15.81,0,0,0,0-27Z'
  var I_PAUSE = 'M216,48V208a16,16,0,0,1-16,16H160a16,16,0,0,1-16-16V48a16,16,0,0,1,16-16h40A16,16,0,0,1,216,48ZM96,32H56A16,16,0,0,0,40,48V208a16,16,0,0,0,16,16H96a16,16,0,0,0,16-16V48A16,16,0,0,0,96,32Z'
  var I_PREV = 'M208,47.88V208.12a16,16,0,0,1-24.43,13.43L64,146.77V216a8,8,0,0,1-16,0V40a8,8,0,0,1,16,0v69.23L183.57,34.45A15.95,15.95,0,0,1,208,47.88Z'
  var I_NEXT = 'M208,40V216a8,8,0,0,1-16,0V146.77L72.43,221.55A15.95,15.95,0,0,1,48,208.12V47.88A15.95,15.95,0,0,1,72.43,34.45L192,109.23V40a8,8,0,0,1,16,0Z'
  var I_HEAD = 'M201.89,54.66A103.43,103.43,0,0,0,128.79,24H128A104,104,0,0,0,24,128v56a24,24,0,0,0,24,24H64a24,24,0,0,0,24-24V144a24,24,0,0,0-24-24H40.36A88.12,88.12,0,0,1,190.54,65.93,87.39,87.39,0,0,1,215.65,120H192a24,24,0,0,0-24,24v40a24,24,0,0,0,24,24h24a24,24,0,0,1-24,24H136a8,8,0,0,0,0,16h56a40,40,0,0,0,40-40V128A103.41,103.41,0,0,0,201.89,54.66Z'
  var total = list.reduce(function (n, x) { return n + (x.durationMs || 0) }, 0)
  var mins = Math.max(1, Math.round(total / 60000))
  shadow.innerHTML = '<style>__CSS__</style>' +
    '<div class="bar" role="group" aria-label="Listen to this story">' +
    '<button class="step prev" type="button" aria-label="Previous section">' + ico(I_PREV) + '</button>' +
    '<button class="play" type="button" aria-label="Listen to this story, ' + mins + ' minute' + (mins === 1 ? '' : 's') + '">' +
    '<span class="glyph">' + ico(I_HEAD) + '</span><span class="hint">Listen \\u00b7 ' + mins + ' min</span></button>' +
    '<div class="info" aria-live="polite"><span class="label"></span><span class="meta"></span><div class="track"><div class="fill"></div></div></div>' +
    '<button class="step next" type="button" aria-label="Next section">' + ico(I_NEXT) + '</button>' +
    '</div>'
  var $ = function (q) { return shadow.querySelector(q) }
  var bar = $('.bar'), playBtn = $('.play'), glyph = $('.glyph'), prevBtn = $('.prev'), nextBtn = $('.next')
  var startLabel = playBtn.getAttribute('aria-label')
  var labelEl = $('.label'), metaEl = $('.meta'), fill = $('.fill')
  host.style.cssText = '--bg:' + data.look.background + ';--fg:' + data.look.text + ';--mu:' + data.look.muted + ';--ac:' + data.look.accent

  // A format's own controls share the bottom of the screen (the book's and
  // deck's .vz-controls, the board's tour panel and minimap). Where the pill
  // would cover one, it moves along the bottom past it, or else sits above.
  var OBSTACLES = '.vz-controls > *, .vz-panel, .vz-minimap'
  function hits(l, r, t, b) {
    var out = []
    ;[].forEach.call(doc.querySelectorAll(OBSTACLES), function (k) {
      var o = k.getBoundingClientRect()
      if (o.width && o.left < r + 8 && o.right > l - 8 && o.top < b + 8 && o.bottom > t - 8) out.push(o)
    })
    return out
  }
  function place() {
    host.style.left = host.style.bottom = ''
    var p = bar.getBoundingClientRect(), vw = root.clientWidth, vh = innerHeight || root.clientHeight
    var hit = hits(p.left, p.right, p.top, p.bottom)
    if (!hit.length) return
    var x = Math.max.apply(null, hit.map(function (o) { return o.right })) + 12
    if (x + p.width <= vw - 12 && !hits(x, x + p.width, p.top, p.bottom).length) {
      host.style.left = Math.round(x) + 'px'
      return
    }
    var top = Math.min.apply(null, hit.map(function (o) { return o.top }))
    host.style.bottom = Math.round(vh - top + 8) + 'px'
  }
  var placing = false
  function replace() {
    if (placing) return
    placing = true
    requestAnimationFrame(function () { placing = false; place() })
  }
  addEventListener('resize', replace)
  addEventListener('scroll', replace, { passive: true })

  // -- where the reader is --
  var audio = new Audio()
  audio.preload = 'none'
  var cur = -1, playing = false, lastEntered = null, navTarget = null

  function paged() { return root.classList.contains('vz-on') }
  function shown(el) {
    if (el.closest('[aria-hidden="true"]')) return false
    if (root.classList.contains('board-on') && el.tagName === 'LI') return el.classList.contains('vz-cur')
    return true
  }
  function onScreen(el) {
    var r = el.getBoundingClientRect(), vh = innerHeight || root.clientHeight
    return r.bottom > vh * 0.15 && r.top < vh * 0.75
  }
  function readerUnit() {
    if (lastEntered && shown(lastEntered) && (paged() || onScreen(lastEntered))) return units.indexOf(lastEntered)
    var vh = innerHeight || root.clientHeight
    for (var i = 0; i < units.length; i++) {
      var r = units[i].getBoundingClientRect()
      if (shown(units[i]) && r.height && r.top <= vh * 0.5 && r.bottom >= vh * 0.2) return i
    }
    for (var j = 0; j < units.length; j++) if (shown(units[j]) && units[j].getBoundingClientRect().height) return j
    return 0
  }
  function itemAtOrAfter(unitIndex) {
    for (var i = 0; i < list.length; i++) if (list[i].index >= unitIndex) return i
    return 0
  }

  // -- bringing a section into view --
  function press(key) {
    try { doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true, cancelable: true })) } catch (e) {}
  }
  function firstShown() {
    for (var i = 0; i < units.length; i++) if (shown(units[i])) return i
    return -1
  }
  // Press the right or left arrow until the section shows, one press at a time, giving each
  // turn a moment to land. Stops when the reader takes over (a key or a tap of
  // their own), when a newer section is on its way, or when presses stop
  // moving the page (a mode the keys don't drive).
  var revealing = 0
  function reveal(el) {
    var token = ++revealing, stall = 0, last = -2
    function step() {
      if (token !== revealing) return
      if (shown(el)) {
        if (!onScreen(el) && !root.classList.contains('board-on')) {
          el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
        }
        navTarget = null
        return
      }
      var at = firstShown()
      if (!paged() || at === -1) { navTarget = null; return }
      if (at === last) {
        if (++stall > 4) { navTarget = null; return }
      } else {
        stall = 0
        last = at
        navTarget = el
        press(units.indexOf(el) > at ? 'ArrowRight' : 'ArrowLeft')
      }
      setTimeout(step, reduced ? 40 : 150)
    }
    step()
  }
  // Focus often stays on the pill after a click on it, so a key the reader
  // presses to move the page lands on the pill too: only the keys that work
  // its buttons don't count.
  function readerTookOver(e) {
    if (!e.isTrusted) return
    if (e.type === 'pointerdown' ? e.target === host : /^(Enter| |Spacebar|Tab|Shift)$/.test(e.key)) return
    revealing++
    navTarget = null
  }
  doc.addEventListener('keydown', readerTookOver, true)
  doc.addEventListener('pointerdown', readerTookOver, true)

  // -- playback --
  function fmt(ms) {
    var s = Math.max(0, Math.round(ms / 1000))
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2)
  }
  function render() {
    bar.classList.toggle('on', cur !== -1)
    glyph.innerHTML = ico(playing ? I_PAUSE : cur === -1 ? I_HEAD : I_PLAY)
    playBtn.setAttribute('aria-label', playing ? 'Pause' : cur === -1 ? startLabel : 'Play')
    if (cur === -1) return
    var it = list[cur]
    labelEl.textContent = it.label
    metaEl.textContent = (cur + 1) + ' / ' + list.length + (audio.duration ? ' \\u00b7 ' + fmt((audio.duration - audio.currentTime) * 1000) : '')
    prevBtn.disabled = cur === 0
    nextBtn.disabled = cur === list.length - 1
  }
  var wasOn = false
  function renderAll() {
    render()
    // The pill changes width when it opens or closes.
    if ((cur !== -1) !== wasOn) { wasOn = cur !== -1; replace() }
  }
  function progress() {
    fill.style.width = audio.duration ? (100 * audio.currentTime / audio.duration) + '%' : '0'
    render()
  }
  function go(i, bring) {
    if (i < 0 || i >= list.length) return
    cur = i
    audio.src = list[i].url
    audio.currentTime = 0
    fill.style.width = '0'
    var p = audio.play()
    if (p && p.catch) p.catch(function () { playing = false; render() })
    playing = true
    if (bring) reveal(units[list[i].index])
    media()
    renderAll()
  }
  function toggle() {
    if (cur === -1) return go(itemAtOrAfter(readerUnit()), true)
    if (playing) { audio.pause(); playing = false }
    else {
      // Paused, then the reader moved on: start where they are now.
      var here = readerUnit()
      if (!shown(units[list[cur].index]) || (!paged() && !onScreen(units[list[cur].index]))) return go(itemAtOrAfter(here), true)
      var p = audio.play()
      if (p && p.catch) p.catch(function () {})
      playing = true
    }
    render()
  }
  function media() {
    var ms = navigator.mediaSession
    if (!ms || cur === -1) return
    try {
      ms.metadata = new MediaMetadata({ title: list[cur].label, artist: data.title || doc.title, album: data.site || '' })
      ms.setActionHandler('play', toggle)
      ms.setActionHandler('pause', toggle)
      ms.setActionHandler('previoustrack', function () { go(cur - 1, true) })
      ms.setActionHandler('nexttrack', function () { go(cur + 1, true) })
    } catch (e) {}
  }

  playBtn.addEventListener('click', toggle)
  prevBtn.addEventListener('click', function () { go(cur - 1, true) })
  nextBtn.addEventListener('click', function () { go(cur + 1, true) })
  audio.addEventListener('timeupdate', progress)
  audio.addEventListener('loadedmetadata', render)
  audio.addEventListener('pause', function () { if (!audio.ended) { playing = false; render() } })
  audio.addEventListener('play', function () { playing = true; render() })
  audio.addEventListener('ended', function () {
    if (cur < list.length - 1) go(cur + 1, true)
    else { playing = false; cur = -1; renderAll() }
  })
  audio.addEventListener('error', function () { if (playing && cur < list.length - 1) go(cur + 1, true) })

  // A format entered a unit: remember it, and follow the reader if they
  // turned away from the section being read.
  var pending = null
  doc.addEventListener('story:enter', function (e) {
    var el = e.target
    if (units.indexOf(el) === -1) return
    lastEntered = el
    if (!playing || cur === -1 || navTarget) return
    if (shown(units[list[cur].index])) return
    if (pending === null || units.indexOf(el) < pending) pending = units.indexOf(el)
    setTimeout(function () {
      if (pending === null) return
      var at = pending
      pending = null
      var i = itemAtOrAfter(at)
      if (i !== cur) go(i, false)
    }, 0)
  })

  ;(doc.body || root).appendChild(host)
  // The runtimes build their controls once the document is parsed.
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', function () { setTimeout(replace, 0) })
  else replace()
  addEventListener('load', replace)
})()`

/**
 * The player's markup for one story: its manifest as JSON and the script,
 * to go at the end of <body>. Empty when no section has a clip.
 */
export function audioPlayerHtml(
  sections: HtmlStoryAudioSection[],
  { look, title, site }: { look: AudioPlayerLook; title?: string; site?: string },
): string {
  const playable = sections.filter((s) => s.url)
  if (!playable.length) return ''
  const data = {
    count: sections.length,
    title: title ?? null,
    site: site ?? null,
    look,
    sections: playable.map((s) => ({ index: s.index, label: s.label, url: s.url, durationMs: s.durationMs })),
  }
  const js = PLAYER_JS.replace('__SELECTORS__', () => JSON.stringify(NARRATION_SECTION_SELECTORS)).replace(
    '__CSS__',
    () => PLAYER_CSS.replace(/\s*\n\s*/g, '').replace(/'/g, "\\'"),
  )
  return `<script type="application/json" id="vz-narration">${scriptJson(data)}</script><script>${js}</script>`
}
