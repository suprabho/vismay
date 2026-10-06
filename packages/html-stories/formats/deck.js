/*
 * vizmaya deck format, v1: the runtime behind deck@1.js (which bundles the
 * story runtime above it). Pair with deck@1.css.
 *
 * Contract: <main class="stage"> holds <div class="deck">, whose
 * <section class="slide" data-unit> children are the slides in order.
 * Slides are laid out at a fixed frame (see deck.css) and the deck is scaled
 * to fit. Two presentations of one DOM:
 *   slides  one frame; the current slide is .vz-cur, the others .vz-before
 *           and .vz-after, and a swipe follows the finger
 *   cards   a stack; the next three cards fan out behind the current one,
 *           and a swiped card is dealt off in the direction it was thrown
 * Story.enter() runs on each slide as it becomes current.
 *
 * Optional: data-title on .deck (the folio's title; default: the document
 * title), .bare on a slide (no folio).
 */
(function () {
  'use strict'
  var S = window.Story
  if (!S || !S.ui) return
  var ui = S.ui
  var SRC = document.currentScript && document.currentScript.src
  var FRAMES = { landscape: [1280, 720], portrait: [450, 780], card: [460, 680] }
  ui.boot('deck', SRC, start)

  function start() {
    var doc = document
    var root = doc.documentElement
    var stage = doc.querySelector('.stage')
    var deck = stage && stage.querySelector('.deck')
    if (!deck) { ui.warn('deck: no <div class="deck"> inside <main class="stage">; the page stays one column'); return }
    var slides = [].filter.call(deck.children, function (el) { return el.matches('.slide, [data-unit]') })
    if (!slides.length) { ui.warn('deck: .deck has no slides'); return }

    ui.themeVars()
    ui.markAura()
    var reduced = S.reduced
    var title = deck.getAttribute('data-title') || doc.title || ''
    var cur = 0, mode = 'slides', frame = null
    var thrown = {} // card index → the direction it was dealt off (-1 left, 1 right)

    if (!stage.hasAttribute('aria-roledescription')) stage.setAttribute('aria-roledescription', 'carousel')
    slides.forEach(function (s, i) {
      if (!s.hasAttribute('aria-roledescription')) s.setAttribute('aria-roledescription', 'slide')
      if (s.matches('.bare') || s.querySelector(':scope > .vz-folio')) return
      var f = doc.createElement('div')
      f.className = 'vz-folio'
      f.setAttribute('aria-hidden', 'true')
      var a = doc.createElement('span')
      a.textContent = title
      var b = doc.createElement('span')
      b.textContent = (i + 1) + ' / ' + slides.length
      f.appendChild(a)
      f.appendChild(b)
      s.appendChild(f)
    })

    // ── chrome ─────────────────────────────────────────────────────────────
    var table = doc.createElement('div')
    table.className = 'vz-table'
    table.setAttribute('aria-hidden', 'true')
    stage.insertBefore(table, stage.firstChild)
    var desk = doc.createElement('div')
    desk.className = 'vz-desk'
    var fit = doc.createElement('div')
    fit.className = 'vz-deck-fit'
    deck.parentNode.insertBefore(desk, deck)
    desk.appendChild(fit)
    fit.appendChild(deck)
    var progress = doc.createElement('div')
    progress.className = 'vz-progress vz-only'
    progress.setAttribute('aria-hidden', 'true')
    var bar = doc.createElement('i')
    progress.appendChild(bar)
    desk.insertBefore(progress, fit)

    var nav = doc.createElement('nav')
    nav.className = 'vz-controls'
    nav.setAttribute('aria-label', 'Deck controls')
    var prevBtn = ui.button({ icon: 'prev', aria: 'Previous slide', cls: 'vz-only', onClick: function () { go(cur - 1) } })
    var where = doc.createElement('span')
    where.className = 'vz-where vz-only'
    where.setAttribute('aria-live', 'polite')
    var nextBtn = ui.button({ icon: 'next', aria: 'Next slide', cls: 'vz-only', onClick: function () { go(cur + 1) } })
    var sep = doc.createElement('span')
    sep.className = 'vz-sep vz-only'
    var seg = doc.createElement('span')
    seg.className = 'vz-seg vz-only'
    seg.setAttribute('role', 'group')
    seg.setAttribute('aria-label', 'Show as')
    var mSlides = doc.createElement('button')
    mSlides.type = 'button'
    mSlides.innerHTML = ui.icon('slides') + '<span class="vz-label">Slides</span>'
    mSlides.addEventListener('click', function () { setMode('slides') })
    var mCards = doc.createElement('button')
    mCards.type = 'button'
    mCards.innerHTML = ui.icon('cards') + '<span class="vz-label">Cards</span>'
    mCards.addEventListener('click', function () { setMode('cards') })
    seg.appendChild(mSlides)
    seg.appendChild(mCards)
    var modeBtn = ui.button({ icon: 'rows', label: 'Read as one page', pressed: false, onClick: toggleMode })
    var fsBtn = ui.button({ icon: 'expand', aria: 'Full screen', cls: 'vz-only vz-fs' })
    fsBtn.hidden = true
    ;[prevBtn, where, nextBtn, sep, seg, modeBtn, fsBtn].forEach(function (el) { nav.appendChild(el) })
    stage.appendChild(nav)
    ui.fullscreen(fsBtn, stage)

    function setFrame(f) {
      deck.style.setProperty('--vz-fw', f[0] + 'px')
      deck.style.setProperty('--vz-fh', f[1] + 'px')
    }
    // the frame each slide is laid out at before the deck is scaled to fit
    function frameFor(w, h) {
      if (mode === 'cards') return FRAMES.card
      return w / h >= 1.05 ? FRAMES.landscape : FRAMES.portrait
    }
    function layout(force) {
      var w = desk.clientWidth, h = desk.clientHeight
      var f = frameFor(w, h)
      var changed = !frame || f[0] !== frame[0] || f[1] !== frame[1]
      frame = f
      setFrame(f)
      var gut = w < 520 ? 8 : 32
      var room = mode === 'cards' ? 50 : 0
      var s = Math.max(0.1, Math.min((w - gut * 2) / f[0], (h - 24 - room) / f[1], mode === 'cards' ? 1.25 : 1.6))
      fit.style.transform = 'scale(' + s + ') translate(' + (-f[0] / 2) + 'px,' + (-f[1] / 2 - room / 2 / s) + 'px)'
      if (changed || force) S.rebuildAll(deck)
      render(true)
    }

    // ── positions ──────────────────────────────────────────────────────────
    function cardTransform(depth) {
      // depth 0 is the top card; deeper cards fan out behind it
      var d = Math.min(depth, 3)
      return 'translateY(' + d * 16 + 'px) scale(' + (1 - d * 0.035) + ') rotate(' + [0, -2.2, 1.8, -1.2][d] + 'deg)'
    }
    function thrownTransform(i) {
      var dir = thrown[i] || -1
      return 'translateX(' + dir * 135 + '%) rotate(' + dir * 16 + 'deg)'
    }
    function render(instant) {
      slides.forEach(function (s, i) {
        s.classList.toggle('vz-cur', i === cur)
        s.classList.toggle('vz-before', i < cur)
        s.classList.toggle('vz-after', i > cur)
        if (instant) s.style.transition = 'none'
        if (mode === 'cards') {
          var d = i - cur
          s.style.zIndex = String(100 - Math.abs(d))
          s.style.transform = d < 0 ? thrownTransform(i) : cardTransform(d)
          s.style.opacity = d < 0 || d > 3 ? '0' : '1'
        } else {
          s.style.zIndex = ''
          s.style.transform = ''
          s.style.opacity = ''
        }
        ui.reachable(s, i === cur)
      })
      if (instant) {
        void deck.offsetWidth
        slides.forEach(function (s) { s.style.transition = '' })
      }
      where.textContent = (cur + 1) + ' of ' + slides.length
      bar.style.width = ((cur + 1) / slides.length * 100) + '%'
      prevBtn.disabled = cur === 0
      nextBtn.disabled = cur === slides.length - 1
      S.enter(slides[cur])
      ui.setHash('s=' + (cur + 1) + (mode === 'cards' ? '&cards' : ''))
    }
    function go(i, dir) {
      if (!root.classList.contains('deck-on')) return
      i = Math.max(0, Math.min(slides.length - 1, i))
      if (i === cur) { render(); return }
      if (i > cur && mode === 'cards') thrown[cur] = dir || -1
      cur = i
      render(reduced)
    }

    // ── input ──────────────────────────────────────────────────────────────
    ui.keys('deck-on', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && e.target === doc.body)) { e.preventDefault(); go(cur + 1) }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(cur - 1) }
      else if (e.key === 'Home') { e.preventDefault(); go(0) }
      else if (e.key === 'End') { e.preventDefault(); go(slides.length - 1) }
    })
    // swipe / drag: slides follow the finger; a card is thrown either way to deal the next
    var drag = null
    desk.addEventListener('pointerdown', function (e) {
      if (!root.classList.contains('deck-on') || e.button > 0 || e.target.closest('a, button, input, select, textarea, label, summary')) return
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, el: slides[cur], dx: 0 }
    })
    desk.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y
      if (!drag.moved) {
        if (Math.abs(dx) < 8 || Math.abs(dy) > Math.abs(dx)) return
        drag.moved = true
        drag.el.classList.add('vz-dragging')
        try { desk.setPointerCapture(e.pointerId) } catch (err) {}
      }
      var x = dx / (fit.getBoundingClientRect().width / frame[0])
      if (mode === 'cards') drag.el.style.transform = 'translateX(' + x + 'px) rotate(' + x / 30 + 'deg)'
      else {
        var edge = (cur === 0 && x > 0) || (cur === slides.length - 1 && x < 0)
        drag.el.style.transform = 'translateX(' + (edge ? x / 4 : x / 2) + 'px)'
      }
      drag.dx = dx
    })
    function end(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return
      var d = drag
      drag = null
      if (!d.moved) {
        // a tap on the left fifth goes back, anywhere else forward
        var r = fit.getBoundingClientRect()
        if (e.type === 'pointerup' && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          go(e.clientX < r.left + r.width * 0.2 ? cur - 1 : cur + 1)
        }
        return
      }
      d.el.classList.remove('vz-dragging')
      var far = Math.abs(d.dx) > 70
      if (mode === 'cards' && far && cur < slides.length - 1) go(cur + 1, d.dx > 0 ? 1 : -1)
      else if (mode === 'slides' && far) go(d.dx < 0 ? cur + 1 : cur - 1)
      else render()
    }
    desk.addEventListener('pointerup', end)
    desk.addEventListener('pointercancel', end)
    stage.addEventListener('click', function (e) {
      var g = e.target.closest('[data-goto]')
      if (!g) return
      var n = Math.max(1, parseInt(g.getAttribute('data-goto'), 10) || 1)
      if (root.classList.contains('deck-on')) go(n - 1)
      else if (slides[n - 1]) slides[n - 1].scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
    })

    // ── slides or cards; the deck or one page ──────────────────────────────
    function setMode(m) {
      mode = m
      root.setAttribute('data-vz-mode', m)
      mSlides.setAttribute('aria-pressed', String(m === 'slides'))
      mCards.setAttribute('aria-pressed', String(m === 'cards'))
      layout()
    }

    var io = null, slots = []
    // One column: each slide keeps a frame and is scaled into the column, so
    // it reads exactly as it does in the deck.
    function placeSlots() {
      var col = Math.min(deck.clientWidth - 32, 1040)
      if (col <= 0) return
      var f = col >= 600 ? FRAMES.landscape : FRAMES.portrait
      var s = col / f[0]
      var changed = !frame || frame[0] !== f[0]
      frame = f
      setFrame(f)
      slots.forEach(function (slot, i) {
        slot.style.width = col + 'px'
        slot.style.height = Math.round(f[1] * s) + 'px'
        slides[i].style.transform = 'scale(' + s + ')'
      })
      if (changed) S.rebuildAll(deck)
    }
    function linearOn() {
      root.classList.remove('deck-on', 'vz-on')
      modeBtn.setAttribute('aria-pressed', 'true')
      ui.setButton(modeBtn, 'slides', 'Back to the deck')
      fit.style.transform = ''
      slots = slides.map(function (s) {
        s.classList.remove('vz-cur', 'vz-before', 'vz-after')
        s.style.transform = ''
        s.style.opacity = ''
        s.style.zIndex = ''
        ui.reachable(s, true)
        var slot = doc.createElement('div')
        slot.className = 'vz-slot'
        deck.insertBefore(slot, s)
        slot.appendChild(s)
        return slot
      })
      frame = null
      placeSlots()
      io = S.observe(slides)
    }
    function deckOn() {
      if (io) { io.disconnect(); io = null }
      slots.forEach(function (slot, i) {
        slides[i].style.transform = ''
        deck.insertBefore(slides[i], slot)
        deck.removeChild(slot)
      })
      slots = []
      root.classList.add('deck-on', 'vz-on')
      modeBtn.setAttribute('aria-pressed', 'false')
      ui.setButton(modeBtn, 'rows', 'Read as one page')
      frame = null
      layout(true)
    }
    function toggleMode() {
      if (root.classList.contains('deck-on')) linearOn()
      else {
        deckOn()
        stage.scrollIntoView({ block: 'start' })
      }
    }

    // Overflow check at all three frames; charts step aside while measuring.
    function checkFrames() {
      var keep = frame
      var found = []
      root.classList.add('vz-measure')
      ;['landscape', 'portrait', 'card'].forEach(function (name) {
        var f = FRAMES[name]
        setFrame(f)
        ui.each(slides, function (s, i) {
          var over = s.scrollHeight - s.clientHeight
          if (over > 1) found.push('slide ' + (i + 1) + (s.getAttribute('aria-label') ? ' ("' + s.getAttribute('aria-label') + '")' : '') + ' overflows the ' + name + ' frame (' + f[0] + '×' + f[1] + ') by ' + over + 'px')
        })
      })
      root.classList.remove('vz-measure')
      setFrame(keep)
      found.forEach(function (m) { ui.warn(m) })
      try {
        if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'vizmaya:format-check', format: 'deck', warnings: found }, '*')
      } catch (e) {}
    }

    // ── start ──────────────────────────────────────────────────────────────
    root.classList.add('js', 'vz-on', 'deck-on')
    var s0 = ui.hashNumber('s')
    if (s0) cur = Math.max(0, Math.min(slides.length - 1, s0 - 1))
    setMode(ui.hashHas('cards') ? 'cards' : 'slides')
    var rt = null
    window.addEventListener('resize', function () {
      clearTimeout(rt)
      rt = setTimeout(function () {
        if (root.classList.contains('deck-on')) layout()
        else placeSlots()
      }, 120)
    })
    ui.afterFonts(function () { if (root.classList.contains('deck-on')) checkFrames() })
  }
})()
