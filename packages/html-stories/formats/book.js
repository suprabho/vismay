/*
 * vizmaya book format, v1: the runtime behind book@1.js (which bundles the
 * story runtime above it). Pair with book@1.css.
 *
 * Contract: <main class="stage"> holds <div class="pages">, whose children
 * are the pages (<article class="page" data-unit>) in reading order. Wide
 * screens show a two-page spread: sheet k carries page 2k on its front and
 * page 2k+1 on its back, so page 1 sits alone on the right like a cover.
 * Narrow screens show one page per sheet with a blank back. A turn is one
 * 0→1 tween of the sheet's rotateY and --vz-s (shading); dragging scrubs the
 * same value. Story.enter() runs on the visible pages after each turn.
 *
 * Optional: data-title on .pages (left-hand running heads; default: the
 * document title), data-head on a page (its right-hand running head),
 * data-label (what the counter says), .bare (no head or folio; .cover,
 * .backcover and .endpaper count as bare), .book-only, data-goto="<page>".
 */
(function () {
  'use strict'
  var S = window.Story
  if (!S || !S.ui) return
  var ui = S.ui
  var SRC = document.currentScript && document.currentScript.src
  ui.boot('book', SRC, start)

  function start() {
    var doc = document
    var root = doc.documentElement
    var stage = doc.querySelector('.stage')
    var pagesEl = stage && stage.querySelector('.pages')
    if (!pagesEl) { ui.warn('book: no <div class="pages"> inside <main class="stage">; the page stays one column'); return }
    var pages = [].filter.call(pagesEl.children, function (el) { return el.matches('.page, [data-unit]') })
    if (!pages.length) { ui.warn('book: .pages has no pages'); return }

    ui.themeVars()
    ui.markAura()
    var reduced = S.reduced
    var cs = getComputedStyle(pagesEl)
    var PW = parseFloat(cs.getPropertyValue('--pw')) || 400
    var PH = parseFloat(cs.getPropertyValue('--ph')) || 580
    var title = pagesEl.getAttribute('data-title') || doc.title || ''

    // ── chrome: the table, the desk, the controls ──────────────────────────
    var table = doc.createElement('div')
    table.className = 'vz-table'
    table.setAttribute('aria-hidden', 'true')
    stage.insertBefore(table, stage.firstChild)
    var desk = doc.createElement('div')
    desk.className = 'vz-desk'
    stage.insertBefore(desk, pagesEl)

    var nav = doc.createElement('nav')
    nav.className = 'vz-controls'
    nav.setAttribute('aria-label', 'Book controls')
    var prevBtn = ui.button({ icon: 'prev', aria: 'Previous page', cls: 'vz-only', onClick: function () { go(-1) } })
    var where = doc.createElement('span')
    where.className = 'vz-where vz-only'
    where.setAttribute('aria-live', 'polite')
    var nextBtn = ui.button({ icon: 'next', aria: 'Next page', cls: 'vz-only', onClick: function () { go(1) } })
    var sep = doc.createElement('span')
    sep.className = 'vz-sep vz-only'
    var modeBtn = ui.button({ icon: 'rows', label: 'Read as one page', pressed: false, onClick: toggleMode })
    var fsBtn = ui.button({ icon: 'expand', aria: 'Full screen', cls: 'vz-only' })
    fsBtn.hidden = true
    ;[prevBtn, where, nextBtn, sep, modeBtn, fsBtn].forEach(function (el) { nav.appendChild(el) })
    stage.appendChild(nav)
    ui.fullscreen(fsBtn, stage)

    // running heads and folios
    pages.forEach(function (p, i) {
      var side = i % 2 ? 'left' : 'right'
      p.setAttribute('data-side', side)
      if (p.matches('.bare, .cover, .backcover, .endpaper') || p.querySelector(':scope > .vz-head')) return
      var head = doc.createElement('div')
      head.className = 'vz-head'
      head.setAttribute('aria-hidden', 'true')
      head.textContent = side === 'left' ? title : (p.getAttribute('data-head') || '')
      var folio = doc.createElement('div')
      folio.className = 'vz-folio'
      folio.setAttribute('aria-hidden', 'true')
      folio.textContent = String(i + 1)
      p.insertBefore(head, p.firstChild)
      p.appendChild(folio)
    })

    var book, fit, sheets = [], single = false, cur = 0, busy = false, mounted = false, pendingLayout = false

    function build() {
      desk.innerHTML = ''
      fit = doc.createElement('div')
      fit.className = 'vz-book-fit'
      book = doc.createElement('div')
      book.className = 'vz-book' + (single ? ' vz-single' : '')
      fit.appendChild(book)
      desk.appendChild(fit)
      sheets = []
      var per = single ? 1 : 2
      for (var i = 0; i < pages.length; i += per) {
        var sh = doc.createElement('div')
        sh.className = 'vz-sheet'
        var f = doc.createElement('div')
        f.className = 'vz-face vz-front'
        f.appendChild(pages[i])
        var b = doc.createElement('div')
        b.className = 'vz-face vz-back'
        if (per === 2 && pages[i + 1]) b.appendChild(pages[i + 1])
        else {
          var bl = doc.createElement('div')
          bl.className = 'vz-blank'
          b.appendChild(bl)
        }
        sh.appendChild(f)
        sh.appendChild(b)
        book.appendChild(sh)
        sheets.push(sh)
      }
    }
    function unmount() {
      pages.forEach(function (p) { pagesEl.appendChild(p) })
      desk.innerHTML = ''
      mounted = false
    }

    function layout() {
      if (busy) { pendingLayout = true; return }
      var w = desk.clientWidth, h = desk.clientHeight
      var wantSingle = w < 720 || w / (2 * PW) < 0.8
      if (!mounted || wantSingle !== single) {
        // keep the reader on the same page when switching between spread and single
        var page = firstVisiblePage()
        single = wantSingle
        build()
        mounted = true
        cur = sheetForPage(page)
      }
      var bw = single ? PW : PW * 2
      var gut = w < 520 ? 8 : 40
      var s = Math.max(0.1, Math.min((w - gut * 2) / bw, (h - 24) / PH, 1.45))
      fit.style.transform = 'scale(' + s + ') translate(' + (-bw / 2) + 'px,' + (-PH / 2) + 'px)'
      render()
      S.build(book)
      show()
    }
    function firstVisiblePage() {
      if (!mounted) return 0
      return single ? cur : Math.max(0, cur * 2 - 1)
    }
    function sheetForPage(p) {
      if (single) return Math.min(p, sheets.length - 1)
      return Math.min(Math.ceil(p / 2), sheets.length)
    }
    function maxCur() { return single ? sheets.length - 1 : sheets.length }

    // ── rest ───────────────────────────────────────────────────────────────
    // Only a turning sheet is 3D (.vz-turning: rotateY, preserve-3d and
    // will-change: transform). At rest every sheet is flat and the ones that
    // can't be seen are hidden: a permanent 3D sheet is a compositing layer,
    // and Chrome keeps every face of every sheet as tiles at the book's scale
    // × the device pixel ratio, about 0.5 GB for a 20-page book on a 3.5×
    // phone, where Android Chrome has 256 MB, so pages (and parts of the
    // page) never draw. At rest only the open spread is painted: sheet cur
    // and, turned, sheet cur - 1 (.vz-left lays its back on the left page).
    function setTurn(sh, p) {
      sh.style.transform = 'rotateY(' + (-180 * p) + 'deg)'
      sh.style.setProperty('--vz-s', p)
    }
    function lift(sh) {
      // a sheet starts to turn; the page it uncovers is shown beneath it
      // (on phones a sheet turning back covers the page, uncovering nothing)
      var i = sheets.indexOf(sh), turned = i < cur
      var under = sheets[turned ? i - 1 : i + 1]
      if (under && !(single && turned)) under.classList.remove('vz-gone')
      sh.classList.remove('vz-gone', 'vz-left')
      sh.classList.add('vz-turning')
      sh.style.zIndex = sheets.length + 10
      setTurn(sh, turned ? 1 : 0)
    }
    function centre(next) {
      // a closed book sits centred, and so does the back cover at the end
      if (single) {
        book.style.setProperty('--vz-shift', '0px')
        book.style.setProperty('--vz-shadow-l', '0')
        book.style.setProperty('--vz-shadow-r', '0')
        return
      }
      var n = sheets.length
      book.style.setProperty('--vz-shift', (next === 0 ? -PW / 2 : next === n ? PW / 2 : 0) + 'px')
      book.style.setProperty('--vz-shadow-l', next === 0 ? '50%' : '0')
      book.style.setProperty('--vz-shadow-r', next === n ? '50%' : '0')
    }
    function render() {
      var n = sheets.length
      sheets.forEach(function (sh, i) {
        var turned = i < cur
        sh.classList.remove('vz-turning')
        sh.classList.toggle('vz-left', turned)
        sh.style.transform = ''
        sh.style.setProperty('--vz-s', turned ? 1 : 0)
        sh.style.zIndex = turned ? i + 1 : n - i
        sh.classList.toggle('vz-gone', single ? i !== cur : i !== cur && i !== cur - 1)
      })
      centre(cur)
    }
    function visiblePages() {
      var out = []
      if (single) out.push(pages[cur])
      else {
        if (cur > 0) out.push(pages[cur * 2 - 1])
        if (cur < sheets.length) out.push(pages[cur * 2])
      }
      return out.filter(Boolean)
    }
    function show() {
      var vis = visiblePages()
      pages.forEach(function (p) { ui.reachable(p, vis.indexOf(p) !== -1) })
      vis.forEach(function (p) { S.enter(p) })
      var idx = vis.map(function (p) { return pages.indexOf(p) + 1 })
      where.textContent = vis.length && vis[0].matches('.cover') ? 'Cover'
        : idx.length > 1 ? 'Pages ' + idx[0] + '–' + idx[1] + ' of ' + pages.length
        : 'Page ' + idx[0] + ' of ' + pages.length
      prevBtn.disabled = cur === 0
      nextBtn.disabled = cur >= maxCur()
      ui.setHash('p=' + idx[0])
    }

    // ── turning ────────────────────────────────────────────────────────────
    function tween(sh, from, to, ms, done) {
      if (reduced || ms <= 0) { setTurn(sh, to); done(); return }
      var t0 = null
      function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2 }
      function frame(t) {
        if (t0 === null) t0 = t
        var k = Math.min(1, (t - t0) / ms)
        setTurn(sh, from + (to - from) * ease(k))
        if (k < 1) requestAnimationFrame(frame)
        else done()
      }
      requestAnimationFrame(frame)
    }
    function settle() {
      busy = false
      if (pendingLayout) { pendingLayout = false; layout() }
    }
    function go(dir, fromP, ms) {
      if (busy || !mounted) return
      if (dir > 0 && cur >= maxCur()) return
      if (dir < 0 && cur <= 0) return
      var sh = dir > 0 ? sheets[cur] : sheets[cur - 1]
      busy = true
      lift(sh)
      var from = fromP != null ? fromP : (dir > 0 ? 0 : 1)
      centre(cur + dir) // the book slides to centre while the cover or back cover turns
      tween(sh, from, dir > 0 ? 1 : 0, ms != null ? ms : 900 * Math.abs((dir > 0 ? 1 : 0) - from), function () {
        cur += dir
        render()
        show()
        settle()
      })
    }
    function cancel(sh, fromP, back) {
      busy = true
      tween(sh, fromP, back, 300, function () { render(); settle() })
    }
    function goTo(sheet) {
      if (busy) return
      cur = Math.max(0, Math.min(maxCur(), sheet))
      render()
      show()
    }

    // ── input: tap, drag, keys ─────────────────────────────────────────────
    var drag = null
    desk.addEventListener('pointerdown', function (e) {
      if (busy || e.button > 0 || !fit) return
      if (e.target.closest('a, button, input, select, textarea, label, summary')) return
      var rect = fit.getBoundingClientRect()
      var mid = single ? rect.left + rect.width * 0.4 : rect.left + rect.width / 2
      var dir = e.clientX >= mid ? 1 : -1
      if (cur === 0) dir = 1
      if (cur >= maxCur()) dir = -1
      drag = { x: e.clientX, dir: dir, w: rect.width / (single ? 1 : 2), moved: false, p: null, sh: null, id: e.pointerId }
    })
    desk.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return
      var dx = e.clientX - drag.x
      if (!drag.moved && Math.abs(dx) < 8) return
      if (!drag.moved) {
        if ((drag.dir > 0 && cur >= maxCur()) || (drag.dir < 0 && cur <= 0)) { drag = null; return }
        drag.moved = true
        drag.sh = drag.dir > 0 ? sheets[cur] : sheets[cur - 1]
        lift(drag.sh)
        try { desk.setPointerCapture(e.pointerId) } catch (err) {}
      }
      var span = drag.w * (single ? 1.2 : 2)
      var p = drag.dir > 0 ? Math.min(1, Math.max(0, -dx / span)) : Math.min(1, Math.max(0, 1 - dx / span))
      drag.p = p
      setTurn(drag.sh, p)
    })
    function endDrag(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return
      var d = drag
      drag = null
      if (!d.moved) {
        if (e.type === 'pointerup') go(d.dir)
        return
      }
      var p = d.p == null ? (d.dir > 0 ? 0 : 1) : d.p
      if (d.dir > 0) {
        if (p > 0.3) go(1, p, 500 * (1 - p) + 120)
        else cancel(d.sh, p, 0)
      } else if (p < 0.7) go(-1, p, 500 * p + 120)
      else cancel(d.sh, p, 1)
    }
    desk.addEventListener('pointerup', endDrag)
    desk.addEventListener('pointercancel', endDrag)
    ui.keys('book-on', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(1) }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1) }
      else if (e.key === 'Home') { e.preventDefault(); goTo(0) }
      else if (e.key === 'End') { e.preventDefault(); goTo(maxCur()) }
    })
    stage.addEventListener('click', function (e) {
      var b = e.target.closest('[data-goto]')
      if (!b) return
      var n = Math.max(1, parseInt(b.getAttribute('data-goto'), 10) || 1)
      if (root.classList.contains('book-on')) goTo(sheetForPage(n - 1))
      else if (pages[n - 1]) pages[n - 1].scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
    })

    // ── the book, or one long page ─────────────────────────────────────────
    var io = null
    function linearOn() {
      unmount()
      root.classList.remove('book-on', 'vz-on')
      modeBtn.setAttribute('aria-pressed', 'true')
      ui.setButton(modeBtn, 'book', 'Read as a book')
      pages.forEach(function (p) { ui.reachable(p, true) })
      S.rebuildAll(pagesEl)
      io = S.observe(pages)
    }
    function bookOn() {
      if (io) { io.disconnect(); io = null }
      root.classList.add('book-on', 'vz-on')
      modeBtn.setAttribute('aria-pressed', 'false')
      ui.setButton(modeBtn, 'rows', 'Read as one page')
      layout()
      S.rebuildAll(book)
    }
    function toggleMode() {
      if (root.classList.contains('book-on')) linearOn()
      else {
        bookOn()
        stage.scrollIntoView({ block: 'start' })
      }
    }

    // ── start ──────────────────────────────────────────────────────────────
    root.classList.add('js', 'vz-on', 'book-on')
    layout()
    var p0 = ui.hashNumber('p')
    if (p0) goTo(sheetForPage(Math.max(0, p0 - 1)))
    var rt = null
    window.addEventListener('resize', function () {
      if (!root.classList.contains('book-on')) return
      clearTimeout(rt)
      rt = setTimeout(layout, 120)
    })
    ui.afterFonts(function () {
      if (!root.classList.contains('book-on')) return
      ui.reportOverflow('book', pages, function (p, i) {
        return 'page ' + (i + 1) + (p.getAttribute('data-label') ? ' ("' + p.getAttribute('data-label') + '")' : '')
      })
    })
  }
})()
