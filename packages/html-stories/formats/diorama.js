/*
 * vizmaya diorama format, v1: the runtime behind diorama@1.js (which bundles
 * the story runtime above it). Pair with diorama@1.css. Loads d3@7.9.0 and
 * topojson-client@3.1.0 if the page hasn't, three@0.169.0 for the stage, and
 * world-atlas land for the plates.
 *
 * A diorama is one model seen from many camera positions: a tilted map plate
 * on a plinth (sea), real coastlines stacked as paper strata (terrain),
 * routes and place markers (routes & labels), data props that stand up off
 * the plate (props), fog (atmosphere), and the flat HTML proscenium in front.
 * Scrolling scrubs the camera from one beat's pose to the next; layers fade
 * at the beat threshold.
 *
 * Contract: <main class="stage"> holds
 *   <script type="application/json" class="diorama-data">{…story.json…}</script>
 *   <div class="beats"> of <section class="beat" data-unit data-beat="<id>">,
 *     each with a <div class="copy"> (the proscenium) and matching a beat in
 *     the JSON by id. The JSON beat gives its type, camera pose, layers and
 *     props; the section gives its words.
 *   A stepper beat's .copy holds <ol class="stops"> of <li data-stop="<place>">
 *   (one card per stop; data-ship="galley|raft|none"); the camera follows the
 *   stop the reader has scrolled to, and Back / Sail on buttons step it.
 *   A layers beat gets one toggle per route (into .dio-chips if present).
 * A route's stops are place ids, or [lon, lat] waypoints that only bend it.
 * Every place carries a certainty (excavated, hinge, tradition, contested)
 * and its marker shows it. [data-q="<quantity id>"] on a number ties it to the
 * JSON's quantities, and the runtime warns when they disagree.
 *
 * Without WebGL (or with data-renderer="css" on the stage) the same model is
 * drawn as an inline SVG plate in CSS 3D. Without JS the beats read as one
 * column. Reduced motion: no loops, camera cuts instead of moves, props at
 * full height.
 */
(function () {
  'use strict'
  var S = window.Story
  if (!S || !S.ui) return
  var ui = S.ui
  var w = window
  var doc = document
  var SRC = doc.currentScript && doc.currentScript.src
  var NPM = 'https://cdn.jsdelivr.net/npm/'
  var LIB = {
    d3: NPM + 'd3@7.9.0/dist/d3.min.js',
    topojson: NPM + 'topojson-client@3.1.0/dist/topojson-client.min.js',
    three: NPM + 'three@0.169.0/build/three.module.min.js',
    atlas: NPM + 'world-atlas@2.0.2/'
  }
  ui.boot('diorama', SRC, function () {
    script(LIB.d3, function () { return w.d3 && w.d3.geoPath }, function () {
      script(LIB.topojson, function () { return !!w.topojson }, start)
    })
  })

  function script(src, has, done) {
    if (has()) { done(); return }
    var s = doc.createElement('script')
    s.src = src
    s.onload = function () { done() }
    s.onerror = function () { ui.warn('diorama: ' + src + ' failed to load; the page stays one column') }
    ;(doc.head || doc.documentElement).appendChild(s)
  }

  // ── constants ──────────────────────────────────────────────────────────
  var TOKENS = {
    ground: '#120E16', paper: '#EFE6D6', muted: '#B9AE9C', accent: '#D3A04D',
    'sea-1': '#30346E', 'sea-2': '#241B45', 'sea-3': '#2E0F22',
    land: '#EDE3CF', 'strata-1': '#BFA27A', 'strata-2': '#74563E', 'strata-3': '#22101A',
    'route-2': '#7CC4C9', 'route-3': '#EE8A6B', 'route-4': '#9EA3C9',
    plinth: '#3A1C24', 'plinth-side': '#22101A', fog: '#CFC8DE'
  }
  var CERTAINTY = ['excavated', 'hinge', 'tradition', 'contested']
  var CERTAINTY_LABEL = {
    excavated: 'Excavated: archaeology supports it',
    hinge: 'The hinge: the last solid point',
    tradition: 'Tradition: a literary or local association',
    contested: 'Contested: the evidence is disputed'
  }
  var KM = { km: 1, nm: 1.852, mi: 1.609344, m: 0.001 }
  var WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
    'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty']
  // Land, in plate pixels: three strata under a paper top (the canvas draws
  // the land four times, offset 2, 4.5 and 7px down).
  var STRATA = [[0, 2.5, 'strata-3'], [2.5, 2.5, 'strata-2'], [5, 2, 'strata-1']]
  var LZ = 7
  var MOVE = bezier(0.2, 0.8, 0.2, 1)
  var MAX_LABELS = 8
  var MAX_LABELS_SM = 4
  // Section progress (0 at the top of a beat, 1 at its end, measured at the
  // middle of the screen) where the camera starts for the next beat's pose.
  var MOVE_FROM = 0.55
  var STEP_FROM = 0.06
  var STEP_TO = 0.74

  function bezier(x1, y1, x2, y2) {
    function a(p1, p2) { return 1 - 3 * p2 + 3 * p1 }
    function b(p1, p2) { return 3 * p2 - 6 * p1 }
    function c(p1) { return 3 * p1 }
    function calc(t, p1, p2) { return ((a(p1, p2) * t + b(p1, p2)) * t + c(p1)) * t }
    function slope(t, p1, p2) { return 3 * a(p1, p2) * t * t + 2 * b(p1, p2) * t + c(p1) }
    return function (x) {
      if (x <= 0) return 0
      if (x >= 1) return 1
      var t = x
      for (var i = 0; i < 8; i++) {
        var s = slope(t, x1, x2)
        if (Math.abs(s) < 1e-6) break
        t = Math.min(1, Math.max(0, t - (calc(t, x1, x2) - x) / s))
      }
      return calc(t, y1, y2)
    }
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v }
  function lerp(a, b, t) { return a + (b - a) * t }
  function el(tag, cls, html) {
    var e = doc.createElement(tag)
    if (cls) e.className = cls
    if (html != null) e.innerHTML = html
    return e
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] })
  }
  function mix(a, b, t) {
    var A = rgb(a), B = rgb(b)
    return '#' + [0, 1, 2].map(function (i) { return ('0' + Math.round(lerp(A[i], B[i], t)).toString(16)).slice(-2) }).join('')
  }
  function rgb(hex) {
    var h = String(hex).replace('#', '')
    if (h.length === 3) h = h.replace(/./g, '$&$&')
    var n = parseInt(h.slice(0, 6), 16)
    return isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [200, 200, 200]
  }
  // The point `km` from lonlat along `bearing` degrees.
  function destination(lonlat, bearing, km) {
    var r = Math.PI / 180, d = km / 6371.0088
    var la = lonlat[1] * r, lo = lonlat[0] * r, th = bearing * r
    var la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(th))
    var lo2 = lo + Math.atan2(Math.sin(th) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2))
    return [lo2 / r, la2 / r]
  }

  function circleSamples(cx, cy, r) {
    var n = Math.max(48, Math.ceil((2 * Math.PI * r) / 3)), out = []
    for (var i = 0; i <= n; i++) {
      var a = (i / n) * 2 * Math.PI
      out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), d: (i / n) * 2 * Math.PI * r })
    }
    return out
  }
  function lineSamples(a, b) {
    var L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.ceil(L / 3)), out = []
    for (var i = 0; i <= n; i++) out.push({ x: lerp(a[0], b[0], i / n), y: lerp(a[1], b[1], i / n), d: (L * i) / n })
    return out
  }
  function start() {
    var d3 = w.d3
    var root = doc.documentElement
    var stage = doc.querySelector('.stage')
    var dataEl = stage && stage.querySelector('script.diorama-data, script#diorama')
    var beatsEl = stage && stage.querySelector('.beats')
    if (!dataEl || !beatsEl) {
      ui.warn('diorama: needs <main class="stage"> with <script type="application/json" class="diorama-data"> and <div class="beats">; the page stays one column')
      return
    }
    var story
    try { story = JSON.parse(dataEl.textContent) } catch (e) {
      ui.warn('diorama: the story JSON does not parse (' + e.message + '); the page stays one column')
      return
    }
    if (!story || !story.plate || !story.plate.bbox) { ui.warn('diorama: the story JSON has no plate.bbox; the page stays one column'); return }
    var sections = [].filter.call(beatsEl.children, function (n) { return n.matches('.beat') })
    if (!sections.length) { ui.warn('diorama: .beats has no <section class="beat">'); return }

    ui.themeVars()
    ui.markAura()
    var reduced = S.reduced
    var checks = []
    var places = {}, quantities = {}, routes = {}, beatDefs = {}
    ;(story.places || []).forEach(function (p) { places[p.id] = p })
    ;(story.quantities || []).forEach(function (q) { quantities[q.id] = q })
    ;(story.routes || []).forEach(function (r) { routes[r.id] = r })
    ;(story.beats || []).forEach(function (b) { beatDefs[b.id] = b })
    var tok = readTokens(stage)

    // ── the view (behind the beats) ──────────────────────────────────────
    var view = el('div', 'dio-view vz-only')
    var glHost = el('div', 'dio-gl')
    glHost.setAttribute('role', 'img')
    glHost.setAttribute('aria-label', story.title ? 'A model of ' + story.title + '. The places are listed below.' : 'The story’s model')
    var overlay = el('div', 'dio-overlay')
    overlay.setAttribute('aria-hidden', 'true')
    var progress = el('div', 'dio-progress')
    var ticks = el('div', 'dio-ticks')
    var count = el('span', 'dio-count')
    count.setAttribute('aria-live', 'polite')
    progress.appendChild(ticks)
    progress.appendChild(count)
    var legend = el('div', 'dio-legend')
    legend.setAttribute('aria-hidden', 'true')
    view.appendChild(glHost)
    view.appendChild(overlay)
    view.appendChild(progress)
    view.appendChild(legend)
    view.appendChild(placeList())
    stage.insertBefore(view, beatsEl)
    var tools = el('div', 'vz-controls dio-tools')
    var modeBtn = ui.button({ icon: 'rows', label: 'Read as one page', pressed: false, onClick: toggleMode })
    tools.appendChild(modeBtn)
    beatsEl.parentNode.insertBefore(tools, beatsEl.nextSibling)
    // A hidden path, for sampling curved routes.
    var sampler = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
    sampler.setAttribute('class', 'dio-sampler')
    sampler.setAttribute('aria-hidden', 'true')
    var samplerPath = doc.createElementNS('http://www.w3.org/2000/svg', 'path')
    sampler.appendChild(samplerPath)
    view.appendChild(sampler)

    // ── plates ───────────────────────────────────────────────────────────
    var plateDefs = { main: story.plate }
    ;(story.insets || []).forEach(function (p) { if (p && p.id && p.bbox) plateDefs[p.id] = p })
    var plates = {}
    function plateFor(id) {
      if (!plates[id]) plates[id] = makePlate(id, plateDefs[id] || story.plate)
      return plates[id]
    }

    function makePlate(id, def) {
      var W = (def.size && +def.size[0]) || 1100
      var H = (def.size && +def.size[1]) || 560
      var b = def.bbox
      var lon0 = +b[0][0], lat0 = +b[0][1], lon1 = +b[1][0], lat1 = +b[1][1]
      var proj
      if (/conic/.test(def.projection || '')) {
        var dl = (lat1 - lat0) / 6
        proj = d3.geoConicEqualArea().parallels([lat0 + dl, lat1 - dl]).rotate([-(lon0 + lon1) / 2, 0])
      } else {
        proj = d3.geoMercator()
      }
      var pts = []
      for (var i = 0; i <= 8; i++) {
        var f = i / 8
        pts.push([lerp(lon0, lon1, f), lat0], [lerp(lon0, lon1, f), lat1], [lon0, lerp(lat0, lat1, f)], [lon1, lerp(lat0, lat1, f)])
      }
      proj.fitExtent([[0, 0], [W, H]], { type: 'MultiPoint', coordinates: pts })
      proj.clipExtent([[0, 0], [W, H]])
      var plate = {
        id: id, def: def, W: W, H: H, proj: proj, bbox: [lon0, lat0, lon1, lat1],
        caption: def.caption || '', land: null, routes: {}, props: {}, fogs: {}, marks: {}, built: false,
        xy: function (lonlat) {
          var p = proj(lonlat)
          return p && isFinite(p[0]) && isFinite(p[1]) ? p : null
        }
      }
      plate.inside = function (p) { return !!p && p[0] >= -1 && p[0] <= W + 1 && p[1] >= -1 && p[1] <= H + 1 }
      plate.placeXY = function (pid) {
        var p = places[pid]
        if (!p) return null
        var xy = plate.xy([+p.lon, +p.lat])
        return plate.inside(xy) ? xy : null
      }
      plate.kmPx = function (lonlat, km) {
        var a = plate.xy(lonlat), c = plate.xy(destination(lonlat, 270, km))
        return a && c ? Math.hypot(c[0] - a[0], c[1] - a[1]) : 0
      }
      return plate
    }

    var atlas = {}
    function loadLand(name) {
      if (!atlas[name]) {
        atlas[name] = fetch(LIB.atlas + name + '.json')
          .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json() })
          .then(function (t) { return w.topojson.feature(t, t.objects.land) })
      }
      return atlas[name]
    }

    // Land clipped to the plate, as projected rings (for extrusion) and an
    // SVG path (for the CSS plate and the sea's coastal glow).
    function landFor(plate) {
      var name = /^land-(10|50|110)m$/.test(plate.def.land || '') ? plate.def.land : 'land-50m'
      return loadLand(name).then(function (fc) {
        var geoms = fc.features ? fc.features.map(function (f) { return f.geometry }) : [fc.geometry || fc]
        var bb = plate.bbox, pad = Math.max(4, (bb[2] - bb[0]) * 0.2)
        var kept = []
        geoms.forEach(function (g) {
          if (!g) return
          var polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
          polys.forEach(function (poly) {
            var r = poly[0], a = 180, b2 = 90, c = -180, d = -90
            for (var i = 0; i < r.length; i++) {
              if (r[i][0] < a) a = r[i][0]
              if (r[i][0] > c) c = r[i][0]
              if (r[i][1] < b2) b2 = r[i][1]
              if (r[i][1] > d) d = r[i][1]
            }
            if (c >= bb[0] - pad && a <= bb[2] + pad && d >= bb[1] - pad && b2 <= bb[3] + pad) kept.push(poly)
          })
        })
        var geom = { type: 'MultiPolygon', coordinates: kept }
        var rings = [], cur = null
        var ctx = {
          moveTo: function (x, y) { cur = [[x, y]]; rings.push(cur) },
          lineTo: function (x, y) {
            var l = cur[cur.length - 1]
            if (Math.abs(l[0] - x) + Math.abs(l[1] - y) > 0.5) cur.push([x, y])
          },
          closePath: function () {},
          arc: function () {}
        }
        d3.geoPath(plate.proj, ctx)(geom)
        rings = rings.filter(function (r) { return r.length > 2 && Math.abs(area(r)) > 1 })
        return { rings: rings, d: d3.geoPath(plate.proj)(geom) || '', geom: geom }
      })
    }
    function area(r) {
      var s = 0
      for (var i = 0, n = r.length; i < n; i++) {
        var a = r[i], b = r[(i + 1) % n]
        s += a[0] * b[1] - b[0] * a[1]
      }
      return s / 2
    }

    // A route on a plate: its stops' points, a curve through them sampled
    // every 3px, and how far along it each stop sits.
    function routeGeom(plate, route) {
      var pts = [], ids = []
      // A stop is a place id, or a [lon, lat] waypoint that only bends the line.
      ;(route.stops || []).forEach(function (st) {
        var xy = typeof st === 'string' ? plate.placeXY(st) : st && st.length === 2 ? plate.xy([+st[0], +st[1]]) : null
        if (xy) { pts.push(xy); ids.push(typeof st === 'string' ? st : null) }
      })
      if (pts.length < 2) return null
      var curve = route.curve === 'straight' ? d3.curveLinear : d3.curveCatmullRom.alpha(0.5)
      var d = d3.line().curve(curve)(pts)
      var samples = samplePath(d)
      var stopDist = []
      var j = 0
      pts.forEach(function (p, k) {
        if (k === 0) { stopDist.push(0); return }
        var best = Infinity, bi = j
        for (var i = j; i < samples.length; i++) {
          var dd = Math.hypot(samples[i].x - p[0], samples[i].y - p[1])
          if (dd < best) { best = dd; bi = i }
          else if (best < 2.5 && dd > best + 4) break
        }
        j = bi
        stopDist.push(samples[bi].d)
      })
      return { d: d, samples: samples, length: samples[samples.length - 1].d, stops: ids, stopDist: stopDist }
    }
    function samplePath(d) {
      samplerPath.setAttribute('d', d)
      var L = 0
      try { L = samplerPath.getTotalLength() } catch (e) {}
      var out = []
      if (!L) return [{ x: 0, y: 0, d: 0 }, { x: 0, y: 0, d: 0 }]
      var n = Math.max(2, Math.ceil(L / 3))
      for (var i = 0; i <= n; i++) {
        var p = samplerPath.getPointAtLength((L * i) / n)
        out.push({ x: p.x, y: p.y, d: (L * i) / n })
      }
      return out
    }
    function pointAt(samples, dist) {
      if (!samples || !samples.length) return null
      if (dist <= 0) return [samples[0].x, samples[0].y]
      for (var i = 1; i < samples.length; i++) {
        if (samples[i].d >= dist) {
          var a = samples[i - 1], b = samples[i], t = (dist - a.d) / ((b.d - a.d) || 1)
          return [lerp(a.x, b.x, t), lerp(a.y, b.y, t)]
        }
      }
      var z = samples[samples.length - 1]
      return [z.x, z.y]
    }

    // ── quantities ───────────────────────────────────────────────────────
    function qv(id) {
      var q = quantities[id]
      return q && isFinite(+q.value) ? q : null
    }
    function qkm(id) {
      var q = qv(id)
      if (!q) return 0
      var f = KM[String(q.unit || 'km').toLowerCase()]
      return f ? +q.value * f : 0
    }
    // Tower heights share one scale per unit across the story.
    var towerMax = {}
    ;(story.beats || []).forEach(function (b) {
      ;(b.props || []).forEach(function (p) {
        var q = p.kind === 'tower' && qv(p.value)
        if (q) towerMax[q.unit] = Math.max(towerMax[q.unit] || 0, +q.value)
      })
    })

    // ── beats ────────────────────────────────────────────────────────────
    var B = sections.map(function (sec, i) {
      var id = sec.getAttribute('data-beat') || ''
      var def = beatDefs[id]
      if (!def) {
        checks.push('beat section ' + (i + 1) + (id ? ' ("' + id + '")' : '') + ' has no beat in the story JSON')
        def = { id: id }
      }
      var type = def.type || sec.getAttribute('data-type') || 'reveal'
      sec.classList.add('dio-' + type)
      if (!sec.hasAttribute('data-unit')) sec.setAttribute('data-unit', '')
      var b = { i: i, el: sec, id: id, def: def, type: type, plate: type === 'interstitial' ? null : def.plate || 'main' }
      if (type === 'stepper') b.stops = [].slice.call(sec.querySelectorAll('.stops > li[data-stop]'))
      return b
    })
    ;(story.beats || []).forEach(function (d) {
      if (!B.some(function (b) { return b.id === d.id })) checks.push('beat "' + d.id + '" in the story JSON has no <section class="beat" data-beat="' + d.id + '">')
    })
    // An interstitial holds the next model beat's plate (else the last one's).
    B.forEach(function (b, i) {
      if (b.type !== 'interstitial') return
      var n = nextModel(i) || prevModel(i)
      b.plate = n ? n.plate : 'main'
      b.ref = n
    })
    function nextModel(i) { for (var j = i + 1; j < B.length; j++) if (B[j].type !== 'interstitial') return B[j]; return null }
    function prevModel(i) { for (var j = i - 1; j >= 0; j--) if (B[j].type !== 'interstitial') return B[j]; return null }

    function targetXY(plate, t) {
      if (typeof t === 'string' && places[t]) {
        var p = places[t]
        return plate.xy([+p.lon, +p.lat]) || [plate.W / 2, plate.H / 2]
      }
      if (t && t.length === 2 && isFinite(+t[0])) return plate.xy([+t[0], +t[1]]) || [plate.W / 2, plate.H / 2]
      return [plate.W / 2, plate.H / 2]
    }
    function poseOf(b, target) {
      var plate = plateFor(b.plate)
      var c = b.def.camera || {}
      var xy = targetXY(plate, target || c.target)
      return {
        plate: b.plate, x: xy[0], y: xy[1], zoom: +c.zoom || 1,
        tilt: clamp(c.tilt == null ? 48 : +c.tilt, 5, 75), az: c.azimuth == null ? -6 : +c.azimuth, spin: !!c.spin
      }
    }
    B.forEach(function (b) {
      if (b.type === 'interstitial') return
      b.pose = poseOf(b)
      if (b.type === 'stepper') {
        b.stopPoses = b.stops.map(function (li) { return poseOf(b, li.getAttribute('data-stop')) })
        if (!b.stopPoses.length) b.stopPoses = [b.pose]
      }
    })
    B.forEach(function (b) { if (b.type === 'interstitial') b.pose = b.ref ? entryPose(b.ref) : poseOf({ plate: 'main', def: {} }) })
    function entryPose(b) { return b.type === 'stepper' ? b.stopPoses[0] : b.pose }
    function lerpPose(a, b, t) {
      return {
        plate: a.plate, x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t),
        zoom: Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), t)), tilt: lerp(a.tilt, b.tilt, t), az: lerp(a.az, b.az, t),
        spin: t < 0.5 ? a.spin : b.spin
      }
    }
    // A stepper's stop position for section progress s: q in [0, n-1].
    function stepQ(b, s) { return clamp((s - STEP_FROM) / (STEP_TO - STEP_FROM), 0, 1) * Math.max(0, b.stopPoses.length - 1) }
    function stepParts(b, s) {
      var q = stepQ(b, s), i0 = Math.floor(q), f = q - i0
      var n = b.stopPoses.length
      if (i0 >= n - 1) return { i0: n - 1, i1: n - 1, f: 0, cur: n - 1 }
      var ff = reduced ? 0 : MOVE(clamp((f - 0.3) / 0.7, 0, 1))
      return { i0: i0, i1: i0 + 1, f: ff, cur: f < 0.65 ? i0 : i0 + 1 }
    }
    function poseAt(b, s) {
      if (b.type !== 'stepper') return b.pose
      var p = stepParts(b, s)
      if (reduced) return b.stopPoses[p.cur]
      return lerpPose(b.stopPoses[p.i0], b.stopPoses[p.i1], p.f)
    }
    function cameraFor(i, s) {
      var b = B[i]
      var base = poseAt(b, s)
      if (reduced || i + 1 >= B.length) return base
      var from = b.type === 'stepper' ? 0.8 : MOVE_FROM
      if (s <= from) return base
      var next = B[i + 1].type === 'interstitial' ? B[i + 1].pose : entryPose(B[i + 1])
      if (!next || next.plate !== base.plate) return base
      return lerpPose(base, next, MOVE((s - from) / (1 - from)))
    }

    // What a beat shows. Layers beats keep their toggles in b.on.
    function propKey(p) { return JSON.stringify(p) }
    function stateFor(b, s) {
      var st = { routes: {}, draw: {}, fog: null, props: {}, marks: {}, gaps: {}, labels: [], current: null, ship: null }
      if (b.type === 'interstitial') return st
      var plate = plateFor(b.plate)
      var L = b.def.layers || {}
      var list = b.type === 'layers' ? (L.routes || []).filter(function (id) { return b.on[id] }) : L.routes || []
      list.forEach(function (id) { if (routes[id]) st.routes[id] = 1 })
      // A stop a route only borrows (gapFilled) draws hollow in its colour,
      // unless another visible route names it outright.
      var named = {}
      Object.keys(st.routes).forEach(function (id) {
        var gaps = routes[id].gapFilled || []
        ;(routes[id].stops || []).forEach(function (pid) {
          if (!plate.placeXY(pid)) return
          st.marks[pid] = 1
          if (gaps.indexOf(pid) < 0) named[pid] = 1
          else if (!st.gaps[pid]) st.gaps[pid] = routeStyle(routes[id]).color
        })
      })
      Object.keys(named).forEach(function (pid) { delete st.gaps[pid] })
      ;(L.places || []).forEach(function (pid) { if (plate.placeXY(pid)) st.marks[pid] = 1 })
      if (L.fog) st.fog = fogKey(L.fog)
      ;(b.def.props || []).forEach(function (p) {
        if (p.kind === 'ship') { st.ship = { at: p.at, kind: p.ship || 'galley' }; return }
        st.props[propKey(p)] = 1
        ;[p.at, p.from, p.to].forEach(function (pid) { if (typeof pid === 'string' && plate.placeXY(pid)) st.marks[pid] = 1 })
      })
      if (b.type === 'stepper' && b.stops.length) {
        var parts = stepParts(b, s)
        var li = b.stops[parts.cur]
        st.current = li.getAttribute('data-stop')
        var rid = (b.def.stepper && b.def.stepper.route) || list[0]
        var g = rid && plateGeom(plate, rid)
        if (g) {
          var d0 = stopDistance(g, b.stops[parts.i0]), d1 = stopDistance(g, b.stops[parts.i1])
          var dist = lerp(d0, d1, parts.f)
          st.draw[rid] = dist
          var ship = (b.stops[parts.f < 0.5 ? parts.i0 : parts.i1].getAttribute('data-ship') || 'galley').toLowerCase()
          if (ship !== 'none') st.ship = { xy: pointAt(g.samples, dist), kind: ship }
        }
      }
      var cap = narrow ? MAX_LABELS_SM : MAX_LABELS
      var labels = (narrow && L.labelsSm ? L.labelsSm : L.labels || autoLabels(st)).slice()
      if (st.current) labels = [st.current].concat(labels.filter(function (pid) { return pid !== st.current }))
      labels = labels.filter(function (pid) { return plate.placeXY(pid) })
      st.labels = labels.slice(0, cap)
      st.labels.forEach(function (pid) { st.marks[pid] = 1 })
      return st
    }
    function autoLabels(st) {
      var ids = Object.keys(st.marks)
      var rank = { hinge: 0, excavated: 1, contested: 2, tradition: 3 }
      return ids.sort(function (a, b) { return (rank[places[a].certainty] || 4) - (rank[places[b].certainty] || 4) })
    }
    function stopDistance(g, li) {
      var pid = li && li.getAttribute('data-stop')
      var k = g.stops.indexOf(pid)
      return k < 0 ? 0 : g.stopDist[k]
    }
    function plateGeom(plate, rid) {
      if (!(rid in plate.routes)) plate.routes[rid] = routes[rid] ? routeGeom(plate, routes[rid]) : null
      return plate.routes[rid]
    }
    function fogKey(f) {
      if (f === true) {
        var hinge = (story.places || []).filter(function (p) { return p.certainty === 'hinge' })[0]
        f = { west: hinge ? +hinge.lon : 0 }
      }
      return JSON.stringify(f)
    }

    // Static references the reader would trip over: say so, in the console
    // and to the admin preview.
    ;(story.routes || []).forEach(function (r) {
      ;(r.stops || []).forEach(function (pid) { if (typeof pid === 'string' && !places[pid]) checks.push('route "' + r.id + '" stops at "' + pid + '", which is not in places') })
    })
    ;(story.places || []).forEach(function (p) {
      if (CERTAINTY.indexOf(p.certainty) < 0) checks.push('place "' + p.id + '" has no certainty (excavated, hinge, tradition or contested)')
    })
    ;[].forEach.call(stage.querySelectorAll('[data-q]'), function (n) {
      var id = n.getAttribute('data-q'), q = quantities[id]
      if (!q) { checks.push('[data-q="' + id + '"] is not in quantities'); return }
      var digits = String(q.value).replace(/[^0-9.]/g, '')
      var raw = n.textContent.trim().toLowerCase()
      var text = raw.replace(/[,\s\u202f]/g, '')
      var word = WORDS.indexOf(raw.split(/[\s-]/)[0])
      if (digits && text.indexOf(digits) < 0 && text.indexOf(String(Math.round(+q.value))) < 0 && word !== +q.value) {
        checks.push('"' + n.textContent.trim() + '" reads differently from quantity "' + id + '" (' + q.value + ' ' + (q.unit || '') + ')')
      }
    })
    B.forEach(function (b) {
      var L = b.def.layers || {}
      if (L.labels && L.labels.length > MAX_LABELS) checks.push('beat "' + b.id + '" labels ' + L.labels.length + ' places; keep it to ' + MAX_LABELS + ' (and ' + MAX_LABELS_SM + ' on phones, via labelsSm)')
    })

    // ── proscenium chrome: stepper nav, layer toggles, progress ─────────
    B.forEach(function (b) {
      var copy = b.el.querySelector('.copy') || b.el
      if (b.type === 'stepper' && b.stops.length) buildStepper(b, copy)
      if (b.type === 'layers') buildChips(b, copy)
    })
    B.forEach(function (b, i) {
      var t = el('span', 'dio-tick')
      t.title = (b.el.querySelector('h1, h2') || {}).textContent || 'Beat ' + (i + 1)
      ticks.appendChild(t)
    })

    function buildStepper(b, copy) {
      b.stops.forEach(function (li, k) { li.classList.toggle('dio-cur', k === 0) })
      var nav = el('div', 'dio-stepnav')
      var back = ui.button({ icon: 'prev', label: 'Back', onClick: function () { goStop(b, b.cur - 1) } })
      var where = el('span', 'dio-stopcount')
      where.setAttribute('aria-live', 'polite')
      var on = ui.button({ icon: 'next', label: (b.def.stepper && b.def.stepper.next) || 'Next', cls: 'vz-primary', onClick: function () { goStop(b, b.cur + 1) } })
      on.appendChild(on.firstChild)
      nav.appendChild(back)
      nav.appendChild(where)
      nav.appendChild(on)
      var list = el('div', 'dio-timeline')
      list.setAttribute('role', 'group')
      list.setAttribute('aria-label', 'Stops')
      b.timeline = b.stops.map(function (li, k) {
        var name = li.getAttribute('data-short') || ((li.querySelector('h3, h4') || {}).textContent || 'Stop ' + k)
        var btn = el('button', 'dio-stopbtn', '<span>' + ('0' + k).slice(-2) + '</span>' + esc(name))
        btn.type = 'button'
        btn.addEventListener('click', function () { goStop(b, k) })
        list.appendChild(btn)
        return btn
      })
      var stopsEl = copy.querySelector('.stops')
      stopsEl.parentNode.insertBefore(nav, stopsEl.nextSibling)
      nav.parentNode.insertBefore(list, nav.nextSibling)
      b.back = back
      b.on2 = on
      b.where = where
      b.cur = 0
      setStop(b, 0)
    }
    function setStop(b, k) {
      b.cur = k
      b.stops.forEach(function (li, j) {
        li.classList.toggle('dio-cur', j === k)
        ui.reachable(li, j === k)
      })
      b.timeline.forEach(function (btn, j) {
        if (j === k) btn.setAttribute('aria-current', 'step')
        else btn.removeAttribute('aria-current')
        btn.classList.toggle('dio-past', j < k)
      })
      b.back.disabled = k === 0
      b.on2.disabled = k === b.stops.length - 1
      b.where.textContent = 'Stop ' + (k + 1) + ' of ' + b.stops.length
      S.enter(b.stops[k])
    }
    function goStop(b, k) {
      k = clamp(k, 0, b.stops.length - 1)
      var n = Math.max(1, b.stops.length - 1)
      var s = k === b.stops.length - 1 ? STEP_TO + 0.01 : STEP_FROM + ((k + 0.12) / n) * (STEP_TO - STEP_FROM)
      scrollToProgress(b, s)
    }
    function buildChips(b, copy) {
      var L = b.def.layers || {}
      var on = L.on || L.routes || []
      b.on = {}
      ;(L.routes || []).forEach(function (id) { b.on[id] = on.indexOf(id) >= 0 })
      var box = copy.querySelector('.dio-chips')
      if (!box) { box = el('div', 'dio-chips'); copy.appendChild(box) }
      box.setAttribute('role', 'group')
      box.setAttribute('aria-label', 'Route layers')
      ;(L.routes || []).forEach(function (id) {
        var r = routes[id]
        if (!r) return
        var btn = el('button', 'dio-chip', swatch(r) + '<span class="dio-chip-t"><b>' + esc(r.label || id) + '</b>' + (r.by ? '<small>' + esc(r.by) + '</small>' : '') + '</span>')
        btn.type = 'button'
        btn.setAttribute('aria-pressed', String(!!b.on[id]))
        btn.addEventListener('click', function () {
          b.on[id] = !b.on[id]
          btn.setAttribute('aria-pressed', String(b.on[id]))
          dirty = true
        })
        box.appendChild(btn)
      })
    }
    function routeStyle(r) {
      var st = r.style || {}
      var dash = st.dash && st.dash.length === 2 ? [+st.dash[0], +st.dash[1]] : [0, 0]
      return { color: colorOf(st.color), dash: dash, width: +st.width || 2.4 }
    }
    function swatch(r) {
      var s = routeStyle(r)
      return '<svg class="dio-swatch" viewBox="0 0 40 12" aria-hidden="true"><path d="M2 6H38" stroke="' + esc(s.color) + '" stroke-width="2.6" stroke-linecap="round"' +
        (s.dash[0] ? ' stroke-dasharray="' + s.dash.join(' ') + '"' : '') + '/></svg>'
    }
    function colorOf(name) {
      if (!name || name === 'bronze') return tok.accent
      if (tok[name]) return tok[name]
      return /^#[0-9a-f]{3,8}$/i.test(name) ? name : tok.accent
    }

    function placeList() {
      var box = el('div', 'dio-sr')
      var items = (story.places || []).map(function (p) {
        return '<li>' + esc(p.name || p.id) + ': ' + esc(p.certainty || 'certainty not given') + (p.note ? '. ' + esc(p.note) : '') + '</li>'
      }).join('')
      box.innerHTML = '<h2>Places on the model</h2><ul>' + items + '</ul>'
      return box
    }

    // ── layout and scroll ────────────────────────────────────────────────
    var narrow = false, vw = 0, vh = 0, chromeH = 0
    var tops = [], heights = []
    function measure() {
      var r = view.getBoundingClientRect()
      vw = view.clientWidth
      vh = view.clientHeight
      narrow = w.innerWidth < 720
      chromeH = Math.max(0, w.innerHeight - vh)
      B.forEach(function (b) {
        if (b.type === 'stepper') b.el.style.minHeight = Math.round(b.stops.length * 42 + 130) + 'svh'
      })
      var y = w.scrollY || w.pageYOffset || 0
      B.forEach(function (b, i) {
        var rr = b.el.getBoundingClientRect()
        tops[i] = rr.top + y
        heights[i] = Math.max(1, rr.height)
      })
      if (R) R.resize(vw, vh)
      dirty = true
      return r
    }
    function readLine() { return (w.scrollY || w.pageYOffset || 0) + chromeH + vh * 0.5 }
    function where() {
      var y = readLine(), i = 0
      for (var k = 0; k < B.length; k++) if (tops[k] <= y) i = k
      return { i: i, s: clamp((y - tops[i]) / heights[i], 0, 1) }
    }
    function scrollToProgress(b, s) {
      var y = tops[b.i] + s * heights[b.i] - chromeH - vh * 0.5
      try { w.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' }) } catch (e) { w.scrollTo(0, y) }
    }
    function goBeat(i) {
      i = clamp(i, 0, B.length - 1)
      scrollToProgress(B[i], 0.08)
    }

    // ── overlay: markers, labels, prop captions, the ship ────────────────
    function buildOverlay(plate) {
      plate.layer = el('div', 'dio-plate-layer')
      overlay.appendChild(plate.layer)
      ;(story.places || []).forEach(function (p) {
        var xy = plate.placeXY(p.id)
        if (!xy) return
        var side = p.label || 'r'
        var m = el('div', 'dio-mark is-' + (CERTAINTY.indexOf(p.certainty) >= 0 ? p.certainty : 'tradition') + ' side-' + side,
          '<i class="dio-dot"></i><span class="dio-name">' + esc(p.name || p.id) + '</span>')
        plate.layer.appendChild(m)
        plate.marks[p.id] = { el: m, xy: xy, o: 0, named: false, cur: false, gap: '' }
      })
      plate.ship = el('div', 'dio-ship', SHIPS.galley)
      plate.layer.appendChild(plate.ship)
      plate.shipKind = 'galley'
      plate.shipO = 0
      plate.shipXY = [0, 0]
    }
    var SHIPS = {
      galley: '<svg viewBox="0 0 40 30" aria-hidden="true"><path d="M3 20Q20 27 37 20L34 24Q20 29 6 24Z" class="hull"/><path d="M20 21V3" class="mast"/><path d="M11 4Q20 7 29 4L28 16Q20 18 12 16Z" class="sail"/></svg>',
      raft: '<svg viewBox="0 0 40 30" aria-hidden="true"><path d="M8 22H32L30 26H10Z" class="raft"/><path d="M20 22V10" class="mast"/><path d="M20 10L28 13L20 17Z" class="sail"/></svg>'
    }

    // Props and fogs a plate needs: every one any beat on it shows.
    function collect(plate) {
      B.forEach(function (b) {
        if (b.plate !== plate.id || b.type === 'interstitial') return
        ;(b.def.props || []).forEach(function (p) {
          if (p.kind === 'ship') return
          var key = propKey(p)
          if (plate.props[key]) return
          var prop = makeProp(plate, p)
          if (prop) plate.props[key] = prop
          else checks.push('beat "' + b.id + '": a ' + p.kind + ' prop at "' + (p.at || p.from) + '" has no place on its plate')
        })
        var L = b.def.layers || {}
        if (L.fog) {
          var key = fogKey(L.fog)
          if (!plate.fogs[key]) plate.fogs[key] = makeFog(plate, JSON.parse(key))
        }
        ;(L.routes || []).forEach(function (rid) { plateGeom(plate, rid) })
        if (b.def.stepper && b.def.stepper.route) plateGeom(plate, b.def.stepper.route)
      })
      Object.keys(plate.routes).forEach(function (rid) {
        var g = plate.routes[rid]
        if (!g) return
        var stl = routeStyle(routes[rid])
        g.color = stl.color
        g.dash = stl.dash
        g.width = stl.width
        g.o = 0
        g.draw = Infinity
        g.gaps = (routes[rid].gapFilled || []).filter(function (pid) { return g.stops.indexOf(pid) >= 0 })
      })
    }
    function where2(plate, ref) {
      if (typeof ref === 'string') return plate.placeXY(ref)
      if (ref && ref.length === 2) { var xy = plate.xy([+ref[0], +ref[1]]); return plate.inside(xy) ? xy : null }
      return null
    }
    function tag(plate, html, cls) {
      var t = el('div', 'dio-tag ' + (cls || ''), html)
      plate.layer.appendChild(t)
      return t
    }
    function makeProp(plate, p) {
      var prop = { spec: p, kind: p.kind, o: 0, grow: 0, growT: null, color: colorOf(p.color) }
      var q = p.value ? qv(p.value) : null
      if (p.kind === 'tower') {
        var at = where2(plate, p.at)
        if (!at || !q) return null
        prop.xy = at
        prop.size = +p.size || Math.round(plate.W * 0.022)
        prop.h = Math.max(3, (+q.value / (towerMax[q.unit] || +q.value)) * plate.H * 0.46)
        var cap = p.caption || q.value + ' ' + (q.unit || '')
        prop.tag = tag(plate, (p.label ? '<b>' + esc(p.label) + '</b>' : '') + '<small>' + esc(cap) + '</small>', 'is-tower')
        prop.anchor = function () { return [at[0], at[1], prop.h * prop.grow + 14] }
      } else if (p.kind === 'ring') {
        var c = where2(plate, p.at)
        if (!c) return null
        var cl = places[p.at] ? [+places[p.at].lon, +places[p.at].lat] : plate.proj.invert(c)
        var radii = (p.range || [p.value]).map(function (id) { return plate.kmPx(cl, qkm(id)) }).filter(function (r) { return r > 0 })
        if (!radii.length) return null
        prop.xy = c
        prop.radii = radii
        var ang = ((p.labelAngle == null ? 200 : +p.labelAngle) * Math.PI) / 180
        var rr = radii[radii.length - 1]
        if (p.label) prop.tag = tag(plate, esc(p.label), 'is-ring')
        prop.anchor = function () { return [c[0] + rr * Math.cos(ang), c[1] + rr * Math.sin(ang), 0] }
      } else if (p.kind === 'line') {
        var a = where2(plate, p.from), b2 = where2(plate, p.to)
        if (!a || !b2) return null
        prop.a = a
        prop.b = b2
        if (p.label) prop.tag = tag(plate, esc(p.label), 'is-line')
        prop.anchor = function () { return [(a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2, LZ + 2] }
      } else if (p.kind === 'pulse') {
        var pc = where2(plate, p.at)
        if (!pc) return null
        prop.xy = pc
        prop.r = +p.radius || 48
      } else {
        return null
      }
      prop.label = p.label
      return prop
    }
    function makeFog(plate, f) {
      var lon = f.west != null ? +f.west : +f.east
      var lat = (plate.bbox[1] + plate.bbox[3]) / 2
      var xy = plate.xy([lon, lat])
      var x = xy ? clamp(xy[0], 0, plate.W) : plate.W / 2
      var fog = { west: f.west != null, x: x, o: 0 }
      var labels = f.labels || {}
      if (labels.west) fog.wTag = tag(plate, esc(labels.west), 'is-area')
      if (labels.east) fog.eTag = tag(plate, esc(labels.east), 'is-area is-east')
      if (f.caption) fog.cTag = tag(plate, esc(f.caption), 'is-cut')
      return fog
    }

    // ── state, every frame ───────────────────────────────────────────────
    var R = null
    var curI = -1, curPlate = null, dirty = true, last = 0, t0 = 0, spin = 0
    var fade = { a: 1, target: 1, pending: null }
    var lastPoseKey = ''

    function setCurrent(i) {
      var prev = curI
      curI = i
      B.forEach(function (b, k) {
        b.el.classList.toggle('dio-cur', k === i)
        ticks.children[k].classList.toggle('on', k <= i)
      })
      count.textContent = ('0' + (i + 1)).slice(-2) + ' / ' + ('0' + B.length).slice(-2)
      view.classList.toggle('dio-hidden', B[i].type === 'interstitial')
      S.enter(B[i].el)
      if (prev !== -1) ui.setHash('beat=' + (i + 1))
      dirty = true
    }

    function frame(now) {
      w.requestAnimationFrame(frame)
      if (!root.classList.contains('diorama-on') || !R) return
      var dt = last ? Math.min(100, now - last) : 16
      last = now
      if (!t0) t0 = now
      var t = (now - t0) / 1000
      var pos = where()
      if (pos.i !== curI) setCurrent(pos.i)
      var b = B[pos.i]
      // Covered by an interstitial: nothing to draw.
      if (b.type === 'interstitial') {
        var rr = b.el.getBoundingClientRect()
        if (rr.top <= chromeH + 1 && rr.bottom >= w.innerHeight - 1) return
      }
      var st = stateFor(b, pos.s)
      if (b.type === 'stepper' && b.stops.length) {
        var k = stepParts(b, pos.s).cur
        if (k !== b.cur) setStop(b, k)
      }
      var pose = cameraFor(pos.i, pos.s)
      var plate = plateFor(pose.plate)
      // A new plate, or (reduced motion) a new pose: cut behind a quick fade.
      var poseKey = reduced ? pose.plate + ':' + pose.x.toFixed(0) + ':' + pose.y.toFixed(0) + ':' + pose.zoom + ':' + pose.tilt : pose.plate
      if (poseKey !== lastPoseKey) {
        if (lastPoseKey && !fade.pending) fade.pending = { plate: plate, key: poseKey }
        else if (!lastPoseKey) { showPlate(plate); lastPoseKey = poseKey }
      }
      if (fade.pending) {
        fade.a = Math.max(0, fade.a - dt / 180)
        if (fade.a === 0) {
          showPlate(fade.pending.plate)
          lastPoseKey = fade.pending.key
          fade.pending = null
        }
      } else if (fade.a < 1) {
        fade.a = Math.min(1, fade.a + dt / 260)
      }
      glHost.style.opacity = fade.a
      overlay.style.opacity = fade.a
      if (!curPlate || !curPlate.built) return
      var p = curPlate
      // While fading to another plate, hold this one's last pose.
      if (fade.pending) pose = p.lastPose || pose
      else p.lastPose = pose
      if (pose.plate !== p.id) return

      // Layer targets, eased: fades at the beat threshold, props rise once.
      var k1 = reduced ? 1 : 1 - Math.exp(-dt / 140)
      Object.keys(p.routes).forEach(function (rid) {
        var g = p.routes[rid]
        if (!g) return
        g.o += ((st.routes[rid] ? 1 : 0) - g.o) * k1
        g.draw = rid in st.draw ? st.draw[rid] : Infinity
      })
      Object.keys(p.fogs).forEach(function (key) {
        var f = p.fogs[key]
        f.o += ((st.fog === key ? 1 : 0) - f.o) * k1
      })
      Object.keys(p.props).forEach(function (key) {
        var pr = p.props[key]
        var on = !!st.props[key]
        pr.o += ((on ? 1 : 0) - pr.o) * k1
        if (on && pr.growT === null) pr.growT = now
        pr.grow = pr.growT === null ? 0 : reduced ? 1 : MOVE(Math.min(1, (now - pr.growT) / 2600))
      })
      Object.keys(p.marks).forEach(function (pid) {
        var m = p.marks[pid]
        m.o += ((st.marks[pid] ? 1 : 0) - m.o) * k1
        var named = st.labels.indexOf(pid) >= 0
        var cur = st.current === pid
        if (named !== m.named) { m.named = named; m.el.classList.toggle('named', named) }
        if (cur !== m.cur) { m.cur = cur; m.el.classList.toggle('current', cur) }
        var gap = st.gaps[pid] || ''
        if (gap !== m.gap) { m.gap = gap; m.el.classList.toggle('gap', !!gap); m.el.style.setProperty('--dio-gap', gap || 'transparent') }
      })
      if (st.ship) {
        var sxy = st.ship.xy || p.placeXY(st.ship.at)
        if (sxy) p.shipXY = sxy
        if (st.ship.kind !== p.shipKind && SHIPS[st.ship.kind]) { p.shipKind = st.ship.kind; p.ship.innerHTML = SHIPS[st.ship.kind] }
      }
      p.shipO += ((st.ship ? 1 : 0) - p.shipO) * k1

      // The camera: the scrubbed pose, breathing (±3°) and the epilogue's turn.
      if (pose.spin && !reduced) spin += (dt / 80000) * 360
      else { spin = ((spin % 360) + 540) % 360 - 180; spin *= 1 - k1 }
      var cam = {
        x: pose.x, y: pose.y, zoom: pose.zoom,
        tilt: pose.tilt + (reduced ? 0 : 1.4 * Math.sin((t * 2 * Math.PI) / 14)),
        az: pose.az + spin + (reduced ? 0 : 2.2 * Math.sin((t * 2 * Math.PI) / 16))
      }
      R.draw(p, cam, reduced ? 0 : t, layout())
      placeOverlay(p)
      if (dirty) { drawLegend(p, st); dirty = false }
    }
    function layout() {
      return narrow ? { focus: [0.5, 0.26], fit: 1.5 } : { focus: [0.64, 0.56], fit: 0.6 }
    }

    function placeOverlay(p) {
      Object.keys(p.marks).forEach(function (pid) {
        var m = p.marks[pid]
        if (m.o < 0.01) { if (m.shown) { m.el.style.visibility = 'hidden'; m.shown = false } return }
        var s = R.project(m.xy[0], m.xy[1], LZ + 0.5)
        if (!s) return
        if (!m.shown) { m.el.style.visibility = 'visible'; m.shown = true }
        m.el.style.opacity = m.o.toFixed(3)
        m.el.style.transform = 'translate3d(' + s[0].toFixed(1) + 'px,' + s[1].toFixed(1) + 'px,0)'
      })
      Object.keys(p.props).forEach(function (key) {
        var pr = p.props[key]
        if (!pr.tag) return
        var o = pr.o * (pr.kind === 'tower' ? clamp((pr.grow - 0.75) * 4, 0, 1) : 1)
        pr.tag.style.visibility = o < 0.01 ? 'hidden' : 'visible'
        if (o < 0.01) return
        var a = pr.anchor(), s = R.project(a[0], a[1], a[2])
        if (!s) return
        pr.tag.style.opacity = o.toFixed(3)
        pr.tag.style.transform = 'translate3d(' + s[0].toFixed(1) + 'px,' + s[1].toFixed(1) + 'px,0)'
      })
      Object.keys(p.fogs).forEach(function (key) {
        var f = p.fogs[key]
        var spots = [[f.wTag, f.x * 0.62, p.H * 0.42], [f.eTag, (f.x + p.W) / 2, p.H * 0.72], [f.cTag, f.x, p.H * 0.06]]
        spots.forEach(function (sp) {
          if (!sp[0]) return
          sp[0].style.visibility = f.o < 0.01 ? 'hidden' : 'visible'
          if (f.o < 0.01) return
          var s = R.project(sp[1], sp[2], LZ + 4)
          if (!s) return
          sp[0].style.opacity = f.o.toFixed(3)
          sp[0].style.transform = 'translate3d(' + s[0].toFixed(1) + 'px,' + s[1].toFixed(1) + 'px,0)'
        })
      })
      if (p.shipO > 0.01) {
        var s = R.project(p.shipXY[0], p.shipXY[1], LZ + 1)
        if (s) p.ship.style.transform = 'translate3d(' + s[0].toFixed(1) + 'px,' + s[1].toFixed(1) + 'px,0)'
      }
      p.ship.style.opacity = p.shipO.toFixed(3)
      p.ship.style.visibility = p.shipO < 0.01 ? 'hidden' : 'visible'
    }

    function drawLegend(p, st) {
      var rows = []
      Object.keys(st.routes).forEach(function (rid) {
        var r = routes[rid]
        if (r) rows.push('<li>' + swatch(r) + '<span>' + esc(r.label || rid) + '</span></li>')
      })
      var kinds = {}
      Object.keys(st.marks).forEach(function (pid) { kinds[places[pid].certainty] = 1 })
      CERTAINTY.forEach(function (c) {
        if (kinds[c]) rows.push('<li><i class="dio-dot is-' + c + '"></i><span>' + esc(CERTAINTY_LABEL[c]) + '</span></li>')
      })
      legend.innerHTML = rows.length ? '<ul>' + rows.join('') + '</ul>' : ''
    }

    function showPlate(plate) {
      if (curPlate === plate) return
      if (curPlate && curPlate.layer) curPlate.layer.style.display = 'none'
      curPlate = plate
      if (!plate.layer) {
        buildOverlay(plate)
        collect(plate)
      }
      plate.layer.style.display = ''
      if (!plate.built && !plate.loading) {
        plate.loading = true
        landFor(plate).then(function (land) {
          plate.land = land
          R.build(plate)
          plate.built = true
          dirty = true
        }, function (e) {
          ui.warn('diorama: land for plate "' + plate.id + '" failed to load', e)
          plate.land = { rings: [], d: '', geom: null }
          R.build(plate)
          plate.built = true
        })
      }
      if (R) R.show(plate)
      dirty = true
    }

    // ── modes and keys ───────────────────────────────────────────────────
    function toggleMode() {
      var on = !root.classList.contains('diorama-on')
      root.classList.toggle('diorama-on', on)
      modeBtn.setAttribute('aria-pressed', String(!on))
      ui.setButton(modeBtn, on ? 'rows' : 'frame', on ? 'Read as one page' : 'Back to the model')
      B.forEach(function (b) {
        if (b.stops) b.stops.forEach(function (li, k) { ui.reachable(li, !on || k === b.cur) })
      })
      if (!on) S.observe(sections)
      w.requestAnimationFrame(function () { measure(); S.rebuildAll(beatsEl) })
    }
    ui.keys('diorama-on', function (e) {
      var k = e.key
      if (k !== 'ArrowRight' && k !== 'ArrowLeft') return
      var b = B[curI]
      var d = k === 'ArrowRight' ? 1 : -1
      e.preventDefault()
      if (b && b.type === 'stepper' && b.stops.length && b.cur + d >= 0 && b.cur + d < b.stops.length) goStop(b, b.cur + d)
      else goBeat(curI + d)
    })

    // ── go ───────────────────────────────────────────────────────────────
    root.classList.add('js', 'vz-on', 'diorama-on')
    var forceCss = stage.getAttribute('data-renderer') === 'css' || ui.hashHas('css')
    var make = forceCss || !hasWebGL()
      ? Promise.resolve(cssRenderer(glHost, tok))
      : loadThree().then(function (THREE) { return threeRenderer(THREE, glHost, tok) }, function (e) {
          ui.warn('diorama: three.js failed to load; drawing the CSS plate', e)
          return cssRenderer(glHost, tok)
        })
    make.then(function (r) {
      R = r
      view.classList.add(r.kind === 'webgl' ? 'dio-webgl' : 'dio-css')
      measure()
      var deep = ui.hashNumber('beat')
      if (deep && deep > 1 && deep <= B.length) goBeat(deep - 1)
      // Insets (close-ups) load once the main plate is up.
      w.setTimeout(function () {
        Object.keys(plateDefs).forEach(function (id) {
          var pl = plateFor(id)
          if (!pl.layer) { buildOverlay(pl); collect(pl); pl.layer.style.display = 'none' }
          if (!pl.built && !pl.loading) {
            pl.loading = true
            landFor(pl).then(function (land) { pl.land = land; R.build(pl); pl.built = true; if (pl !== curPlate) R.hide(pl) }, function () {})
          }
        })
      }, 1500)
      w.requestAnimationFrame(frame)
      reportChecks()
    })
    w.addEventListener('resize', function () { measure() })
    if ('ResizeObserver' in w) new ResizeObserver(function () { measure() }).observe(view)
    ui.afterFonts(measure)
    w.addEventListener('load', measure)

    function reportChecks() {
      checks.forEach(function (m) { ui.warn('diorama: ' + m) })
      try {
        if (w.parent && w.parent !== w) w.parent.postMessage({ type: 'vizmaya:format-check', format: 'diorama', warnings: checks }, '*')
      } catch (e) {}
    }
  }

  function readTokens(el) {
    var cs = w.getComputedStyle(el)
    var t = {}
    for (var k in TOKENS) {
      var v = (cs.getPropertyValue('--dio-' + k) || '').trim()
      t[k] = /^#[0-9a-f]{3,8}$/i.test(v) ? v : TOKENS[k]
    }
    return t
  }
  function hasWebGL() {
    try {
      var c = doc.createElement('canvas')
      return !!(w.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')))
    } catch (e) { return false }
  }
  function loadThree() {
    if (w.THREE && w.THREE.WebGLRenderer) return Promise.resolve(w.THREE)
    // A module from a classic script: dynamic import.
    return new Function('u', 'return import(u)')(LIB.three)
  }

  // ── the WebGL stage ────────────────────────────────────────────────────
  // Colours are used as written (no colour management), so the model
  // matches the page's tokens exactly; faces are flat-shaded by hand.
  function threeRenderer(THREE, host, tok) {
    if (THREE.ColorManagement) THREE.ColorManagement.enabled = false
    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(w.devicePixelRatio || 1, 2))
    renderer.setClearColor(0x000000, 0)
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    host.appendChild(renderer.domElement)
    var scene = new THREE.Scene()
    var camera = new THREE.PerspectiveCamera(26, 1, 4, 60000)
    camera.up.set(0, 0, 1)
    var groups = {}
    var size = [1, 1]
    var shift = new THREE.Matrix4()
    var v3 = new THREE.Vector3()
    var current = null
    var ribbons = []

    function C(hex) { return new THREE.Color(hex) }
    function basic(hex, extra) {
      var m = new THREE.MeshBasicMaterial({ color: C(hex) })
      if (extra) for (var k in extra) m[k] = extra[k]
      return m
    }
    function canvasTex(cv) {
      var t = new THREE.CanvasTexture(cv)
      if ('colorSpace' in t) t.colorSpace = THREE.NoColorSpace
      t.anisotropy = 4
      return t
    }

    var RIBBON_VS = [
      'attribute vec2 aNormal; attribute float aDist; attribute float aSide;',
      'uniform float uWidth; varying float vDist; varying float vSide; varying vec2 vXY;',
      'void main() {',
      '  vDist = aDist; vSide = aSide;',
      '  vec3 p = position + vec3(aNormal * aSide * uWidth * 0.5, 0.0);',
      '  vXY = p.xy;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);',
      '}'
    ].join('\n')
    var RIBBON_FS = [
      'uniform vec3 uColor; uniform float uOpacity; uniform vec2 uDash; uniform float uTime;',
      'uniform float uFlow; uniform float uDraw; uniform vec2 uPlate; varying float vDist; varying float vSide; varying vec2 vXY;',
      'void main() {',
      '  if (vDist > uDraw || vXY.x < 0.0 || vXY.x > uPlate.x || vXY.y > 0.0 || vXY.y < -uPlate.y) discard;',
      '  if (uDash.x > 0.0) { float m = mod(vDist - uTime * uFlow, uDash.x + uDash.y); if (m > uDash.x) discard; }',
      '  float edge = 1.0 - smoothstep(0.55, 1.0, abs(vSide));',
      '  gl_FragColor = vec4(uColor, uOpacity * edge);',
      '}'
    ].join('\n')
    function ribbon(samples, opts) {
      var n = samples.length
      var pos = new Float32Array(n * 2 * 3), nor = new Float32Array(n * 2 * 2), dist = new Float32Array(n * 2), side = new Float32Array(n * 2)
      var idx = []
      for (var i = 0; i < n; i++) {
        var a = samples[Math.max(0, i - 1)], b = samples[Math.min(n - 1, i + 1)]
        var tx = b.x - a.x, ty = -(b.y - a.y), L = Math.hypot(tx, ty) || 1
        var nx = -ty / L, ny = tx / L
        for (var s = 0; s < 2; s++) {
          var k = i * 2 + s
          pos[k * 3] = samples[i].x
          pos[k * 3 + 1] = -samples[i].y
          pos[k * 3 + 2] = opts.z
          nor[k * 2] = nx
          nor[k * 2 + 1] = ny
          dist[k] = samples[i].d
          side[k] = s ? 1 : -1
        }
        if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
      }
      var g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      g.setAttribute('aNormal', new THREE.BufferAttribute(nor, 2))
      g.setAttribute('aDist', new THREE.BufferAttribute(dist, 1))
      g.setAttribute('aSide', new THREE.BufferAttribute(side, 1))
      g.setIndex(idx)
      var dash = opts.dash || [0, 0]
      var mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: {
          uPlate: { value: new THREE.Vector2(opts.plate.W, opts.plate.H) },
          uColor: { value: C(opts.color) }, uOpacity: { value: 0 }, uDash: { value: new THREE.Vector2(dash[0], dash[1]) },
          uTime: { value: 0 }, uFlow: { value: dash[0] ? (dash[0] + dash[1]) / 1.4 : 0 }, uDraw: { value: 1e9 }, uWidth: { value: opts.width || 2.4 }
        },
        vertexShader: RIBBON_VS, fragmentShader: RIBBON_FS
      })
      var mesh = new THREE.Mesh(g, mat)
      mesh.renderOrder = opts.order || 3
      mesh.frustumCulled = false
      mesh.userData.px = opts.width || 2.4
      ribbons.push(mesh)
      return mesh
    }

    var SEA_FS = [
      'uniform sampler2D uMap; uniform float uTime; uniform vec2 uSize; uniform vec3 uPaper;',
      'varying vec2 vUv;',
      'void main() {',
      '  vec3 c = texture2D(uMap, vUv).rgb;',
      '  vec2 p = vUv * uSize;',
      '  float y = p.y + 2.5 * sin((p.x - uTime * 5.3) / 48.0 * 6.2831853);',
      '  float line = 1.0 - smoothstep(0.0, 0.07, abs(fract(y / 16.0) - 0.5));',
      '  gl_FragColor = vec4(mix(c, uPaper, line * 0.07), 1.0);',
      '}'
    ].join('\n')
    var FOG_FS = [
      'uniform vec3 uColor; uniform float uOpacity; uniform float uTime; uniform float uWest; varying vec2 vUv;',
      'float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
      'float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
      '  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }',
      'void main() {',
      '  vec2 p = vUv * vec2(6.0, 3.0);',
      '  float v = 0.55 * n(p + vec2(uTime / 16.0, uTime / 40.0)) + 0.3 * n(p * 2.1 - vec2(uTime / 19.0, 0.0)) + 0.15 * n(p * 4.3 + vec2(0.0, uTime / 13.0));',
      '  float x = uWest > 0.5 ? vUv.x : 1.0 - vUv.x;',
      '  float edge = (1.0 - smoothstep(0.78, 1.0, x)) * smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y) * smoothstep(0.0, 0.04, 1.0 - x);',
      '  float a = mix(0.34, 0.16, clamp(x / 0.8, 0.0, 1.0)) * edge * (0.35 + 0.9 * v);',
      '  gl_FragColor = vec4(uColor, a * uOpacity);',
      '}'
    ].join('\n')
    var UV_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'

    function seaTexture(plate) {
      var cw = 2048, ch = Math.round((2048 * plate.H) / plate.W)
      var cv = doc.createElement('canvas')
      cv.width = cw
      cv.height = ch
      var g = cv.getContext('2d')
      var k = cw / plate.W
      var grad = g.createRadialGradient(cw * 0.64, ch * 0.42, 0, cw * 0.64, ch * 0.42, Math.max(cw, ch) * 0.78)
      grad.addColorStop(0, tok['sea-1'])
      grad.addColorStop(0.5, tok['sea-2'])
      grad.addColorStop(1, tok['sea-3'])
      g.fillStyle = grad
      g.fillRect(0, 0, cw, ch)
      if (plate.land && plate.land.geom) {
        g.save()
        g.scale(k, k)
        g.lineJoin = 'round'
        var path = w.d3.geoPath(plate.proj, g)
        g.strokeStyle = tok.paper
        ;[[26, 0.04], [11, 0.06]].forEach(function (s) {
          g.globalAlpha = s[1]
          g.lineWidth = s[0]
          g.beginPath()
          path(plate.land.geom)
          g.stroke()
        })
        g.restore()
      }
      return canvasTex(cv)
    }
    function captionTexture(plate, depth) {
      var cv = doc.createElement('canvas')
      var cw = 2048, ch = Math.max(32, Math.round((2048 * depth) / plate.W))
      cv.width = cw
      cv.height = ch
      var g = cv.getContext('2d')
      g.fillStyle = tok.plinth
      g.fillRect(0, 0, cw, ch)
      if (plate.caption) {
        var fs = Math.round(ch * 0.36)
        g.font = '500 ' + fs + 'px "IBM Plex Mono", ui-monospace, monospace'
        g.fillStyle = tok.muted
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        var text = String(plate.caption).toUpperCase().split('').join(String.fromCharCode(8202, 8202))
        g.fillText(text, cw / 2, ch / 2)
      }
      return canvasTex(cv)
    }

    function shapesFrom(rings) {
      // Outer rings and holes wind opposite ways; the largest ring is
      // surely an outer one, so its sign says which is which.
      var outers = [], holes = []
      var all = rings.map(function (r) {
        var pts = r.map(function (p) { return new THREE.Vector2(p[0], -p[1]) })
        return { pts: pts, a: THREE.ShapeUtils.area(pts) }
      })
      var big = all.reduce(function (m, r) { return Math.abs(r.a) > Math.abs(m.a) ? r : m }, { a: 0 })
      var sign = big.a < 0 ? -1 : 1
      all.forEach(function (r) {
        if (r.a * sign > 0) outers.push({ pts: r.pts, shape: new THREE.Shape(r.pts) })
        else holes.push(r.pts)
      })
      holes.forEach(function (h) {
        var p = h[0]
        for (var i = 0; i < outers.length; i++) {
          if (inside(p, outers[i].pts)) { outers[i].shape.holes.push(new THREE.Path(h)); return }
        }
      })
      return outers.map(function (o) { return o.shape })
    }
    function inside(p, poly) {
      var c = false
      for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        var a = poly[i], b = poly[j]
        if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c
      }
      return c
    }

    function build(plate) {
      var W = plate.W, H = plate.H
      var outer = new THREE.Group()
      var g = new THREE.Group()
      g.position.set(-W / 2, H / 2, 0)
      outer.add(g)
      var depth = 32
      // 01 · sea and plinth
      var front = basic(tok.plinth)
      front.map = captionTexture(plate, depth)
      front.color = C('#ffffff')
      var side = basic(tok['plinth-side'])
      var plinth = new THREE.Mesh(new THREE.BoxGeometry(W, H, depth), [side, side, side, front, side, side])
      plinth.position.set(W / 2, -H / 2, -depth / 2 - 0.05)
      g.add(plinth)
      var seaMat = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: seaTexture(plate) }, uTime: { value: 0 }, uSize: { value: new THREE.Vector2(W, H) }, uPaper: { value: C(tok.paper) } },
        vertexShader: UV_VS, fragmentShader: SEA_FS
      })
      var sea = new THREE.Mesh(new THREE.PlaneGeometry(W, H), seaMat)
      sea.position.set(W / 2, -H / 2, 0)
      g.add(sea)
      // 02 · terrain: one extrusion, stacked as strata under a paper top
      var shapes = shapesFrom(plate.land.rings)
      if (shapes.length) {
        var geo = new THREE.ExtrudeGeometry(shapes, { depth: 1, bevelEnabled: false, curveSegments: 1 })
        STRATA.forEach(function (s, i) {
          var top = basic(i === STRATA.length - 1 ? tok.land : tok[s[2]])
          var mesh = new THREE.Mesh(geo, [top, basic(tok[s[2]])])
          mesh.position.z = s[0]
          mesh.scale.z = s[1]
          mesh.renderOrder = 1
          g.add(mesh)
        })
      }
      // 03 · routes
      Object.keys(plate.routes).forEach(function (rid) {
        var r = plate.routes[rid]
        if (!r) return
        r.mesh = ribbon(r.samples, { plate: plate, z: LZ + 0.8, color: r.color, dash: r.dash, width: r.width, order: 3 })
        g.add(r.mesh)
      })
      // 04 · props
      Object.keys(plate.props).forEach(function (key) { buildProp(g, plate.props[key], plate) })
      // 05 · atmosphere
      Object.keys(plate.fogs).forEach(function (key) {
        var f = plate.fogs[key]
        var fw = f.west ? f.x : W - f.x
        var mat = new THREE.ShaderMaterial({
          transparent: true, depthWrite: false,
          uniforms: { uColor: { value: C(tok.fog) }, uOpacity: { value: 0 }, uTime: { value: 0 }, uWest: { value: f.west ? 1 : 0 } },
          vertexShader: UV_VS, fragmentShader: FOG_FS
        })
        f.mesh = new THREE.Mesh(new THREE.PlaneGeometry(fw, H), mat)
        f.mesh.position.set(f.west ? fw / 2 : f.x + fw / 2, -H / 2, LZ + 4)
        f.mesh.renderOrder = 6
        g.add(f.mesh)
        f.line = ribbon(lineSamples([f.x, H * 0.06], [f.x, H * 0.95]), { plate: plate, z: LZ + 1, color: tok.accent, dash: [2, 5], width: 1.3, order: 4 })
        g.add(f.line)
      })
      groups[plate.id] = outer
      outer.visible = plate === current
      scene.add(outer)
    }
    function shades(hex) {
      return { top: hex, south: mix(hex, tok.ground, 0.45), west: mix(hex, tok.ground, 0.55), east: mix(hex, tok.ground, 0.66), north: mix(hex, tok.ground, 0.75) }
    }
    function buildProp(g, pr, plate) {
      if (pr.kind === 'tower') {
        var sh = shades(pr.color)
        var geo = new THREE.BoxGeometry(pr.size, pr.size, 1)
        geo.translate(0, 0, 0.5)
        var mats = [sh.east, sh.west, sh.north, sh.south, sh.top, sh.north].map(function (c) { return basic(c, { transparent: true }) })
        pr.mesh = new THREE.Mesh(geo, mats)
        pr.mesh.position.set(pr.xy[0], -pr.xy[1], 0)
        pr.mesh.renderOrder = 5
        pr.mats = mats
        g.add(pr.mesh)
      } else if (pr.kind === 'ring') {
        pr.group = new THREE.Group()
        if (pr.radii.length > 1) {
          var band = new THREE.Mesh(new THREE.RingGeometry(pr.radii[0], pr.radii[1], 160), new THREE.ShaderMaterial({
            transparent: true, depthWrite: false, side: THREE.DoubleSide,
            uniforms: { uColor: { value: C(pr.color) }, uOpacity: { value: 0 }, uPlate: { value: new THREE.Vector2(plate.W, plate.H) }, uAt: { value: new THREE.Vector2(pr.xy[0], -pr.xy[1]) } },
            vertexShader: 'varying vec2 vXY; void main() { vXY = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
            fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; uniform vec2 uPlate; uniform vec2 uAt; varying vec2 vXY;' +
              'void main() { vec2 p = vXY + uAt; if (p.x < 0.0 || p.x > uPlate.x || p.y > 0.0 || p.y < -uPlate.y) discard; gl_FragColor = vec4(uColor, uOpacity); }'
          }))
          band.position.set(pr.xy[0], -pr.xy[1], 0.3)
          band.renderOrder = 2
          pr.band = band
          pr.group.add(band)
        }
        pr.lines = pr.radii.map(function (r) {
          var m = ribbon(circleSamples(pr.xy[0], pr.xy[1], r), { plate: plate, z: 0.4, color: pr.color, dash: [3, 4], width: 1.3, order: 2 })
          pr.group.add(m)
          return m
        })
        g.add(pr.group)
      } else if (pr.kind === 'line') {
        pr.lines = [ribbon(lineSamples(pr.a, pr.b), { plate: plate, z: LZ + 1.2, color: pr.spec.color ? pr.color : tok.paper, dash: [1, 6], width: 2, order: 4 })]
        g.add(pr.lines[0])
      } else if (pr.kind === 'pulse') {
        pr.rings = [0, 1].map(function () {
          var m = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 72), basic(pr.color, { transparent: true, depthWrite: false }))
          m.position.set(pr.xy[0], -pr.xy[1], LZ + 0.6)
          m.renderOrder = 4
          g.add(m)
          return m
        })
      }
    }

    function show(plate) {
      current = plate
      Object.keys(groups).forEach(function (id) { groups[id].visible = id === plate.id })
    }
    function hide(plate) { if (groups[plate.id]) groups[plate.id].visible = false }
    function resize(width, height) {
      size = [Math.max(1, width), Math.max(1, height)]
      renderer.setSize(size[0], size[1], false)
    }

    var target = new THREE.Vector3()
    function draw(plate, cam, t, lay) {
      var W = plate.W, H = plate.H
      var aspect = size[0] / size[1]
      camera.aspect = aspect
      camera.updateProjectionMatrix()
      var fov = (camera.fov * Math.PI) / 180
      var tanV = Math.tan(fov / 2)
      // Fit the plate to the frame at zoom 1, then move in by zoom.
      var dW = (W * size[1]) / (2 * tanV * lay.fit * size[0])
      var dH = (H * Math.cos((cam.tilt * Math.PI) / 180) * 1.25) / (2 * tanV * 0.74)
      var D = Math.max(dW, dH) / cam.zoom
      var tilt = (cam.tilt * Math.PI) / 180, az = (cam.az * Math.PI) / 180
      target.set(cam.x - W / 2, H / 2 - cam.y, LZ * 0.5)
      camera.position.set(
        target.x + D * Math.sin(tilt) * Math.sin(az),
        target.y - D * Math.sin(tilt) * Math.cos(az),
        target.z + D * Math.cos(tilt)
      )
      camera.lookAt(target)
      camera.updateMatrixWorld()
      // Put the target at the layout's focus point rather than the centre.
      shift.makeTranslation(2 * lay.focus[0] - 1, 1 - 2 * lay.focus[1], 0)
      camera.projectionMatrix.premultiply(shift)
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
      // Line widths are set in screen pixels.
      var a = project(cam.x, cam.y, LZ), b = project(cam.x + 10, cam.y, LZ)
      var pxPer = a && b ? Math.max(0.05, Math.hypot(b[0] - a[0], b[1] - a[1]) / 10) : 1
      ribbons.forEach(function (m) { m.material.uniforms.uWidth.value = m.userData.px / pxPer; m.material.uniforms.uTime.value = t })
      Object.keys(plate.routes).forEach(function (rid) {
        var r = plate.routes[rid]
        if (!r || !r.mesh) return
        r.mesh.material.uniforms.uOpacity.value = r.o
        r.mesh.material.uniforms.uDraw.value = r.draw === Infinity ? 1e9 : r.draw
        r.mesh.visible = r.o > 0.005
      })
      Object.keys(plate.props).forEach(function (key) {
        var pr = plate.props[key]
        var vis = pr.o > 0.005
        if (pr.kind === 'tower' && pr.mesh) {
          pr.mesh.visible = vis
          pr.mesh.scale.z = Math.max(0.001, pr.h * pr.grow)
          pr.mats.forEach(function (m) { m.opacity = pr.o })
        } else if (pr.kind === 'ring' && pr.group) {
          pr.group.visible = vis
          if (pr.band) pr.band.material.uniforms.uOpacity.value = 0.16 * pr.o
          pr.lines.forEach(function (m) { m.material.uniforms.uOpacity.value = pr.o })
        } else if (pr.kind === 'line' && pr.lines) {
          pr.lines[0].visible = vis
          pr.lines[0].material.uniforms.uOpacity.value = pr.o * 0.95
        } else if (pr.kind === 'pulse' && pr.rings) {
          pr.rings.forEach(function (m, i) {
            var ph = t ? ((t / 3.2 + i * 0.5) % 1) : 0.35
            var r = lerp(pr.r * 0.2, pr.r, ph)
            m.visible = vis
            m.scale.set(r, r, 1)
            m.material.opacity = pr.o * (1 - ph) * 0.9
          })
        }
      })
      Object.keys(plate.fogs).forEach(function (key) {
        var f = plate.fogs[key]
        if (!f.mesh) return
        f.mesh.visible = f.line.visible = f.o > 0.005
        f.mesh.material.uniforms.uOpacity.value = f.o
        f.mesh.material.uniforms.uTime.value = t
        f.line.material.uniforms.uOpacity.value = f.o * 0.85
      })
      var grp = groups[plate.id]
      if (grp) {
        grp.traverse(function (o) {
          if (o.material && o.material.uniforms && o.material.uniforms.uMap) o.material.uniforms.uTime.value = t
        })
      }
      renderer.render(scene, camera)
    }
    function project(x, y, z) {
      if (!current) return null
      v3.set(x - current.W / 2, current.H / 2 - y, z)
      v3.project(camera)
      if (v3.z > 1 || v3.z < -1) return null
      return [((v3.x + 1) / 2) * size[0], ((1 - v3.y) / 2) * size[1]]
    }
    return { kind: 'webgl', build: build, show: show, hide: hide, resize: resize, draw: draw, project: project }
  }

  // ── the CSS 3D stage (no WebGL) ────────────────────────────────────────
  // The design canvas's own construction: an inline SVG plate tilted in CSS
  // 3D, the land drawn four times as strata, props as CSS boxes.
  function cssRenderer(host, tok) {
    var NS = 'http://www.w3.org/2000/svg'
    var cam = el('div', 'dio-css-cam')
    host.appendChild(cam)
    var size = [1, 1]
    var current = null
    var T = { k: 1, P: 2400, fx: 0, fy: 0, x: 0, y: 0, tilt: 0, az: 0 }
    var anims = []
    var uid = 0

    function svgEl(tag, attrs, parent) {
      var e = doc.createElementNS(NS, tag)
      for (var k in attrs) e.setAttribute(k, attrs[k])
      if (parent) parent.appendChild(e)
      return e
    }
    function flow(e, per, ms) {
      if (S.reduced || !e.animate) return
      anims.push(e.animate([{ strokeDashoffset: per }, { strokeDashoffset: 0 }], { duration: ms || 1400, iterations: Infinity }))
    }
    function build(plate) {
      var W = plate.W, H = plate.H
      var id = 'dio' + ++uid
      var p = el('div', 'dio-css-plate')
      p.style.width = W + 'px'
      p.style.height = H + 'px'
      var front = el('div', 'dio-css-front', esc(plate.caption))
      var side = el('div', 'dio-css-side')
      p.appendChild(front)
      p.appendChild(side)
      var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, 'aria-hidden': 'true' })
      p.appendChild(svg)
      var defs = svgEl('defs', {}, svg)
      var rg = svgEl('radialGradient', { id: id + 's', cx: '64%', cy: '42%', r: '78%' }, defs)
      ;['sea-1', 'sea-2', 'sea-3'].forEach(function (k, i) { svgEl('stop', { offset: i / 2, 'stop-color': tok[k] }, rg) })
      var fg = svgEl('linearGradient', { id: id + 'f', x1: 0, y1: 0, x2: 1, y2: 0 }, defs)
      svgEl('stop', { offset: 0, 'stop-color': tok.fog, 'stop-opacity': 0.42 }, fg)
      svgEl('stop', { offset: 0.8, 'stop-color': tok.fog, 'stop-opacity': 0.22 }, fg)
      svgEl('stop', { offset: 1, 'stop-color': tok.fog, 'stop-opacity': 0 }, fg)
      svgEl('rect', { width: W, height: H, fill: 'url(#' + id + 's)' }, svg)
      var d = plate.land.d
      if (d) {
        svgEl('path', { d: d, fill: 'none', stroke: tok.paper, 'stroke-opacity': 0.04, 'stroke-width': 26, 'stroke-linejoin': 'round' }, svg)
        svgEl('path', { d: d, fill: 'none', stroke: tok.paper, 'stroke-opacity': 0.06, 'stroke-width': 11, 'stroke-linejoin': 'round' }, svg)
      }
      var under = svgEl('g', {}, svg)
      if (d) {
        ;[[7, 'strata-3'], [4.5, 'strata-2'], [2, 'strata-1']].forEach(function (s) { svgEl('path', { d: d, transform: 'translate(0 ' + s[0] + ')', fill: tok[s[1]] }, svg) })
        svgEl('path', { d: d, fill: tok.land, stroke: mix(tok['strata-2'], tok.land, 0.2), 'stroke-width': 0.6, 'stroke-linejoin': 'round' }, svg)
      }
      Object.keys(plate.props).forEach(function (key) {
        var pr = plate.props[key]
        if (pr.kind === 'ring') {
          pr.g = svgEl('g', { opacity: 0 }, under)
          if (pr.radii.length > 1) svgEl('circle', { cx: pr.xy[0], cy: pr.xy[1], r: (pr.radii[0] + pr.radii[1]) / 2, fill: 'none', stroke: pr.color, 'stroke-opacity': 0.16, 'stroke-width': pr.radii[1] - pr.radii[0] }, pr.g)
          pr.radii.forEach(function (r) { flow(svgEl('circle', { cx: pr.xy[0], cy: pr.xy[1], r: r, fill: 'none', stroke: pr.color, 'stroke-width': 1.2, 'stroke-dasharray': '3 4' }, pr.g), 7) })
        }
      })
      var top = svgEl('g', {}, svg)
      Object.keys(plate.routes).forEach(function (rid) {
        var r = plate.routes[rid]
        if (!r) return
        var g = svgEl('g', { opacity: 0 }, top)
        var mask = svgEl('mask', { id: id + 'm' + rid.replace(/\W/g, '') }, defs)
        r.maskPath = svgEl('path', { d: r.d, fill: 'none', stroke: '#fff', 'stroke-width': 8, 'stroke-dasharray': r.length + 1 + ' ' + (r.length + 1) }, mask)
        var path = svgEl('path', { d: r.d, fill: 'none', stroke: r.color, 'stroke-width': r.width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', mask: 'url(#' + mask.id + ')' }, g)
        if (r.dash[0]) {
          path.setAttribute('stroke-dasharray', r.dash.join(' '))
          flow(path, r.dash[0] + r.dash[1])
        }
        r.g = g
      })
      Object.keys(plate.props).forEach(function (key) {
        var pr = plate.props[key]
        if (pr.kind === 'line') {
          pr.g = svgEl('g', { opacity: 0 }, top)
          flow(svgEl('path', { d: 'M' + pr.a + 'L' + pr.b, fill: 'none', stroke: pr.spec.color ? pr.color : tok.paper, 'stroke-width': 2, 'stroke-dasharray': '1 6', 'stroke-linecap': 'round' }, pr.g), 7, 1200)
        } else if (pr.kind === 'pulse') {
          pr.g = svgEl('g', { opacity: 0 }, top)
          ;[0, 1].forEach(function (i) {
            var c = svgEl('circle', { cx: pr.xy[0], cy: pr.xy[1], r: pr.r, fill: 'none', stroke: pr.color, 'stroke-width': 1.6 }, pr.g)
            c.style.transformBox = 'fill-box'
            c.style.transformOrigin = 'center'
            if (!S.reduced && c.animate) {
              anims.push(c.animate([{ transform: 'scale(.2)', opacity: 0.9 }, { transform: 'scale(1)', opacity: 0 }], { duration: 3200, delay: i * 1600, iterations: Infinity }))
            } else c.style.opacity = 0.5
          })
        } else if (pr.kind === 'tower') {
          var s = pr.size, h = pr.h, sh = shadesOf(pr.color)
          var box = el('div', 'dio-css-tower')
          box.style.left = pr.xy[0] - s / 2 + 'px'
          box.style.top = pr.xy[1] - s / 2 + 'px'
          box.style.width = box.style.height = s + 'px'
          box.innerHTML =
            '<i style="left:0;top:' + (s - h) + 'px;width:' + s + 'px;height:' + h + 'px;transform-origin:bottom;transform:rotateX(-90deg);background:' + sh.south + '"></i>' +
            '<i style="left:' + s + 'px;top:0;width:' + h + 'px;height:' + s + 'px;transform-origin:left;transform:rotateY(-90deg);background:' + sh.east + '"></i>' +
            '<i style="left:' + -h + 'px;top:0;width:' + h + 'px;height:' + s + 'px;transform-origin:right;transform:rotateY(90deg);background:' + sh.west + '"></i>' +
            '<i style="left:0;top:0;width:' + s + 'px;height:' + s + 'px;transform:translateZ(' + h + 'px);background:' + sh.top + '"></i>'
          p.appendChild(box)
          pr.box = box
        }
      })
      Object.keys(plate.fogs).forEach(function (key) {
        var f = plate.fogs[key]
        f.g = svgEl('g', { opacity: 0 }, svg)
        var fw = f.west ? f.x : W - f.x
        svgEl('rect', { x: f.west ? 0 : f.x, width: fw, height: H, fill: 'url(#' + id + 'f)', transform: f.west ? '' : 'translate(' + (2 * f.x + fw) + ' 0) scale(-1 1)' }, f.g)
        svgEl('line', { x1: f.x, x2: f.x, y1: H * 0.06, y2: H * 0.95, stroke: tok.accent, 'stroke-width': 1.2, 'stroke-dasharray': '2 5' }, f.g)
      })
      plate.cssEl = p
      p.style.display = plate === current ? '' : 'none'
      cam.appendChild(p)
    }
    function shadesOf(hex) {
      return { top: hex, south: mix(hex, tok.ground, 0.45), west: mix(hex, tok.ground, 0.55), east: mix(hex, tok.ground, 0.66) }
    }
    function show(plate) {
      current = plate
      ;[].forEach.call(cam.children, function (c) { c.style.display = c === plate.cssEl ? '' : 'none' })
    }
    function hide(plate) { if (plate.cssEl) plate.cssEl.style.display = 'none' }
    function resize(width, height) { size = [Math.max(1, width), Math.max(1, height)] }
    function draw(plate, c, t, lay) {
      var p = plate.cssEl
      if (!p) return
      var fit = Math.min((size[0] * lay.fit) / plate.W, (size[1] * 0.74) / (plate.H * Math.cos((c.tilt * Math.PI) / 180) * 1.25))
      T = { k: fit * c.zoom, P: 2.4 * fit * plate.W, fx: size[0] * lay.focus[0], fy: size[1] * lay.focus[1], x: c.x, y: c.y, tilt: c.tilt, az: c.az }
      cam.style.perspective = T.P + 'px'
      cam.style.perspectiveOrigin = T.fx + 'px ' + T.fy + 'px'
      p.style.transform = 'translate3d(' + T.fx + 'px,' + T.fy + 'px,0) scale3d(' + T.k + ',' + T.k + ',' + T.k + ') rotateX(' + c.tilt + 'deg) rotateZ(' + c.az + 'deg) translate3d(' + -c.x + 'px,' + -c.y + 'px,0)'
      Object.keys(plate.routes).forEach(function (rid) {
        var r = plate.routes[rid]
        if (!r || !r.g) return
        r.g.setAttribute('opacity', r.o.toFixed(3))
        r.maskPath.setAttribute('stroke-dashoffset', r.draw === Infinity ? 0 : Math.max(0, r.length + 1 - r.draw))
      })
      Object.keys(plate.props).forEach(function (key) {
        var pr = plate.props[key]
        if (pr.g) pr.g.setAttribute('opacity', pr.o.toFixed(3))
        if (pr.box) {
          pr.box.style.opacity = pr.o.toFixed(3)
          pr.box.style.transform = 'scaleZ(' + Math.max(0.01, pr.grow) + ')'
        }
      })
      Object.keys(plate.fogs).forEach(function (key) { var f = plate.fogs[key]; if (f.g) f.g.setAttribute('opacity', f.o.toFixed(3)) })
    }
    // The same transform as the plate's CSS, applied to one point.
    function project(x, y, z) {
      var r = Math.PI / 180
      var X = x - T.x, Y = y - T.y, Z = z
      var ca = Math.cos(T.az * r), sa = Math.sin(T.az * r)
      var x1 = X * ca - Y * sa, y1 = X * sa + Y * ca
      var ct = Math.cos(T.tilt * r), st = Math.sin(T.tilt * r)
      var y2 = y1 * ct - Z * st, z2 = y1 * st + Z * ct
      var xs = x1 * T.k, ys = y2 * T.k, zs = z2 * T.k
      if (zs >= T.P) return null
      var f = T.P / (T.P - zs)
      return [T.fx + xs * f, T.fy + ys * f]
    }
    return { kind: 'css', build: build, show: show, hide: hide, resize: resize, draw: draw, project: project }
  }
})()
