"""Layer 6 — cup ties of the Big-5 top flights for one season (domestic + European cups).

Every tie a club from that season's Premier League, LaLiga, Serie A, Bundesliga or Ligue 1 played, in:
  domestic  FA Cup, League Cup, Copa del Rey, Coppa Italia, DFB-Pokal, DFB-Ligapokal, Coupe de France, Coupe de la Ligue
  European  Champions League (qualifying included), UEFA Cup (qualifying included), Intertoto Cup
Source: the English Wikipedia season pages (+ the sub-pages their {{main}} links point to). Clubs are
identified by their Wikipedia article (redirects resolved), which is also what crests.py looks crests up by.

  python3 -I scripts/cups.py fetch --season 2003   league + cup pages → raw/wikipedia/ (cached)
  python3 -I scripts/cups.py build --season 2003   → data/cup_matches.csv, data/cup_clubs.csv (this season's rows replaced)

cup_matches.csv: season, competition, round, date, home, away (club names as the page shows them), home_wiki,
away_wiki, score (as written: "2–1", "1–1 (4–3 p)", "2–1 (a.e.t.)"; two-legged ties add "(agg x–y)"; both from the home side), top5_side
(home | away | both), source (match = a match box or results table; bracket = only the bracket lists it, so home/away
follow the bracket's slots and the date is blank), source_page.
cup_clubs.csv: season, wiki (article title), name, canonical_id (teams.csv, blank if the crosswalk doesn't know the
club), top_flight (league, if the club played in one of the five), competitions, ties.

Wikipedia rate-limits shared IPs hard (HTTP 429); requests wait out Retry-After and everything is cached, so a
rerun picks up where the last one stopped.
"""
import csv, json, os, re, sys, time, unicodedata, urllib.error, urllib.parse, urllib.request
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I drops the script dir
from players import WIKI, DATA, read_csv, write_csv, season_label, wiki_title, split_top, tables_in, parse_table, plain

UA = {'User-Agent': 'vizmaya-football-seasons/1.0 (hello@promad.design)'}
TOP5 = ['Premier League', 'LaLiga', 'Serie A', 'Bundesliga', 'Ligue 1']

def dash(start): return f'{start}–{str(start + 1)[2:]}'

def cup_pages(start):
    """[(competition, page title)] — the season's main page per cup; sub-pages are found through {{main}} links."""
    s, y = dash(start), start
    return [('FA Cup', f'{s} FA Cup'), ('League Cup', f'{s} Football League Cup'), ('Copa del Rey', f'{s} Copa del Rey'),
            ('Coppa Italia', f'{s} Coppa Italia'), ('DFB-Pokal', f'{s} DFB-Pokal'), ('DFB-Ligapokal', f'{y} DFB-Ligapokal'),
            ('Coupe de France', f'{s} Coupe de France'), ('Coupe de la Ligue', f'{s} Coupe de la Ligue'),
            # English pages start at the quarter-finals / round of 16; Ligue 1 clubs entered earlier.
            ('Coupe de France', f'fr:Coupe de France de football {y}-{y + 1}'),
            ('Coupe de la Ligue', f'fr:Coupe de la Ligue française de football {y}-{y + 1}'),
            ('Champions League', f'{s} UEFA Champions League'), ('UEFA Cup', f'{s} UEFA Cup'),
            ('Intertoto Cup', f'{y} UEFA Intertoto Cup')]

# ---------------------------------------------------------------- polite fetching

def get(url, tries=10):
    """GET with Wikimedia's Retry-After honoured on 429/503 (shared IPs get throttled)."""
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r: return r.read()
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or i == tries - 1: raise
            wait = int(e.headers.get('Retry-After') or 0) or min(300, 15 * 2 ** i)
            print(f'  {e.code}, waiting {wait}s …', file=sys.stderr); time.sleep(wait + 1)
        except (urllib.error.URLError, TimeoutError) as e:
            if i == tries - 1: raise
            print(f'  {e}, retrying …', file=sys.stderr); time.sleep(10 * (i + 1))

def lang_of(title):
    """'fr:Coupe de France…' → ('fr', 'Coupe de France…'); plain titles are English."""
    m = re.match(r'^([a-z]{2}):(.+)$', title)
    return (m.group(1), m.group(2)) if m else ('en', title)

def wiki_api(lang='en', **params):
    params.update(format='json', formatversion=2)
    return json.loads(get(f'https://{lang}.wikipedia.org/w/api.php?' + urllib.parse.urlencode(params)))

def page_path(title):
    lang, t = lang_of(title)
    return os.path.join(WIKI, ('' if lang == 'en' else f'{lang}.') + f'{t.replace("/", "∕")}.json')

def load_page(title):
    p = page_path(title)
    return json.load(open(p)) if os.path.exists(p) else None

def fetch_page(title):
    """Cached wikitext of a page (redirects followed); None if Wikipedia has no such page."""
    if (cached := load_page(title)) is not None: return cached
    lang, t = lang_of(title)
    body = wiki_api(lang, action='parse', page=t, prop='wikitext', redirects=1)
    time.sleep(2)
    if 'parse' not in body:
        print(f'  not on Wikipedia: {title}', file=sys.stderr); return None
    json.dump(body['parse'], open(page_path(title), 'w'))
    return body['parse']

def main_links(wikitext, competition_page):
    """Sub-pages of this cup-season: {{main|…}} / {{see also|…}} targets that start with the page's own title."""
    out = []
    for m in re.finditer(r'\{\{\s*(?:main|main article|further|see also)\s*\|([^{}]+)\}\}', wikitext, re.I):
        for t in m.group(1).split('|'):
            t = t.strip()
            if '=' in t or '#' in t or t == competition_page: continue
            # "2003–04 UEFA Cup first round"; finals live on their own pages ("2004 Coppa Italia final")
            final = re.fullmatch(r'(\d{4}) (.+?) [Ff]inals?', t)
            if t.startswith(competition_page) or (final and final.group(2) in competition_page
                                                  and competition_page[:4] <= final.group(1) <= str(int(competition_page[:4]) + 1)):
                out.append(t)
    return list(dict.fromkeys(out))

def season_titles(start):
    """[(competition, title)] — league pages first, then every cup page and sub-page, read from cache."""
    out = [(c, wiki_title(c, start)) for c in TOP5]
    for comp, title in cup_pages(start):
        queue = [title]
        while queue:
            t = queue.pop(0)
            if (comp, t) in out: continue
            out.append((comp, t))
            page = load_page(t)
            if page: queue += main_links(page['wikitext'], title)
    return out

def fetch(start):
    os.makedirs(WIKI, exist_ok=True)
    got = 0
    for comp in TOP5: got += fetch_page(wiki_title(comp, start)) is not None
    for comp, title in cup_pages(start):
        queue = [title]
        seen = set()
        while queue:
            t = queue.pop(0)
            if t in seen: continue
            seen.add(t)
            page = fetch_page(t)
            if page: got += 1; queue += main_links(page['wikitext'], title)
    print(f'{got} pages in {WIKI}')

# ---------------------------------------------------------------- parsing

LINK = re.compile(r'\[\[([^|\]#]+)(?:#[^|\]]*)?(?:\|([^\]]+))?\]\]')
SCORE = re.compile(r'(\d+)\s*[–\-−]\s*(\d+)')
NOT_CLUB = re.compile(r'^(File|Image|Fichier|Category|Catégorie|w?:|wikt:)|stadium|stadion|estadio|arena|park$|ground$|'
                      r'^\d{4}|^\d{1,2}(er)? [a-zéû]+|season$|saison|national football team|football association|referee|'
                      r'^(championnat|coupe|ligue \d|tirs au but|prolongation|penalty|division)\b', re.I)

def strip_markup(s):
    s = re.sub(r'<ref[^>]*/>|<ref.*?</ref>|<!--.*?-->', '', s, flags=re.S)
    s = re.sub(r'\{\{\s*(flagicon|flag|fb|flagathlete|fbaicon|nowrap|sortname)\s*\|[^{}]*\}\}', '', s, flags=re.I)
    return s

def club_link(s):
    """First wikilink in s that looks like a club → (label, target); {{fb team …}}-style templates are rare
    on 2003-04 pages and unsupported."""
    for m in LINK.finditer(strip_markup(s)):
        target, label = m.group(1).strip(), (m.group(2) or m.group(1)).strip()
        if not NOT_CLUB.search(target): return plain(label), target[0].upper() + target[1:]
    return None

def template_calls(text, names):
    """Top-level {{name|…}} calls → [{param: value}] (positional params under '1', '2', …)."""
    out, i = [], 0
    pat = re.compile(r'\{\{\s*(' + '|'.join(names) + r')\s*[|\n}]', re.I)
    while (m := pat.search(text, i)):
        depth, j = 0, m.start()
        while j < len(text):
            if text.startswith('{{', j): depth += 1; j += 2
            elif text.startswith('}}', j):
                depth -= 1; j += 2
                if depth == 0: break
            else: j += 1
        body = text[m.start() + 2:j - 2]
        params, pos = {}, 0
        for part in split_top(body, '|')[1:]:
            k, eq, v = part.partition('=')
            if eq and re.fullmatch(r'\s*[\w \-]+\s*', k): params[k.strip().lower()] = v.strip()
            else: pos += 1; params[str(pos)] = part.strip()
        out.append((m.start(), m.group(1).lower(), params))
        i = j
    return out

def sections(wikitext):
    """[(start offset, heading path)] so each tie can carry its round ("Round of 16", "Group A")."""
    out, path = [(0, '')], []
    for m in re.finditer(r'^(=+)\s*([^=\n]+?)\s*\1\s*$', wikitext, re.M):
        level = len(m.group(1))
        path = path[:max(0, level - 2)] + [plain(m.group(2))]
        out.append((m.start(), ' › '.join(path)))
    return out

def section_at(secs, offset):
    return next((name for start, name in reversed(secs) if start <= offset), '')

def date_of(s):
    from events import parse_date
    m = re.search(r'\{\{\s*(?:start date|dts|date)\s*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})', s, re.I)
    if m: return f'{int(m.group(1)):04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}'
    return parse_date(s)

def plain_club(s):
    """A club cell without a wikilink (small clubs on French pages: "Aire-sur-la-Lys (PH Régionale)") → (name, 'name:…')."""
    t = re.sub(r'\s*\([^)]*\)', '', plain(strip_markup(s))).strip(" '*")
    if t and len(t) < 60 and not SCORE.search(t) and not re.fullmatch(r'[\W\d]*|bye|exempt|tbd|forfeit', t, re.I):
        return t, f'name:{t}'
    return None

def score_of(s):
    s = plain(strip_markup(s)).replace(' ', ' ')
    return s if SCORE.search(s) else ''

def flip(score):
    """Wikipedia writes both legs Team 1-first; the second leg's home side is Team 2."""
    return SCORE.sub(lambda m: f'{m.group(2)}–{m.group(1)}', score, count=1)

def bracket_ties(wikitext):
    """{{16TeamBracket}} / {{5RoundBracket}}-style templates: RDn-teamXX pairs (odd vs even slot) with
    RDn-scoreXX[-1|-2|-agg]. Legs are listed from the upper slot's side; byes and empty slots skipped."""
    out = []
    for off, _, p in template_calls(wikitext, [r'[\w ]*Bracket[\w ]*', r'Round\d+[\w ]*']):
        if not any(re.fullmatch(r'rd\d+-team\d+', k) for k in p): continue
        for k in p:
            m = re.fullmatch(r'rd(\d+)-team(\d+)', k)
            if not m or int(m.group(2)) % 2 == 0: continue
            rd, n = m.group(1), int(m.group(2))
            k2 = f'rd{rd}-team{n + 1:0{len(m.group(2))}d}'
            h, a = club_link(p[k]), club_link(p.get(k2, ''))
            if not (h and a): continue
            sc = lambda slot, suffix: plain(p.get(f'rd{rd}-score{slot:0{len(m.group(2))}d}{suffix}', '')).strip()
            rnd = plain(p.get(f'rd{rd}', '')) or f'Round {rd}'
            legs = [(sc(n, '-1'), sc(n + 1, '-1')), (sc(n, '-2'), sc(n + 1, '-2'))]
            if any(x and y for x, y in legs):
                agg = f'{sc(n, "-agg")}–{sc(n + 1, "-agg")}' if sc(n, '-agg') else ''
                for i, (x, y) in enumerate(legs):
                    if x and y: out.append(dict(offset=off, date='', home=h if i == 0 else a, away=a if i == 0 else h,
                                                score=f'{x}–{y}' if i == 0 else f'{y}–{x}', agg=agg if i == 0 else flip(agg),
                                                round=rnd, bracket=True))
            elif sc(n, '') or sc(n + 1, ''):
                out.append(dict(offset=off, date='', home=h, away=a, score=f'{sc(n, "")}–{sc(n + 1, "")}', round=rnd, bracket=True))
    return out

SKIP_SECTION = re.compile(r'media|coverage|broadcast|route to|road to|statistic|scorer|references|see also|external|'
                          r'prize money|participating|teams$|venues?$|format', re.I)

def ties_in(wikitext):
    """Every match on a page → dicts (offset, date, home, away, score). Three shapes cover the 2003-04 pages:
    {{footballbox}} templates, two-legged tables ("Team 1 | Agg. | Team 2 | 1st leg | 2nd leg") and plain
    result tables / lines with two club links around a score."""
    out = bracket_ties(wikitext)
    boxes = template_calls(wikitext, ['footballbox collapsible', 'footballbox', 'football box collapsible', 'football box',
                                      'footballbox_collapsible', 'football box small'])
    spans = []
    for off, _, p in boxes:
        h, a = club_link(p.get('team1') or p.get('home') or ''), club_link(p.get('team2') or p.get('away') or '')
        if h and a:
            out.append(dict(offset=off, date=date_of(p.get('date', '')), home=h, away=a, score=score_of(p.get('score', ''))))
    for off, _, p in template_calls(wikitext, ['TwoLegResult', '2legresult', 'Two leg result']):
        h, a = club_link(p.get('1', '')), club_link(p.get('3', ''))
        if h and a:
            agg = score_of(p.get('2', ''))
            for leg, (x, y), f in ((p.get('4', ''), (h, a), False), (p.get('5', ''), (a, h), True)):
                if score_of(leg): out.append(dict(offset=off, date='', home=x, away=y, score=flip(score_of(leg)) if f else score_of(leg),
                                                  agg=flip(agg) if f else agg))
    # Tables
    i = 0
    for t in tables_in(wikitext):
        off = wikitext.find(t, i); i = off + len(t)
        if 'footballbox' in t.lower(): continue
        header, rows = parse_table(t)
        cols = [plain(c).lower() for c in header]
        two_leg = any('1st leg' in c or 'first leg' in c or 'aller' in c for c in cols)
        date_col = next((k for k, c in enumerate(cols) if c.startswith('date')), None)
        # Header names the club columns ("Club", "Team 1", "Équipe"): their unlinked cells are clubs too.
        named = {k for k, c in enumerate(cols) if re.match(r'(club|team|équipe|home|away|domicile|extérieur|visiteur)', c)}
        for r in rows:
            cells = [(k, club_link(c) or (plain_club(c) if k in named and len(r) == len(cols) else None), score_of(c))
                     for k, c in enumerate(r)]
            clubs = [(k, cl) for k, cl, _ in cells if cl]
            if len(clubs) < 2: continue
            (kh, h), (ka, a) = clubs[0], clubs[1]
            between = [sc for k, _, sc in cells if kh < k < ka and sc]
            after = [sc for k, _, sc in cells if k > ka and sc]
            date = date_of(r[date_col]) if date_col is not None and date_col < len(r) else ''
            if two_leg and len(after) >= 2:
                agg = between[0] if between else ''
                out.append(dict(offset=off, date=date, home=h, away=a, score=after[0], agg=agg))
                out.append(dict(offset=off, date=date, home=a, away=h, score=flip(after[1]), agg=flip(agg)))
            elif two_leg and len(after) == 1:  # second leg not played / walkover
                out.append(dict(offset=off, date=date, home=h, away=a, score=after[0], agg=between[0] if between else ''))
            elif between or after:  # "Team 1 | Score | Team 2" or "Team #1 | Team #2 | Result"
                out.append(dict(offset=off, date=date, home=h, away=a, score=(between or after)[0]))
    # Group-stage results matrices and bullet lists ("* [[A]] 2–1 [[B]]") on old pages
    for m in re.finditer(r'^[*#:;]+(.+)$', wikitext, re.M):
        line = m.group(1)
        links = [x for x in LINK.finditer(strip_markup(line)) if not NOT_CLUB.search(x.group(1))]
        if len(links) < 2: continue
        mid = strip_markup(line)
        seg = mid[mid.find(links[0].group(0)) + len(links[0].group(0)):mid.find(links[1].group(0))]
        if SCORE.search(plain(seg)):
            out.append(dict(offset=m.start(), date=date_of(line), home=club_link(links[0].group(0)),
                            away=club_link(links[1].group(0)), score=plain(seg).strip(' :,')))
    return out

def league_clubs(wikitext):
    """Club article titles in a league-season page: the Sports table module (name_XXX=[[…]]), else the first
    table with 15+ club links (the standings or the 'Teams' table)."""
    named = re.findall(r'\|\s*name_\w+\s*=\s*(\[\[[^\]]+\]\])', wikitext)
    if len(named) >= 15: return list({c[1]: c for c in map(club_link, named) if c}.values())
    for t in tables_in(wikitext):
        _, rows = parse_table(t)
        found = [cl for r in rows for cl in [next((club_link(c) for c in r if club_link(c)), None)] if cl]
        if len(found) >= 15: return list({c[1]: c for c in found}.values())
    return []

# ---------------------------------------------------------------- redirects

def resolve_titles(titles):
    """Link target → club id: the English article title (redirects + normalisation followed), cached in
    raw/wikipedia/_redirects.json. Targets from other wikis ("fr:…") go through that wiki's redirects, then
    Wikidata to the English article; without one they stay "fr:Title". "name:…" (unlinked) stays as is."""
    path = os.path.join(WIKI, '_redirects.json')
    cache = json.load(open(path)) if os.path.exists(path) else {}
    def save(): json.dump(cache, open(path, 'w'), ensure_ascii=False, indent=0)
    todo = defaultdict(list)
    for t in sorted(set(titles)):
        if t not in cache and not t.startswith('name:'): todo[lang_of(t)[0]].append(t)
    for lang, ts in todo.items():
        for i in range(0, len(ts), 50):
            batch = ts[i:i + 50]
            q = wiki_api(lang, action='query', titles='|'.join(lang_of(t)[1] for t in batch), redirects=1)['query']
            norm = {n['from']: n['to'] for n in q.get('normalized', [])}
            redir = {r['from']: r['to'] for r in q.get('redirects', [])}
            missing = {p['title'] for p in q.get('pages', []) if p.get('missing')}
            for t in batch:
                n = norm.get(lang_of(t)[1], lang_of(t)[1]); n = redir.get(n, n)
                cache[t] = '' if n in missing else (n if lang == 'en' else f'{lang}:{n}')
            save(); time.sleep(2)
    # Foreign articles → English ones via Wikidata sitelinks.
    foreign = sorted({cache[t] for t in titles if cache.get(t) and lang_of(cache[t])[0] != 'en' and f'{cache[t]}→en' not in cache})
    for lang in {lang_of(t)[0] for t in foreign}:
        ts = [t for t in foreign if lang_of(t)[0] == lang]
        for i in range(0, len(ts), 100):
            batch = ts[i:i + 100]
            values = ' '.join(json.dumps(lang_of(t)[1], ensure_ascii=False) + f'@{lang}' for t in batch)
            q = f"""SELECT ?title ?en WHERE {{ VALUES ?title {{ {values} }}
  ?a schema:name ?title; schema:isPartOf <https://{lang}.wikipedia.org/>; schema:about ?item .
  OPTIONAL {{ ?e schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?en }} }}"""
            res = json.loads(get('https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': q, 'format': 'json'})))
            en = {b['title']['value']: b.get('en', {}).get('value', '') for b in res['results']['bindings']}
            for t in batch: cache[f'{t}→en'] = en.get(lang_of(t)[1], '')
            save(); time.sleep(1)
    def final(t):
        if t.startswith('name:'): return t
        r = cache.get(t) or t
        return cache.get(f'{r}→en') or r if lang_of(r)[0] != 'en' else r
    return {t: final(t) for t in titles}

# ---------------------------------------------------------------- build

def name_key(s):
    s = unicodedata.normalize('NFD', s.lower()).encode('ascii', 'ignore').decode()
    s = re.sub(r'\(.*?\)', ' ', s)
    toks = [t for t in re.split(r'[^a-z0-9]+', s) if t and (len(t) > 1 or t.isdigit()) and t not in
            {'fc', 'afc', 'cf', 'ac', 'sc', 'ssc', 'as', 'sl', 'cd', 'ud', 'rc', 'f', 'c', 'a', 'sv', 'vfl', 'vfb', 'us', 'sd',
             'calcio', 'club', 'football', 'de', 'futbol'}]
    return ' '.join(toks)

def crosswalk_matcher():
    """Wikipedia name/title → teams.csv canonical_id, only where one club claims the key."""
    owners = defaultdict(set)
    for t in read_csv(os.path.join(DATA, 'teams.csv')):
        for c in ('canonical_name', 'football_data_name', 'openfootball_name', 'engsoccerdata_name', 'clubelo_name', 'transfermarkt_name'):
            for n in filter(None, (x.strip() for x in t.get(c, '').split(' | '))): owners[name_key(n)].add(t['canonical_id'])
        owners[name_key(t['canonical_id'].replace('-', ' '))].add(t['canonical_id'])
    over = {r['wiki']: r['canonical_id'] for r in read_csv(os.path.join(DATA, 'cup_clubs_overrides.csv'))} \
        if os.path.exists(os.path.join(DATA, 'cup_clubs_overrides.csv')) else {}
    def match(title, *names):
        """The article title decides; a page label only helps when the title's own key starts with it
        ("Galatasaray S.K. (football)" ↔ "Galatasaray", but not "Racing Club de France" ↔ "RC Paris").
        Reserve sides (" II", "(A)") never borrow the first team's id."""
        if title in over: return '' if over[title] == '-' else over[title]
        if re.search(r'\b(II|B)$|\(A\)', title) or any(re.search(r'\(A\)|\bII$', n) for n in names): return ''
        tk = name_key(lang_of(title)[1].removeprefix('name:'))
        for k in (tk, *(name_key(n) for n in names if tk.startswith(name_key(n)))):
            ids = owners.get(k, set())
            if k and len(ids) == 1: return next(iter(ids))
        return ''
    return match

GENERIC = re.compile(r'^(results?|résultats|matches|match|match details|details|fixtures( and results)?|summary|'
                     r'déroulement de la compétition|knockout (stage|phase)|tableau final|bracket)$', re.I)

def round_name(path, page, main_page):
    """'Résultats › Seizièmes de finale' → 'Seizièmes de finale'; generic headings on a sub-page take the page's
    own round ('2003–04 UEFA Cup first round' → 'First round'); on a final's page they become 'Final'."""
    parts = [x for x in path.split(' › ') if x and not GENERIC.match(x)]
    if re.search(r'\bfinals?$', page, re.I) and not page.startswith(main_page):  # "2004 Coppa Italia final"
        return ' › '.join(['Final'] + [x for x in parts if not re.search(r'final', x, re.I)])
    if parts: return ' › '.join(parts)
    rest = page[len(main_page):].strip() if main_page and page.startswith(main_page) else ''
    return rest[:1].upper() + rest[1:] if rest else path

def build(start):
    s = season_label(start)
    titles = season_titles(start)
    pages = {t: load_page(t) for _, t in titles}
    if missing := [t for comp, t in titles if pages[t] is None and t in dict(cup_pages(start)).values()]:
        print(f'not fetched / not on Wikipedia (run fetch): {missing}', file=sys.stderr)

    league_of_raw, raw_matches = {}, []
    for comp, t in titles:
        if not pages[t]: continue
        if comp in TOP5:
            clubs = league_clubs(pages[t]['wikitext'])
            if len(clubs) < 18: print(f'{t}: only {len(clubs)} clubs found', file=sys.stderr)
            for _, target in clubs: league_of_raw[target] = comp
            continue
        secs, lang = sections(pages[t]['wikitext']), lang_of(t)[0]
        for m in ties_in(pages[t]['wikitext']):
            if lang != 'en':
                for side in ('home', 'away'):
                    label, target = m[side]
                    m[side] = (label, f'name:{lang}:{target[5:]}' if target.startswith('name:') else f'{lang}:{target}')
            rnd = m.get('round') or section_at(secs, m['offset'])
            if SKIP_SECTION.search(rnd.split(' › ')[0]): continue
            raw_matches.append(dict(m, competition=comp, page=t, round=rnd))

    resolved = resolve_titles(list(league_of_raw) + [m[side][1] for m in raw_matches for side in ('home', 'away')])
    top = {resolved[t]: c for t, c in league_of_raw.items()}
    print('top-flight clubs:', dict(Counter(top.values())), file=sys.stderr)

    # Detailed rows (footballbox, tables, lists) first; a bracket only adds ties no detailed row covers.
    digits = lambda sc: tuple(SCORE.search(sc).groups()) if SCORE.search(sc) else sc
    pair_of = lambda m: (m['competition'], frozenset((resolved[m['home'][1]], resolved[m['away'][1]])))
    detailed = {pair_of(m) for m in raw_matches if not m.get('bracket')}
    rows, seen = [], set()
    for m in sorted(raw_matches, key=lambda m: (m.get('bracket', False), m['competition'], m['page'], m['offset'])):
        h, a = resolved[m['home'][1]], resolved[m['away'][1]]
        if h == a: continue
        side = 'both' if h in top and a in top else 'home' if h in top else 'away' if a in top else ''
        if not side: continue
        if m.get('bracket') and pair_of(m) in detailed: continue
        key = (m['competition'], h, a, digits(m['score']))
        if key in seen: continue  # the same match on the main page and a sub-page, or twice on one page
        seen.add(key)
        rnd = round_name(m['round'], m['page'], dict(cup_pages(start)).get(m['competition'], ''))
        rows.append(dict(season=s, competition=m['competition'], round=rnd, date=m['date'], home=m['home'][0], away=m['away'][0],
                         home_wiki=h, away_wiki=a, score=m['score'] + (f' (agg {m["agg"]})' if m.get('agg') else ''),
                         top5_side=side, source='bracket' if m.get('bracket') else 'match', source_page=m['page']))
    order = [c for c, _ in cup_pages(start)]
    rows.sort(key=lambda r: (order.index(r['competition']), r['date'] or '9999', r['source_page'], r['round']))

    match = crosswalk_matcher()
    clubs = {}
    for r in rows:
        for side in ('home', 'away'):
            c = clubs.setdefault(r[f'{side}_wiki'], dict(season=s, wiki=r[f'{side}_wiki'], name=r[side], canonical_id='',
                                                           top_flight=top.get(r[f'{side}_wiki'], ''), competitions=set(), ties=0))
            c['competitions'].add(r['competition']); c['ties'] += 1
    for t, comp in top.items():  # a top-flight club that played no cup tie we could read still gets a row
        clubs.setdefault(t, dict(season=s, wiki=t, name=re.sub(r' \(.*\)$', '', t), canonical_id='', top_flight=comp, competitions=set(), ties=0))
    for c in clubs.values():
        c['canonical_id'] = match(c['wiki'], c['name'])
        c['competitions'] = ' | '.join(sorted(c['competitions']))

    def replace(path, header, new):
        old = [r for r in read_csv(path) if r['season'] != s] if os.path.exists(path) else []
        write_csv(path, header, [[r[h] for h in header] for r in old + new])
    replace(os.path.join(DATA, 'cup_matches.csv'), list(rows[0]) if rows else ['season'], rows)
    club_rows = sorted(clubs.values(), key=lambda c: (c['top_flight'] == '', c['top_flight'], c['wiki']))
    replace(os.path.join(DATA, 'cup_clubs.csv'), ['season', 'wiki', 'name', 'canonical_id', 'top_flight', 'competitions', 'ties'], club_rows)

    per = Counter(r['competition'] for r in rows)
    print(f'{s}: {len(rows)} matches with a top-5 club — ' + ', '.join(f'{c} {per[c]}' for c in dict(cup_pages(start))))
    print(f'{len(clubs)} clubs ({sum(1 for c in clubs.values() if c["top_flight"])} top-flight, '
          f'{sum(1 for c in clubs.values() if not c["top_flight"])} opponents); '
          f'{sum(1 for c in clubs.values() if c["canonical_id"])} matched to teams.csv')
    idle = [c['wiki'] for c in clubs.values() if c['top_flight'] and not c['ties']]
    if idle: print(f'top-flight clubs with no cup tie found (check their cups): {idle}')

if __name__ == '__main__':
    args = sys.argv[1:]
    cmd = args[0] if args else ''
    start = int(args[args.index('--season') + 1]) if '--season' in args else None
    if cmd not in ('fetch', 'build') or start is None: sys.exit(__doc__)
    {'fetch': fetch, 'build': build}[cmd](start)
