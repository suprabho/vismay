/*
 * vizmaya collage format, v1: the runtime behind collage@1.js (which bundles
 * the story runtime above it). Pair with collage@1.css.
 *
 * Contract: <main class="stage"> is the board. Its sections are the units
 * (<header class="cover" data-unit>, <section class="scene" data-unit>,
 * <section class="band" data-unit>, …), each holding .piece elements: a
 * .tape strip and a torn .paper sheet with the words, a cut-paper chart or
 * a registered chart (<div class="chart" data-chart="…">).
 *
 * The page scrolls as usual. What the runtime adds:
 *   - stop-motion choreography from scroll position: a piece with .fly
 *     lands as its top crosses the screen, .grow bars stretch from the left,
 *     .tape and .stamp press down, .n number patches slide in, .swim
 *     cut-outs cross their sheet, .ring circles dilate; a container with
 *     data-seq="<selector>" plays its matching children one after another
 *     (.seq-drop, .seq-slide, .seq-pop). Progress is written as a CSS
 *     variable in a few steps per element (held poses, not easing), and
 *     every default is 1, so the page reads complete without the runtime.
 *   - the cover's parallax (data-par, data-parx, in fractions of the scroll)
 *     and a drift for a .bignum (data-drift, against its section's centre).
 *   - a sewing-thread progress rail down the left edge with a knot per
 *     [data-knot] section (numbered as written, or in order when empty).
 *   - Story.enter() on each unit as it comes up the screen: registered
 *     charts build and play once, [data-count] numbers count up in
 *     twelve held frames.
 *   Under prefers-reduced-motion only the thread rail is dropped; every
 *   piece sits in its finished place.
 *
 * Story.collage.add(selector, variable, from, to, steps) registers more
 * choreography (from/to: where the element's top sits in the viewport, as a
 * fraction of its height, when the motion starts and ends);
 * Story.collage.refresh() re-collects after the DOM changes.
 */
(function () {
  'use strict'
  var S = window.Story
  if (!S || !S.ui) return
  var ui = S.ui
  var SRC = document.currentScript && document.currentScript.src
  ui.boot('collage', SRC, start)

  function start() {
    var doc = document
    var root = doc.documentElement
    var stage = doc.querySelector('.stage')
    if (!stage) { ui.warn('collage: no <main class="stage">; the page reads as written'); return }
    var units = [].slice.call(stage.querySelectorAll('[data-unit]'))
    if (!units.length) ui.warn('collage: no [data-unit] sections; charts and count-ups have nothing to enter')
    if (!stage.querySelector('.piece')) ui.warn('collage: no .piece elements; the paper kit is unused')

    ui.themeVars()
    ui.markAura()
    var reduced = S.reduced
    // Count-ups in held frames, like the rest of the motion.
    S.countSteps = 12
    root.classList.add('js', 'vz-on', 'collage-on')

    var clamp = function (v) { return Math.max(0, Math.min(1, v)) }
    // stop-motion: hold each pose for a few frames
    var q = function (v, n) { return n ? Math.floor(v * n + 1e-6) / n : v }

    // ── choreography ───────────────────────────────────────────────────────
    var specs = [
      ['.fly', '--p', 1.02, 0.58, 6],
      ['.grow', '--g', 0.95, 0.5, 8],
      ['.tape', '--tp', 0.92, 0.72, 3],
      ['.stamp', '--sp', 0.84, 0.66, 3],
      ['.n', '--np', 0.9, 0.62, 5],
      ['.swim', '--p', 1, 0.35, 10],
      ['.ring', '--p', 0.95, 0.5, 7]
    ]
    var items = [], seqs = [], par = [], drift = [], cover = null
    function collect() {
      items = []
      specs.forEach(function (s) {
        ui.each(stage.querySelectorAll(s[0]), function (el) { items.push({ el: el, v: s[1], a: s[2], b: s[3], steps: s[4] }) })
      })
      seqs = [].map.call(stage.querySelectorAll('[data-seq]'), function (el) {
        var kids = []
        try { kids = [].slice.call(el.querySelectorAll(el.getAttribute('data-seq'))) } catch (e) { ui.warn('collage: data-seq="' + el.getAttribute('data-seq') + '" is not a selector') }
        return { el: el, kids: kids }
      })
      par = [].slice.call(stage.querySelectorAll('[data-par]'))
      drift = [].slice.call(stage.querySelectorAll('[data-drift]'))
      cover = stage.querySelector('.cover')
    }
    function add(sel, v, a, b, steps) {
      specs.push([sel, v, a, b, steps])
      ui.each(stage.querySelectorAll(sel), function (el) { items.push({ el: el, v: v, a: a, b: b, steps: steps }) })
      req()
    }

    // ── the thread rail ────────────────────────────────────────────────────
    var thread = doc.createElement('div')
    thread.className = 'vz-thread'
    thread.setAttribute('aria-hidden', 'true')
    var fill = doc.createElement('div')
    fill.className = 'vz-thread-fill'
    thread.appendChild(fill)
    var knots = [].map.call(stage.querySelectorAll('[data-knot]'), function (sec, i) {
      var k = doc.createElement('span')
      k.className = 'vz-knot'
      k.textContent = sec.getAttribute('data-knot') || String(i + 1)
      thread.appendChild(k)
      return { sec: sec, k: k, at: 0 }
    })
    if (knots.length) doc.body.appendChild(thread)
    var maxScroll = 1
    function layout() {
      maxScroll = Math.max(1, root.scrollHeight - window.innerHeight)
      knots.forEach(function (o) {
        var y = o.sec.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.4
        o.at = clamp(y / maxScroll)
        o.k.style.top = (o.at * 100) + '%'
      })
    }

    // ── a frame ────────────────────────────────────────────────────────────
    var ticking = false
    function frame() {
      ticking = false
      var vh = window.innerHeight, y = window.scrollY, prog = clamp(y / maxScroll)
      thread.style.setProperty('--prog', prog.toFixed(4))
      knots.forEach(function (o) { o.k.classList.toggle('vz-on', prog + 0.002 >= o.at) })
      if (reduced) return
      for (var i = 0; i < items.length; i++) {
        var it = items[i]
        var top = it.el.getBoundingClientRect().top / vh
        it.el.style.setProperty(it.v, q(clamp((it.a - top) / (it.a - it.b)), it.steps).toFixed(3))
      }
      for (var j = 0; j < seqs.length; j++) {
        var s = seqs[j]
        var t = s.el.getBoundingClientRect().top / vh
        var p = clamp((1 - t) / 0.55), n = s.kids.length
        for (var k = 0; k < n; k++) s.kids[k].style.setProperty('--p', q(clamp(p * (n + 1) - k), 3).toFixed(3))
      }
      if (cover && y < cover.offsetHeight + vh) {
        for (var m = 0; m < par.length; m++) {
          var el = par[m]
          el.style.setProperty('--py', (-y * +el.getAttribute('data-par')).toFixed(1) + 'px')
          var px = el.getAttribute('data-parx')
          if (px) el.style.setProperty('--px', (y * +px).toFixed(1) + 'px')
        }
      }
      for (var d = 0; d < drift.length; d++) {
        var de = drift[d], r = (de.parentElement || de).getBoundingClientRect()
        de.style.setProperty('--py', ((r.top + r.height / 2 - vh / 2) * -+de.getAttribute('data-drift')).toFixed(1) + 'px')
      }
    }
    function req() {
      if (ticking) return
      ticking = true
      requestAnimationFrame(frame)
    }

    // ── start ──────────────────────────────────────────────────────────────
    collect()
    S.build(stage)
    var io = S.observe(units)
    layout()
    frame()
    window.addEventListener('scroll', req, { passive: true })
    var rt = null
    window.addEventListener('resize', function () {
      layout()
      req()
      clearTimeout(rt)
      rt = setTimeout(function () { S.rebuildAll(stage); layout(); req() }, 150)
    })
    window.addEventListener('load', function () { layout(); req() })
    // web fonts change the sheets' heights: re-place the knots
    ui.afterFonts(function () { layout(); req() })
    stage.addEventListener('story:build', function () { layout(); req() })

    S.collage = {
      add: add,
      refresh: function () {
        collect()
        if (io) io.disconnect()
        units = [].slice.call(stage.querySelectorAll('[data-unit]'))
        S.build(stage)
        io = S.observe(units)
        layout()
        req()
      }
    }
  }
})()
