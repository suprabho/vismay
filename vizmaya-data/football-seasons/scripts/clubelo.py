"""ClubElo's own ratings (api.clubelo.com) per month, joined to the team crosswalk — a cross-check
for scripts/elo_clubs.py, which computes club Elo from our results and needs no network.

One request per month: the date endpoint (api.clubelo.com/2010-01-31) returns every club's
rating *and ClubElo's global rank* on that day, so ~290 month-end snapshots cover all clubs —
instead of ~570 per-club history calls that carry no rank.

  python3 -I scripts/clubelo.py fetch      month-end snapshots → raw/clubelo/YYYY-MM-DD.csv
                                          (cached files are skipped, so rerun freely; stops after
                                          3 straight failures — the API has outages, retry later)
  pnpm --filter @footshorts/worker history:teams     fills teams.csv clubelo_name from the snapshots
  python3 -I scripts/clubelo.py build      → data/clubelo_monthly.csv (club, month, elo, rank, level)
                                          club = teams.csv canonical_id; rank blank when ClubElo
                                          gives none; the current month uses today's snapshot
"""
import csv, os, sys, time, urllib.request, datetime as dt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'raw', 'clubelo')
FIRST_MONTH = '2002-07'
PAUSE_S, MAX_FAILS = 1.5, 3
COUNTRY_FOLD = {'MCO': 'FRA'}  # same fold as the crosswalk (Monaco plays Ligue 1)

def snapshot_dates():
    today, y, m = dt.date.today(), 2002, 7
    while True:
        end = dt.date(y + m // 12, m % 12 + 1, 1) - dt.timedelta(days=1)
        yield f'{y}-{m:02d}', min(end, today).isoformat()
        if end >= today: return
        y, m = y + m // 12, m % 12 + 1

def fetch():
    os.makedirs(RAW, exist_ok=True)
    fails = got = 0
    for month, day in snapshot_dates():
        path = os.path.join(RAW, f'{day}.csv')
        if os.path.exists(path) and os.path.getsize(path) > 0 and day != dt.date.today().isoformat():
            continue
        try:
            with urllib.request.urlopen(f'http://api.clubelo.com/{day}', timeout=30) as r:
                body = r.read().decode('utf-8')
            if not body.startswith('Rank,Club'): raise ValueError(f'unexpected response: {body[:60]!r}')
            with open(path, 'w', newline='') as f: f.write(body)
            got, fails = got + 1, 0
            print(f'{day}  {body.count(chr(10)) - 1} clubs')
        except Exception as e:
            fails += 1
            print(f'{day}  failed: {e}', file=sys.stderr)
            if fails >= MAX_FAILS:
                sys.exit(f'ClubElo API unreachable ({MAX_FAILS} failures in a row). {got} new snapshots saved; rerun later.')
        time.sleep(PAUSE_S)
    print(f'done: {got} new snapshots in {RAW}')

def build():
    with open(os.path.join(ROOT, 'data', 'teams.csv'), newline='') as f:
        teams = list(csv.DictReader(f))
    by_name = {}  # (ClubElo name, country) → canonical_id; names recur across countries
    for t in teams:
        for name in filter(None, (n.strip() for n in t['clubelo_name'].split(' | '))):
            for c in t['country'].split('/'): by_name[(name, c)] = t['canonical_id']
    files = {f[:-4]: f for f in os.listdir(RAW) if f.endswith('.csv')} if os.path.isdir(RAW) else {}
    rows, missing, seen, dupes = [], [], set(), 0
    for month, day in snapshot_dates():
        if day not in files: missing.append(month); continue
        with open(os.path.join(RAW, files[day]), newline='') as f:
            for r in csv.DictReader(f):
                club = by_name.get((r['Club'].strip(), COUNTRY_FOLD.get(r['Country'], r['Country'])))
                if not club: continue
                if (club, month) in seen: dupes += 1; continue  # first listing wins
                seen.add((club, month))
                rows.append((club, month, round(float(r['Elo'])), '' if r['Rank'] in ('', 'None') else r['Rank'], r['Level']))
    if dupes: print(f'warning: {dupes} duplicate club-month listings skipped', file=sys.stderr)
    rows.sort()
    with open(os.path.join(ROOT, 'data', 'clubelo_monthly.csv'), 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['club', 'month', 'elo', 'rank', 'level'])
        w.writerows(rows)
    clubs = {r[0] for r in rows}
    print(f'{len(rows)} rows, {len(clubs)} of {len(teams)} crosswalk clubs rated'
          + (f'; {len(missing)} months not fetched yet ({missing[0]} … {missing[-1]})' if missing else ''))

if __name__ == '__main__':
    {'fetch': fetch, 'build': build}.get(sys.argv[1] if len(sys.argv) > 1 else '', lambda: sys.exit(__doc__))()
