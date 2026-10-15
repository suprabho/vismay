"""Layer 3 — player stats per league-season and league-month.

Two eras, one output format:
  2012-13 → 2025-26  Transfermarkt open data (dcaribou/transfermarkt-datasets, raw/transfermarkt/*.csv.gz):
                     every appearance (goals, assists, minutes, cards) → season AND month totals.
                     Current to 2026-06-28 (upstream paused), so 2026-27 is not covered.
  2002-03 → 2011-12  Wikipedia season pages' top-scorer tables → season totals (goals only).
                     The Championship isn't in Transfermarkt, so it comes from Wikipedia for every season.

  python3 -I scripts/players.py tm-clubs     pair Transfermarkt clubs with crosswalk clubs by matching
                                             games (competition + date ±1 + score) → data/transfermarkt_clubs.csv
  python3 -I scripts/players.py wiki-fetch   season pages → raw/wikipedia/*.json (cached; 1 req/s)
  python3 -I scripts/players.py build        → data/player_season.csv, data/player_month.csv
"""
import csv, gzip, json, os, re, sys, time, urllib.parse, urllib.request, datetime as dt
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TM = os.path.join(ROOT, 'raw', 'transfermarkt')
WIKI = os.path.join(ROOT, 'raw', 'wikipedia')
DATA = os.path.join(ROOT, 'data')

# Transfermarkt competition id → our competition label (matches.csv)
TM_COMPS = {'GB1': 'Premier League', 'ES1': 'LaLiga', 'IT1': 'Serie A', 'L1': 'Bundesliga', 'FR1': 'Ligue 1',
            'NL1': 'Eredivisie', 'PO1': 'Primeira Liga', 'SC1': 'Scottish Premiership', 'CL': 'Champions League'}
TM_FIRST_SEASON = 2012

def season_label(start): return f'{start}-{str(start + 1)[2:]}'

def wiki_title(comp, start):
    s = f'{start}–{str(start + 1)[2:]}'
    return {
        'Premier League': f'{s} FA Premier League' if start <= 2006 else f'{s} Premier League',
        'LaLiga': f'{s} La Liga', 'Serie A': f'{s} Serie A', 'Bundesliga': f'{s} Bundesliga',
        'Ligue 1': f'{s} Ligue 1', 'Eredivisie': f'{s} Eredivisie', 'Primeira Liga': f'{s} Primeira Liga',
        'Scottish Premiership': f'{s} Scottish Premier League' if start <= 2012 else f'{s} Scottish Premiership',
        'Champions League': f'{s} UEFA Champions League',
        'Championship': (f'{s} Football League First Division' if start <= 2003 else
                         f'{s} Football League Championship' if start <= 2015 else f'{s} EFL Championship'),
    }[comp]

def wiki_pages():
    """(competition, season start) pairs Wikipedia must cover. 2012-13 is fetched too, as a cross-check against Transfermarkt."""
    this_season = dt.date.today().year - (dt.date.today().month < 7)
    for comp in TM_COMPS.values():
        for start in range(2002, TM_FIRST_SEASON + 1): yield comp, start
    for start in range(2002, this_season): yield 'Championship', start

def read_gz(name):
    with gzip.open(os.path.join(TM, f'{name}.csv.gz'), 'rt', newline='') as f:
        yield from csv.DictReader(f)

def read_csv(path):
    with open(path, newline='') as f: return list(csv.DictReader(f))

def write_csv(path, header, rows):
    with open(path, 'w', newline='') as f:
        w = csv.writer(f); w.writerow(header); w.writerows(rows)

# ---------------------------------------------------------------- tm-clubs

def tm_clubs():
    """Each Transfermarkt club id → the crosswalk club it plays as, by majority over paired games."""
    name_to_id = {}
    for t in read_csv(os.path.join(DATA, 'teams.csv')):
        for col in ('football_data_name', 'openfootball_name', 'engsoccerdata_name'):
            for n in filter(None, (x.strip() for x in t[col].split(' | '))): name_to_id[n] = t['canonical_id']
    ours = defaultdict(list)  # (competition, date) → [(home_id, away_id, hg, ag)]
    for m in read_csv(os.path.join(DATA, 'matches.csv')):
        if m['competition'] in TM_COMPS.values() and m['season'] >= season_label(TM_FIRST_SEASON):
            ours[(m['competition'], m['date'])].append((name_to_id.get(m['home']), name_to_id.get(m['away']), m['hg'], m['ag']))
    votes, names, paired, total = defaultdict(Counter), {}, 0, 0
    for g in read_gz('games'):
        comp = TM_COMPS.get(g['competition_id'])
        if not comp or int(g['season']) < TM_FIRST_SEASON: continue
        total += 1
        names[g['home_club_id']], names[g['away_club_id']] = g['home_club_name'], g['away_club_name']
        d = dt.date.fromisoformat(g['date'])
        cands = [m for off in (0, -1, 1) for m in ours.get((comp, (d + dt.timedelta(days=off)).isoformat()), [])
                 if (m[2], m[3]) == (g['home_club_goals'], g['away_club_goals'])]
        if len(cands) != 1: continue  # ambiguous or unmatched: no vote
        paired += 1
        h, a = cands[0][:2]
        if h: votes[g['home_club_id']][h] += 1
        if a: votes[g['away_club_id']][a] += 1
    rows = []
    for club, c in votes.items():
        (best, n), total_votes = c.most_common(1)[0], sum(c.values())
        rows.append((club, names.get(club, ''), best, n, round(n / total_votes, 2)))
    rows.sort(key=lambda r: r[2])
    write_csv(os.path.join(DATA, 'transfermarkt_clubs.csv'), ['tm_club_id', 'tm_name', 'canonical_id', 'votes', 'share'], rows)
    shaky = [r for r in rows if r[4] < 0.9]
    print(f'{paired}/{total} Transfermarkt games paired; {len(rows)} clubs mapped' +
          (f'; {len(shaky)} below 90% agreement: {shaky}' if shaky else ''))

# ---------------------------------------------------------------- wiki-fetch

def wiki_fetch():
    os.makedirs(WIKI, exist_ok=True)
    got = 0
    for comp, start in wiki_pages():
        title = wiki_title(comp, start)
        path = os.path.join(WIKI, f'{title}.json')
        if os.path.exists(path): continue
        q = urllib.parse.urlencode({'action': 'parse', 'page': title, 'prop': 'wikitext', 'redirects': 1,
                                    'format': 'json', 'formatversion': 2})
        req = urllib.request.Request(f'https://en.wikipedia.org/w/api.php?{q}',
                                     headers={'User-Agent': 'vizmaya-football-seasons/1.0 (hello@promad.design)'})
        with urllib.request.urlopen(req, timeout=30) as r: body = json.load(r)
        if 'error' in body: print(f'{title}: {body["error"].get("info")}', file=sys.stderr)
        else:
            with open(path, 'w') as f: json.dump(body['parse'], f)
            got += 1
        time.sleep(1)
    print(f'{got} pages fetched into {WIKI}')

# ---------------------------------------------------------------- wikitext tables

SECTION = re.compile(r'scor|goal|pichichi|assist', re.I)
NOT_SECTION = re.compile(r'goalkeeper|historic|\d+(st|nd|rd|th) goal|fastest|controvers|of the (year|season|month)|other scorers|hat', re.I)

def split_top(s, sep):
    """Split on sep outside [[…]] and {{…}}."""
    out, depth, i, start = [], 0, 0, 0
    while i < len(s):
        if s.startswith('[[', i) or s.startswith('{{', i): depth += 1; i += 2; continue
        if s.startswith(']]', i) or s.startswith('}}', i): depth = max(0, depth - 1); i += 2; continue
        if depth == 0 and s.startswith(sep, i): out.append(s[start:i]); i += len(sep); start = i; continue
        i += 1
    out.append(s[start:])
    return out

def cell_parts(raw):
    """'rowspan=2 align=center|20' → ({'rowspan': 2}, '20')."""
    parts = split_top(raw, '|')
    if len(parts) > 1 and '=' in parts[0] and '[[' not in parts[0] and '{{' not in parts[0]:
        span = re.search(r'rowspan\s*=\s*"?(\d+)', parts[0])
        return int(span.group(1)) if span else 1, '|'.join(parts[1:]).strip()
    return 1, raw.strip()

def parse_table(t):
    """Wikitext table → (header, rows) with rowspans expanded."""
    header, rows, cur, pending = [], [], None, {}
    def flush():
        if cur is None: return
        row, col, it = [], 0, iter(cur)
        while True:
            if col in pending:
                text, left = pending[col]
                row.append(text)
                if left > 1: pending[col] = (text, left - 1)
                else: del pending[col]
                col += 1; continue
            nxt = next(it, None)
            if nxt is None: break
            span, text = nxt
            if span > 1: pending[col] = (text, span - 1)
            row.append(text); col += 1
        rows.append(row)
    for line in t.split('\n')[1:]:
        if line.startswith('|-') or line.startswith('|}'):
            flush(); cur = []
            if line.startswith('|}'): break
        elif line.startswith('!') and not rows and not cur:
            header.extend(cell_parts(c)[1] for c in split_top(line[1:], '!!'))
        elif line.startswith('!') or (line.startswith('|') and not line.startswith('|+')):
            # '!' after the header row = row-header cells ("!1", "!25") — data like any other
            if cur is None: cur = []
            body = line[1:].lstrip('|') if line.startswith('|') else line[1:]
            cur.extend(cell_parts(c) for x in split_top(body, '!!') for c in split_top(x, '||'))
        elif cur:  # continuation of a multi-line cell
            span, text = cur[-1]; cur[-1] = (span, text + ' ' + line.strip())
    flush()
    return header, [r for r in rows if r]

def tables_in(text):
    out, i = [], 0
    while (s := text.find('{|', i)) != -1:
        depth, j = 0, s
        while j < len(text):
            if text.startswith('{|', j): depth += 1; j += 2
            elif text.startswith('|}', j):
                depth -= 1; j += 2
                if depth == 0: break
            else: j += 1
        out.append(text[s:j]); i = j
    return out

def link_text(s):
    """First wikilink's label + target, flags/refs stripped; {{sortname|A|B}} → 'A B'."""
    s = re.sub(r'<ref[^>]*/>|<ref.*?</ref>', '', s, flags=re.S)
    s = re.sub(r'\{\{\s*(flagicon|flag|fb|flagathlete|nowrap)\s*\|[^{}]*\}\}', '', s, flags=re.I)
    m = re.search(r'\{\{\s*sortname\s*\|([^|}]*)\|([^|}]*)(?:\|([^|}]*))?', s, re.I)
    if m:
        name = f'{m.group(1).strip()} {m.group(2).strip()}'.strip()
        return name, (m.group(3) or name).strip()
    m = re.search(r'\[\[([^|\]]+)(?:\|([^\]]+))?\]\]', s)
    if m: return (m.group(2) or m.group(1)).strip(), m.group(1).strip()
    plain = re.sub(r'\{\{[^{}]*\}\}|\'\'+', '', s).strip()
    return plain, ''

def plain(s):
    s = re.sub(r'<ref[^>]*/>|<ref.*?</ref>', '', s, flags=re.S)
    s = re.sub(r'<br\s*/?>', ' / ', s, flags=re.I)
    s = re.sub(r'<sup.*?</sup>', '', s, flags=re.S | re.I)  # footnote markers ("Watford³")
    s = re.sub(r'\{\{\s*(center|centre|nowrap|small|big|left|right|nobold)\s*\|\s*([^{}]*?)\s*\}\}', r'\2', s, flags=re.I)
    s = re.sub(r'\{\{\s*(flagicon|flag|fb)\s*\|[^{}]*\}\}', '', s, flags=re.I)
    s = re.sub(r'\[\[(?:[^|\]]+\|)?([^\]]+)\]\]', r'\1', s)
    return re.sub(r'\{\{[^{}]*\}\}|\'\'+|<[^>]+>', '', s).strip()

def wiki_scorers(wikitext):
    """→ {player_wiki_target: {player, club, goals, assists}} from every scorer/assist table on the page."""
    out = {}
    heads = list(re.finditer(r'^(=+)\s*([^=\n]+?)\s*\1\s*$', wikitext, re.M))
    for k, h in enumerate(heads):
        if not SECTION.search(h.group(2)) or NOT_SECTION.search(h.group(2)): continue
        level, end = len(h.group(1)), len(wikitext)
        for h2 in heads[k + 1:]:
            if len(h2.group(1)) <= level: end = h2.start(); break
        for t in tables_in(wikitext[h.end():end]):
            header, rows = parse_table(t)
            cols = [plain(c).lower() for c in header]
            find = lambda pat: next((i for i, c in enumerate(cols) if re.search(pat, c)), None)
            p, c, g, a = find(r'player|name|scorer'), find(r'club|team'), find(r'^goals?\b'), find(r'^assists?\b')
            if p is None or (g is None and a is None): continue
            if find(r'against|opponent|result|date') is not None: continue  # hat-trick lists
            for r in rows:
                if len(r) <= max(x for x in (p, c, g, a) if x is not None): continue
                name, target = link_text(r[p])
                if not name or name.lower() in ('player', 'total'): continue
                num = lambda i: (lambda m: int(m.group()) if m else None)(re.search(r'\d+', plain(r[i]))) if i is not None else None
                e = out.setdefault(target or name, {'player': name, 'club': '', 'goals': None, 'assists': None})
                if c is not None and not e['club']: e['club'] = plain(r[c])
                if g is not None and num(g) is not None: e['goals'] = max(e['goals'] or 0, num(g))
                if a is not None and num(a) is not None: e['assists'] = max(e['assists'] or 0, num(a))
    return out

# ---------------------------------------------------------------- build

def club_matcher():
    """Display club name → canonical_id via every spelling in teams.csv; failing an exact
    spelling, a club from that competition-season whose name's words contain (or are
    contained in) the given name — unique within the season ("Leeds United" ↔ "Leeds")."""
    def key(s):
        import unicodedata
        s = unicodedata.normalize('NFD', s.lower()).encode('ascii', 'ignore').decode()
        toks = [t for t in re.split(r'[^a-z0-9]+', s) if t and t not in {'fc', 'afc', 'cf', 'ac', 'sc', 'ssc', 'as', 'sl', 'cd', 'ud', 'rc'}]
        return ' '.join(toks)
    lookup, keys_of = {}, defaultdict(set)
    for t in read_csv(os.path.join(DATA, 'teams.csv')):
        for col in ('canonical_name', 'football_data_name', 'openfootball_name', 'engsoccerdata_name', 'clubelo_name', 'transfermarkt_name'):
            for n in filter(None, (x.strip() for x in t.get(col, '').split(' | '))):
                lookup.setdefault(key(n), t['canonical_id']); keys_of[t['canonical_id']].add(key(n))
        lookup.setdefault(key(t['canonical_id'].replace('-', ' ')), t['canonical_id'])
        keys_of[t['canonical_id']].add(key(t['canonical_id'].replace('-', ' ')))
    name_to_id = {n: t for k, t in lookup.items() for n in [k]}
    played = defaultdict(set)  # (competition, season) → canonical ids that played it
    for m in read_csv(os.path.join(DATA, 'matches.csv')):
        for side in ('home', 'away'):
            cid = name_to_id.get(key(m[side]))
            if cid: played[(m['competition'], m['season'])].add(cid)
    def one(part, comp, season):
        k = key(part)
        if k in lookup: return lookup[k]
        mine = set(k.split())
        hits = {cid for cid in played[(comp, season)] for kk in keys_of[cid]
                if kk and (set(kk.split()) <= mine or mine <= set(kk.split()))}
        return hits.pop() if len(hits) == 1 else None
    def match(name, comp, season):
        ids = [one(part, comp, season) for part in re.split(r'\s*/\s*|\s*,\s*|\s+and\s+', name) if part.strip()]
        return ' | '.join(ids) if ids and all(ids) else ''
    return match

def ranks(rows, field):
    """Competition ranking ("1224") within each group, players with ≥1 only."""
    vals = sorted((r[field] for r in rows if r[field]), reverse=True)
    for r in rows: r[f'{field}_rank'] = vals.index(r[field]) + 1 if r[field] else ''

def build():
    tm_club = {r['tm_club_id']: (r['canonical_id'], r['tm_name']) for r in read_csv(os.path.join(DATA, 'transfermarkt_clubs.csv'))}
    games = {}
    for g in read_gz('games'):
        comp = TM_COMPS.get(g['competition_id'])
        if comp and int(g['season']) >= TM_FIRST_SEASON: games[g['game_id']] = (comp, season_label(int(g['season'])), g['date'][:7])
    season, month = defaultdict(lambda: Counter()), defaultdict(lambda: Counter())
    names, clubs_s, clubs_m = {}, defaultdict(list), defaultdict(list)
    for a in read_gz('appearances'):
        g = games.get(a['game_id'])
        if not g: continue
        comp, s, m = g
        names[a['player_id']] = a['player_name']
        for key, store, clubs in (((s, comp, a['player_id']), season, clubs_s), ((s, m, comp, a['player_id']), month, clubs_m)):
            c = store[key]
            c['apps'] += 1; c['minutes'] += int(a['minutes_played'] or 0); c['goals'] += int(a['goals'] or 0)
            c['assists'] += int(a['assists'] or 0); c['yellow_cards'] += int(a['yellow_cards'] or 0); c['red_cards'] += int(a['red_cards'] or 0)
            if a['player_club_id'] not in clubs[key]: clubs[key].append(a['player_club_id'])
    def club_cols(ids):
        return ' | '.join(tm_club.get(i, ('', ''))[0] for i in ids), ' / '.join(tm_club.get(i, ('', f'tm:{i}'))[1] for i in ids)

    season_rows = []
    for (s, comp, pid), c in season.items():
        club, club_name = club_cols(clubs_s[(s, comp, pid)])
        season_rows.append(dict(season=s, competition=comp, player=names[pid], player_id=pid, player_wiki='', club=club, club_name=club_name,
                                **{k: c[k] for k in ('apps', 'minutes', 'goals', 'assists', 'yellow_cards', 'red_cards')}, source='transfermarkt'))
    month_rows = []
    for (s, m, comp, pid), c in month.items():
        if not (c['goals'] or c['assists']): continue  # month file = scorers & assisters only
        club, club_name = club_cols(clubs_m[(s, m, comp, pid)])
        month_rows.append(dict(season=s, month=m, competition=comp, player=names[pid], player_id=pid, club=club, club_name=club_name,
                               **{k: c[k] for k in ('apps', 'minutes', 'goals', 'assists', 'yellow_cards', 'red_cards')}))

    # Wikipedia era (+ the Championship throughout); 2012-13 pages only cross-check Transfermarkt.
    match, unmatched, missing, check = club_matcher(), Counter(), [], []
    for comp, start in wiki_pages():
        path = os.path.join(WIKI, f'{wiki_title(comp, start)}.json')
        if not os.path.exists(path): missing.append(f'{comp} {season_label(start)} (not fetched)'); continue
        found = wiki_scorers(json.load(open(path))['wikitext'])
        if not found: missing.append(f'{comp} {season_label(start)}'); continue
        if start >= TM_FIRST_SEASON and comp in TM_COMPS.values():
            check.append((comp, season_label(start), found)); continue
        for target, e in found.items():
            if e['goals'] is None and e['assists'] is None: continue
            club = match(e['club'], comp, season_label(start)) if e['club'] else ''
            if e['club'] and not club: unmatched[e['club']] += 1
            season_rows.append(dict(season=season_label(start), competition=comp, player=e['player'], player_id='', player_wiki=target,
                                    club=club, club_name=e['club'], apps='', minutes='', goals=e['goals'] or 0, assists=e['assists'] or 0,
                                    yellow_cards='', red_cards='', source='wikipedia'))

    for rows, keys in ((season_rows, ('season', 'competition')), (month_rows, ('season', 'month', 'competition'))):
        groups = defaultdict(list)
        for r in rows: groups[tuple(r[k] for k in keys)].append(r)
        for g in groups.values(): ranks(g, 'goals'); ranks(g, 'assists')
        rows.sort(key=lambda r: (*(r[k] for k in keys), r['goals_rank'] or 9999, -r['assists'], r['player']))

    write_csv(os.path.join(DATA, 'player_season.csv'), list(season_rows[0]), [list(r.values()) for r in season_rows])
    write_csv(os.path.join(DATA, 'player_month.csv'), list(month_rows[0]), [list(r.values()) for r in month_rows])
    print(f'player_season.csv: {len(season_rows)} rows ({sum(r["source"] == "wikipedia" for r in season_rows)} from Wikipedia); '
          f'player_month.csv: {len(month_rows)} rows')
    if missing: print(f'no scorer table found: {missing}')
    if unmatched: print(f'{sum(unmatched.values())} Wikipedia club names not in the crosswalk (club left blank): {unmatched.most_common(15)}')

    # Cross-check: Wikipedia vs Transfermarkt goals for the 2012-13 top scorers.
    by_name = {(r['season'], r['competition'], r['player']): r['goals'] for r in season_rows if r['source'] == 'transfermarkt'}
    agree = total = 0
    for comp, s, found in check:
        for e in sorted(found.values(), key=lambda e: -(e['goals'] or 0))[:5]:
            tm = by_name.get((s, comp, e['player']))
            if tm is None or e['goals'] is None: continue
            total += 1; agree += tm == e['goals']
            if tm != e['goals']: print(f'  2012-13 check {comp}: {e["player"]} wiki {e["goals"]} vs transfermarkt {tm}')
    print(f'2012-13 cross-check: {agree}/{total} top-5 scorers agree on goals')

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    {'tm-clubs': tm_clubs, 'wiki-fetch': wiki_fetch, 'build': build}.get(cmd, lambda: sys.exit(__doc__))()
