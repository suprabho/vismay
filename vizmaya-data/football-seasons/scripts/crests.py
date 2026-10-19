"""Layer 6b — the crest each club in data/cup_clubs.csv wore in a given season (top flight + cup opponents).

  python3 -I scripts/crests.py resolve  --season 2003   Wikidata (ids, local names, dated logos) + Logopedia logo
                                                        timelines → raw/crests/_meta/ (cached)
  python3 -I scripts/crests.py build    --season 2003   pick the crest valid in the season → data/crests.csv (season's rows replaced)
  python3 -I scripts/crests.py download --season 2003   files → raw/crests/<season>/<slug>.<svg|png> + <slug>.thumb.png (256 px)
  python3 -I scripts/crests.py review   --season 2003   → review/crests-<season>.html, a contact sheet for the hand check

Which crest: a logo whose dated range covers the season (starts by its first year, runs at least into its second).
  1. Logopedia (logos.fandom.com) — each club page's {{ImageTOC}} timeline ("1989–2004", "2004–present"), else its
     dated section headings. The page is found by exact title (Wikipedia title, English/local names), else search.
  2. Wikidata logo image (P154) with start/end qualifiers covering the season.
  3. Otherwise the current crest (Logopedia's latest, else Wikidata's undated P154, else TheSportsDB's badge),
     era "current" — never silently passed off as period-correct.
needs_review flags: crest changed in the season's first or second year (the range alone can't tell which side of
the season it fell), several logos fit, page found by search rather than exact title, or no period crest.
Hand fixes: data/crests_overrides.csv (season, wiki, logopedia_file, era_label, note); a row always wins on rerun.

Logopedia images are user uploads of trademarked crests (non-free); fine for research, clear rights before print.
"""
import hashlib, json, os, re, sys, time, unicodedata, urllib.parse, html
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I drops the script dir
from players import DATA, ROOT, read_csv, write_csv, season_label
from cups import get, template_calls, name_key

RAW = os.path.join(ROOT, 'raw', 'crests')
META = os.path.join(RAW, '_meta')
LOGOS_API = 'https://logos.fandom.com/api.php'
FOOTBALL_CAT = re.compile(r'football|soccer|calcio|fútbol|futbol|fußball', re.I)

def cached(name, fn):
    """JSON cache under raw/crests/_meta/ — every network answer is kept, so reruns are offline."""
    path = os.path.join(META, re.sub(r'[^\w.()\-–]+', '_', name)[:180] + '.json')
    if os.path.exists(path): return json.load(open(path))
    val = fn()
    os.makedirs(META, exist_ok=True)
    json.dump(val, open(path, 'w'), ensure_ascii=False)
    return val

def logos_api(**params):
    params.update(format='json', formatversion=2)
    time.sleep(0.5)
    return json.loads(get(f'{LOGOS_API}?' + urllib.parse.urlencode(params)))

# ---------------------------------------------------------------- Wikidata

SPARQL = 'https://query.wikidata.org/sparql'

def wikidata(titles):
    """enwiki title → {qid, labels {lang: label}, country, logos [(file, start_year, end_year, rank)]}, 100 per query."""
    out = {}
    for i in range(0, len(titles), 100):
        batch = titles[i:i + 100]
        def run():
            values = ' '.join(json.dumps(t, ensure_ascii=False) + '@en' for t in batch)
            q = f'''SELECT ?title ?item ?lang ?label ?countryLabel ?logo ?start ?end ?rank WHERE {{
  VALUES ?title {{ {values} }}
  ?article schema:name ?title; schema:isPartOf <https://en.wikipedia.org/>; schema:about ?item .
  OPTIONAL {{ ?item rdfs:label ?label . BIND(LANG(?label) AS ?lang) FILTER(?lang IN ("en","fr","de","it","es","pt","nl")) }}
  OPTIONAL {{ ?item wdt:P17 ?country . ?country rdfs:label ?countryLabel FILTER(LANG(?countryLabel) = "en") }}
  OPTIONAL {{ ?item p:P154 ?st . ?st ps:P154 ?logo; wikibase:rank ?rank .
             OPTIONAL {{ ?st pq:P580 ?start }} OPTIONAL {{ ?st pq:P582 ?end }} }}
}}'''
            data = json.loads(get(SPARQL + '?' + urllib.parse.urlencode({'query': q, 'format': 'json'})))
            time.sleep(1)
            return data['results']['bindings']
        for b in cached(f'wikidata_{hashlib.md5("|".join(batch).encode()).hexdigest()}', run):
            v = lambda k: b.get(k, {}).get('value', '')
            e = out.setdefault(v('title'), dict(qid=v('item').rsplit('/', 1)[-1], labels={}, country='', logos=[]))
            if v('lang'): e['labels'][v('lang')] = v('label')
            if v('countryLabel'): e['country'] = v('countryLabel')
            if v('logo'):
                logo = (urllib.parse.unquote(v('logo').rsplit('/', 1)[-1]), (v('start') or '')[:4], (v('end') or '')[:4], v('rank').rsplit('#', 1)[-1])
                if logo not in [tuple(x) for x in e['logos']]: e['logos'].append(logo)
    return out

def commons_url(file, width=None):
    name = file.replace(' ', '_')
    h = hashlib.md5(name.encode()).hexdigest()
    q = urllib.parse.quote(name)
    if width:
        thumb = f'{width}px-{q}' + ('.png' if name.lower().endswith('.svg') else '')
        return f'https://upload.wikimedia.org/wikipedia/commons/thumb/{h[0]}/{h[:2]}/{q}/{thumb}'
    return f'https://upload.wikimedia.org/wikipedia/commons/{h[0]}/{h[:2]}/{q}'

SPORTSDB = 'https://www.thesportsdb.com/api/v1/json/123/searchteams.php'
# Wikidata's English country label → TheSportsDB's spelling where they differ
COUNTRY_ALIAS = {'United Kingdom': {'England', 'Scotland', 'Wales', 'Northern Ireland'}, 'Czech Republic': {'Czechia'},
                 'North Macedonia': {'Macedonia', 'North Macedonia'}, 'Republic of Ireland': {'Ireland'}, 'Turkey': {'Türkiye'},
                 'Moldova': {'Moldova', 'Republic of Moldova'}}

def sportsdb_crest(wiki, name, country):
    """Last resort: TheSportsDB's badge (today's crest) for clubs Logopedia and Wikidata don't have.
    Soccer, men's, same country, and a name that reduces to the same key as ours. → (team, url, thumb) or None."""
    keys = {name_key(t) for t in title_candidates(wiki.removeprefix('name:').split(':')[-1], name, {})} - {''}
    for q in list(dict.fromkeys([name, title_candidates(wiki.split(':')[-1], '', {})[-1]])):
        teams = cached(f'tsdb_{q}', lambda: (time.sleep(2.1), json.loads(get(f'{SPORTSDB}?' + urllib.parse.urlencode({'t': q}))))[1].get('teams') or [])
        for t in teams:
            if t.get('strSport') != 'Soccer' or t.get('strGender') not in (None, '', 'Male') or not t.get('strBadge'): continue
            if country and t.get('strCountry') not in COUNTRY_ALIAS.get(country, {country}) | {country}: continue
            names = [t['strTeam']] + [x.strip() for x in (t.get('strTeamAlternate') or '').split(',')]
            if any(name_key(n) in keys for n in names if n):
                return t['strTeam'], t['strBadge'], t['strBadge'] + '/small'
    return None

# ---------------------------------------------------------------- Logopedia

def title_candidates(wiki, name, labels):
    """Logopedia page names to try, best first: it titles clubs by common name ("Arsenal FC", "Leeds United", "Juventus FC")."""
    base = [wiki, name, labels.get('en', '')] + [labels.get(l, '') for l in ('fr', 'de', 'it', 'es', 'pt', 'nl')]
    base += [re.sub(r'\s+II$', '', wiki)] if re.search(r'\s+II$', wiki) else []  # reserve sides wear the first team's crest
    out = []
    for t in base:
        t = re.sub(r'\s*\(.*?\)\s*$', '', t or '').strip()
        if not t: continue
        dotted = re.sub(r'\b([A-Z])\.(?=[A-Z]?\.?)', r'\1', t).replace('..', '.').rstrip('.')  # "A.F.C." → "AFC"
        bare = re.sub(r'\s+(A?FC|CF|F\.?C\.?|A\.F\.C\.|SC|AC|SV|BV)$', '', dotted)
        out += [t, dotted, bare, re.sub(r'^(FC|AC|AS|SS|SSC|US|RC|CD|UD|SD|SV|VfL|VfB|SC|AJ|OGC|SM|1\. FC)\s+', '', bare)]
    return list(dict.fromkeys(x for x in out if x))

def page_info(titles):
    """Logopedia pages among titles → {asked title: (page title, categories)} for pages that exist."""
    found = {}
    for i in range(0, len(titles), 40):
        batch = titles[i:i + 40]
        q = cached('lp_titles_' + hashlib.md5('|'.join(batch).encode()).hexdigest(),
                   lambda: logos_api(action='query', titles='|'.join(batch), redirects=1, prop='categories', cllimit='max')['query'])
        hop = {n['from']: n['to'] for n in q.get('normalized', []) + q.get('redirects', [])}
        pages = {p['title']: p for p in q.get('pages', []) if not p.get('missing') and not p.get('invalid')}
        for t in batch:
            n = t
            for _ in range(3): n = hop.get(n, n)
            if n in pages: found[t] = (n, [c['title'] for c in pages[n].get('categories', [])])
    return found

def find_page(wiki, name, labels, exact):
    for t in title_candidates(wiki, name, labels):
        if t in exact and any(FOOTBALL_CAT.search(c) for c in exact[t][1]): return exact[t][0], 'exact'
    # Search: accept a football page whose title reduces to the same key as one of our names.
    # Search: a football page whose title reduces to one of our names' keys, else one whose title contains
    # the club's short name as whole words ("Siena" → "SS Robur Siena"), reserve sides excluded.
    keys = {name_key(t) for t in title_candidates(wiki, name, labels)} - {''}
    res = cached(f'lp_search_{wiki}', lambda: logos_api(action='query', list='search', srsearch=name or wiki, srlimit=8)['query']['search'])
    bare = title_candidates(wiki, '', {})[-1] if not wiki.startswith('name:') else ''
    if bare and bare != name:  # the club's full name finds pages its short name drowns in ("Aris" → cities, banks)
        res = res + cached(f'lp_search2_{wiki}', lambda: logos_api(action='query', list='search', srsearch=bare, srlimit=8)['query']['search'])
    short = name_key(name or wiki)
    hits = [r['title'] for r in res if name_key(r['title']) in keys] or \
           [r['title'] for r in res if short and re.search(rf'(^| ){re.escape(short)}( |$)', name_key(r['title']))
            and not re.search(r'\b(B|II|III|U\d\d|Women|Femenino|Femminile|Féminin|Frauen|Ladies)\b', r['title'], re.I)]
    if hits:
        info = page_info(hits)
        for h in hits:
            if h in info and any(FOOTBALL_CAT.search(c) for c in info[h][1]): return info[h][0], 'search'
    return '', ''

def years(label):
    """'1989–2004' → (1989, 2004); '2004–present' → (2004, None); '1990s–2004' → (1990, 2004); '?–1995' → (None, 1995)."""
    label = plain_label(label)
    parts = re.split(r'\s*[–—‒−~\-]\s*|\s+to\s+', label, maxsplit=1)
    def y(s, edge):
        """A year; a partial one ("195?", "19??") counts as the earliest (start) or latest (end) it could be."""
        m = re.search(r'(1[89]|20)([\d?])([\d?])', s or '')
        if not m: return None
        return int(''.join(m.groups()).replace('?', '0' if edge == 'start' else '9'))
    if len(parts) == 1:
        return y(parts[0], 'start'), y(parts[0], 'end')
    return y(parts[0], 'start'), y(parts[1], 'end')

def plain_label(s):
    s = re.sub(r'<[^>]+>|\{\{[^{}]*\}\}|\'\'+', '', s)
    return re.sub(r'\[\[(?:[^|\]]+\|)?([^\]]+)\]\]', r'\1', s).strip()

def timeline(page):
    """Logo timelines of a Logopedia page → [(file, label, start, end)] in page order."""
    wt = cached(f'lp_page_{page}', lambda: logos_api(action='parse', page=page, prop='wikitext', redirects=1).get('parse', {}).get('wikitext', ''))
    out = []
    for _, _, p in template_calls(wt, ['ImageTOC']):  # pages split primary / shirt / secondary crests over several
        vals = [p[str(i)] for i in range(1, len(p) + 1) if str(i) in p]
        for f, lab in zip(vals[0::2], vals[1::2]):
            f = re.sub(r'^(File|Image):', '', f.strip(), flags=re.I)
            if f: out.append((f, plain_label(lab), *years(lab)))
    if not out:  # no ImageTOC: "==1989–2004==" headings, first image under each
        for m in re.finditer(r'^(=+)\s*([^=\n]*\d{4}[^=\n]*)\s*\1\s*$\n(.*?)(?=^=|\Z)', wt, re.M | re.S):
            img = re.search(r'\[\[(?:File|Image):([^|\]]+)', m.group(3), re.I)
            if img: out.append((img.group(1).strip(), plain_label(m.group(2)), *years(m.group(2))))
    if not out:  # stub page: one undated logo — treated as the current crest
        img = re.search(r'\[\[(?:File|Image):([^|\]]+)', wt, re.I)
        if img: out.append((img.group(1).strip(), 'undated', None, None))
    return out

def file_info(files):
    """Logopedia file names → {name: {url, thumb, mime}}."""
    out = {}
    for i in range(0, len(files), 40):
        batch = files[i:i + 40]
        q = cached('lp_files_' + hashlib.md5('|'.join(batch).encode()).hexdigest(),
                   lambda: logos_api(action='query', titles='|'.join('File:' + f for f in batch), prop='imageinfo',
                                     iiprop='url|mime', iiurlwidth=256)['query'])
        back = {n['to']: n['from'] for n in q.get('normalized', [])}
        for p in q.get('pages', []):
            ii = (p.get('imageinfo') or [{}])[0]
            if ii.get('url'):
                asked = back.get(p['title'], p['title'])
                out[asked.split(':', 1)[1]] = dict(url=ii['url'], thumb=ii.get('thumburl', ''), mime=ii.get('mime', ''))
    return out

# ---------------------------------------------------------------- pick

def covers(start_year, s, e):
    return (s is None or s <= start_year) and (e is None or e >= start_year + 1)

def pick(start, items):
    """items [(file, label, s, e)] → (chosen, era, notes)."""
    # "1983–1995, 2017–present": each range on its own (same file)
    spans = [(x[0], x[1], *years(part)) for x in items for part in re.split(r'\s*[,;&/]\s*|\s+and\s+', x[1])
             if re.search(r'\d', part)] + [x for x in items if not re.search(r'\d', x[1])]
    fits = [x for x in spans if covers(start, x[2], x[3]) and not (x[2] is None and x[3] is None)]
    fits = list({x[0]: x for x in sorted(fits, key=lambda x: x[2] or 0)}.values())
    notes = []
    if fits:
        best = max(fits, key=lambda x: (x[2] or 0))
        if len(fits) > 1: notes.append(f'{len(fits)} logos fit ({", ".join(x[1] for x in fits)})')
        if best[2] == start: notes.append(f'adopted in {start}: before or after the season started?')
        if best[3] == start + 1: notes.append(f'replaced in {start + 1}: before or after the season ended?')
        return best, 'season', notes
    if items:
        dated = [x for x in items if x[2] is not None]
        if dated and min(x[2] for x in dated) > start + 1: notes.append(f'timeline starts {min(x[2] for x in dated)}')
        live = [x for x in spans if x[3] is None and x[2] is not None]  # "…–present"
        return (max(live, key=lambda x: x[2]) if live else items[-1]), 'current', notes
    return None, '', notes

def slugify(s):
    s = unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', re.sub(r'\s*\(.*?\)', '', s)).strip('-')

def clubs_for(s):
    rows = [r for r in read_csv(os.path.join(DATA, 'cup_clubs.csv')) if r['season'] == s]
    if not rows: sys.exit(f'no {s} clubs in data/cup_clubs.csv — run cups.py build first')
    return rows

def resolve(start):
    s = season_label(start)
    clubs = clubs_for(s)
    wd = wikidata([c['wiki'] for c in clubs])
    cands = sorted({t for c in clubs for t in title_candidates(c['wiki'], c['name'], wd.get(c['wiki'], {}).get('labels', {}))})
    exact = page_info(cands)
    n = 0
    for c in clubs:
        page, how = find_page(c['wiki'], c['name'], wd.get(c['wiki'], {}).get('labels', {}), exact)
        if page: timeline(page); n += 1
        w = wd.get(c['wiki'], {})
        if not page and not w.get('logos'): sportsdb_crest(c['wiki'], c['name'], w.get('country', ''))
    print(f'{len(clubs)} clubs: {sum(1 for c in clubs if c["wiki"] in wd)} on Wikidata, {n} Logopedia pages')

def build(start):
    s = season_label(start)
    clubs = clubs_for(s)
    wd = wikidata([c['wiki'] for c in clubs])
    cands = sorted({t for c in clubs for t in title_candidates(c['wiki'], c['name'], wd.get(c['wiki'], {}).get('labels', {}))})
    exact = page_info(cands)
    over_path = os.path.join(DATA, 'crests_overrides.csv')
    if not os.path.exists(over_path): write_csv(over_path, ['season', 'wiki', 'logopedia_file', 'era_label', 'note'], [])
    overrides = {r['wiki']: r for r in read_csv(over_path) if r['season'] == s}

    picks = []
    for c in clubs:
        w = wd.get(c['wiki'], {})
        page, how = find_page(c['wiki'], c['name'], w.get('labels', {}), exact)
        items = timeline(page) if page else []
        chosen, era, notes = pick(start, items)
        source = 'logopedia' if chosen else ''
        if how == 'search': notes.append(f'Logopedia page found by search: "{page}"')
        if re.search(r'\s+II$', c['wiki']) and page: notes.append("reserve side: the first team's crest")
        if era != 'season':  # Wikidata dated logos, then its current one
            wlogos = [(f, f'{a or "?"}–{b or "present"}', int(a) if a else None, int(b) if b else None) for f, a, b, _ in w.get('logos', [])]
            dated = [x for x in wlogos if x[2] or x[3]]
            wpick, wera, wnotes = pick(start, dated)
            if wera == 'season': chosen, era, source, notes = wpick, 'season', 'wikidata', wnotes + notes
            elif not chosen and wlogos:
                preferred = [x for x, (_, _, _, r) in zip(wlogos, w['logos']) if r == 'PreferredRank'] or wlogos
                chosen, era, source = preferred[0], 'current', 'wikidata'
        sdb = None
        if not chosen and (sdb := sportsdb_crest(c['wiki'], c['name'], w.get('country', ''))):
            chosen, era, source = (sdb[0], 'today', None, None), 'current', 'thesportsdb'
            notes.append(f'TheSportsDB badge of "{sdb[0]}"')
        o = overrides.get(c['wiki'])
        if o and o['logopedia_file']:
            chosen, era, source = (o['logopedia_file'], o['era_label'], *years(o['era_label'])), 'season', 'logopedia'
            notes = [f'override: {o["note"]}'] if o['note'] else ['override']
        if not page: notes.append('no Logopedia page')
        if era == 'current': notes.append('current crest — no dated one found for the season')
        if not chosen: notes.append('no crest found')
        picks.append(dict(c=c, w=w, page=page, chosen=chosen, era=era, source=source, notes=notes, sdb=sdb,
                          override=bool(o and o['logopedia_file'])))

    infos = file_info(sorted({p['chosen'][0] for p in picks if p['chosen'] and p['source'] == 'logopedia'}))
    rows = []
    for p in picks:
        c, ch = p['c'], p['chosen']
        url = thumb = ''
        if ch and p['source'] == 'logopedia':
            i = infos.get(ch[0].replace('_', ' ')) or infos.get(ch[0]) or {}
            url = i.get('url', '')
            # Fandom omits thumburl when the file is narrower than asked; its scaler still returns a PNG
            thumb = url.replace('/revision/latest', '/revision/latest/scale-to-width-down/256', 1) if url else ''
            if not url: p['notes'].append(f'Logopedia file missing: {ch[0]}')
        elif ch and p['source'] == 'thesportsdb':
            url, thumb = p['sdb'][1:]
        elif ch:
            url, thumb = commons_url(ch[0]), commons_url(ch[0], 256)
        slug = c['canonical_id'] or slugify(c['wiki'])
        review = bool(p['notes']) and not (p['override'])
        rows.append(dict(season=s, wiki=c['wiki'], name=c['name'], canonical_id=c['canonical_id'], slug=slug, top_flight=c['top_flight'],
                         competitions=c['competitions'], country=p['w'].get('country', ''), qid=p['w'].get('qid', ''),
                         source=p['source'] if url else '', era=p['era'] if url else '', era_label=ch[1] if ch and url else '',
                         file=ch[0] if ch and url else '', file_url=url, thumb_url=thumb,
                         logopedia_page=p['page'], needs_review='yes' if review or not url else '', review_note='; '.join(dict.fromkeys(p['notes']))))
    path = os.path.join(DATA, 'crests.csv')
    old = [r for r in read_csv(path) if r['season'] != s] if os.path.exists(path) else []
    header = list(rows[0])
    write_csv(path, header, [[r[h] for h in header] for r in old + rows])
    count = lambda f: sum(1 for r in rows if f(r))
    print(f'{s}: {len(rows)} clubs — {count(lambda r: r["era"] == "season")} season crests '
          f'({count(lambda r: r["era"] == "season" and r["source"] == "logopedia")} Logopedia, '
          f'{count(lambda r: r["era"] == "season" and r["source"] == "wikidata")} Wikidata), '
          f'{count(lambda r: r["era"] == "current")} current only, {count(lambda r: not r["file_url"])} none; '
          f'{count(lambda r: r["needs_review"])} flagged for review → {path}')

def crest_rows(s):
    return [r for r in read_csv(os.path.join(DATA, 'crests.csv')) if r['season'] == s]

def download(start):
    s = season_label(start)
    out = os.path.join(RAW, s); os.makedirs(out, exist_ok=True)
    manifest_path = os.path.join(out, '_manifest.json')  # path → url it came from, so a changed pick re-downloads
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}
    got, wanted = 0, set()
    for r in crest_rows(s):
        if not r['file_url']: continue
        ext = os.path.splitext(r['file'])[1].lower() if re.search(r'\.(svg|png|gif|jpe?g)$', r['file'], re.I) else '.png'
        for url, name in ((r['file_url'], r['slug'] + ext), (r['thumb_url'], r['slug'] + '.thumb.png')):
            if not url: continue
            wanted.add(name)
            path = os.path.join(out, name)
            if os.path.exists(path) and manifest.get(name) == url: continue
            open(path, 'wb').write(get(url)); manifest[name] = url; got += 1
            json.dump(manifest, open(manifest_path, 'w'), indent=0)
            time.sleep(0.3)
    for name in set(os.listdir(out)) - wanted - {'_manifest.json'}:  # crests no longer picked
        os.remove(os.path.join(out, name)); manifest.pop(name, None)
    json.dump(manifest, open(manifest_path, 'w'), indent=0)
    print(f'{got} files downloaded, {len(wanted)} in {out}')

def review(start):
    """Contact sheet: every crest at thumbnail size, top flight by league, then opponents; flags inline."""
    s = season_label(start)
    rows = crest_rows(s)
    def img(r):  # remote thumbnails keep the sheet small enough to commit; open it online
        if not r['thumb_url']: return '<div class="none">no crest</div>'
        return f'<img alt="" loading="lazy" referrerpolicy="no-referrer" src="{html.escape(r["thumb_url"])}">'
    groups = defaultdict(list)
    for r in rows: groups[r['top_flight'] or 'Cup opponents'].append(r)
    order = ['Premier League', 'LaLiga', 'Serie A', 'Bundesliga', 'Ligue 1', 'Cup opponents']
    cards = []
    for g in order:
        if g not in groups: continue
        items = sorted(groups[g], key=lambda r: (r['country'], r['name']))
        cells = ''.join(
            f'<figure class="{"flag" if r["needs_review"] else ""} {r["era"] or "missing"}">{img(r)}<figcaption>'
            f'<b>{html.escape(r["name"])}</b><span>{html.escape(r["era_label"] or "—")} · {html.escape(r["source"] or "none")}</span>'
            + (f'<span class="c">{html.escape(r["country"])} · {html.escape(r["competitions"])}</span>' if g == 'Cup opponents' else '')
            + (f'<em>{html.escape(r["review_note"])}</em>' if r['review_note'] else '')
            + f'<a href="https://en.wikipedia.org/wiki/{urllib.parse.quote(r["wiki"].replace(" ", "_"))}">wiki</a>'
            + (f' · <a href="https://logos.fandom.com/wiki/{urllib.parse.quote(r["logopedia_page"].replace(" ", "_"))}">logopedia</a>' if r['logopedia_page'] else '')
            + '</figcaption></figure>' for r in items)
        cards.append(f'<section><h2>{html.escape(g)} <small>{len(items)}</small></h2><div class="grid">{cells}</div></section>')
    n = lambda f: sum(1 for r in rows if f(r))
    page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{s} Crests Review</title>
<style>
:root {{ --paper:#f6f7f3; --sheet:#fff; --ink:#1b2420; --muted:#5d6a63; --rule:#dde3dc; --flag:#a15c07; --flag-soft:#fdf1df; --cur:#b42318; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --paper:#121715; --sheet:#19201d; --ink:#e6ece8; --muted:#9aa8a0; --rule:#2a332f; --flag:#e3a656; --flag-soft:#35270f; --cur:#f08a7d; color-scheme:dark; }} }}
:root[data-theme="dark"] {{ --paper:#121715; --sheet:#19201d; --ink:#e6ece8; --muted:#9aa8a0; --rule:#2a332f; --flag:#e3a656; --flag-soft:#35270f; --cur:#f08a7d; color-scheme:dark; }}
* {{ box-sizing:border-box }} body {{ margin:0; background:var(--paper); color:var(--ink); font:14px/1.4 system-ui,sans-serif; padding:24px 16px 64px }}
header {{ max-width:1200px; margin:0 auto 16px }} h1 {{ margin:0 0 4px; font-size:24px }} header p {{ margin:0; color:var(--muted) }}
label {{ display:inline-flex; gap:6px; align-items:center; margin-top:10px; color:var(--muted) }}
section {{ max-width:1200px; margin:24px auto 0 }} h2 {{ font-size:16px; border-bottom:1px solid var(--rule); padding-bottom:6px }} h2 small {{ color:var(--muted); font-weight:400 }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:10px }}
figure {{ margin:0; background:var(--sheet); border:1px solid var(--rule); border-radius:8px; padding:10px; display:flex; flex-direction:column; align-items:center; gap:6px }}
figure.flag {{ border-color:var(--flag); background:var(--flag-soft) }}
img, .none {{ width:96px; height:96px; object-fit:contain }} .none {{ display:grid; place-items:center; color:var(--cur); font-size:12px; border:1px dashed var(--cur); border-radius:6px }}
figcaption {{ display:flex; flex-direction:column; align-items:center; text-align:center; gap:2px; font-size:12px }}
figcaption span {{ color:var(--muted) }} figcaption em {{ color:var(--flag); font-style:normal; font-size:11px }} figure.current figcaption span:first-of-type {{ color:var(--cur) }}
a {{ color:inherit; font-size:11px }}
body.only-flagged figure:not(.flag) {{ display:none }}
</style></head><body>
<header><h1>{s} crests — top flights and their cup opponents</h1>
<p>{len(rows)} clubs · {n(lambda r: r["era"] == "season")} crests dated to the season · {n(lambda r: r["era"] == "current")} current only (red) ·
{n(lambda r: not r["file_url"])} missing · {n(lambda r: r["needs_review"])} flagged (amber). Fix in data/crests_overrides.csv.</p>
<label><input type="checkbox" onchange="document.body.classList.toggle('only-flagged', this.checked)"> Flagged only</label></header>
{"".join(cards)}
</body></html>'''
    path = os.path.join(ROOT, 'review', f'crests-{s}.html')
    open(path, 'w').write(page)
    print(f'wrote {path} ({len(page) // 1024} KB)')

if __name__ == '__main__':
    args = sys.argv[1:]
    cmd = args[0] if args else ''
    start = int(args[args.index('--season') + 1]) if '--season' in args else None
    fns = {'resolve': resolve, 'build': build, 'download': download, 'review': review}
    if cmd not in fns or start is None: sys.exit(__doc__)
    fns[cmd](start)
