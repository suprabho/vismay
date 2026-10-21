"""Layer 6c — each club's home kit in a season, for the club marks (Club Mark Generator spec): pattern, c1, c2.

  python3 -I scripts/kits.py fetch --season 2003   Wikipedia: the club's season article, else its club article
                                                   (today's kit) → raw/kits/_pages/; the kit body pattern images
                                                   → raw/kits/patterns/ (all cached, reruns are offline)
  python3 -I scripts/kits.py build --season 2003   classify each kit → data/kits.csv (season's rows replaced)

Which kit: the home kit (suffix 1) in the infobox's {{Football kit}} parameters — body1 is the shirt colour and
pattern_b1 names a 38×59 overlay image ("Kit body_fcbarcelona0304h.png"). The overlay is composited on body1 and
the shirt is matched against the spec's six patterns (solid, stripes, hoops, halves, sleeves, band); c1 and c2 are
the two main colours. A sash reads as a band and quarters as halves. Kit colours never come from the crest.

A plain shirt still gets a second colour: sleeves in another colour make the pattern `sleeves` (c2 = the sleeves,
Arsenal); otherwise c2 is the shorts colour (it can become the mark's ring, when it is dark enough).

c1/c2 roles: c1 is the shirt, c2 the second colour. Stripes and hoops — c1 is the more common colour; halves — c1 is
the left half; band (and sash) — c2 is the band; quarters, read as halves — c1 is the top-left quarter.

needs_review flags: pattern fit under 0.8, no kit at all, an unreadable pattern image. Only today's kit found (no
season article) is noted in review_note but not flagged. Wikipedia kit
colours are approximate (often pure #FF0000 / #0000FF), so the admin review queue is where they get corrected.
Hand fixes: data/kits_overrides.csv (season, wiki, pattern, c1, c2, note); a row always wins on rerun, blanks
included (a blank c2 means none).
"""
import json, math, os, re, struct, sys, time, urllib.error, urllib.parse, zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I drops the script dir
from players import DATA, ROOT, read_csv, write_csv, season_label
from cups import dash, get

RAW = os.path.join(ROOT, 'raw', 'kits')
PAGES = os.path.join(RAW, '_pages')
PATTERNS = os.path.join(RAW, 'patterns')
OUT = os.path.join(DATA, 'kits.csv')
OVERRIDES = os.path.join(DATA, 'kits_overrides.csv')
HEADER = ['season', 'wiki', 'name', 'pattern', 'c1', 'c2', 'confidence', 'source', 'page', 'body1', 'pattern_file',
          'sleeves', 'shorts', 'needs_review', 'review_note']
PATTERN_NAMES = ['solid', 'stripes', 'hoops', 'halves', 'sleeves', 'band']
# Shirt templates the classifier still fits, folded into the six: a diagonal sash is a band, quarters are halves.
FOLD = {'sash': 'band', 'quarters': 'halves', 'chestband': 'band'}

def clubs(start):
    """(wiki, name) of every club in the season's crests (top flights + cup opponents)."""
    rows = [r for r in read_csv(os.path.join(DATA, 'crests.csv')) if r['season'] == season_label(start)]
    if not rows: sys.exit(f'No {season_label(start)} clubs in data/crests.csv — run crests.py build --season {start} first')
    return [(r['wiki'], r['name']) for r in rows]

# ---------------------------------------------------------------- fetch

def page_file(title):
    return os.path.join(PAGES, re.sub(r'[^\w.()\-–]+', '_', title)[:180] + '.json')

def fetch_pages(titles, lang='en'):
    """Wikitext of many pages, 50 per request (Wikipedia throttles shared IPs); a missing page is cached as null."""
    todo = [t for t in dict.fromkeys(titles) if not os.path.exists(page_file(f'{lang}:{t}'))]
    os.makedirs(PAGES, exist_ok=True)
    for i in range(0, len(todo), 50):
        batch = todo[i:i + 50]
        body = json.loads(get(f'https://{lang}.wikipedia.org/w/api.php?' + urllib.parse.urlencode(dict(
            action='query', prop='revisions', rvprop='content', rvslots='main', titles='|'.join(batch),
            redirects=1, format='json', formatversion=2))))
        q = body.get('query', {})
        alias = {n['from']: n['to'] for n in q.get('normalized', [])}
        alias.update({r['from']: r['to'] for r in q.get('redirects', [])})
        found = {p['title']: p['revisions'][0]['slots']['main']['content'] for p in q.get('pages', []) if p.get('revisions')}
        for t in batch:
            target = alias.get(alias.get(t, t), alias.get(t, t))
            text = found.get(target)
            json.dump({'title': target, 'wikitext': text} if text else None, open(page_file(f'{lang}:{t}'), 'w'), ensure_ascii=False)
        print(f'  pages {min(i + 50, len(todo))}/{len(todo)} ({lang})', file=sys.stderr)
        time.sleep(3)

def load(title, lang='en'):
    p = page_file(f'{lang}:{title}')
    return json.load(open(p)) if os.path.exists(p) else None

def article_titles(wiki):
    """[(lang, title)] for a crests.csv club id: 'Arsenal F.C.', 'fr:US Créteil', 'name:fr:…' (no article)."""
    if wiki.startswith('name:'): return None
    m = re.match(r'^([a-z]{2}):(.+)$', wiki)
    return (m.group(1), m.group(2)) if m else ('en', wiki)

def home_kit(wikitext):
    """body1, pattern_b1, leftarm1 and shorts1 from the first infobox kit, or None."""
    if not wikitext: return None
    params = {}
    for m in re.finditer(r'\|\s*(body1|pattern_b1|leftarm1|shorts1)\s*=\s*([^|\n}]*)', wikitext):
        params.setdefault(m.group(1), re.sub(r'<!--.*?-->', '', m.group(2)).strip())
    colour = lambda k: (m.group(0).upper() if (m := re.search(r'[0-9A-Fa-f]{6}', params.get(k, ''))) else '')
    if not colour('body1') and not params.get('pattern_b1'): return None
    return {'body1': colour('body1'), 'pattern': params.get('pattern_b1', '').strip(), 'sleeves': colour('leftarm1'), 'shorts': colour('shorts1')}

def pattern_path(pattern):
    return os.path.join(PATTERNS, re.sub(r'[^\w.\-]+', '_', pattern) + '.png')

def fetch_pattern(pattern):
    """Kit body<pattern>.png from Wikipedia (local or Commons); a 404 is cached as an empty file."""
    path = pattern_path(pattern)
    if os.path.exists(path): return
    os.makedirs(PATTERNS, exist_ok=True)
    url = 'https://en.wikipedia.org/wiki/Special:FilePath/' + urllib.parse.quote(f'Kit_body{pattern}.png'.replace(' ', '_'))
    try: data = get(url)
    except urllib.error.HTTPError as e:
        if e.code != 404: raise
        data = b''
    open(path, 'wb').write(data)
    time.sleep(1)

def fetch(start):
    cl = clubs(start)
    by_lang = {}
    for wiki, _ in cl:
        t = article_titles(wiki)
        if not t: continue
        lang, title = t
        if lang == 'en': by_lang.setdefault('en', []).append(f'{dash(start)} {title} season')
        by_lang.setdefault(lang, []).append(title)
    for lang, titles in by_lang.items(): fetch_pages(titles, lang)
    patterns = set()
    for wiki, _ in cl:
        for kit in kits_for(wiki, start):
            if kit and kit[0]['pattern']: patterns.add(kit[0]['pattern'])
    for i, p in enumerate(sorted(patterns)):
        fetch_pattern(p)
        if i % 20 == 19: print(f'  patterns {i + 1}/{len(patterns)}', file=sys.stderr)
    print(f'{len(cl)} clubs, {len(patterns)} kit patterns cached under raw/kits/')

def kits_for(wiki, start):
    """[(kit, source, page)]: the season article's kit, then the club article's (today's)."""
    t = article_titles(wiki)
    if not t: return []
    lang, title = t
    out = []
    if lang == 'en':
        p = load(f'{dash(start)} {title} season')
        if p and (k := home_kit(p['wikitext'])): out.append((k, 'season', p['title']))
    p = load(title, lang)
    if p and (k := home_kit(p['wikitext'])): out.append((k, 'club', (f'{lang}:' if lang != 'en' else '') + p['title']))
    return out

# ---------------------------------------------------------------- PNG (stdlib only: scripts run with -I)

def read_png(data):
    """→ (width, height, [(r, g, b, a)] row-major). 8-bit and palette PNGs, non-interlaced (Wikipedia kit images)."""
    if data[:8] != b'\x89PNG\r\n\x1a\n': raise ValueError('not a PNG')
    i, idat, plte, trns = 8, b'', None, None
    while i < len(data):
        n, kind = struct.unpack('>I4s', data[i:i + 8]); chunk = data[i + 8:i + 8 + n]; i += 12 + n
        if kind == b'IHDR': w, h, depth, ctype, _, _, interlace = struct.unpack('>IIBBBBB', chunk)
        elif kind == b'PLTE': plte = [tuple(chunk[j:j + 3]) for j in range(0, len(chunk), 3)]
        elif kind == b'tRNS': trns = chunk
        elif kind == b'IDAT': idat += chunk
    if interlace: raise ValueError('interlaced PNG')
    chans = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
    bpp = max(1, chans * depth // 8)
    stride = (w * chans * depth + 7) // 8
    raw, out, prev = zlib.decompress(idat), [], bytearray(stride)
    for y in range(h):
        f, line = raw[y * (stride + 1)], bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for x in range(stride):
            a = line[x - bpp] if x >= bpp else 0; b = prev[x]; c = prev[x - bpp] if x >= bpp else 0
            if f == 1: line[x] = (line[x] + a) & 255
            elif f == 2: line[x] = (line[x] + b) & 255
            elif f == 3: line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        prev = line
        if depth < 8:
            per = 8 // depth
            vals = [(line[x // per] >> (8 - depth * (x % per + 1))) & ((1 << depth) - 1) for x in range(w)]
        elif depth == 16: vals = list(line[::2])
        else: vals = list(line)
        for x in range(w):
            if ctype == 3:
                k = vals[x]; r, g, b = plte[k]; al = trns[k] if trns and k < len(trns) else 255
                out.append((r, g, b, al))
            elif ctype == 0:
                v = vals[x] * (255 // ((1 << depth) - 1)) if depth < 8 else vals[x]; out.append((v, v, v, 255))
            elif ctype == 4: out.append((vals[2 * x], vals[2 * x], vals[2 * x], vals[2 * x + 1]))
            elif ctype == 2: out.append((*vals[3 * x:3 * x + 3], 255))
            else: out.append(tuple(vals[4 * x:4 * x + 4]))
    return w, h, out

# ---------------------------------------------------------------- classify

def lab(rgb):
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = map(lin, rgb)
    x, y, z = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, 0.2126 * r + 0.7152 * g + 0.0722 * b, (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    return 116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))

def hexof(rgb): return '#' + ''.join(f'{round(v):02X}' for v in rgb)

def shirt(body1, pattern):
    """The home shirt as (w, h, [rgb]): the pattern overlay composited on body1 (opaque overlays replace it)."""
    base = tuple(int(body1[i:i + 2], 16) for i in (0, 2, 4)) if body1 else (255, 255, 255)
    data = open(pattern_path(pattern), 'rb').read() if pattern else b''
    if not data: return 38, 59, [base] * (38 * 59)
    w, h, px = read_png(data)
    return w, h, [tuple(round(p[k] * p[3] / 255 + base[k] * (1 - p[3] / 255)) for k in range(3)) for p in px]

def classify(w, h, px):
    """→ (pattern, c1, c2, confidence). Torso only (no collar, no hem); colours grouped within ΔE 18; logos ignored."""
    x0, x1, y0, y1 = int(w * 0.12), int(w * 0.88), int(h * 0.22), int(h * 0.95)
    pts = [(x, y, px[y * w + x]) for y in range(y0, y1) for x in range(x0, x1)]
    groups = []  # [lab, rgb sums, count]
    for _, _, c in pts:
        L = lab(c)
        for g in groups:
            if math.dist(g[0], L) < 18:
                g[2] += 1; g[1] = [s + v for s, v in zip(g[1], c)]; break
        else: groups.append([L, list(c), 1])
    groups.sort(key=lambda g: -g[2])
    mean = lambda g: tuple(v / g[2] for v in g[1])
    total = len(pts)
    a = groups[0]
    b = groups[1] if len(groups) > 1 and groups[1][2] / total >= 0.12 else None
    if not b: return 'solid', hexof(mean(a)), '', round(a[2] / total, 2)
    la, lb = lab(mean(a)), lab(mean(b))
    cells = []  # (u, v, is_b) for pixels close to either colour
    for x, y, c in pts:
        L = lab(c); da, db = math.dist(L, la), math.dist(L, lb)
        if min(da, db) < 30: cells.append(((x - x0 + 0.5) / (x1 - x0), (y - y0 + 0.5) / (y1 - y0), db < da))
    def fit(label):
        hit = sum(label(u, v) == isb for u, v, isb in cells)
        return max(hit, len(cells) - hit) / len(cells), hit >= len(cells) - hit
    cands = []
    for n in range(3, 13):
        for ph in (0, 0.25, 0.5, 0.75):
            cands.append(('stripes', fit(lambda u, v: int(u * n + ph) % 2 == 1), 0.004 * n))
            cands.append(('hoops', fit(lambda u, v: int(v * n + ph) % 2 == 1), 0.004 * n))
    for t in (0.4, 0.45, 0.5, 0.55, 0.6): cands.append(('halves', fit(lambda u, v: u >= t), 0))
    for bw in (0.16, 0.24, 0.32, 0.4, 0.48, 0.56, 0.64, 0.72, 0.8):
        cands.append(('band', fit(lambda u, v: abs(u - 0.5) < bw / 2), 0))
        cands.append(('sash', fit(lambda u, v: abs((u + v) / 2 - 0.5) < bw / 2), 0))
        cands.append(('sash', fit(lambda u, v: abs((u + 1 - v) / 2 - 0.5) < bw / 2), 0))
    cands.append(('quarters', fit(lambda u, v: (u >= 0.5) != (v >= 0.5)), 0.01))
    name, (score, b_is_true), _ = max(cands, key=lambda c: c[1][0] - c[2])
    solid_score = a[2] / total
    if score < solid_score + 0.08: return 'solid', hexof(mean(a)), '', round(solid_score, 2)
    ca, cb = hexof(mean(a)), hexof(mean(b))
    # Role of c1 per pattern: the template's "true" region is the band / right half / top-right quarter.
    true_c, false_c = (cb, ca) if b_is_true else (ca, cb)
    if name in ('band', 'sash', 'halves', 'quarters'): c1, c2 = false_c, true_c
    else: c1, c2 = ca, cb
    return FOLD.get(name, name), c1, c2, round(score, 2)

def distinct(a, b):
    """Two kit colours (hex) far enough apart to read as two (sRGB distance)."""
    if not a or not b: return False
    ra, rb = (tuple(int(h.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4)) for h in (a, b))
    return math.dist(ra, rb) > 80

def build(start):
    overrides = {(r['season'], r['wiki']): r for r in read_csv(OVERRIDES)} if os.path.exists(OVERRIDES) else {}
    rows = []
    for wiki, name in clubs(start):
        season = season_label(start)
        notes, source, page, body1, pfile = [], 'none', '', '', ''
        pattern = c1 = c2 = sleeves = shorts = ''; conf = 0.0
        kits = kits_for(wiki, start)
        if kits:
            kit, source, page = kits[0]
            body1, pfile = kit['body1'], kit['pattern']
            sleeves, shorts = (f'#{kit[k]}' if kit.get(k) else '' for k in ('sleeves', 'shorts'))
            if pfile and not os.path.exists(pattern_path(pfile)): notes.append('pattern image not fetched (run fetch)')
            try: pattern, c1, c2, conf = classify(*shirt(body1, pfile if pfile and os.path.exists(pattern_path(pfile)) else ''))
            except ValueError as e: notes.append(f'pattern image unreadable: {e}')
            if pattern == 'solid':
                if distinct(sleeves, c1): pattern, c2 = 'sleeves', sleeves
                elif distinct(shorts, c1): c2 = shorts
            if source == 'club': notes.append("today's kit (no season article)")
            if conf < 0.8: notes.append(f'pattern fit {conf}')
        else:
            notes.append('no kit on Wikipedia')
        if (o := overrides.get((season, wiki))):
            pattern, c1, c2, conf, source = FOLD.get(o['pattern'], o['pattern']) or pattern, o['c1'] or c1, o['c2'], 1.0, 'override'
            notes = [o['note']] if o.get('note') else []
        if pattern and pattern not in PATTERN_NAMES: notes.append(f'unknown pattern {pattern}')
        # Today's kit is a note, not a flag: traditional home kits rarely change pattern; the review queue shows it.
        flagged = source != 'override' and any(not n.startswith("today's kit") for n in notes)
        rows.append([season, wiki, name, pattern, c1, c2, conf, source, page, body1, pfile, sleeves, shorts,
                     'yes' if flagged else '', '; '.join(notes)])
    keep = [r for r in read_csv(OUT) if r['season'] != season_label(start)] if os.path.exists(OUT) else []
    write_csv(OUT, HEADER, [[r[h] for h in HEADER] for r in keep] + rows)
    by = lambda k: sum(1 for r in rows if r[7] == k)
    print(f'{len(rows)} clubs → data/kits.csv: season kit {by("season")}, today\'s kit {by("club")}, override {by("override")}, '
          f'none {by("none")}; flagged {sum(1 for r in rows if r[13])}; sleeves {sum(1 for r in rows if r[3] == "sleeves")}; '
          f'solid {sum(1 for r in rows if r[3] == "solid")}')

if __name__ == '__main__':
    if len(sys.argv) < 4 or sys.argv[1] not in ('fetch', 'build') or sys.argv[2] != '--season':
        sys.exit(__doc__)
    {'fetch': fetch, 'build': build}[sys.argv[1]](int(sys.argv[3]))
