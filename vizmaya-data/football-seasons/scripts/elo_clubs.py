"""Club Elo per month, computed from our own results — no ClubElo API needed.

Same method as elo_national.py:  R' = R + K·G·(W − We),  We = 1 / (10^(−dr/400) + 1)
  K   20 for every match (ClubElo's K); 40 for a club's first 30 rated matches, so clubs that only
      meet ours in Europe (Shakhtar, Galatasaray, …) settle fast from the one prior they all share
  G   1 for a 0–1 goal margin, 1.5 for 2, 1.75 for 3, 1.75 + (N−3)/8 for N ≥ 4
  dr  rating gap, +HOME (55, the home edge in our league results) to the home side — none in a
      Champions League final; shootouts count as draws
Matches: the 9 leagues + the Champions League from data/matches.csv (2002-07 on), and a burn-in
from 1995-96 (football-data.co.uk files + engsoccerdata champs.csv in raw/) so that the leagues are
already calibrated against each other through Europe and promotion when the books start.
Seeding: the burn-in opens every league at its PRIOR. After that a club that enters a league
from outside our data (promoted from Ligue 2, back after years away) takes the mean rating of the
clubs that league lost to outside our data the season before — the clubs it replaced.
Clubs that only play us in Europe start at OUTSIDE.

  python3 -I scripts/elo_clubs.py fetch   burn-in league files 1995-96 → 2001-02 (cached)
  python3 -I scripts/elo_clubs.py build   needs data/matches.csv + raw/ucl/engsoccerdata/champs.csv
Writes
  data/elo_monthly.csv       club, month, elo, rank, level — month-end from 2002-07; club =
                             teams.csv canonical_id; rank among crosswalk clubs that played in the
                             last 12 months; level 1 top flight, 2 Championship, blank = Europe only
  data/elo_club_matches.csv  every rated match from 2002-07 with both pre-match ratings and the swing
"""
import csv, os, sys, urllib.request, datetime as dt
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FD = os.path.join(ROOT, 'raw', 'football-data-co-uk')
FIRST_MONTH, BURN_IN_FROM = '2002-07', 1995
K, K_NEW, NEW_GAMES, HOME = 20, 40, 30, 55
LEAGUES = {  # football-data code → (competition, country, level, burn-in prior)
    'E0': ('Premier League', 'ENG', 1, 1650), 'E1': ('Championship', 'ENG', 2, 1450),
    'SP1': ('LaLiga', 'ESP', 1, 1650), 'I1': ('Serie A', 'ITA', 1, 1680), 'D1': ('Bundesliga', 'GER', 1, 1630),
    'F1': ('Ligue 1', 'FRA', 1, 1600), 'N1': ('Eredivisie', 'NED', 1, 1550), 'P1': ('Primeira Liga', 'POR', 1, 1520),
    'SC0': ('Scottish Premiership', 'SCO', 1, 1450)}
BY_COMP = {v[0]: (code, *v[1:]) for code, v in LEAGUES.items()}
OUTSIDE = 1400
SOURCE_COL = {'fd': 'football_data_name', 'es': 'engsoccerdata_name', 'of': 'openfootball_name'}

def burn_in_seasons():
    return [f'{y % 100:02d}{(y + 1) % 100:02d}' for y in range(BURN_IN_FROM, 2002)]

def fetch():
    for s in burn_in_seasons():
        os.makedirs(os.path.join(FD, s), exist_ok=True)
        for code in LEAGUES:
            path = os.path.join(FD, s, f'{code}.csv')
            if os.path.exists(path) and os.path.getsize(path) > 100: continue
            try:
                with urllib.request.urlopen(f'https://www.football-data.co.uk/mmz4281/{s}/{code}.csv', timeout=30) as r:
                    body = r.read()
                if not body.lstrip(b'\xef\xbb\xbf').startswith(b'Div'): raise ValueError('not a results file')
                with open(path, 'wb') as f: f.write(body)
            except Exception as e:
                print(f'MISS {s} {code}: {e}', file=sys.stderr)
        print(f'done {s}')

def parse_date(s):
    for fmt in ('%d/%m/%Y', '%d/%m/%y', '%Y-%m-%d'):
        try: return dt.datetime.strptime(s.strip(), fmt).date().isoformat()
        except ValueError: pass

def load_matches():
    """(date, season start year, competition, stage, (source, home), (source, away), hg, ag)."""
    games = []
    for s in burn_in_seasons():
        for code, (comp, *_rest) in LEAGUES.items():
            path = os.path.join(FD, s, f'{code}.csv')
            if not os.path.exists(path) or os.path.getsize(path) < 100: continue
            with open(path, encoding='utf-8-sig', errors='replace', newline='') as f:
                for r in csv.DictReader(f):
                    d = parse_date(r.get('Date') or '')
                    if not d or not (r.get('FTHG') or '').strip() or not (r.get('HomeTeam') or '').strip(): continue
                    games.append((d, 1900 + int(s[:2]) if s[:2] > '50' else 2000 + int(s[:2]), comp, 'League',
                                  ('fd', r['HomeTeam'].strip()), ('fd', r['AwayTeam'].strip()), int(float(r['FTHG'])), int(float(r['FTAG']))))
    with open(os.path.join(ROOT, 'raw', 'ucl', 'engsoccerdata', 'champs.csv'), newline='') as f:
        for r in csv.DictReader(f):
            if BURN_IN_FROM <= int(r['Season']) < 2002:
                hg, ag = (r['aethgoal'], r['aetvgoal']) if r['aethgoal'] not in ('', 'NA') else (r['hgoal'], r['vgoal'])
                games.append((r['Date'], int(r['Season']), 'Champions League', r['round'],
                              ('es', r['home']), ('es', r['visitor']), int(hg), int(ag)))
    src = {'football-data.co.uk': 'fd', 'engsoccerdata': 'es', 'openfootball': 'of', 'openfootball-txt': 'of'}
    with open(os.path.join(ROOT, 'data', 'matches.csv'), newline='') as f:
        for r in csv.DictReader(f):
            if r['competition'] not in BY_COMP and r['competition'] != 'Champions League': continue
            s = src[r['source']]
            games.append((r['date'][:10], int(r['season'][:4]), r['competition'], r['stage'],
                          (s, r['home']), (s, r['away']), int(float(r['hg'])), int(float(r['ag']))))
    games.sort(key=lambda g: (g[0], g[2] != 'Champions League'))  # stable within a day
    return games

def goal_factor(n):
    return 1 if n <= 1 else 1.5 if n == 2 else 1.75 + (n - 3) / 8

def month_end(month):
    y, m = map(int, month.split('-'))
    return (dt.date(y + m // 12, m % 12 + 1, 1) - dt.timedelta(days=1)).isoformat()

def next_month(month):
    y, m = map(int, month.split('-'))
    return f'{y + m // 12}-{m % 12 + 1:02d}'

def build():
    with open(os.path.join(ROOT, 'data', 'teams.csv'), newline='') as f:
        teams = list(csv.DictReader(f))
    canon = {}  # (source, name) → canonical_id; outside the crosswalk a club keeps its source name
    for t in teams:
        for s, col in SOURCE_COL.items():
            for n in filter(None, (x.strip() for x in t[col].split(' | '))): canon[(s, n)] = t['canonical_id']
    crosswalk = {t['canonical_id'] for t in teams}
    club = lambda key: canon.get(key, f'{key[0]}:{key[1]}')
    games = load_matches()

    # league seasons: who played where, so newcomers and the clubs they replace are known up front
    in_league = defaultdict(set)   # (competition, season) → clubs
    tracked = defaultdict(set)     # season → clubs in any of our leagues
    for d, season, comp, _, h, a, *_ in games:
        if comp in BY_COMP:
            for c in (club(h), club(a)): in_league[(comp, season)].add(c); tracked[season].add(c)
    seasons_of = defaultdict(list)
    for comp, season in sorted(in_league): seasons_of[comp].append(season)

    elo, played, last_played, level = {}, defaultdict(int), {}, {}
    seeded = set()  # (club, competition, season) already placed this season
    def replaced_mean(comp, season):
        prev = [s for s in seasons_of[comp] if s < season]
        if not prev: return None
        left = [c for c in in_league[(comp, prev[-1])] if c not in tracked[season] and c in elo]
        return sum(elo[c] for c in left) / len(left) if left else None
    def enter(c, comp, season):
        if (c, comp, season) in seeded: return
        seeded.add((c, comp, season))
        prev = [s for s in seasons_of[comp] if s < season]
        came_from_ours = c in tracked[season - 1] or (prev and c in tracked[prev[-1]])
        if c in elo and came_from_ours: return
        seed = replaced_mean(comp, season)
        elo[c], played[c] = (seed if seed is not None else BY_COMP[comp][3]), 0

    months, snapshots, rated, mi = [], [], [], 0
    month, today = FIRST_MONTH, dt.date.today().isoformat()[:7]
    while month <= today: months.append(month); month = next_month(month)
    def snapshot(month):
        cutoff = (dt.date.fromisoformat(month_end(month)) - dt.timedelta(days=365)).isoformat()
        active = sorted((c for c, d in last_played.items() if d > cutoff and c in crosswalk), key=lambda c: -elo[c])
        snapshots.extend((c, month, round(elo[c]), i + 1, level.get(c, '')) for i, c in enumerate(active))

    for d, season, comp, stage, hk, ak, hg, ag in games:
        while mi < len(months) and d > month_end(months[mi]): snapshot(months[mi]); mi += 1
        h, a = club(hk), club(ak)
        for c in (h, a):
            if comp in BY_COMP: enter(c, comp, season); level[c] = BY_COMP[comp][2]
            elif c not in elo: elo[c], played[c] = OUTSIDE, 0
        rh, ra = elo[h], elo[a]
        neutral = comp == 'Champions League' and stage.lower() == 'final'
        we = 1 / (10 ** (-(rh + (0 if neutral else HOME) - ra) / 400) + 1)
        w = 1 if hg > ag else 0.5 if hg == ag else 0
        swing = goal_factor(abs(hg - ag)) * (w - we)
        elo[h] = rh + (K_NEW if played[h] < NEW_GAMES else K) * swing
        elo[a] = ra - (K_NEW if played[a] < NEW_GAMES else K) * swing
        played[h] += 1; played[a] += 1
        last_played[h] = last_played[a] = d
        if d >= FIRST_MONTH:
            rated.append((d, comp, h, a, hg, ag, round(rh), round(ra), round(elo[h] - rh, 1)))
    while mi < len(months): snapshot(months[mi]); mi += 1

    out = os.path.join(ROOT, 'data')
    with open(os.path.join(out, 'elo_monthly.csv'), 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['club', 'month', 'elo', 'rank', 'level'])
        w.writerows(snapshots)
    with open(os.path.join(out, 'elo_club_matches.csv'), 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['date', 'competition', 'home', 'away', 'hg', 'ag', 'home_elo_before', 'away_elo_before', 'home_change'])
        w.writerows(rated)
    loose = sorted({c for g in rated for c in g[2:4] if c not in crosswalk})
    print(f'{len(rated)} matches rated from {FIRST_MONTH}, {len({s[0] for s in snapshots})} crosswalk clubs, '
          f'{len(snapshots)} monthly rows ({months[0]} → {months[-1]})')
    if loose: print(f'{len(loose)} clubs outside the crosswalk (rated, not written): {", ".join(loose[:12])}' + (' …' if len(loose) > 12 else ''))

if __name__ == '__main__':
    {'fetch': fetch, 'build': build}.get(sys.argv[1] if len(sys.argv) > 1 else '', lambda: sys.exit(__doc__))()
