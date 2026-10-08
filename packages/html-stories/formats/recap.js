/*
 * vizmaya recap format, v1: the runtime behind recap@1.js (which bundles the
 * story runtime above it). Pair with recap@1.css. vizf1 only: the replay is
 * the site's 3D race replay (/embed/replay), framed beside the story.
 *
 * Contract: <main class="stage"> holds
 *   <div class="replay" data-session="<session_key>" data-laps="71" data-alt="…">
 *   <div class="chapters"> of <section class="chapter" data-unit data-label="…">
 * The page scrolls as usual; the replay stays on screen beside the chapters
 * (above them on phones). Cues move it: a chapter, or any element inside
 * one, with data-lap (seek to the start of that lap) or data-at (an exact
 * session time, in seconds), and optionally data-cam (auto, pov, chase, tv,
 * heli, orbit) and data-focus (a driver's three-letter code). An element
 * without data-cam or data-focus takes its chapter's. The cue in charge is
 * the last one whose top has scrolled past the reading line, so a chapter
 * can move the replay several times as it is read.
 *
 * Story.enter() runs on a chapter when it becomes the current one, so its
 * charts play then. "Read as one page" drops the replay; the chapters then
 * enter as they come up the screen.
 */
(function () {
  'use strict'
  var S = window.Story
  if (!S || !S.ui) return
  var ui = S.ui
  var SRC = document.currentScript && document.currentScript.src
  ui.boot('recap', SRC, start)

  var CAMS = { auto: 1, pov: 1, chase: 1, tv: 1, heli: 1, orbit: 1 }

  function start() {
    var doc = document
    var root = doc.documentElement
    var stage = doc.querySelector('.stage')
    var replay = stage && stage.querySelector('.replay')
    var rail = stage && stage.querySelector('.chapters')
    if (!replay || !rail) { ui.warn('recap: <main class="stage"> needs a <div class="replay"> and a <div class="chapters">; the page stays one column'); return }
    var chapters = [].filter.call(rail.children, function (el) { return el.matches('.chapter') })
    if (!chapters.length) { ui.warn('recap: .chapters has no <section class="chapter"> elements'); return }
    var session = replay.getAttribute('data-session') || ''
    if (!session) ui.warn('recap: .replay has no data-session; the replay plays the demo race')
    var laps = +replay.getAttribute('data-laps') || 0

    ui.themeVars()
    ui.markAura()

    // ── the replay ─────────────────────────────────────────────────────────
    // The site that serves this runtime serves the replay (data-src overrides,
    // for previews off the site).
    var base = replay.getAttribute('data-src') || (function () {
      try { return new URL(SRC).origin + '/embed/replay' } catch (e) { return '/embed/replay' }
    })()
    var frame = doc.createElement('iframe')
    frame.className = 'vz-replay-frame'
    frame.title = replay.getAttribute('data-alt') || 'Race replay'
    frame.setAttribute('loading', 'eager')
    var first = cueOf(chapters[0])
    frame.src = base + '?session=' + encodeURIComponent(session || 'demo') + (laps ? '&laps=' + laps : '') + query(first)
    replay.appendChild(frame)
    var ready = false
    window.addEventListener('message', function (e) {
      if (e.source !== frame.contentWindow || !e.data) return
      if (e.data.type === 'vizf1:replay-ready') {
        ready = true
        if (cur) send(cur)
      }
    })

    // ── chapter nav ────────────────────────────────────────────────────────
    var nav = doc.createElement('nav')
    // In the one-page view the nav keeps only the mode button (recap.css).
    nav.className = 'vz-recap-nav'
    nav.setAttribute('aria-label', 'Chapters')
    var list = doc.createElement('ol')
    var navBtns = chapters.map(function (ch, i) {
      var li = doc.createElement('li')
      var b = doc.createElement('button')
      b.type = 'button'
      var label = ch.getAttribute('data-label') || textOf(ch.querySelector('h2, h3')) || 'Chapter ' + (i + 1)
      b.innerHTML = '<span class="vz-n">' + pad(i + 1) + '</span><span class="vz-t"></span>'
      b.querySelector('.vz-t').textContent = label
      b.addEventListener('click', function () { goChapter(i) })
      li.appendChild(b)
      list.appendChild(li)
      return b
    })
    nav.appendChild(list)
    var count = doc.createElement('span')
    count.className = 'vz-count'
    count.setAttribute('aria-live', 'polite')
    nav.appendChild(count)
    var modeBtn = ui.button({ icon: 'rows', label: 'Read as one page', pressed: false, onClick: toggleMode })
    nav.appendChild(modeBtn)
    rail.parentNode.insertBefore(nav, rail)

    root.classList.add('js', 'vz-on', 'recap-on')

    // ── cues ───────────────────────────────────────────────────────────────
    var cues = [].slice.call(rail.querySelectorAll('[data-lap], [data-at]')).filter(function (el) {
      return el.closest('.chapter')
    })
    chapters.forEach(function (ch) {
      if (!ch.matches('[data-lap], [data-at]')) ui.warn('recap: chapter "' + (ch.getAttribute('data-label') || textOf(ch.querySelector('h2, h3'))) + '" has no data-lap or data-at; it keeps the replay where it was')
    })
    function cueOf(el) {
      var ch = el.closest('.chapter') || el
      var lap = parseFloat(el.getAttribute('data-lap'))
      var at = parseFloat(el.getAttribute('data-at'))
      var cam = el.getAttribute('data-cam') || ch.getAttribute('data-cam')
      var focus = el.getAttribute('data-focus') || ch.getAttribute('data-focus')
      return {
        lap: isFinite(lap) ? lap : undefined,
        at: isFinite(at) ? at : undefined,
        cam: cam && CAMS[cam] ? cam : undefined,
        focus: focus ? focus.toUpperCase() : undefined,
        play: el.getAttribute('data-play') === 'false' ? false : undefined
      }
    }
    function query(c) {
      var q = ''
      if (c.lap != null) q += '&lap=' + c.lap
      if (c.at != null) q += '&at=' + c.at
      if (c.cam) q += '&cam=' + c.cam
      if (c.focus) q += '&focus=' + encodeURIComponent(c.focus)
      return q
    }
    function send(c) {
      if (!ready) return
      try {
        frame.contentWindow.postMessage({
          type: 'vizf1:replay-cue', lap: c.lap, at: c.at, cam: c.cam, focus: c.focus, play: c.play, laps: laps || undefined
        }, '*')
      } catch (e) {}
    }

    // ── where the reader is ────────────────────────────────────────────────
    var cur = null, curEl = null, chapter = -1
    // The reading line: 40% down what the replay leaves of the screen.
    function line() {
      var top = 0
      if (getComputedStyle(replay).position === 'sticky' && rail.getBoundingClientRect().left < replay.getBoundingClientRect().right - 1) {
        top = replay.getBoundingClientRect().bottom
      }
      return top + (window.innerHeight - top) * 0.4
    }
    function update() {
      if (!root.classList.contains('recap-on')) return
      var y = line()
      var el = null
      for (var i = 0; i < cues.length; i++) {
        if (cues[i].getBoundingClientRect().top <= y) el = cues[i]
        else break
      }
      el = el || cues[0] || chapters[0]
      var ch = chapters.indexOf(el.closest('.chapter'))
      if (ch !== chapter) setChapter(ch)
      if (el !== curEl) {
        if (curEl) curEl.classList.remove('vz-cue-on')
        curEl = el
        if (el.matches('[data-lap], [data-at]')) {
          el.classList.add('vz-cue-on')
          cur = cueOf(el)
          send(cur)
        }
      }
    }
    function setChapter(i) {
      chapter = i
      chapters.forEach(function (ch, j) { ch.classList.toggle('vz-cur', j === i) })
      navBtns.forEach(function (b, j) {
        if (j === i) b.setAttribute('aria-current', 'step')
        else b.removeAttribute('aria-current')
      })
      var b = navBtns[i]
      if (b && b.scrollIntoView && list.scrollWidth > list.clientWidth) {
        list.scrollTo({ left: b.parentNode.offsetLeft - 16, behavior: S.reduced ? 'auto' : 'smooth' })
      }
      count.textContent = (i + 1) + ' of ' + chapters.length
      S.enter(chapters[i])
      ui.setHash('c=' + (i + 1))
    }
    function goChapter(i) {
      i = Math.max(0, Math.min(chapters.length - 1, i))
      // Land the chapter's top just above the reading line.
      var y = window.scrollY + chapters[i].getBoundingClientRect().top - line() + 24
      window.scrollTo({ top: Math.max(0, y), behavior: S.reduced ? 'auto' : 'smooth' })
    }
    var raf = 0
    function schedule() {
      if (raf) return
      raf = requestAnimationFrame(function () { raf = 0; update() })
    }
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', function () {
      schedule()
      if (root.classList.contains('recap-on')) S.rebuildAll(rail)
    })
    ui.keys('recap-on', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); goChapter(chapter + 1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goChapter(chapter - 1) }
    })

    // ── modes ──────────────────────────────────────────────────────────────
    var io = null
    function toggleMode() {
      var toLinear = root.classList.contains('recap-on')
      root.classList.toggle('recap-on', !toLinear)
      root.classList.toggle('vz-on', !toLinear)
      modeBtn.setAttribute('aria-pressed', String(toLinear))
      ui.setButton(modeBtn, toLinear ? 'replay' : 'rows', toLinear ? 'Back to the replay' : 'Read as one page')
      // Pause the replay while it's out of sight.
      try { frame.contentWindow.postMessage({ type: 'vizf1:replay-play', playing: !toLinear }, '*') } catch (e) {}
      S.rebuildAll(rail)
      if (toLinear) {
        io = S.observe(chapters)
      } else {
        if (io) { io.disconnect(); io = null }
        curEl = null
        chapter = -1
        update()
      }
      stage.scrollIntoView({ block: 'start' })
    }
    // ── start ──────────────────────────────────────────────────────────────
    S.build(rail)
    var c0 = ui.hashNumber('c')
    update()
    if (c0 && c0 > 1) ui.afterFonts(function () { goChapter(c0 - 1) })
  }

  function pad(n) { return n < 10 ? '0' + n : String(n) }
  function textOf(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : '' }
})()
