"""team@1.2 spread generator: pack + editorial + palette -> x-dc template body.
Markup is transcribed from the Arsenal / Chelsea / Manchester United reference spreads."""
import datetime, html, itertools, math, re

ROW_RX = 'position: absolute'
HEATER = 'polygon(6% 4%,94% 4%,94% 40%,91% 58%,83% 74%,68% 88%,50% 97%,32% 88%,17% 74%,9% 58%,6% 40%)'
CLIP = {'heater': HEATER, 'roundel': 'circle(47% at 50% 50%)', 'oval': 'ellipse(40% 48% at 50% 50%)', 'plate': 'inset(10% 4% round 18%)'}
POS_COL = {'FW': '#E7B94C', 'MF': '#EF7594', 'DF': '#75BCE9', 'GK': '#FFFFFF'}
MONTHS = [(2003, 8), (2003, 9), (2003, 10), (2003, 11), (2003, 12), (2004, 1), (2004, 2), (2004, 3), (2004, 4), (2004, 5)]
MN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']


def esc(s):
    return html.escape(s, quote=False)


def ord_(n):
    n = int(n)
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def f1(x):
    return f'{x:.1f}'


def fmt_day(d):
    dt = datetime.date.fromisoformat(d)
    return f'{dt.day} {MN[dt.month]}'


# ---- tokens ---------------------------------------------------------------
def pattern_css(t):
    p, a, b = t['pattern'], t.get('c1'), t.get('c2')
    return {
        'plain': a,
        'sleeves': f'linear-gradient(90deg, {b} 0 20%, {a} 20% 80%, {b} 80%)',
        'halves': f'linear-gradient(90deg, {a} 50%, {b} 50%)',
        'stripes': f'repeating-linear-gradient(90deg, {a} 0 12.5%, {b} 12.5% 25%)',
        'hoops': f'repeating-linear-gradient(180deg, {a} 0 16.66%, {b} 16.66% 33.33%)',
        'band': f'linear-gradient(180deg, {a} 0 42%, {b} 42% 58%, {a} 58%)',
        'panel': f'linear-gradient(90deg, {a} 0 34%, {b} 34% 66%, {a} 66%)',
        'trim': f'linear-gradient(180deg, {a} 0 70%, {b} 70% 78%, {a} 78%)',
    }[p]


def token(t, size, title, keyline='#15161A'):
    """A kit-derived club token, or the dashed 'token row pending' placeholder."""
    if not t:
        return f'<span style="width: {size}px; height: {size}px; flex: none; box-sizing: border-box; border-radius: 50%; border: 0.8px dashed rgba(255,255,255,0.6)" title="{esc(title)}: token row pending"></span>'
    c = CLIP[t['family']]
    return (f'<span style="position: relative; width: {size}px; height: {size}px; flex: none; background: {keyline}; clip-path: {c}" title="{esc(title)}: {t["family"]}, {t["pattern"]}">'
            f'<span style="position: absolute; inset: 4%; background: {pattern_css(t)}; clip-path: {c}"></span></span>')


def lum(h):
    v = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    v = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in v]
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]


def contrast(a, b):
    x, y = sorted((lum(a), lum(b)), reverse=True)
    return (x + 0.05) / (y + 0.05)


def identity(p, pal, left):
    t = p['token']
    kl = pal.get('keyline') or ('#FFFFFF' if contrast(t['c1'], left) < 1.6 or contrast('#15161A', left) < 1.6 else '#15161A')
    c = CLIP[t['family']]
    return (f'<div style="position: absolute; left: 470px; top: 45px; width: 76px; height: 84px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px" role="img" aria-label="{esc(p["name"])} club token: {t["family"]} in {t["pattern"]}">'
            f'<div style="position: relative; width: 64px; height: 64px; background: {kl}; clip-path: {c}"><div style="position: absolute; inset: 4%; background: {pattern_css(t)}; clip-path: {c}"></div></div>'
            f'<span style="font-stretch: 75%; font-size: 13px; line-height: 14px; font-weight: 800; letter-spacing: 0.06em">{p["code"]}</span></div>')


# ---- climb ----------------------------------------------------------------
def climb_range(pos):
    lo, hi = min(pos), max(pos)
    if (hi - lo) % 2:
        if lo > 1:
            lo -= 1
        else:
            hi += 1
    if hi - lo < 2:
        hi = lo + 2
    return lo, hi


def climb(p, ed, pal):
    pos = p['rounds']
    lo, hi = climb_range(pos)
    y = lambda v: 262 + (v - lo) / (hi - lo) * 90
    x = lambda r: 274 + (r - 1) * 272 / 37
    mid = (lo + hi) // 2
    tp = ed['turn_round']
    d = 'M' + ' L'.join(f'{x(i + 1):.1f} {y(v):.1f}' for i, v in enumerate(pos))
    marks = [1, tp, 38]
    rects = ''.join(f'<rect x="{x(r) - 2.5:.1f}" y="{y(pos[r - 1]) - 2.5:.1f}" width="5" height="5" fill="{{{{highlight}}}}"></rect>' for r in marks)
    tl = f'R{tp:02d} · {ord_(pos[tp - 1])}, {fmt_day(p["round_dates"][tp - 1])}'
    tx = min(max(x(tp), 348), 462)
    ttl = ed.get('climb_title', 'THE CLIMB')
    return f'''  <div style="position: absolute; left: 262px; top: 222px; display: flex; align-items: center; gap: 6px; font-size: 10px; line-height: 12px; font-weight: 700; color: {{{{highlight}}}}">
    <svg width="16" height="16" sc-camel-view-box="0 0 16 16" aria-hidden="true"><path d="M1.5 1.5 V14.5 H14.5 M3.5 11 L7 7 L9.5 9 L14 4" fill="none" stroke="{{{{highlight}}}}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"></path></svg>
    <span>{ttl} / LEAGUE POSITION</span>
  </div>
  <svg width="300" height="150" sc-camel-view-box="250 245 300 150" role="img" aria-label="League position by round: {ord_(pos[0])} after round 1, {ord_(pos[tp - 1])} after round {tp}, {ord_(pos[37])} after round 38" style="position: absolute; left: 250px; top: 245px; overflow: visible; font-family: Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif">
    <g stroke="{pal['grid']}" stroke-width="0.5"><line x1="272" y1="262.0" x2="548" y2="262.0"></line><line x1="272" y1="307.0" x2="548" y2="307.0"></line><line x1="272" y1="352.0" x2="548" y2="352.0"></line></g>
    <g font-size="7.5" fill="#FFFFFF" text-anchor="end"><text x="266" y="264.5">{lo}</text><text x="266" y="309.5">{mid}</text><text x="266" y="354.5">{hi}</text></g>
    <path d="{d}" fill="none" stroke="{{{{highlight}}}}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"></path>
    {rects}
    <g font-size="7.5" fill="#FFFFFF"><text x="274" y="368">R01 · {ord_(pos[0])}</text><text x="{tx:.1f}" y="368" text-anchor="middle">{tl}</text><text x="548" y="368" text-anchor="end">R38 · {ord_(pos[37])}</text></g>
  </svg>'''


# ---- calendar -------------------------------------------------------------
CELL_DOT = '<span style="width: 11px; height: 8.5px; display: flex; align-items: center; justify-content: center"><span style="width: 1.3px; height: 1.3px; border-radius: 50%; background: rgba(255,255,255,0.32)"></span></span>'
CELL_NONE = '<span style="width: 11px; height: 8.5px"></span>'


def mark(m, pal):
    col = {'W': '{{highlight}}', 'D': pal['draw'], 'L': '{{accent}}'}[m['res']]
    if m['comp'] == 'PL':
        return f'<span style="width: 6px; height: 6px; background: {col}"></span>'
    if m['comp'] in ('UCL', 'UC'):
        return f'<span style="width: 6px; height: 6px; border-radius: 50%; background: {col}"></span>'
    return f'<span style="width: 4.8px; height: 4.8px; transform: rotate(45deg); background: {col}"></span>'


def calendar(p, pal):
    by = {}
    for m in p['matches']:
        by.setdefault(m['date'], []).append(m)
    out = []
    for y, mo in MONTHS:
        first = datetime.date(y, mo, 1)
        n = (datetime.date(y + (mo == 12), mo % 12 + 1, 1) - first).days
        cells = [CELL_NONE] * first.weekday()
        for d in range(1, n + 1):
            iso = datetime.date(y, mo, d).isoformat()
            if iso in by:
                cells.append('<span style="width: 11px; height: 8.5px; display: flex; gap: 1px; align-items: center; justify-content: center">' + ''.join(mark(m, pal) for m in by[iso]) + '</span>')
            else:
                cells.append(CELL_DOT)
        out.append(f'<div style="display: flex; flex-direction: column; gap: 8px"><span style="font-size: 9px; line-height: 11px; font-weight: 700">{MN[mo].upper()}</span><div style="display: grid; grid-template-columns: repeat(7, 11px); grid-auto-rows: 8.5px; align-items: center; justify-items: center">{"".join(cells)}</div></div>')
    return '    ' + ''.join(out)


COLX = [40 + i * 105.4 for i in range(5)]


def cell_xy(iso):
    dt = datetime.date.fromisoformat(iso)
    idx = next(i for i, ym in enumerate(MONTHS) if ym == (dt.year, dt.month))
    col = idx % 5
    first = datetime.date(dt.year, dt.month, 1)
    row = (first.weekday() + dt.day - 1) // 7
    y0 = 461 if idx < 5 else 544.5
    return COLX[col] + 11 * dt.weekday() + 5.5, y0 + 8.5 * row + 4.25, col, idx >= 5


def _cross(a, b):
    """Do axis-aligned segments a, b intersect (touching counts)?"""
    (x1, y1, x2, y2), (x3, y3, x4, y4) = a, b
    if max(min(x1, x2), min(x3, x4)) - 0.01 > min(max(x1, x2), max(x3, x4)) + 0.01:
        return False
    if max(min(y1, y2), min(y3, y4)) - 0.01 > min(max(y1, y2), max(y3, y4)) + 0.01:
        return False
    return True


def route_leaders(dates, match_days):
    """Orthogonal leaders from rings to the text columns, through the gaps between months.
    A ring may leave sideways to a gutter, or, in the lower row of months, straight down."""
    rings = sorted(((cell_xy(d)[0], cell_xy(d)[1], d) for d in dates))
    n = len(rings)
    tcol = [40 + i * (515 + 12) / n + 8 for i in range(n)]
    lanes = [616, 622, 628, 634][:n]
    gutters = [c + 77 + g for c in COLX[:4] for g in (6.5, 13, 19.5)] + [36.0, 30.0, 545.0, 551.0]
    marks = [(cell_xy(d)[0], cell_xy(d)[1]) for d in match_days if d not in dates]
    GRID_BOTTOM = 595
    opts = []
    for rx, ry, d in rings:
        o = [('side', g) for g in sorted(gutters, key=lambda g: abs(g - rx))[:6]]
        if ry > 540:
            o.insert(0, ('down', rx))
        opts.append(o)
    best = None
    for gs in itertools.product(*opts):
        xs = [g for _, g in gs]
        if any(abs(a - b) < 5.5 for a, b in itertools.combinations(xs, 2)):
            continue
        base = []
        hit_cost = 0
        for (rx, ry, d), (kind, g) in zip(rings, gs):
            if kind == 'side':
                sx = rx + 5 if g > rx else rx - 5
                base.append([(sx, ry, g, ry), (g, ry, g, 0)])
                for mx, my in marks:
                    if abs(my - ry) < 1 and min(sx, g) - 3.5 < mx < max(sx, g) + 3.5:
                        hit_cost += 400
            else:
                base.append([(rx, ry + 5, rx, 0)])
                for mx, my in marks:
                    if abs(mx - rx) < 3.5 and my > ry:
                        hit_cost += 400
        for lp in itertools.permutations(lanes):
            segs, cost = [], hit_cost
            for b_, (kind, g), lane, t in zip(base, gs, lp, tcol):
                s_ = [tuple(q[:3] + (lane,)) if q[3] == 0 else q for q in b_]
                s_ += [(g, lane, t, lane), (t, lane, t, 640)]
                segs.append(s_)
                cost += abs(g - t) * 0.6 + (lane - 616) * 0.05
            bad = 0
            for i, j in itertools.combinations(range(n), 2):
                bad += sum(_cross(a, b) for a in segs[i] for b in segs[j])
                for rr, sg in ((rings[j], segs[i]), (rings[i], segs[j])):
                    for q in sg:
                        if min(q[0], q[2]) - 5.2 < rr[0] < max(q[0], q[2]) + 5.2 and min(q[1], q[3]) - 5.2 < rr[1] < max(q[1], q[3]) + 5.2:
                            bad += 1
            tot = bad * 10000 + cost
            if best is None or tot < best[0]:
                best = (tot, bad, gs, lp, hit_cost)
    tot, bad, gs, lp, hit_cost = best
    circles = ''.join(f'<circle cx="{rx:.1f}" cy="{ry:.2f}" r="5"></circle>' for rx, ry, d in rings)
    paths = ''
    for (rx, ry, d), (kind, g), lane, t in zip(rings, gs, lp, tcol):
        if kind == 'side':
            sx = rx + 5 if g > rx else rx - 5
            paths += f'<path d="M{sx:.1f} {ry:.2f} H{g:.1f} V{lane:.2f} H{t:.1f} V640.00"></path>'
        else:
            paths += f'<path d="M{rx:.1f} {ry + 5:.2f} V{lane:.2f} H{t:.1f} V640.00"></path>'
    return circles, paths, [r[2] for r in rings], bad + (hit_cost // 400) * 0.01


def moments(p, ed):
    ms = ed['moments']
    days = sorted({m['date'] for m in p['matches']})
    circles, paths, order, bad = route_leaders([m['date'] for m in ms], days)
    by = {m['date']: m for m in ms}
    cols = ''.join(f'<div style="border-top: 0.6px solid {{{{highlight}}}}; padding-top: 3px"><b style="color: {{{{highlight}}}}">{fmt_day(d)}</b> · {by[d]["text"]}</div>' for d in order)
    return f'''  <!-- Key moments, linked to their dates in the calendar (ordered left to right so the leaders never cross: {", ".join(fmt_day(d) for d in order)}) -->
  <svg width="595" height="842" sc-camel-view-box="0 0 595 842" aria-hidden="true" style="position: absolute; left: 0; top: 0; pointer-events: none">
    <g fill="none" stroke="{{{{highlight}}}}" stroke-width="0.7">{circles}</g>
    <g fill="none" stroke="{{{{highlight}}}}" stroke-width="0.6" stroke-opacity="0.85" stroke-linejoin="round">{paths}</g>
  </svg>
  <div style="position: absolute; left: 40px; top: 642px; width: 515px; display: grid; grid-template-columns: repeat({len(ms)}, minmax(0, 1fr)); gap: 12px; font-size: 7px; line-height: 9px">
    {cols}
  </div>''', bad


# ---- cup runs -------------------------------------------------------------
FLAG = 'background: linear-gradient(#C8102E,#C8102E) center/100% 3.2px no-repeat, linear-gradient(#C8102E,#C8102E) center/3.2px 100% no-repeat, #FFFFFF'
UCL_MARK = '<svg width="24" height="16" sc-camel-view-box="0 0 24 16" role="img" aria-label="Champions League mark: knockout bracket" style="flex: none"><rect x="0" y="0" width="24" height="16" rx="2.5" fill="#15161A"></rect><g fill="none" stroke="#F7F6F2" stroke-width="1.1" stroke-linecap="round"><path d="M4 4 H8 V12 H4 M8 8 H10.5 M20 4 H16 V12 H20 M16 8 H13.5"></path></g><circle cx="12" cy="8" r="1.4" fill="#F7F6F2"></circle></svg>'
UC_MARK = '<svg width="24" height="16" sc-camel-view-box="0 0 24 16" role="img" aria-label="UEFA Cup mark: knockout ladder" style="flex: none"><rect x="0" y="0" width="24" height="16" rx="2.5" fill="#15161A"></rect><g fill="#F7F6F2"><circle cx="5" cy="3" r="1.25"></circle><circle cx="5" cy="6.3" r="1.25"></circle><circle cx="5" cy="9.7" r="1.25"></circle><circle cx="5" cy="13" r="1.25"></circle><circle cx="12" cy="4.65" r="1.25"></circle><circle cx="12" cy="11.35" r="1.25"></circle><circle cx="19" cy="8" r="1.6"></circle></g></svg>'
CUP_MARK = f'<span style="width: 24px; height: 16px; flex: none; border-radius: 2.5px; box-shadow: inset 0 0 0 0.8px #15161A; {FLAG}; display: flex; align-items: center; justify-content: center" role="img" aria-label="Domestic cup mark: ENG flag tile with cup diamond"><span style="width: 5.5px; height: 5.5px; box-sizing: border-box; transform: rotate(45deg); border: 1.3px solid #15161A; background: #FFFFFF"></span></span>'
MARKS = {'UCL': (UCL_MARK, 'UCL', 'CHAMPIONS LEAGUE'), 'UC': (UC_MARK, 'UC', 'UEFA CUP'), 'FAC': (CUP_MARK, 'FAC', 'FA CUP'), 'LC': (CUP_MARK, 'LC', 'LEAGUE CUP')}


def run_row(x, y, r, pal, last):
    won = r.get('won')
    out = r.get('out')
    if won:
        style = 'background: {{highlight}}; color: {{right}}'
        lab = '{{right}}'
    elif out:
        style = f'background: {pal["outbg"]}; box-shadow: inset 2px 0 0 {pal["outedge"]}; color: #FFFFFF'
        lab = '{{highlight}}'
    else:
        style = f'background: {pal["card"]}; color: #FFFFFF'
        lab = '{{highlight}}'
    return (f'<div style="position: absolute; left: {x}px; top: {y}px; width: 214px; height: 18px; box-sizing: border-box; padding: 0 6px; display: flex; gap: 5px; align-items: center; {style}">'
            f'<span style="font-size: 6.5px; line-height: 8px; font-weight: 700; color: {lab}; width: 18px; flex: none">{r["label"]}</span>'
            f'{token(r["token"], 12, r["opp"])}'
            f'<span style="font-size: 7px; line-height: 9px; font-weight: 700; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{esc(r["opp"])}</span>'
            f'<span style="font-size: 6.5px; line-height: 8px; white-space: nowrap; font-variant-numeric: tabular-nums; width: 52px; flex: none">{r["legs"]}</span>'
            f'<span style="font-size: 6.5px; line-height: 8px; font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; width: 38px; flex: none; text-align: right">{r["right"]}</span></div>')


def block_height(b):
    return 31 + 18 + 20 * (len(b['rows']) - 1)


def choose_columns(blocks):
    """Split blocks into two columns, shortest overall, keeping book order inside a column."""
    best = None
    n = len(blocks)
    for mask in range(1 << n):
        a = [b for i, b in enumerate(blocks) if mask >> i & 1]
        c = [b for i, b in enumerate(blocks) if not mask >> i & 1]
        if not a:
            continue
        h = lambda l: sum(block_height(x) for x in l) + 12 * (len(l) - 1) if l else 0
        ha, hc = h(a), h(c)
        widest = max([len(x['rows']) for x in c] or [0])
        pen = max(0, widest - 5) * 30
        score = (max(ha, hc), abs(ha - hc) + pen, 0 if blocks[0] in a else 1)
        if best is None or score < best[0]:
            best = (score, a, c)
    return best[1], best[2]


def cup_runs(p, pal):
    blocks = p['runs']
    a, c = choose_columns(blocks)
    out, bottom = [], 32
    for x0, col in ((625, a), (900, c)):
        y = 32
        for b in col:
            mk, code, name = MARKS[b['comp']]
            if contrast('#15161A', pal['right']) < 1.35:  # keep the dark tile visible on a near-black page
                mk = mk.replace('rx="2.5" fill="#15161A"', 'rx="2.5" fill="#15161A" stroke="#F7F6F2" stroke-opacity="0.4" stroke-width="0.6"')
            out.append(f'<div style="position: absolute; left: {x0}px; top: {y}px; width: 250px"><div style="display: flex; align-items: center; gap: 6px; font-size: 10px; line-height: 12px; font-weight: 700; color: {{{{highlight}}}}">{mk}<span style="font-stretch: 75%; font-weight: 800; letter-spacing: 0.06em; color: #FFFFFF">{code}</span><span>{name}</span></div><div style="margin-top: 5px; font-size: 7.5px; line-height: 9px">{esc(b["sub"])}</div></div>')
            ry = y + 31
            for i, r in enumerate(b['rows']):
                rx = x0 + 12 * i
                if i:
                    out.append(f'<div style="position: absolute; left: {rx - 7}px; top: {ry - 3}px; width: 7px; height: 12px; box-sizing: border-box; border-left: 0.8px solid {{{{highlight}}}}; border-bottom: 0.8px solid {{{{highlight}}}}"></div>')
                out.append(run_row(rx, ry, r, pal, i == len(b['rows']) - 1))
                ry += 20
            y = ry - 20 + 18 + 12
            bottom = max(bottom, ry - 2)
    neutral = any(r['legs'].startswith('N') for b in blocks for r in b['rows'])
    won = any(r.get('won') for b in blocks for r in b['rows'])
    note = f'Scores {p["short"]} first · H home / A away{" / N neutral" if neutral else ""} · right column = aggregate · {pal["outname"]} = elimination{", gold = winners" if won else ""}'
    note_y = bottom + 7
    out.append(f'<div style="position: absolute; left: 625px; top: {note_y}px; width: 525px; font-size: 7px; line-height: 9px; opacity: 0.85; text-wrap: pretty">{note}</div>')
    return ''.join(out), note_y


# ---- the side -------------------------------------------------------------
PEOPLE_ICON = '<svg width="16" height="16" sc-camel-view-box="0 0 16 16" aria-hidden="true"><g fill="none" stroke="{{highlight}}" stroke-width="1.1" stroke-linecap="round"><circle cx="8" cy="5" r="2.5"></circle><path d="M3.5 14 A4.5 4.5 0 0 1 12.5 14"></path><circle cx="2.5" cy="6" r="1.5"></circle><circle cx="13.5" cy="6" r="1.5"></circle></g></svg>'
PITCH = '<svg width="160" height="76" sc-camel-view-box="0 0 160 76" aria-hidden="true" style="position: absolute; left: 0; top: 0"><g fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="0.6"><rect x="0.5" y="0.5" width="159" height="75"></rect><line x1="80" y1="0.5" x2="80" y2="75.5"></line><circle cx="80" cy="38" r="10"></circle><rect x="0.5" y="16" width="25" height="44"></rect><rect x="134.5" y="16" width="25" height="44"></rect></g></svg>'


def line_y(n):
    return {1: [38], 2: [25.3, 50.7], 3: [19, 38, 57], 4: [15.2, 30.4, 45.6, 60.8], 5: [11, 24.5, 38, 51.5, 65], 6: [10, 21, 32, 43, 54, 65]}[n]


def side_dot(cx, cy, pl):
    new = pl.get('new')
    style = 'color: #FFFFFF; background: {{accent}}; border: 0.8px solid #FFFFFF' if new else 'color: {{right}}; background: {{highlight}}; border: 0'
    return (f'<span style="position: absolute; left: {cx - 5.5:.1f}px; top: {cy - 5.5:.1f}px; width: 11px; height: 11px; border-radius: 50%; box-sizing: border-box; display: flex; align-items: center; justify-content: center; font-size: 6px; line-height: 6px; font-weight: 800; font-variant-numeric: tabular-nums; {style}">{pl["shirt"]}</span>'
            f'<span style="position: absolute; left: {cx - 24:.1f}px; top: {cy + 3.5:.1f}px; width: 48px; text-align: center; font-size: 5.5px; line-height: 6.5px; white-space: nowrap; color: #FFFFFF">{esc(pl["name"])}</span>')


def pitch(xi):
    out = []
    lines = xi['lines']  # gk, def, mid, fwd
    xs = {'gk': 12, 'd': 46, 'm': 88, 'f': 134}
    # a 3-man forward line sits a touch further back so names clear the box
    for key in ('gk', 'd', 'm', 'f'):
        pl = lines[key]
        if not pl:
            continue
        ys = line_y(len(pl))
        for q, yy in zip(pl, ys):
            out.append(side_dot(xs[key], yy, q))
    return ''.join(out)


def side(p, ed, pal, top):
    head = f'<div style="position: absolute; left: 625px; top: {top}px; display: flex; align-items: center; gap: 6px; font-size: 10px; line-height: 12px; font-weight: 700; color: {{{{highlight}}}}">{PEOPLE_ICON}<span>THE SIDE / COACH AND MOST-USED XI</span></div>'
    y = top + 22
    a = p['all']
    rec = f'<span style="font-variant-numeric: tabular-nums"><b>{a["n"]}</b> games &nbsp;<b>{a["W"]}</b>W <b>{a["D"]}</b>D <b>{a["L"]}</b>L</span>'
    c = ed['coach']
    if len(c) == 1:
        body = f'<span style="font-size: 12px; line-height: 14px; font-weight: 800">{esc(c[0]["name"])}</span><span>{esc(c[0]["bio"])}</span>{rec}'
        lab = 'COACH'
    else:
        lab = 'COACHES'
        body = ''
        for k in c:
            body += f'<span style="font-size: {k.get("size", 10.5)}px; line-height: 12px; font-weight: 800">{esc(k["name"])}</span><span style="font-size: 7px; line-height: 9px">{esc(k["bio"])}</span>'
        body += rec
    coach = f'<div style="position: absolute; left: 625px; top: {y}px; width: 150px; display: flex; flex-direction: column; gap: {3 if len(c) == 1 else 2}px; font-size: 7.5px; line-height: 10px"><span style="font-size: 7px; line-height: 9px; font-weight: 700; letter-spacing: 0.06em; color: {{{{highlight}}}}">{lab}</span>{body}</div>'
    xs = ''
    for lx, xi in zip((790, 980), p['xis']):
        xs += f'<div style="position: absolute; left: {lx}px; top: {y}px; width: 160px"><div style="font-size: 7px; line-height: 9px; font-weight: 700">{xi["label"]} <span style="font-weight: 400; opacity: 0.8">· {xi["shape"]}</span></div><div style="position: relative; margin-top: 4px; width: 160px; height: 76px">{PITCH}{pitch(xi)}</div></div>'
    newbit = f' {pal["accentname"]} = signed in January.' if any(q.get('new') for xi in p['xis'] for l in xi['lines'].values() for q in l) else ''
    cap = f'<div style="position: absolute; left: 790px; top: {y + 91}px; width: 360px; font-size: 6.5px; line-height: 8px; opacity: 0.85">Most starts in each half, by shirt number, in the usual shape; attack to the right.{newbit}</div>'
    return head + coach + xs + cap


# ---- bubble ---------------------------------------------------------------
def nice_top(mx):
    top = max(5, math.ceil(mx / 5) * 5)
    if top >= 25:
        return math.ceil(mx / 10) * 10, 10
    return top, 5


def text_w(s):
    return len(s) * 3.75


def people(p, ed, pal, top):
    h = 560 - (top + 20)
    y0 = h - 16
    players = [q for q in p['bubbles'] if q['min'] > 0]
    mx = max(q['goals'] for q in players)
    gtop, step = nice_top(mx)
    X = lambda m: 30 + m * 485 / 3420
    Y = lambda g: y0 - g * (y0 - 20) / gtop
    gmax = max(q['games'] for q in players)
    pts = []
    for q in sorted(players, key=lambda z: -z['games']):
        r = 7 * math.sqrt(q['games'] / gmax)
        pts.append(dict(q, ax=X(q['min']), ay=Y(q['goals']), x=X(q['min']), y=Y(q['goals']), r=max(r, 1.0)))
    for _ in range(400):
        moved = False
        for a, b in itertools.combinations(pts, 2):
            dx, dy = b['x'] - a['x'], b['y'] - a['y']
            d = math.hypot(dx, dy) or 0.01
            need = a['r'] + b['r'] + 1.2
            if d < need:
                push = (need - d) / 2
                ux, uy = (dx / d, dy / d) if d > 0.05 else (0.0, 1.0)
                # prefer vertical separation, x carries the exact minutes
                ux *= 0.55
                a['x'] -= ux * push; a['y'] -= uy * push
                b['x'] += ux * push; b['y'] += uy * push
                moved = True
        for q in pts:
            q['y'] = min(q['y'], y0 + 2)
            q['y'] = max(q['y'], 12)
            q['x'] = min(max(q['x'], 31), 518)
        if not moved:
            break
    moved = [q for q in pts if math.hypot(q['x'] - q['ax'], q['y'] - q['ay']) > 0.6]
    ticks_y = list(range(0, gtop + 1, step))
    grid = ''.join(f'M30.0 {Y(t):.1f} H515.0 ' for t in ticks_y) + ''.join(f'M{x:.1f} 14.0 V{y0:.1f} ' for x in (30.0, 171.8, 313.6, 455.4))
    axis = ''.join(f'<text x="24.0" y="{Y(t) + 2.5:.1f}" text-anchor="end">{t}</text>' for t in ticks_y)
    axis += '<text x="0" y="7">GOALS</text>'
    axis += ''.join(f'<text x="{x}" y="{y0 + 11:.1f}" text-anchor="middle">{l}</text>' for x, l in ((30.0, '0'), (171.8, '1,000'), (313.6, '2,000'), (455.4, '3,000')))
    axis += f'<text x="525" y="{y0 + 22:.1f}" text-anchor="end">LEAGUE MINUTES</text>'
    lines = ' '.join(f'M{q["ax"]:.1f} {q["ay"]:.1f} L{q["x"]:.1f} {q["y"]:.1f}' for q in moved)
    circles = ''
    for q in pts:
        sw = 1.3 if q['r'] > 3 else 0.9
        circles += f'<circle cx="{q["x"]:.1f}" cy="{q["y"]:.1f}" r="{q["r"]:.1f}" fill="{pal["right"]}" fill-opacity="0.85" stroke="{POS_COL[q["pos"]]}" stroke-width="{sw}"></circle>'
    dots = ' '.join(f'M{q["ax"] - 1.1:.1f} {q["ay"]:.1f} a1.1 1.1 0 1 0 2.2 0 a1.1 1.1 0 1 0 -2.2 0' for q in moved)
    # labels: try above, right, left, below; never over a circle or a label
    placed = []
    labels = ''
    want = ed['labels']
    def hits(x0, y0_, x1, y1):
        for q in pts:
            if x0 - q['r'] < q['x'] < x1 + q['r'] and y0_ - q['r'] < q['y'] < y1 + q['r']:
                return True
        for b in placed:
            if x0 < b[2] and x1 > b[0] and y0_ < b[3] and y1 > b[1]:
                return True
        return False
    for name in want:
        q = next((z for z in pts if z['label'] == name), None)
        if not q:
            raise ValueError('no bubble for label ' + name)
        w = text_w(name)
        r = q['r']
        cands = [('middle', q['x'], q['y'] - r - 3.5), ('start', q['x'] + r + 3, q['y'] + 3), ('end', q['x'] - r - 3, q['y'] + 3), ('middle', q['x'], q['y'] + r + 8.5),
                 ('middle', q['x'], q['y'] - r - 11), ('start', q['x'] + r + 3, q['y'] - 4), ('end', q['x'] - r - 3, q['y'] - 4)]
        ch = None
        for anc, tx, ty in cands:
            x0 = tx - w / 2 if anc == 'middle' else tx if anc == 'start' else tx - w
            x1 = x0 + w
            if x1 > 525 or x0 < 26 or ty < 8 or ty > y0 + 8:
                continue
            if not hits(x0, ty - 7, x1, ty + 1):
                ch = (anc, tx, ty, x0, x1)
                break
        if ch is None:
            anc, tx, ty = cands[0]
            x0 = tx - w / 2
            ch = (anc, tx, ty, x0, x0 + w)
        anc, tx, ty, x0, x1 = ch
        placed.append((x0, ty - 7, x1, ty + 1))
        labels += f'<text x="{tx:.1f}" y="{ty:.1f}" text-anchor="{anc}" font-family="Archivo, Helvetica, Arial, sans-serif" font-size="7.5" font-weight="700" fill="#FFFFFF">{esc(name)}</text>'
    bt = top + 20
    leg = ''.join(f'<span style="display: flex; gap: 5px; align-items: center"><span style="width: 7px; height: 7px; border-radius: 50%; box-sizing: border-box; border: 1.5px solid {c}"></span>{n}</span>' for n, c in (('Forward', '#E7B94C'), ('Midfield', '#EF7594'), ('Defence', '#75BCE9'), ('Goalkeeper', '#FFFFFF')))
    return (f'<div style="position: absolute; left: 625px; top: {top}px; display: flex; align-items: center; gap: 6px; font-size: 10px; line-height: 12px; font-weight: 700; color: {{{{highlight}}}}">{PEOPLE_ICON}<span>{ed["people_title"]}</span></div>'
            f'<svg width="525" height="{h}" sc-camel-view-box="0 0 525 {h}" role="img" aria-label="{esc(p["name"])} players: league minutes against league goals, sized by league games" style="position: absolute; left: 625px; top: {bt}px; overflow: visible">'
            f'<path d="{grid.strip()}" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="0.5"></path>'
            f'<g font-family="Archivo, Helvetica, Arial, sans-serif" font-size="7" fill="#FFFFFF" fill-opacity="0.85">{axis}</g>'
            f'<path d="{lines}" stroke="rgba(255,255,255,0.5)" stroke-width="0.5" fill="none"></path>{circles}<path d="{dots}" fill="#FFFFFF"></path>{labels}</svg>'
            f'<div style="position: absolute; left: 625px; top: 570px; width: 525px; display: flex; gap: 16px; align-items: center; font-size: 7px; line-height: 9px">{leg}<span style="opacity: 0.8">Area = league games · dots mark exact values where circles were moved apart</span></div>')


# ---- window + radar -------------------------------------------------------
def win_row(r):
    posc = POS_COL[r['pos']]
    tk = token(r['token'], 10, r['code'])
    tk = tk.replace(f': {r["token"]["family"]}, {r["token"]["pattern"]}"', f': {r["token"]["family"]}"') if r['token'] else tk
    return (f'<div style="display: grid; grid-template-columns: 7px minmax(0, 1fr) 14px 10px 20px 38px; column-gap: 4px; align-items: center; height: 12px; border-bottom: 0.4px solid rgba(255,255,255,0.16); font-size: 7.5px; line-height: 9px">'
            f'<span style="font-size: 6px; font-weight: 800; color: {{{{highlight}}}}">{"J" if r.get("jan") else ""}</span>'
            f'<span style="font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{esc(r["name"])}</span>'
            f'<span style="font-size: 6.5px; font-weight: 800; color: {posc}">{r["pos"]}</span>{tk}'
            f'<span style="font-size: 7px; font-weight: 800; letter-spacing: 0.04em; font-stretch: 75%">{r["code"]}</span>'
            f'<span style="text-align: right; white-space: nowrap; font-weight: 700">{r["fee"]}</span></div>')


def win_head(label, total, pad):
    return (f'<div style="display: flex; justify-content: space-between; align-items: baseline; padding: {pad}px 0 3px; border-bottom: 0.6px solid {{{{highlight}}}}; font-size: 7px; line-height: 9px; font-weight: 700; letter-spacing: 0.06em"><span style="color: {{{{highlight}}}}">{label}</span><span>{total}</span></div>')


def window(p):
    w = p['window']
    body = win_head('IN', w['in_total'], 0) + ''.join(win_row(r) for r in w['in'])
    body += win_head('OUT', w['out_total'], 8) + ''.join(win_row(r) for r in w['out'])
    return (f'<div style="position: absolute; left: 625px; top: 593px; display: flex; align-items: center; gap: 6px; font-size: 10px; line-height: 12px; font-weight: 700; color: {{{{highlight}}}}"><svg width="16" height="16" sc-camel-view-box="0 0 16 16" aria-hidden="true"><g fill="none" stroke="{{{{highlight}}}}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 5 H13.5 M10.5 2 L13.5 5 L10.5 8"></path><path d="M14.5 11 H2.5 M5.5 8 L2.5 11 L5.5 14"></path></g></svg><span>THE WINDOW / IN AND OUT</span></div>'
            f'<div style="position: absolute; left: 625px; top: 613px; width: 250px; display: flex; flex-direction: column; font-variant-numeric: tabular-nums">{body}<div style="padding-top: 4px; font-size: 6.5px; line-height: 8px; opacity: 0.85">{w["note"]}</div></div>')


AXES = [('gpg', 'GOALS / GAME'), ('win', 'WIN RATE'), ('away', 'AWAY PTS / GAME'), ('cpg', 'CONCEDED / GAME'), ('cs', 'CLEAN SHEETS'), ('cards', 'CARDS / GAME')]


def rpoint(i, R):
    a = math.radians(60 * i)
    return 127.5 + R * math.sin(a), 69.5 - R * math.cos(a)


def rval(rad, k, v):
    m = rad[k]
    t = (v - m['min']) / (m['max'] - m['min'])
    if k in ('cpg', 'cards'):
        t = 1 - t
    return 5 + t * 36.5


def radar(p):
    rv = p['radar']
    rad = p['radar_range']
    rings = ' '.join(' '.join(('M' if i == 0 else 'L') + f'{rpoint(i, R)[0]:.1f} {rpoint(i, R)[1]:.1f}' for i in range(6)) + ' Z' for R in (5, 17.2, 29.3, 41.5))
    spokes = ' '.join(f'M127.5 69.5 L{rpoint(i, 41.5)[0]:.1f} {rpoint(i, 41.5)[1]:.1f}' for i in range(6))
    avg = ' '.join(f'{rpoint(i, rval(rad, k, rad[k]["avg"]))[0]:.1f},{rpoint(i, rval(rad, k, rad[k]["avg"]))[1]:.1f}' for i, (k, _) in enumerate(AXES))
    team = [rpoint(i, rval(rad, k, rv[k]['v'])) for i, (k, _) in enumerate(AXES)]
    poly = ' '.join(f'{x:.1f},{y:.1f}' for x, y in team)
    dots = ' '.join(f'M{x - 2:.1f} {y:.1f} a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0' for x, y in team)
    def fv(k):
        v = rv[k]['v']
        return f'{v * 100:.0f}%' if k == 'win' else f'{int(v)}' if k == 'cs' else f'{v:.2f}'
    aria = '; '.join(f'{l.lower()} {fv(k)}, {ord_(rv[k]["rank"])}' for k, l in AXES)
    pos = [(972.5, 629, 'center', 'center'), (1065.4, 662.8, 'flex-start', 'left'), (1065.4, 712.2, 'flex-start', 'left'), (972.5, 744, 'center', 'center'), (879.6, 712.2, 'flex-end', 'right'), (879.6, 662.8, 'flex-end', 'right')]
    labels = ''
    for (k, l), (x, y, al, ta) in zip(AXES, pos):
        labels += (f'<div style="position: absolute; left: {x}px; top: {y}px; width: 100px; display: flex; flex-direction: column; gap: 1px; align-items: {al}; text-align: {ta}; white-space: nowrap"><span style="font-size: 6.5px; line-height: 8px; font-weight: 700; letter-spacing: 0.04em">{l}</span>'
                   f'<span style="font-size: 8.5px; line-height: 10px; font-weight: 800; color: {{{{highlight}}}}; font-variant-numeric: tabular-nums">{fv(k)}<span style="font-size: 7px; font-weight: 500; color: #FFFFFF"> · {ord_(rv[k]["rank"])}</span></span></div>')
    return (f'<div style="position: absolute; left: 895px; top: 593px; display: flex; align-items: center; gap: 6px; font-size: 10px; line-height: 12px; font-weight: 700; color: {{{{highlight}}}}"><svg width="16" height="16" sc-camel-view-box="0 0 16 16" aria-hidden="true"><g fill="none" stroke="{{{{highlight}}}}" stroke-width="1.1" stroke-linejoin="round"><path d="M8 1.5 L13.6 4.75 V11.25 L8 14.5 L2.4 11.25 V4.75 Z"></path><path d="M8 4.5 L11.5 7 L10 11 L5.5 10.5 L5 6.5 Z"></path></g></svg><span>THE TEAM / AGAINST THE PREMIER LEAGUE</span></div>'
            f'<div style="position: absolute; left: 895px; top: 610px; width: 255px; font-size: 9px; line-height: 11px">Centre = league’s worst · edge = league’s best</div>'
            f'<svg width="255" height="139" sc-camel-view-box="0 0 255 139" role="img" aria-label="{esc(p["name"])} against the league: {aria}" style="position: absolute; left: 895px; top: 627px; overflow: visible">'
            f'<path d="{rings}" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.5"></path><path d="{spokes}" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.5"></path>'
            f'<polygon points="{avg}" fill="none" stroke="#FFFFFF" stroke-opacity="0.75" stroke-width="0.8" stroke-dasharray="2 2"></polygon>'
            f'<polygon points="{poly}" fill="{{{{ hlSoft }}}}" stroke="{{{{highlight}}}}" stroke-width="1.5" stroke-linejoin="round"></polygon>'
            f'<path d="{dots}" fill="{{{{highlight}}}}"></path></svg>{labels}'
            f'<div style="position: absolute; left: 895px; top: 768px; width: 255px; display: flex; gap: 14px; align-items: center; font-size: 7px; line-height: 9px"><span style="display: flex; gap: 5px; align-items: center"><span style="width: 10px; height: 7px; background: {{{{ hlSoft }}}}; border: 1px solid {{{{highlight}}}}; box-sizing: border-box"></span>{esc(p["short"])}</span><span style="display: flex; gap: 5px; align-items: center"><span style="width: 12px; height: 0; border-top: 0.8px dashed #FFFFFF"></span>League average</span><span style="opacity: 0.8">League games · rank of 20</span></div>')


# ---- page -----------------------------------------------------------------
LEG_ROW = '<span style="display: flex; gap: 5px; align-items: center"><span style="{}"></span>{}</span>'


def spread(p, ed, pal, head_block, sources):
    kicker = f'{p["kicker"]} / 2003-04'
    l, r = ed['headline']
    title = f'{l} {r}'.strip().upper() if r else l.upper()
    a = p['all']; lg = p['league']
    euro = any(m['comp'] in ('UCL', 'UC') for m in p['matches'])
    stat = f'<span>{esc(ed["stat"])}</span>'
    if ed.get('stat_small'):
        stat += f'<span style="font-size: 22px; line-height: 24px; font-weight: 800; align-self: flex-end; padding-bottom: 4px; opacity: 0.9">{esc(ed["stat_small"])}</span>'
    leg = [LEG_ROW.format('width: 5.5px; height: 5.5px; border-radius: 50%; background: {{highlight}}', 'W'),
           LEG_ROW.format(f'width: 5.5px; height: 5.5px; border-radius: 50%; background: {pal["draw"]}', 'D'),
           LEG_ROW.format('width: 5.5px; height: 5.5px; border-radius: 50%; background: {{accent}}', 'L'),
           '<span style="width: 4px"></span>',
           LEG_ROW.format('width: 5.5px; height: 5.5px; background: #FFFFFF', 'League')]
    if euro:
        leg.append(LEG_ROW.format('width: 5.5px; height: 5.5px; border-radius: 50%; background: #FFFFFF', 'Europe'))
    leg.append(LEG_ROW.format('width: 4.6px; height: 4.6px; transform: rotate(45deg); background: #FFFFFF', 'Cups'))
    mom, bad = moments(p, ed)
    cups, note_y = cup_runs(p, pal)
    # a note that wraps to two lines adds nine points
    side_top = note_y + 24
    people_top = side_top + 136
    t = p['token']
    body = f'''<div style="width: 1587px; height: 1123px; overflow: hidden; background: {{{{right}}}}">
<!-- Authored in points: 1190 × 842 pt canvas, zoomed to 96 dpi. Generated from the {esc(p["key"])} data pack; spec v1.2 -->
<div style="zoom: 1.33361; position: relative; width: 1190px; height: 842px; overflow: hidden; color: #FFFFFF; font-family: Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif">

  <div style="position: absolute; left: 0; top: 0; width: 595px; height: 842px; background: {{{{left}}}}"></div>
  <div style="position: absolute; left: 595px; top: 0; width: 595px; height: 842px; background: {{{{right}}}}"></div>

  <!-- ============ LEFT PAGE ============ -->
  <div style="position: absolute; left: 40px; top: 32px; font-size: 10px; line-height: 12px; font-weight: 700; letter-spacing: 0.02em; color: {{{{highlight}}}}">{esc(kicker)}</div>
  <h1 style="position: absolute; left: 38px; top: 76px; width: 430px; margin: 0; font-size: {ed.get("h1", 55)}px; line-height: {ed.get("h1", 55) + 1}px; font-weight: 800; letter-spacing: -0.01em; text-transform: uppercase; color: #FFFFFF">{esc(l)}{"<br>" + esc(r) if r else ""}</h1>
  {identity(p, pal, pal["left"])}

  <!-- Story stat -->
  <div style="position: absolute; left: 40px; top: 222px; width: 200px; display: flex; flex-direction: column; gap: 6px">
    <div style="display: flex; align-items: center; gap: 14px; font-size: {ed.get("stat_size", 53)}px; line-height: 53px; font-weight: 800; color: {{{{highlight}}}}; font-variant-numeric: tabular-nums; white-space: nowrap">{stat}</div>
    <div style="font-size: 7.5px; line-height: 9px; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase">{esc(ed["stat_label"])}</div>
  </div>
  <p style="position: absolute; left: 40px; top: 300px; width: 212px; margin: 0; font-size: 11px; line-height: 15px; text-wrap: pretty">{re.sub(r"(\d+–\d+)", r'<span style="white-space: nowrap">\1</span>', esc(ed["story"]))}</p>

  <!-- Climb -->
{climb(p, ed, pal)}

  <div style="position: absolute; left: 40px; top: 392px; width: 515px; height: 0.6px; background: #FFFFFF; opacity: 0.45"></div>

  <!-- Calendar -->
  <div style="position: absolute; left: 40px; top: 412px; display: flex; align-items: center; gap: 6px; font-size: 10px; line-height: 12px; font-weight: 700; color: {{{{highlight}}}}">
    <svg width="16" height="16" sc-camel-view-box="0 0 16 16" aria-hidden="true"><g fill="none" stroke="{{{{highlight}}}}" stroke-width="1.1" stroke-linecap="round"><rect x="1.5" y="3" width="13" height="11.5" rx="1.5"></rect><path d="M1.5 6.5 H14.5 M5 1.5 V4.5 M11 1.5 V4.5"></path><path d="M5 9.5 h0.01 M8 9.5 h0.01 M11 9.5 h0.01 M5 12 h0.01 M8 12 h0.01"></path></g></svg>
    <span>SEASON / ALL {a["n"]} COMPETITIVE GAMES</span>
  </div>
  <div style="position: absolute; left: 40px; top: 442px; width: 515px; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); row-gap: 22px; column-gap: 12px">
{calendar(p, pal)}
  </div>
  <div style="position: absolute; left: 225px; top: 414px; width: 330px; display: flex; justify-content: flex-end; gap: 9px; align-items: center; font-size: 7.5px; line-height: 10px">
    {"".join(leg)}
  </div>

{mom}

  <!-- Season record -->
  <div style="position: absolute; left: 40px; top: 680px; display: flex; align-items: center; gap: 6px; font-size: 10px; line-height: 12px; font-weight: 700; color: {{{{highlight}}}}">
    <svg width="16" height="16" sc-camel-view-box="0 0 16 16" aria-hidden="true"><path d="M5 2 H11 V6 A3 3 0 0 1 5 6 Z M5 3.5 H2.5 A2.5 2.5 0 0 0 5 6.5 M11 3.5 H13.5 A2.5 2.5 0 0 1 11 6.5 M8 9 V12 M5.5 14 H10.5 M6.5 12 H9.5" fill="none" stroke="{{{{highlight}}}}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"></path></svg>
    <span>SEASON RECORD / 2003-04</span>
  </div>
  <div style="position: absolute; left: 40px; top: 702px; width: 515px; display: grid; grid-template-columns: 1fr 1fr 1.4fr 1.3fr; gap: 10px">
    <div style="display: flex; flex-direction: column; gap: 3px"><span style="font-size: 25px; line-height: 26px; font-weight: 800">{ord_(lg["pos"])}</span><span style="font-size: 7.5px; line-height: 9px">PREMIER LEAGUE</span></div>
    <div style="display: flex; flex-direction: column; gap: 3px"><span style="font-size: 25px; line-height: 26px; font-weight: 800; font-variant-numeric: tabular-nums">{lg["pts"]}</span><span style="font-size: 7.5px; line-height: 9px">LEAGUE PTS</span></div>
    <div style="display: flex; flex-direction: column; gap: 3px"><span style="font-size: 25px; line-height: 26px; font-weight: 800; font-variant-numeric: tabular-nums">{a["GF"]}:{a["GA"]}</span><span style="font-size: 7.5px; line-height: 9px">ALL COMPETITIONS GF:GA</span></div>
    <div style="display: flex; flex-direction: column; gap: 3px"><span style="font-size: 25px; line-height: 26px; font-weight: 800; font-variant-numeric: tabular-nums">{a["W"]}-{a["D"]}-{a["L"]}</span><span style="font-size: 7.5px; line-height: 9px">ALL COMPETITIONS W-D-L</span></div>
  </div>

  <div style="position: absolute; left: 40px; top: 777px; font-size: 6.5px; line-height: 8px; color: #FFFFFF; opacity: 0.75">Club mark: kit-derived token ({p["code"]} · {t["family"]} · {t["pattern"]}), not the official crest · League and competition marks: flag tiles and abstract glyphs</div>
  <div style="position: absolute; left: 40px; top: 790px; width: 515px; height: 0.6px; background: #FFFFFF; opacity: 0.45"></div>
  <div style="position: absolute; left: 40px; top: 800px; font-size: 8.5px; line-height: 10px; letter-spacing: 0.03em; color: #FFFFFF; opacity: 0.85">{esc(kicker)} &nbsp;•&nbsp; A / {esc(title)}</div>

  <!-- ============ RIGHT PAGE ============ -->
  <!-- Cup runs -->
{cups}

  <!-- The side -->
{side(p, ed, pal, side_top)}

  <!-- The people: league minutes x goals -->
{people(p, ed, pal, people_top)}

  <!-- The window (compact) beside the team radar -->
{window(p)}{radar(p)}

  <div style="position: absolute; left: 625px; top: 790px; width: 525px; height: 0.6px; background: #FFFFFF; opacity: 0.45"></div>
  <div style="position: absolute; left: 625px; top: 798px; width: 525px; font-size: 6.5px; line-height: 9px; opacity: 0.8">{sources}</div>
</div>
</div>
'''
    return body, bad
