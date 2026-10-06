/*
 * vizmaya board format, v1: the runtime behind board@1.js (which bundles the
 * story runtime above it). Pair with board@1.css. Needs d3 v7 (it loads
 * d3@7.9.0 itself if the page hasn't).
 *
 * Contract: <main class="stage"> holds <div class="world"> (a fixed-size
 * board, data-width × data-height, default 3400 × 2240) of .item elements
 * placed with inline --x, --y, --w and an optional --r tilt, and an optional
 * <ol class="tour"> of <li data-unit data-target="id id …">. A step frames
 * the union of its targets' boxes ("board" frames the whole board;
 * data-target-sm is a tighter frame for phones), fitted into the part of
 * the screen the tour panel doesn't cover.
 *
 * The camera is d3-zoom on the viewport, so a fly between two frames uses
 * d3.interpolateZoom: the camera pulls back, travels, then pushes in.
 * Story.enter() runs on the framed items on arrival, and on any item the
 * reader zooms into (k ≥ 0.35, centre on screen) while exploring.
 *
 * data-pin-to="id" on an item runs a string from its pin to that item's pin;
 * "id:key" runs it to the point anchor(key) of the chart inside that item.
 * Gestures leave scrolling to the page: drag pans; ⌘/Ctrl + wheel and
 * trackpad pinch zoom; two fingers pan and pinch on touch.
 */
(function () {
  'use strict'
  var S = window.Story
  if (!S || !S.ui) return
  var ui = S.ui
  var SRC = document.currentScript && document.currentScript.src
  var D3 = 'https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js'
  ui.boot('board', SRC, function () { withD3(start) })

  function withD3(fn) {
    if (window.d3 && window.d3.zoom) { fn(); return }
    var s = document.createElement('script')
    s.src = D3
    s.onload = fn
    s.onerror = function () { ui.warn('board: d3 failed to load; the page stays one column') }
    ;(document.head || document.documentElement).appendChild(s)
  }

  function start() {
    var d3 = window.d3
    var doc = document
    var root = doc.documentElement
    var stage = doc.querySelector('.stage')
    var world = stage && stage.querySelector('.world')
    if (!world) { ui.warn('board: no <div class="world"> inside <main class="stage">; the page stays one column'); return }
    var items = [].slice.call(world.querySelectorAll('.item'))
    if (!items.length) { ui.warn('board: .world has no .item elements'); return }
    var tourEl = stage.querySelector('.tour')
    var steps = tourEl ? [].filter.call(tourEl.children, function (li) { return li.matches('li') }) : []

    ui.themeVars()
    ui.markAura()
    var reduced = S.reduced
    var WW = +world.getAttribute('data-width') || 3400
    var WH = +world.getAttribute('data-height') || 2240
    world.style.setProperty('--vz-world-w', WW + 'px')
    world.style.setProperty('--vz-world-h', WH + 'px')
    var step = 0

    // ── chrome ─────────────────────────────────────────────────────────────
    var vp = doc.createElement('div')
    vp.className = 'vz-viewport'
    world.parentNode.insertBefore(vp, world)
    vp.appendChild(world)
    var strings = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
    strings.setAttribute('class', 'vz-strings')
    strings.setAttribute('aria-hidden', 'true')
    world.insertBefore(strings, world.firstChild)
    items.forEach(function (el) {
      if (!el.matches('.bare') && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0')
    })

    var tools = doc.createElement('div')
    tools.className = 'vz-tools'
    var overviewBtn = ui.button({ icon: 'frame', label: 'Whole board', cls: 'vz-only', onClick: overview })
    var surfaceBtn = ui.button({ icon: 'board', label: 'Whiteboard', cls: 'vz-only', pressed: false, onClick: toggleSurface })
    var modeBtn = ui.button({ icon: 'rows', label: 'Read as one page', pressed: false, onClick: toggleMode })
    var fsBtn = ui.button({ icon: 'expand', aria: 'Full screen', cls: 'vz-only' })
    fsBtn.hidden = true
    ;[overviewBtn, surfaceBtn, modeBtn, fsBtn].forEach(function (b) { tools.appendChild(b) })
    stage.insertBefore(tools, vp)
    ui.fullscreen(fsBtn, stage)

    var panel = null, countEl = null, prevBtn = null, nextBtn = null
    if (steps.length) {
      panel = doc.createElement('aside')
      panel.className = 'vz-panel vz-only'
      panel.setAttribute('aria-label', 'Guided tour')
      tourEl.parentNode.insertBefore(panel, tourEl)
      panel.appendChild(tourEl)
      var bar = doc.createElement('div')
      bar.className = 'vz-panel-bar'
      prevBtn = ui.button({ icon: 'prev', aria: 'Previous step', onClick: function () { goStep(step - 1) } })
      countEl = doc.createElement('span')
      countEl.className = 'vz-count'
      countEl.setAttribute('aria-live', 'polite')
      nextBtn = ui.button({ icon: 'next', label: 'Next', cls: 'vz-primary', onClick: function () { goStep(step === steps.length - 1 ? 0 : step + 1) } })
      // icon after the label on the primary button
      nextBtn.appendChild(nextBtn.firstChild)
      bar.appendChild(prevBtn)
      bar.appendChild(countEl)
      bar.appendChild(nextBtn)
      panel.appendChild(bar)
    }
    var minimap = doc.createElement('div')
    minimap.className = 'vz-minimap vz-only'
    minimap.setAttribute('aria-hidden', 'true')
    minimap.style.height = Math.round(180 * WH / WW) + 'px'
    stage.appendChild(minimap)
    var hint = doc.createElement('div')
    hint.className = 'vz-hint'
    hint.setAttribute('role', 'status')
    stage.appendChild(hint)

    root.classList.add('js', 'vz-on', 'board-on')

    // ── camera ─────────────────────────────────────────────────────────────
    var zoom = d3.zoom()
      .scaleExtent([0.05, 2.5])
      .filter(function (e) {
        if (e.type === 'wheel') return e.ctrlKey || e.metaKey
        if (e.type === 'touchstart') return e.touches.length > 1
        if (e.type === 'dblclick') return false
        return !e.button && !e.target.closest('a, button, input, select, textarea, .vz-panel, .vz-tools, .vz-minimap')
      })
      .on('start', function (e) { if (e.sourceEvent && e.sourceEvent.type === 'mousedown') vp.classList.add('vz-grabbing') })
      .on('zoom', function (e) {
        var t = e.transform
        if (root.classList.contains('board-on')) {
          world.style.transform = 'translate(' + t.x + 'px,' + t.y + 'px) scale(' + t.k + ')'
          layer(t.k)
        }
        drawMinimapView(t)
      })
      .on('end', function (e) {
        vp.classList.remove('vz-grabbing')
        dropLayer()
        if (e.sourceEvent) enterVisible(e.transform)
      })
    var sel = d3.select(vp).call(zoom).on('dblclick.zoom', null)
    // d3-zoom sets touch-action: none; keep one-finger vertical scrolling for the page
    vp.style.touchAction = 'pan-y'

    var mac = /Mac|iPhone|iPad/.test(navigator.platform || '')
    vp.addEventListener('wheel', function (e) {
      if (!(e.ctrlKey || e.metaKey) && root.classList.contains('board-on')) flash(mac ? 'Hold ⌘ and scroll to zoom the board' : 'Hold Ctrl and scroll to zoom the board')
    }, { passive: true })
    vp.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1 && root.classList.contains('board-on')) flash('Use two fingers to move the board')
    }, { passive: true })
    var ht = null
    function flash(msg) {
      hint.textContent = msg
      hint.classList.add('vz-show')
      clearTimeout(ht)
      ht = setTimeout(function () { hint.classList.remove('vz-show') }, 1400)
    }

    // ── layer ──────────────────────────────────────────────────────────────
    // While the camera moves, the world is its own compositing layer
    // (.vz-moving sets will-change: transform) so a frame only moves pixels
    // already drawn. A layer keeps the resolution it was drawn at: Chrome
    // draws it at max(k, 1) × the device pixel ratio (k: the camera scale)
    // and won't redraw it coarser while it stays a layer. Left as a layer
    // after a close-up, the world needs the whole board at close-up
    // resolution once the camera pulls back: about 1 GB of tiles on a 3.5×
    // phone, where Android Chrome has 256 MB, so most of the board (and parts
    // of the page) never draw. So: no layer at rest, where the board draws at
    // its own scale; none below k = 0.5, where even a new layer is 4 screens
    // of tiles; and a layer is dropped once k leaves half to double the scale
    // it was drawn at. A frame goes out between dropping one and making the
    // next, so the next is drawn new at the scale of its moment.
    var layerR = 0, layerWait = 0
    function layer(k) {
      if (layerR && (k < layerR / 2 || k > layerR * 2)) dropLayer()
      else if (!layerR && !layerWait && k >= 0.5) {
        world.classList.add('vz-moving')
        layerR = Math.max(k, 1)
      }
    }
    function dropLayer() {
      if (!layerR) return
      world.classList.remove('vz-moving')
      layerR = 0
      layerWait++
      requestAnimationFrame(function () { requestAnimationFrame(function () { layerWait-- }) })
    }

    // the part of the screen the camera may use (the panel covers the rest)
    function safeRect() {
      var W = vp.clientWidth, H = vp.clientHeight
      var r = { x: 0, y: 0, w: W, h: H }
      if (!panel || panel.offsetParent === null) return r
      var pr = panel.getBoundingClientRect(), sr = vp.getBoundingClientRect()
      if (W > 720) { r.x = pr.right - sr.left; r.w = W - r.x }
      else r.h = pr.top - sr.top
      return r
    }
    function box(el) {
      // world-space box from layout, ignoring the item's small tilt
      return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }
    }
    function byId(id) { return doc.getElementById(id) }
    function frameOf(ids) {
      var els = (ids || 'board') === 'board' ? [] : ids.split(/\s+/).map(byId).filter(Boolean)
      if (!els.length) return { x: -30, y: -30, w: WW + 60, h: WH + 60 }
      var bs = els.map(box)
      var x0 = d3.min(bs, function (b) { return b.x }), y0 = d3.min(bs, function (b) { return b.y })
      var x1 = d3.max(bs, function (b) { return b.x + b.w }), y1 = d3.max(bs, function (b) { return b.y + b.h })
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
    }
    function fit(f, pad) {
      var s = safeRect()
      pad = pad == null ? 40 : pad
      var k = Math.max(0.05, Math.min((s.w - pad * 2) / f.w, (s.h - pad * 2) / f.h, 1.6))
      return d3.zoomIdentity.translate(s.x + s.w / 2 - (f.x + f.w / 2) * k, s.y + s.h / 2 - (f.y + f.h / 2) * k).scale(k)
    }
    function fly(t, done) {
      var cur = d3.zoomTransform(vp)
      if (reduced) {
        sel.interrupt().call(zoom.transform, t)
        if (done) done()
        return
      }
      var s = vp.getBoundingClientRect()
      var p0 = [(s.width / 2 - cur.x) / cur.k, (s.height / 2 - cur.y) / cur.k, s.width / cur.k]
      var p1 = [(s.width / 2 - t.x) / t.k, (s.height / 2 - t.y) / t.k, s.width / t.k]
      var ms = Math.max(900, Math.min(2400, d3.interpolateZoom(p0, p1).duration * 1.1))
      sel.interrupt().transition().duration(ms).ease(d3.easeCubicInOut).call(zoom.transform, t)
        .on('end', function () { if (done) done() })
    }

    // ── tour ───────────────────────────────────────────────────────────────
    function targetsOf(li) {
      var t = li.getAttribute('data-target') || 'board'
      return t === 'board' ? [] : t.split(/\s+/).map(byId).filter(Boolean)
    }
    function goStep(i, instant) {
      if (!steps.length) {
        var t0 = fit(frameOf('board'), 12)
        if (instant) sel.call(zoom.transform, t0)
        else fly(t0)
        return
      }
      step = Math.max(0, Math.min(steps.length - 1, i))
      steps.forEach(function (li, j) { li.classList.toggle('vz-cur', j === step) })
      var li = steps[step]
      countEl.textContent = (step + 1) + ' of ' + steps.length
      prevBtn.disabled = step === 0
      var label = nextBtn.querySelector('.vz-label')
      if (label) label.textContent = step === 0 ? 'Start the tour' : step === steps.length - 1 ? 'Start again' : 'Next'
      var small = vp.clientWidth <= 720
      var target = (small && li.getAttribute('data-target-sm')) || li.getAttribute('data-target') || 'board'
      var t = fit(frameOf(target), target === 'board' ? 12 : small ? 14 : 48)
      var land = function () {
        S.enter(li)
        targetsOf(li).forEach(function (el) { S.enter(el) })
      }
      if (instant) { sel.interrupt().call(zoom.transform, t); land() }
      else fly(t, land)
      ui.setHash('step=' + (step + 1))
    }
    ui.keys('board-on', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goStep(step + 1) }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goStep(step - 1) }
      else if (e.key === 'Escape' || e.key === '0') overview()
      else if (e.key === '+' || e.key === '=') sel.transition().duration(reduced ? 0 : 300).call(zoom.scaleBy, 1.4)
      else if (e.key === '-') sel.transition().duration(reduced ? 0 : 300).call(zoom.scaleBy, 1 / 1.4)
    })

    // clicking (or Enter on) a card flies to it; a card a tour step frames syncs the tour
    function focusItem(el) {
      var idx = -1
      steps.forEach(function (li, j) {
        if (idx === -1 && (' ' + (li.getAttribute('data-target') || '') + ' ').indexOf(' ' + el.id + ' ') !== -1) idx = j
      })
      if (el.id && idx !== -1) { goStep(idx); return }
      fly(fit(box(el), 60), function () { S.enter(el) })
    }
    world.addEventListener('click', function (e) {
      if (!root.classList.contains('board-on') || e.defaultPrevented || e.target.closest('a, button, input, select, textarea')) return
      var el = e.target.closest('.item')
      if (el && !el.matches('.bare')) focusItem(el)
    })
    world.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.matches && e.target.matches('.item') && root.classList.contains('board-on')) focusItem(e.target)
    })
    // keyboard focus moving to a card brings it on screen
    world.addEventListener('focusin', function (e) {
      if (!root.classList.contains('board-on')) return
      var el = e.target.closest('.item')
      if (!el) return
      var t = d3.zoomTransform(vp), b = box(el), s = safeRect()
      var x = t.applyX(b.x), y = t.applyY(b.y)
      if (x < s.x || y < s.y || x + b.w * t.k > s.x + s.w || y + b.h * t.k > s.y + s.h) fly(fit(b, 60), function () { S.enter(el) })
    })
    stage.addEventListener('click', function (e) {
      var g = e.target.closest('[data-goto]')
      if (g && root.classList.contains('board-on')) goStep((parseInt(g.getAttribute('data-goto'), 10) || 1) - 1)
    })

    function overview() { fly(fit(frameOf('board'), 20)) }

    // items the reader zooms into while exploring get their charts played too
    function enterVisible(t) {
      if (t.k < 0.35) return
      var s = safeRect()
      items.forEach(function (el) {
        var b = box(el), x = t.applyX(b.x + b.w / 2), y = t.applyY(b.y + b.h / 2)
        if (x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.h) S.enter(el)
      })
    }

    // ── strings ────────────────────────────────────────────────────────────
    function offsetIn(el) {
      var x = 0, y = 0, n = el
      while (n && n !== world) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent }
      return [x, y]
    }
    function pinOf(el) {
      var b = box(el)
      return [b.x + b.w / 2, b.y - 2]
    }
    function endOf(spec) {
      var at = spec.indexOf(':')
      var id = at < 0 ? spec : spec.slice(0, at)
      var el = byId(id)
      if (!el) return null
      if (at < 0) return pinOf(el.closest('.item') || el)
      var chartEl = el.matches('[data-chart]') ? el : el.querySelector('[data-chart]')
      var c = chartEl && chartEl._chart
      if (!c || typeof c.anchor !== 'function') return null
      var p = c.anchor(spec.slice(at + 1))
      if (!p) return null
      var o = offsetIn(chartEl)
      return [o[0] + p[0], o[1] + p[1]]
    }
    function drawStrings() {
      var out = ''
      items.forEach(function (card) {
        var spec = card.getAttribute('data-pin-to')
        if (!spec) return
        var from = pinOf(card)
        spec.split(/\s+/).forEach(function (s) {
          var to = s && endOf(s)
          if (!to) return
          var mx = (from[0] + to[0]) / 2
          var my = (from[1] + to[1]) / 2 + Math.hypot(to[0] - from[0], to[1] - from[1]) * 0.12 // a little sag
          out += '<path d="M' + from[0] + ',' + from[1] + 'Q' + mx + ',' + my + ' ' + to[0] + ',' + to[1] + '"/>' +
            '<circle cx="' + to[0] + '" cy="' + to[1] + '" r="4"/>'
        })
      })
      strings.setAttribute('viewBox', '0 0 ' + WW + ' ' + WH)
      strings.innerHTML = out
    }
    var sr = 0
    world.addEventListener('story:build', function () {
      cancelAnimationFrame(sr)
      sr = requestAnimationFrame(drawStrings)
    })

    // ── minimap ────────────────────────────────────────────────────────────
    var mmView = null, mmS = 180 / WW
    function drawMinimap() {
      minimap.innerHTML = ''
      items.forEach(function (el) {
        if (el.matches('.bare')) return
        var b = box(el), i = doc.createElement('i')
        i.style.cssText = 'left:' + b.x * mmS + 'px;top:' + b.y * mmS + 'px;width:' + Math.max(2, b.w * mmS) + 'px;height:' + Math.max(2, b.h * mmS) + 'px'
        minimap.appendChild(i)
      })
      mmView = doc.createElement('div')
      mmView.className = 'vz-view'
      minimap.appendChild(mmView)
      drawMinimapView(d3.zoomTransform(vp))
    }
    function drawMinimapView(t) {
      if (!mmView) return
      var W = vp.clientWidth, H = vp.clientHeight
      mmView.style.cssText = 'left:' + (-t.x / t.k) * mmS + 'px;top:' + (-t.y / t.k) * mmS + 'px;width:' + (W / t.k) * mmS + 'px;height:' + (H / t.k) * mmS + 'px'
    }
    minimap.addEventListener('click', function (e) {
      var r = minimap.getBoundingClientRect()
      var wx = (e.clientX - r.left) / mmS, wy = (e.clientY - r.top) / mmS
      var t = d3.zoomTransform(vp), s = safeRect()
      fly(d3.zoomIdentity.translate(s.x + s.w / 2 - wx * t.k, s.y + s.h / 2 - wy * t.k).scale(t.k))
    })

    // ── surface, modes ─────────────────────────────────────────────────────
    function toggleSurface() {
      var white = stage.getAttribute('data-surface') !== 'whiteboard'
      stage.setAttribute('data-surface', white ? 'whiteboard' : 'felt')
      surfaceBtn.setAttribute('aria-pressed', String(white))
      ui.setButton(surfaceBtn, 'board', white ? 'Felt board' : 'Whiteboard')
    }
    var io = null
    function toggleMode() {
      var toLinear = root.classList.contains('board-on')
      root.classList.toggle('board-on', !toLinear)
      root.classList.toggle('vz-on', !toLinear)
      modeBtn.setAttribute('aria-pressed', String(toLinear))
      ui.setButton(modeBtn, toLinear ? 'pin' : 'rows', toLinear ? 'Back to the board' : 'Read as one page')
      if (toLinear) {
        sel.interrupt()
        world.style.transform = ''
        S.rebuildAll(world)
        io = S.observe(items)
      } else {
        if (io) { io.disconnect(); io = null }
        S.rebuildAll(world)
        drawStrings()
        drawMinimap()
        goStep(step, true)
        stage.scrollIntoView({ block: 'start' })
      }
    }

    // ── start ──────────────────────────────────────────────────────────────
    S.build(world)
    drawStrings()
    drawMinimap()
    var s0 = ui.hashNumber('step')
    goStep(s0 ? s0 - 1 : 0, true)
    items.forEach(function (el) { if (el.matches('.bare')) S.enter(el) })
    var rt = null
    window.addEventListener('resize', function () {
      if (!root.classList.contains('board-on')) return
      clearTimeout(rt)
      rt = setTimeout(function () { drawMinimap(); goStep(step, true) }, 150)
    })
    // web fonts change card heights: re-measure strings and the minimap
    ui.afterFonts(function () {
      if (!root.classList.contains('board-on')) return
      drawStrings()
      drawMinimap()
    })
  }
})()
