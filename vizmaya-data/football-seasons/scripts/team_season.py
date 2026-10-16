"""Team-season pack — everything for one club in one season, in one folder, for designing a book or story around it.

  python3 -I scripts/team_season.py fetch --team barcelona --season 2003   raw pages → raw/teams/<team>-<season>/ (cached)
  python3 -I scripts/team_season.py build --team barcelona --season 2003   → teams/<team>/<season label>/*.csv + summary.json

Sources (all cached, re-runnable; a page already on disk is never fetched again):
  BDFutbol            club season page (squad stats per competition), every competitive match page (lineups, subs,
                      cards, goals with minutes, referee, stadium), the league season page (all league results by
                      round) and each squad player's page (birth date/place, height)
  football-data.co.uk the league season CSV (half-time scores, Bet365 / market odds)
  Transfermarkt       the season squad page (detailed position, height, foot, joined date)
  Wikipedia           the club season page (transfers in/out with fees and citations) and the season's context pages
  ClubElo             the club's and its rivals' rating history (when api.clubelo.com is up)

Only Spanish clubs are configured so far (BDFutbol covers La Liga in full); add a TEAMS entry for another.
"""
import csv, html, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request, datetime as dt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'vizmaya-football-seasons/1.0 (hello@promad.design)'
BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

TEAMS = {
    'barcelona': {
        'name': 'FC Barcelona', 'bdf_id': 1, 'bdf_name': 'Barcelona', 'fd_name': 'Barcelona', 'fd_league': 'SP1',
        'tm_slug': 'fc-barcelona', 'tm_id': 131, 'clubelo': 'Barcelona',
        'wiki_season': '{dash} FC Barcelona season',
        # rivals whose Elo is worth drawing next to the club's
        'elo_rivals': ['RealMadrid', 'Valencia', 'Depor'],
    },
}
# Season context pages read for the timeline (cached; a missing page is skipped).
WIKI_CONTEXT = {
    2003: ['{dash} La Liga', '{dash} UEFA Cup', '{dash} Copa del Rey', 'Frank Rijkaard', 'Joan Laporta', 'Ronaldinho',
           '2003 FC Barcelona presidential election', 'Sandro Rosell', 'Txiki Begiristain', 'Edgar Davids',
           '{dash} Real Madrid CF season', '{dash} Valencia CF season', '{dash} Deportivo de La Coruña season',
           'El Clásico', 'Camp Nou', 'Lionel Messi'],
}

def dash(start): return f'{start}–{str(start + 1)[2:]}'
def label(start): return f'{start}-{str(start + 1)[2:]}'
def raw_dir(team, start): return os.path.join(ROOT, 'raw', 'teams', f'{team}-{label(start)}')
def out_dir(team, start): return os.path.join(ROOT, 'teams', team, label(start))

def get(url, path, ua=BROWSER_UA, tries=4, pause=1.0):
    """Download url → path once. Returns the body (cached copy when present), or None on a miss."""
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return open(path, encoding='utf-8', errors='replace').read()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': ua}), timeout=40) as r:
                body = r.read().decode('utf-8', errors='replace')
            open(path, 'w', encoding='utf-8').write(body)
            time.sleep(pause)
            return body
        except urllib.error.HTTPError as e:
            if e.code == 404: print('  404', url); return None
            wait = 20 * (i + 1) if e.code == 429 else 2 ** (i + 1)
            print(f'  {e.code} {url} — retry in {wait}s'); time.sleep(wait)
        except Exception as e:  # network blips: back off and retry
            print(f'  {type(e).__name__} {url} — retry'); time.sleep(2 ** (i + 1))
    print('  MISS', url)
    return None

def wiki(title, folder):
    q = urllib.parse.urlencode({'action': 'parse', 'page': title, 'prop': 'wikitext', 'format': 'json',
                                'formatversion': 2, 'redirects': 1})
    path = os.path.join(folder, 'wikipedia', title.replace('/', '_') + '.json')
    body = get(f'https://en.wikipedia.org/w/api.php?{q}', path, ua=UA, pause=1.5)
    if body is None: return None
    d = json.loads(body)
    if 'error' in d:
        os.remove(path); print('  no page', title); return None
    return d['parse']['wikitext']

# ---------------------------------------------------------------- fetch
def bdf_match_ids(team_html):
    m = re.search(r"var JSEGID=JSON.parse\('(.*?)'\)", team_html)
    return json.loads(m.group(1))

def bdf_squad_json(team_html):
    m = re.search(r"json_data = JSON.parse\('(.*?)'\);", team_html, re.S)
    return json.loads(m.group(1))

def fetch(team, start):
    cfg, raw = TEAMS[team], raw_dir(team, start)
    bdf = 'https://www.bdfutbol.com/en'
    print('BDFutbol club season + league season')
    team_html = get(f'{bdf}/t/t{label(start)}{cfg["bdf_id"]}.html', os.path.join(raw, 'bdfutbol', 'team.html'))
    get(f'{bdf}/t/t{label(start)}.html', os.path.join(raw, 'bdfutbol', 'league.html'))
    ids = bdf_match_ids(team_html)['tot']
    print(f'BDFutbol {len(ids)} match pages')
    for mid in ids:
        get(f'{bdf}/p/p.php?id={mid}', os.path.join(raw, 'bdfutbol', 'matches', f'{mid}.html'), pause=0.7)
    pids = [p for p in bdf_squad_json(team_html)['COD'][0]['data'] if p]
    print(f'BDFutbol {len(pids)} player pages')
    for pid in pids:
        get(f'{bdf}/j/j{pid}.html', os.path.join(raw, 'bdfutbol', 'players', f'{pid}.html'), pause=0.7)
    print('football-data.co.uk')
    s = f'{start % 100:02d}{(start + 1) % 100:02d}'
    get(f'https://www.football-data.co.uk/mmz4281/{s}/{cfg["fd_league"]}.csv', os.path.join(raw, 'football-data.csv'))
    print('Transfermarkt squad')
    get(f'https://www.transfermarkt.com/{cfg["tm_slug"]}/kader/verein/{cfg["tm_id"]}/saison_id/{start}/plus/1',
        os.path.join(raw, 'transfermarkt', 'squad.html'))
    print('Wikipedia')
    for t in [cfg['wiki_season']] + WIKI_CONTEXT.get(start, []):
        wiki(t.format(dash=dash(start)), raw)
    print('ClubElo')
    for club in [cfg['clubelo']] + cfg['elo_rivals']:
        get(f'http://api.clubelo.com/{club}', os.path.join(raw, 'clubelo', f'{club}.csv'), tries=2)
    print('done')

# ---------------------------------------------------------------- build helpers
def text(fragment):
    return html.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', fragment))).strip()

def write_csv(path, header, rows):
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f); w.writerow(header)
        for r in rows: w.writerow([r.get(h, '') if isinstance(r, dict) else r[i] for i, h in enumerate(header)])

def ddmmyyyy(s):
    return dt.datetime.strptime(s, '%d/%m/%Y').date()

COMP_LABEL = {'lig': 'La Liga', 'uef': 'UEFA Cup', 'cop': 'Copa del Rey'}

def parse_match(page):
    """One BDFutbol match page → dict with header, goals and both lineups."""
    hero = page[page.find('hero-partit'):]
    field = lambda name: (re.search(rf'<div class="f14">{name}</div>\s*<div class="f13 font-weight-bold">(.*?)</div>',
                                    hero, re.S) or [None, ''])[1]
    teams = re.findall(r"<span class=\"(?:mr-3|ml-3)\"><a href='\.\./e/e(\d+)\.html'>(.*?)</a>", hero)[:2]
    score = re.findall(r'resultat-partit[^>]*>\s*(\d+)\s*</span>', hero)[:2]
    stadium = field('Stadium'); date = re.search(r'\d{2}/\d{2}/\d{4}', text(field('Date'))).group(0)
    kickoff = re.search(r'\((\d{2}:\d{2})\)', text(field('Date')))
    ref = re.search(r"<a href='\.\./r/r(\d+)\.html'>.*?whistle-white\.png' alt=''>(.*?)</a>", hero, re.S)
    # goals: two columns (home, away) of "<span>1-0</span> <a ..j123>Name</a> 11'" + " (pen)" / " (pp)" (own goal)
    goals = []
    gblock = hero[hero.find('<div class="row pt-1 pt-md-3 pb-2 text-center'):]
    gblock = gblock[:gblock.find('<div class="row pt-1 pb-4 d-md-none">')]
    cols = gblock.split('<div class="col-6 col-sm f14">')
    home_col, away_col = (cols[1], cols[2]) if len(cols) > 2 else ('', '')
    for side, col in (('home', home_col), ('away', away_col)):
        for blk in re.findall(r'<div class="text-blanc">(.*?)</div>', col, re.S):
            sc = re.search(r'<span[^>]*>(\d+)-(\d+)</span>', blk)
            if not sc: continue
            link = re.search(r'href="\.\./j/j(\d+)\.html">(.*?)</a>', blk)
            rest = text(blk[sc.end():])
            minute = re.search(r"(\d+)(?:\+(\d+))?'", rest)
            name = text(link.group(2)) if link else rest[:minute.start()].strip() if minute else rest
            tail = rest[minute.start():] if minute else ''
            goals.append(dict(side=side, score=f'{sc.group(1)}-{sc.group(2)}', player_id=link.group(1) if link else '',
                              player=name, minute=minute.group(1) if minute else '',
                              stoppage=(minute.group(2) or '') if minute else '',
                              penalty='1' if '(pen)' in tail else '', own_goal='1' if '(pp)' in tail else '', raw=tail))
    # lineups: the two tables after the header; starters first, then the "Substitutes" tables
    body = page[page.find('<div class="row pt-3 pb-2" style="overflow: auto;">'):]
    body = body[:body.find('Milestones')] if 'Milestones' in body else body[:body.find('Collaborate with BDFutbol')]
    tables = re.findall(r'<table class="taula_estil text-left">(.*?)</table>', body, re.S)
    managers = re.findall(r"<a href=\"\.\./l/l(\d+)\.html\">(.*?)</a>|<a href='\.\./l/l(\d+)\.html'>(.*?)</a>", body)
    players = []
    for ti, tb in enumerate(tables[:4]):
        side = 'home' if ti % 2 == 0 else 'away'
        for row in re.findall(r'<tr>(.*?)</tr>', tb, re.S):
            pid = re.search(r'href="\.\./j/j(\d+)\.html">(.*?)</a>', row)
            if not pid: continue
            num = re.search(r'text-clar text-right">(\d*)</td>', row)
            cells = re.findall(r"<td class='pl-1 pl-md-2 pr-1 pr-md-2'>(.*?)</td>", row, re.S)
            subs = cells[1] if len(cells) > 1 else ''
            cards = cells[2] if len(cells) > 2 else ''
            out_ = re.search(r'title="Out"></div>\s*(\d+)', subs); in_ = re.search(r'title="In"></div>\s*(\d+)', subs)
            nat = re.search(r"<div class='pais ([\w-]+)'>", row)
            # cards cell: icons with minutes — goals (G/GP/GPP), yellow (TG), second yellow (TG2), red (TV),
            # missed penalty (PF), injured (L)
            ev = [(c, int(mn) if mn else None) for c, mn in re.findall(r'<div class="(\w+)" title="[^"]*"></div>\s*(\d*)', cards)]
            mins = lambda *cs: ' '.join(str(mn) for c, mn in ev if c in cs and mn is not None)
            players.append(dict(side=side, started='1' if ti < 2 else '0', number=num.group(1) if num else '',
                                player_id=pid.group(1), player=text(pid.group(2)), nation=nat.group(1) if nat else '',
                                sub_on=in_.group(1) if in_ else '', sub_off=out_.group(1) if out_ else '',
                                yellow=str(sum(c == 'TG' for c, _ in ev)), yellow_min=mins('TG'),
                                second_yellow=str(sum(c == 'TG2' for c, _ in ev)),
                                red=str(sum(c == 'TV' for c, _ in ev)), sent_off_min=mins('TG2', 'TV'),
                                missed_penalty=str(sum(c == 'PF' for c, _ in ev)),
                                injured='1' if any(c == 'L' for c, _ in ev) else ''))
    return dict(home_id=teams[0][0], home=text(teams[0][1]), away_id=teams[1][0], away=text(teams[1][1]),
                hg=int(score[0]), ag=int(score[1]), date=ddmmyyyy(date), kickoff=kickoff.group(1) if kickoff and kickoff.group(1) != '00:00' else '', round=text(field('Round')),
                competition=text(field('Competition')), stadium=text(stadium),
                referee=text(ref.group(2)) if ref else '', referee_id=ref.group(1) if ref else '',
                goals=goals, players=players, managers=[text(m[1] or m[3]) for m in managers])

if __name__ == '__main__':
    args = sys.argv[1:]
    if not args or args[0] not in ('fetch', 'build'): sys.exit(__doc__)
    opt = dict(zip(args[1::2], args[2::2]))
    team, start = opt.get('--team', 'barcelona'), int(opt.get('--season', 2003))
    if args[0] == 'fetch': fetch(team, start)
    else:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I drops the script dir
        from team_season_build import build
        build(team, start)
