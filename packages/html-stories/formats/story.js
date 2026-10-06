/*
 * vizmaya story runtime, v1: charts and numbers that play when their unit is
 * entered. Every format runtime (book, board, deck) bundles it; it is also
 * served alone as /formats/story@1.js.
 *
 * A unit is one page, one tour step or board item, one slide. The format
 * decides when a unit becomes the one the reader is looking at and calls
 * Story.enter(unit); everything below happens then, once.
 *
 * Public API (window.Story):
 *   Story.charts.<name> = function (el, opts) { ...; return { play: function () {} } }
 *       Draws the chart for <div data-chart="<name>">. Draw at Story.size(el):
 *       the element's layout size, so the format's CSS scale doesn't matter.
 *       Draw the start state (the final one when Story.reduced) and animate in
 *       play(), with every duration and delay passed through Story.dur(ms).
 *       opts is el.dataset. A chart may also return anchor(key) -> [x, y] in
 *       its own pixels (the board pins strings to it).
 *   Story.enter(unit)      build the unit's charts if needed, play them once,
 *                          count up its [data-count] numbers once, and fire
 *                          'story:enter' on the unit (every time).
 *   Story.build(root, force)  draw the charts in root (idempotent per size).
 *   Story.rebuildAll(root) redraw after a size change; charts that already
 *                          played come back in their final state.
 *   Story.observe(units)   enter units as they scroll into view (one-page view).
 *   Story.dur(ms)          ms, or 0 under reduced motion and while a played
 *                          chart is being redrawn.
 *   Story.size(el, ratio)  [width, height] of el's layout box.
 *   Story.reduced          prefers-reduced-motion.
 *   Story.theme            the page's <meta name="vizmaya:theme"> colours.
 * Story.ui is shared plumbing for the format runtimes, not part of the API.
 */
(function () {
  'use strict'
  var w = window
  if (w.Story && w.Story.version) return
  var doc = document
  var root = doc.documentElement
  // Charts registered before this script ran (window.Story = { charts: {...} }).
  var early = (w.Story && w.Story.charts) || {}

  var reduced = false
  try { reduced = w.matchMedia('(prefers-reduced-motion: reduce)').matches } catch (e) {}
  var instant = false

  function each(list, fn) { Array.prototype.forEach.call(list || [], fn) }
  function dur(ms) { return reduced || instant ? 0 : ms }
  function size(el, ratio) {
    var cw = el.clientWidth || 320
    var ch = el.clientHeight || Math.round(cw * (ratio || 0.62))
    return [cw, ch]
  }
  function fire(el, type) {
    try { el.dispatchEvent(new CustomEvent(type, { bubbles: true })) } catch (e) {}
  }
  function warn() {
    if (w.console && console.warn) console.warn.apply(console, ['[vizmaya]'].concat([].slice.call(arguments)))
  }

  var charts = {}
  for (var k in early) charts[k] = early[k]

  function chartsIn(el) {
    var out = el.matches && el.matches('[data-chart]') ? [el] : []
    return out.concat([].slice.call(el.querySelectorAll ? el.querySelectorAll('[data-chart]') : []))
  }

  // ── charts ─────────────────────────────────────────────────────────────
  function build(scope, force) {
    each(chartsIn(scope || doc), function (el) {
      // Not laid out (display: none, e.g. a book-only page in the one-page
      // view): leave it for the next build.
      if (!el.getClientRects().length) return
      var key = el.clientWidth + 'x' + el.clientHeight
      if (!force && el._chart && el._chartKey === key) return
      var name = el.getAttribute('data-chart')
      var fn = charts[name]
      if (typeof fn !== 'function') {
        if (!el._missing) { el._missing = true; warn('no chart registered for data-chart="' + name + '"') }
        return
      }
      try {
        el.innerHTML = ''
        el._chart = fn(el, el.dataset) || {}
        el._chartKey = key
        if (el._played && el._chart.play) {
          instant = true
          try { el._chart.play() } finally { instant = false }
        }
        fire(el, 'story:build')
      } catch (e) {
        // Leave the element empty so its data-alt text shows instead.
        el._chart = null
        el.innerHTML = ''
        if (w.console) console.error('[vizmaya] chart "' + name + '" failed', e)
      }
    })
  }

  function play(el) {
    if (el._played || !el._chart) return
    el._played = true
    try { if (el._chart.play) el._chart.play() } catch (e) { if (w.console) console.error(e) }
  }

  // ── count-ups ──────────────────────────────────────────────────────────
  // The final value is already in the markup; it counts up to it once and is
  // put back exactly as written.
  function countUp(el) {
    if (el._counted) return
    el._counted = true
    var raw = el.getAttribute('data-count') || ''
    var end = parseFloat(raw)
    if (!isFinite(end) || reduced) return
    var dec = (raw.split('.')[1] || '').length
    var written = el.textContent
    var t0 = null
    var D = 1200
    function fmt(v) {
      try { return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) } catch (e) { return v.toFixed(dec) }
    }
    function frame(t) {
      if (t0 === null) t0 = t
      var p = Math.min(1, (t - t0) / D)
      if (p < 1) {
        el.textContent = fmt(end * (1 - Math.pow(1 - p, 3)))
        w.requestAnimationFrame(frame)
      } else {
        el.textContent = written
      }
    }
    w.requestAnimationFrame(frame)
  }

  // ── units ──────────────────────────────────────────────────────────────
  function enter(unit) {
    if (!unit) return
    build(unit)
    each(chartsIn(unit), play)
    if (unit.matches && unit.matches('[data-count]')) countUp(unit)
    each(unit.querySelectorAll('[data-count]'), countUp)
    fire(unit, 'story:enter')
  }
  function rebuildAll(scope) { build(scope || doc, true) }

  // The one-page view: enter each unit as it comes up the screen.
  function observe(units) {
    if (!('IntersectionObserver' in w)) {
      each(units, enter)
      return { disconnect: function () {} }
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) enter(en.target) })
    }, { rootMargin: '0px 0px -20% 0px' })
    each(units, function (u) { io.observe(u) })
    return io
  }

  // ── the page's palette ─────────────────────────────────────────────────
  function readTheme() {
    var t = {}
    var m = doc.querySelector('meta[name="vizmaya:theme"]')
    if (!m) return t
    ;(m.getAttribute('content') || '').split(';').forEach(function (pair) {
      var i = pair.indexOf(':')
      if (i < 0) return
      var key = pair.slice(0, i).trim()
      var val = pair.slice(i + 1).trim()
      if (/^#[0-9a-f]{3,8}$/i.test(val)) t[key] = val
    })
    return t
  }
  var theme = readTheme()

  // ── shared plumbing for the format runtimes ───────────────────────────
  var ICONS = {
    prev: '<path d="M15 5l-7 7 7 7"/>',
    next: '<path d="M9 5l7 7-7 7"/>',
    rows: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    book: '<path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5V19"/>',
    pin: '<path d="M14.5 3.5l6 6M16 5l-5 5-4-1-2 2 8 8 2-2-1-4 5-5M9 15l-5 5"/>',
    slides: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 20h8"/>',
    cards: '<rect x="6" y="3" width="12" height="16" rx="2"/><path d="M3.5 7.5v11A2.5 2.5 0 006 21h9"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    frame: '<path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
    board: '<rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M7 21l2-4M17 21l-2-4M8 9h5M8 12h8"/>'
  }
  function icon(name) {
    return '<svg class="vz-i" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (ICONS[name] || '') + '</svg>'
  }
  function button(opts) {
    var b = doc.createElement('button')
    b.type = 'button'
    b.className = 'vz-btn' + (opts.cls ? ' ' + opts.cls : '')
    if (opts.id) b.id = opts.id
    if (opts.aria) b.setAttribute('aria-label', opts.aria)
    if (opts.pressed != null) b.setAttribute('aria-pressed', String(opts.pressed))
    b.innerHTML = (opts.icon ? icon(opts.icon) : '') + (opts.label ? '<span class="vz-label">' + opts.label + '</span>' : '')
    if (opts.onClick) b.addEventListener('click', opts.onClick)
    return b
  }
  function setButton(b, iconName, label) {
    b.innerHTML = icon(iconName) + '<span class="vz-label">' + label + '</span>'
  }

  function css(id, text) {
    if (doc.getElementById(id)) return
    var s = doc.createElement('style')
    s.id = id
    s.textContent = text
    ;(doc.head || root).appendChild(s)
  }
  // The runtime's controls take the page's vizmaya:theme colours. :where()
  // keeps these at zero specificity, so a page's own --vz-* values win.
  function themeVars() {
    var t = theme
    var line = t.line || t.muted
    var decl = [
      ['--vz-bg', t.background], ['--vz-surface', t.surface || t.background], ['--vz-text', t.text],
      ['--vz-muted', t.muted], ['--vz-line', line], ['--vz-accent', t.accent], ['--vz-accent2', t.accent2]
    ].filter(function (d) { return d[1] }).map(function (d) { return d[0] + ':' + d[1] }).join(';')
    if (decl) css('vz-theme', ':where(:root){' + decl + '}')
  }
  function ready(fn) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', fn)
    else fn()
  }
  // Start a format once the DOM is parsed (so charts registered in a script
  // after the runtime's are there) and its stylesheet is in. The stylesheet
  // sits next to the script (book@1.js → book@1.css); it is linked here if
  // the page didn't link it.
  function boot(name, src, fn) {
    var linked = doc.querySelector('link[rel~="stylesheet"][href*="/formats/' + name + '@"]')
    if (linked || !src || !/\.js(\?|$)/.test(src)) { ready(fn); return }
    var l = doc.createElement('link')
    var done = false
    function go() { if (!done) { done = true; ready(fn) } }
    l.rel = 'stylesheet'
    l.href = src.replace(/\.js(\?|$)/, '.css$1')
    l.onload = go
    l.onerror = go
    w.setTimeout(go, 4000)
    ;(doc.head || root).appendChild(l)
  }
  // An aura scene behind the page (the site lays one there for some stories):
  // the format's stage lets it show through.
  function markAura() {
    if (doc.querySelector('vizmaya-aura')) root.classList.add('vz-aura')
  }
  function setHash(h) {
    try { history.replaceState(history.state, '', '#' + h) } catch (e) {}
  }
  function hashNumber(key) {
    var m = new RegExp('(?:^#|&)' + key + '=(\\d+)').exec(location.hash)
    return m ? +m[1] : null
  }
  function hashHas(word) { return new RegExp('(?:^#|&)' + word + '(?:&|$)').test(location.hash) }
  // Keys for one format: ignored with modifiers, in form fields, or when the
  // format isn't on (the one-page view).
  function keys(onClass, fn) {
    doc.addEventListener('keydown', function (e) {
      if (!root.classList.contains(onClass) || e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return
      var t = e.target
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return
      fn(e)
    })
  }
  function fullscreen(btn, stage) {
    if (!(doc.fullscreenEnabled && stage.requestFullscreen)) return
    btn.hidden = false
    btn.addEventListener('click', function () {
      try {
        if (doc.fullscreenElement) doc.exitFullscreen()
        else stage.requestFullscreen()
      } catch (e) {}
    })
  }
  // Only the units on screen are reachable by keyboard and screen readers.
  function reachable(el, on) {
    if (on) el.removeAttribute('aria-hidden')
    else el.setAttribute('aria-hidden', 'true')
    if ('inert' in el) el.inert = !on
  }
  // A unit's frame overflowing is the one layout bug a fixed frame can't
  // hide: say so in the console, and to the admin preview around the page.
  function reportOverflow(format, units, describe) {
    var found = []
    // Height only: a frame's width is fixed and text wraps to it, while a
    // decoration bleeding off the side is usually deliberate.
    each(units, function (u, i) {
      var over = u.scrollHeight - u.clientHeight
      if (over > 1) found.push(describe(u, i) + ' overflows its frame by ' + over + 'px')
    })
    found.forEach(function (m) { warn(m) })
    try {
      if (w.parent && w.parent !== w) w.parent.postMessage({ type: 'vizmaya:format-check', format: format, warnings: found }, '*')
    } catch (e) {}
    return found
  }
  function afterFonts(fn) {
    var go = function () { w.setTimeout(fn, 60) }
    try { if (doc.fonts && doc.fonts.ready) { doc.fonts.ready.then(go, go); return } } catch (e) {}
    go()
  }

  w.Story = {
    version: 1,
    reduced: reduced,
    theme: theme,
    charts: charts,
    build: build,
    enter: enter,
    rebuildAll: rebuildAll,
    observe: observe,
    dur: dur,
    size: size,
    ui: {
      icon: icon, button: button, setButton: setButton, css: css, themeVars: themeVars,
      boot: boot, ready: ready, markAura: markAura, setHash: setHash,
      hashNumber: hashNumber, hashHas: hashHas, keys: keys, fullscreen: fullscreen,
      reachable: reachable, reportOverflow: reportOverflow, afterFonts: afterFonts, warn: warn, each: each
    }
  }
})()
