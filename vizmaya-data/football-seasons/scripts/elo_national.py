"""World Football Elo for every national team, 1872 → today, from raw/international/results.csv.

Method (eloratings.net):  R' = R + K·G·(W − We),  We = 1 / (10^(−dr/400) + 1)
  K   60 World Cup · 50 continental finals & Confederations Cup · 40 qualifiers & Nations Leagues
      · 30 other tournaments · 20 friendlies
  G   1 for a 0–1 goal margin, 1.5 for 2, 1.75 for 3, 1.75 + (N−3)/8 for N ≥ 4
  dr  rating gap, +100 to the home side unless the venue is neutral; new teams start at 1500;
      shootouts count as draws (results.csv already stores the score before penalties).
Non-FIFA events (CONIFA, Island Games, …) are skipped so their sides never enter the ranking.

Writes
  data/elo_national_matches.csv  every rated match with both pre-match ratings and the swing
  data/elo_national_monthly.csv  team, month, elo, rank — end of each month from 2002-07; rank is
                                 among teams that played in the previous 4 years

  python3 -I scripts/elo_national.py
"""
import csv, os, datetime as dt
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIRST_MONTH, ACTIVE_YEARS = '2002-07', 4
WORLD_CUP = {'FIFA World Cup'}
CONTINENTAL = {'UEFA Euro', 'Copa América', 'African Cup of Nations', 'AFC Asian Cup', 'Gold Cup',
               'CONCACAF Championship', 'Oceania Nations Cup', 'Confederations Cup'}
NON_FIFA = ('CONIFA', 'Island Games', 'Muratti Vase', 'Viva World Cup', 'Inter Games', 'ELF Cup',
            'FIFI Wild Cup', 'UNIFFAC Cup', 'Niamh Challenge Cup', 'World Unity Cup')

def k_factor(t):
    if t in WORLD_CUP: return 60
    if t in CONTINENTAL: return 50
    if 'qualification' in t or 'Nations League' in t: return 40
    return 20 if t == 'Friendly' else 30

def goal_factor(n):
    return 1 if n <= 1 else 1.5 if n == 2 else 1.75 + (n - 3) / 8

def month_end(month):
    y, m = map(int, month.split('-'))
    return (dt.date(y + m // 12, m % 12 + 1, 1) - dt.timedelta(days=1)).isoformat()

def next_month(month):
    y, m = map(int, month.split('-'))
    return f'{y + m // 12}-{m % 12 + 1:02d}'

def main():
    with open(os.path.join(ROOT, 'raw', 'international', 'results.csv'), newline='') as f:
        games = [r for r in csv.DictReader(f)
                 if r['home_score'] not in ('', 'NA') and not any(x in r['tournament'] for x in NON_FIFA)]
    games.sort(key=lambda r: r['date'])  # stable: same-day games keep file order

    elo, last_played, rated = defaultdict(lambda: 1500.0), {}, []
    months, snapshots = [], []
    month, today = FIRST_MONTH, dt.date.today().isoformat()[:7]
    while month <= today: months.append(month); month = next_month(month)

    def snapshot(month):
        cutoff = (dt.date.fromisoformat(month_end(month)) - dt.timedelta(days=365 * ACTIVE_YEARS)).isoformat()
        active = sorted((t for t, d in last_played.items() if d > cutoff), key=lambda t: -elo[t])
        snapshots.extend((t, month, round(elo[t]), i + 1) for i, t in enumerate(active))

    mi = 0
    for g in games:
        while mi < len(months) and g['date'] > month_end(months[mi]): snapshot(months[mi]); mi += 1
        h, a, hs, as_ = g['home_team'], g['away_team'], int(g['home_score']), int(g['away_score'])
        rh, ra = elo[h], elo[a]
        dr = rh + (0 if g['neutral'].upper() == 'TRUE' else 100) - ra
        we = 1 / (10 ** (-dr / 400) + 1)
        w = 1 if hs > as_ else 0.5 if hs == as_ else 0
        delta = k_factor(g['tournament']) * goal_factor(abs(hs - as_)) * (w - we)
        elo[h], elo[a] = rh + delta, ra - delta
        last_played[h] = last_played[a] = g['date']
        rated.append((g['date'], g['tournament'], h, a, hs, as_, g['neutral'], round(rh), round(ra), round(delta, 1)))
    while mi < len(months): snapshot(months[mi]); mi += 1

    out = os.path.join(ROOT, 'data')
    with open(os.path.join(out, 'elo_national_matches.csv'), 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['date', 'tournament', 'home', 'away', 'hg', 'ag', 'neutral', 'home_elo_before', 'away_elo_before', 'home_change'])
        w.writerows(rated)
    with open(os.path.join(out, 'elo_national_monthly.csv'), 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['team', 'month', 'elo', 'rank'])
        w.writerows(snapshots)
    print(f'{len(rated)} matches rated, {len(elo)} teams, {len(snapshots)} monthly rows ({months[0]} → {months[-1]})')

if __name__ == '__main__':
    main()
