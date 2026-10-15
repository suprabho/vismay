"""Layer 5 — StatsBomb open event data, for marquee seasons only (special features, not recurring sections).

  python3 -I scripts/statsbomb.py list                  seasons StatsBomb publishes (raw/statsbomb/competitions.json)
  python3 -I scripts/statsbomb.py fetch --season 2003   match lists + events + lineups → raw/statsbomb/ (cached)
  python3 -I scripts/statsbomb.py build --season 2003   → data/statsbomb/<season>/
      matches.csv        one row per match (StatsBomb id ↔ crosswalk club ids, managers, stadium)
      shots.csv          every shot: location, end location, StatsBomb xG, outcome, body part, assister   → shot maps
      pass_network.csv   completed passes passer → recipient, per team per match, up to the team's first sub
      pass_nodes.csv     each player's average pass location + volume over the same window            → pass networks
      pressures.csv      every pressure event: location, counterpress, duration                           → pressing maps
      team_match.csv     per team per match: passes, completion, shots, xG, pressures (by third), PPDA

Coordinates are StatsBomb's 120×80 pitch, each event from the acting team's point of view (attacking left → right).
Publishing anything from this data needs the StatsBomb attribution: https://github.com/statsbomb/open-data#license
"""
import csv, json, os, sys, time, urllib.request
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from players import ROOT, DATA, club_matcher, season_label

SB = os.path.join(ROOT, 'raw', 'statsbomb')
BASE = 'https://raw.githubusercontent.com/statsbomb/open-data/master/data'
# StatsBomb competition name → our competition label (matches.csv) for club-id matching.
COMPS = {'Premier League': 'Premier League', 'Champions League': 'Champions League', 'La Liga': 'LaLiga'}
DEFENSIVE = {'Duel', 'Interception', 'Foul Committed', 'Block', 'Clearance'}  # PPDA's defensive actions (+ tackles via Duel)

def seasons_for(start):
    name = f'{start}/{start + 1}'
    comps = json.load(open(os.path.join(SB, 'competitions.json')))
    return [c for c in comps if c['season_name'] == name and c['competition_gender'] == 'male']

def get(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0: return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with urllib.request.urlopen(url, timeout=120) as r: data = r.read()
    json.loads(data)  # refuse to cache an error page
    with open(path, 'wb') as f: f.write(data)
    time.sleep(0.3)
    return True

def list_seasons():
    for c in sorted(json.load(open(os.path.join(SB, 'competitions.json'))), key=lambda c: c['season_name']):
        print(f"{c['season_name']:>10}  {c['competition_name']} ({c['competition_gender']})  comp={c['competition_id']} season={c['season_id']}")

def matches_for(start):
    out = []
    for c in seasons_for(start):
        path = os.path.join(SB, 'matches', str(c['competition_id']), f"{c['season_id']}.json")
        if os.path.exists(path): out += json.load(open(path))
    return sorted(out, key=lambda m: m['match_date'])

def fetch(start):
    got = 0
    for c in seasons_for(start):
        got += get(f"{BASE}/matches/{c['competition_id']}/{c['season_id']}.json",
                   os.path.join(SB, 'matches', str(c['competition_id']), f"{c['season_id']}.json"))
    ms = matches_for(start)
    for m in ms:
        for kind in ('events', 'lineups'):
            got += get(f"{BASE}/{kind}/{m['match_id']}.json", os.path.join(SB, kind, f"{m['match_id']}.json"))
    print(f'{season_label(start)}: {len(ms)} matches in {[c["competition_name"] for c in seasons_for(start)]}; {got} files downloaded')

def write(path, header, rows):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', newline='') as f:
        w = csv.writer(f); w.writerow(header); w.writerows(rows)

def r1(v): return round(v, 1) if isinstance(v, (int, float)) else ''

def build(start):
    s, match = season_label(start), club_matcher()
    out = os.path.join(DATA, 'statsbomb', s)
    matches, shots, edges, nodes, pressures, team_rows = [], [], [], [], [], []
    for m in matches_for(start):
        mid, comp = m['match_id'], COMPS.get(m['competition']['competition_name'], m['competition']['competition_name'])
        home, away = m['home_team']['home_team_name'], m['away_team']['away_team_name']
        mgr = lambda t: ' | '.join(x['name'] for x in t.get('managers', []))
        matches.append([mid, m['match_date'], comp, m.get('competition_stage', {}).get('name', ''), home, away,
                        match(home, comp, s), match(away, comp, s), m['home_score'], m['away_score'],
                        mgr(m['home_team']), mgr(m['away_team']), m.get('stadium', {}).get('name', '')])
        events = json.load(open(os.path.join(SB, 'events', f'{mid}.json')))
        by_id = {e['id']: e for e in events}
        teams = [home, away]

        # Shots (+ the pass that set each one up).
        for e in events:
            if e['type']['name'] != 'Shot': continue
            sh, kp = e['shot'], by_id.get(e['shot'].get('key_pass_id', ''), {})
            end = sh.get('end_location', [None, None])
            shots.append([mid, m['match_date'], e['team']['name'], e['player']['name'], e['period'], e['minute'], e['second'],
                          *e['location'][:2], r1(end[0]), r1(end[1]), round(sh.get('statsbomb_xg', 0), 3), sh['outcome']['name'],
                          sh['body_part']['name'], sh['type']['name'], sh.get('technique', {}).get('name', ''),
                          bool(e.get('under_pressure')), bool(sh.get('first_time')), kp.get('player', {}).get('name', '')])

        # Pass networks: completed passes up to each team's first substitution.
        first_sub = {t: min((e['minute'] + e['second'] / 60 for e in events if e['type']['name'] == 'Substitution' and e['team']['name'] == t), default=999)
                     for t in teams}
        pair, spots = defaultdict(Counter), defaultdict(lambda: defaultdict(list))
        for e in events:
            if e['type']['name'] != 'Pass' or 'outcome' in e['pass']: continue  # no outcome = completed
            t = e['team']['name']
            if e['minute'] + e['second'] / 60 >= first_sub[t] or 'recipient' not in e['pass']: continue
            p, rcv = e['player']['name'], e['pass']['recipient']['name']
            pair[t][(p, rcv)] += 1
            spots[t][p].append(e['location'])
            spots[t][rcv].append(e['pass']['end_location'])
        for t in teams:
            for (p, rcv), n in pair[t].items(): edges.append([mid, t, p, rcv, n])
            for p, locs in spots[t].items():
                nodes.append([mid, t, p, r1(sum(l[0] for l in locs) / len(locs)), r1(sum(l[1] for l in locs) / len(locs)),
                              sum(n for (a, _), n in pair[t].items() if a == p), r1(first_sub[t]) if first_sub[t] < 999 else 90])

        # Pressing.
        for e in events:
            if e['type']['name'] == 'Pressure':
                pressures.append([mid, m['match_date'], e['team']['name'], e['player']['name'], e['period'], e['minute'], e['second'],
                                  *e['location'][:2], bool(e.get('counterpress')), r1(e.get('duration', 0))])
        for t in teams:
            opp = away if t == home else home
            mine = [e for e in events if e.get('team', {}).get('name') == t]
            passes = [e for e in mine if e['type']['name'] == 'Pass']
            done = sum('outcome' not in e['pass'] for e in passes)
            prs = [e for e in mine if e['type']['name'] == 'Pressure']
            thirds = Counter('final' if e['location'][0] >= 80 else 'middle' if e['location'][0] >= 40 else 'defensive' for e in prs)
            # PPDA: opponent passes in their own 60% ÷ our defensive actions in the opponent's 60% (our x ≥ 48).
            opp_passes = sum(1 for e in events if e.get('team', {}).get('name') == opp and e['type']['name'] == 'Pass' and e['location'][0] <= 72)
            def_acts = sum(1 for e in mine if e['type']['name'] in DEFENSIVE and e.get('location', [0])[0] >= 48)
            team_rows.append([mid, m['match_date'], t, opp, len(passes), round(100 * done / len(passes), 1) if passes else '',
                              sum(e['type']['name'] == 'Shot' for e in mine),
                              round(sum(e['shot'].get('statsbomb_xg', 0) for e in mine if e['type']['name'] == 'Shot'), 2),
                              len(prs), thirds['final'], thirds['middle'], thirds['defensive'], sum(bool(e.get('counterpress')) for e in prs),
                              round(opp_passes / def_acts, 2) if def_acts else ''])

    write(os.path.join(out, 'matches.csv'), ['match_id', 'date', 'competition', 'stage', 'home', 'away', 'home_club', 'away_club',
                                             'home_score', 'away_score', 'home_manager', 'away_manager', 'stadium'], matches)
    write(os.path.join(out, 'shots.csv'), ['match_id', 'date', 'team', 'player', 'period', 'minute', 'second', 'x', 'y', 'end_x', 'end_y',
                                           'xg', 'outcome', 'body_part', 'shot_type', 'technique', 'under_pressure', 'first_time', 'assisted_by'], shots)
    write(os.path.join(out, 'pass_network.csv'), ['match_id', 'team', 'passer', 'recipient', 'passes'], edges)
    write(os.path.join(out, 'pass_nodes.csv'), ['match_id', 'team', 'player', 'avg_x', 'avg_y', 'passes_made', 'until_minute'], nodes)
    write(os.path.join(out, 'pressures.csv'), ['match_id', 'date', 'team', 'player', 'period', 'minute', 'second', 'x', 'y',
                                               'counterpress', 'duration'], pressures)
    write(os.path.join(out, 'team_match.csv'), ['match_id', 'date', 'team', 'opponent', 'passes', 'pass_pct', 'shots', 'xg', 'pressures',
                                                'pressures_final_third', 'pressures_middle_third', 'pressures_defensive_third',
                                                'counterpresses', 'ppda'], team_rows)
    print(f'{s}: {len(matches)} matches → {len(shots)} shots, {len(edges)} pass links, {len(pressures)} pressures → {out}')

if __name__ == '__main__':
    a = sys.argv[1:]
    if a == ['list']: list_seasons()
    elif len(a) == 3 and a[1] == '--season' and a[2].isdigit() and a[0] in ('fetch', 'build'): {'fetch': fetch, 'build': build}[a[0]](int(a[2]))
    else: sys.exit(__doc__)
