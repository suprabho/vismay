"""Spread-ready tables for the league- and cup-level spreads of one season book.

  python3 -I scripts/spreads.py --season 2003     → briefs/2003-04/data/*.csv

League = Premier League, cup = Champions League (the first pair; others follow the same shape).
Reads data/matches.csv (build_matches.py), raw/football-data-co-uk/<prev season>/E0.csv (for the
season-on-season slope), data/statsbomb/<season>/ (statsbomb.py build), and the Wikipedia pages in
raw/wikipedia-briefs/ (scorers, monthly awards, attendances; fetch with `wiki-fetch`).

  python3 -I scripts/spreads.py wiki-fetch --season 2003   Wikipedia wikitext → raw/wikipedia-briefs/ (cached, 3 s apart)

Points 3/1/0, ties broken on GD, GF, then name (same as the admin planner). Team names are display
names (DISPLAY below); `team_id` is the crosswalk canonical_id from data/teams.csv.
"""
import csv, json, os, re, sys, time, urllib.parse, urllib.request
from collections import defaultdict
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WIKI = os.path.join(ROOT, 'raw', 'wikipedia-briefs')

# football-data.co.uk / engsoccerdata spellings → how the book prints them
DISPLAY = {
    'Man United': 'Manchester United', 'Man City': 'Manchester City', 'Newcastle': 'Newcastle United',
    'Tottenham': 'Tottenham Hotspur', 'Wolves': 'Wolverhampton Wanderers', 'Leicester': 'Leicester City',
    'Leeds': 'Leeds United', 'Birmingham': 'Birmingham City', 'Blackburn': 'Blackburn Rovers',
    'Bolton': 'Bolton Wanderers', 'Charlton': 'Charlton Athletic', 'West Ham': 'West Ham United',
    'West Brom': 'West Bromwich Albion', 'Sunderland': 'Sunderland',
    'FC Porto': 'Porto', 'AS Monaco': 'Monaco', 'Deportivo La Coruna': 'Deportivo La Coruña', 'Olympique Lyon': 'Lyon', 'Olympique Marseille': 'Marseille',
    'AFC Ajax': 'Ajax', 'Lokomotiv Moskva': 'Lokomotiv Moscow', 'CSKA Moskva': 'CSKA Moscow', 'Sparta Praha': 'Sparta Prague',
    'Slavia Praha': 'Slavia Prague', 'Dinamo Kiev': 'Dynamo Kyiv', 'Rosenborg BK': 'Rosenborg', 'RSC Anderlecht': 'Anderlecht',
    'Partizan Belgrade': 'Partizan', 'Internazionale': 'Inter', 'Kobenhavn': 'Copenhagen', 'Besiktas': 'Beşiktaş',
}
WIKI_PAGES = ['{s} FA Premier League', '{s} UEFA Champions League']
# engsoccerdata country codes → printed names
COUNTRY = {
    'ALB': 'Albania', 'ARM': 'Armenia', 'AUT': 'Austria', 'AZE': 'Azerbaijan', 'BEL': 'Belgium', 'BIH': 'Bosnia and Herzegovina',
    'BLR': 'Belarus', 'BUL': 'Bulgaria', 'CRO': 'Croatia', 'CYP': 'Cyprus', 'CZE': 'Czech Republic', 'DEN': 'Denmark',
    'ENG': 'England', 'ESP': 'Spain', 'EST': 'Estonia', 'FIN': 'Finland', 'FRA': 'France', 'FRO': 'Faroe Islands', 'GEO': 'Georgia',
    'GER': 'Germany', 'GRE': 'Greece', 'HUN': 'Hungary', 'IRL': 'Republic of Ireland', 'ISL': 'Iceland', 'ISR': 'Israel', 'ITA': 'Italy',
    'KAZ': 'Kazakhstan', 'LTU': 'Lithuania', 'LUX': 'Luxembourg', 'LVA': 'Latvia', 'MDA': 'Moldova', 'MKD': 'North Macedonia',
    'MLT': 'Malta', 'NED': 'Netherlands', 'NIR': 'Northern Ireland', 'NOR': 'Norway', 'POL': 'Poland', 'POR': 'Portugal',
    'ROU': 'Romania', 'RUS': 'Russia', 'SCO': 'Scotland', 'SRB': 'Serbia and Montenegro', 'SUI': 'Switzerland', 'SVK': 'Slovakia',
    'SVN': 'Slovenia', 'SWE': 'Sweden', 'TUR': 'Turkey', 'UKR': 'Ukraine', 'WAL': 'Wales',
}

def name(t): return DISPLAY.get(t, t)
def season_label(start): return f'{start}-{str(start + 1)[2:]}'
def outcome(gf, ga): return 'W' if gf > ga else 'D' if gf == ga else 'L'

def write(path, rows, cols=None):
    df = pd.DataFrame(rows)
    if cols: df = df[cols]
    df.to_csv(path, index=False)
    return df

def crosswalk():
    """football-data / engsoccerdata spelling → canonical_id."""
    ids = {}
    with open(os.path.join(ROOT, 'data', 'teams.csv'), newline='') as f:
        for r in csv.DictReader(f):
            for col in ('football_data_name', 'engsoccerdata_name'):
                for n in filter(None, (x.strip() for x in (r.get(col) or '').split('|'))): ids.setdefault(n, r['canonical_id'])
    return ids

# ---------------------------------------------------------------------------
# Wikipedia (scorers, awards, attendances)

def wiki_fetch(start):
    os.makedirs(WIKI, exist_ok=True)
    s = f'{start}–{str(start + 1)[2:]}'
    for p in WIKI_PAGES:
        title = p.format(s=s)
        out = os.path.join(WIKI, title.replace('–', '-').replace(' ', '_') + '.json')
        if os.path.exists(out) and os.path.getsize(out) > 2000: continue
        q = urllib.parse.urlencode({'action': 'parse', 'page': title, 'prop': 'wikitext', 'format': 'json', 'redirects': 1})
        req = urllib.request.Request(f'https://en.wikipedia.org/w/api.php?{q}', headers={'User-Agent': 'vizmaya-football-seasons/1.0'})
        with urllib.request.urlopen(req, timeout=30) as r: body = r.read()
        json.loads(body)['parse']  # fail loudly on an error page rather than caching it
        open(out, 'wb').write(body)
        print('fetched', title); time.sleep(3)

def wikitext(title):
    path = os.path.join(WIKI, title.replace('–', '-').replace(' ', '_') + '.json')
    if not os.path.exists(path): sys.exit(f'missing {path}: run `spreads.py wiki-fetch --season N` first')
    return json.load(open(path))['parse']['wikitext']['*']

def section(w, heading):
    i = w.find(heading)
    if i < 0: return ''
    j = w.find('\n==', i + len(heading))
    return w[i:j if j > 0 else None]

def unlink(cell):
    """[[A|B]] → B, [[A]] → A, drop templates/refs/markup."""
    cell = re.sub(r'<ref[^>]*/>|<ref[^>]*>.*?</ref>', '', cell)
    cell = re.sub(r'\{\{(?:flagicon|fbaicon|#invoke:flag\|icon)[^}]*\}\}', '', cell)
    cell = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]+)\]\]', r'\1', cell)
    cell = re.sub(r"'''?|align=\w+\||<br\s*/?>", '', cell)
    return re.sub(r'\s+', ' ', cell).strip(' |')

def table_rows(block):
    """Wikitable rows → list of cell lists; carries rowspan values down (Rank / Goals)."""
    rows, carry = [], {}
    for raw in block.split('\n|-')[1:]:
        cells = []
        for line in raw.split('\n'):
            line = line.strip()
            if not line.startswith('|') or line.startswith('|}'): continue
            cells.extend(c for c in line[1:].split('||'))
        if not cells: continue
        out, ci = [], 0
        width = max(len(cells) + len(carry), 1)
        for col in range(width):
            if col in carry:
                v, n = carry[col]; out.append(v)
                carry[col] = (v, n - 1)
                if n - 1 == 0: del carry[col]
                continue
            if ci >= len(cells): break
            c = cells[ci]; ci += 1
            m = re.match(r'\s*rowspan="?(\d+)"?[^|]*\|(.*)', c)
            if m:
                v = unlink(m.group(2)); out.append(v)
                if int(m.group(1)) > 1: carry[col] = (v, int(m.group(1)) - 1)
            else:
                out.append(unlink(re.sub(r'^\s*(?:style|align)="?[^|]*\|', '', c)))
        rows.append(out)
    return rows

# ---------------------------------------------------------------------------
# League (Premier League)

def team_games(df):
    rows = []
    for _, r in df.iterrows():
        for side in ('H', 'A'):
            h = side == 'H'
            gf, ga = (r.hg, r.ag) if h else (r.ag, r.hg)
            hth, hta = (str(r.ht).split('-') + ['', ''])[:2]
            htf, hta_ = (hth, hta) if h else (hta, hth)
            rows.append(dict(date=r.date, team=r.home if h else r.away, opponent=r.away if h else r.home, venue=side,
                             gf=int(gf), ga=int(ga), result=outcome(gf, ga), pts=3 if gf > ga else 1 if gf == ga else 0,
                             ht_gf=int(htf) if htf.strip().isdigit() else None, ht_ga=int(hta_) if hta_.strip().isdigit() else None,
                             shots=r.HS if h else r.AS, shots_on_target=r.HST if h else r.AST,
                             yellows=r.HY if h else r.AY, reds=r.HR if h else r.AR,
                             odds_win=r.B365H if h else r.B365A, odds_draw=r.B365D, odds_loss=r.B365A if h else r.B365H,
                             referee=r.Referee))
    return pd.DataFrame(rows).sort_values(['date', 'team']).reset_index(drop=True)

def standings(g):
    """g = team_games rows → table sorted 3/1/0, GD, GF, name."""
    t = g.groupby('team').agg(P=('pts', 'size'), W=('result', lambda s: (s == 'W').sum()), D=('result', lambda s: (s == 'D').sum()),
                              L=('result', lambda s: (s == 'L').sum()), GF=('gf', 'sum'), GA=('ga', 'sum'), Pts=('pts', 'sum')).reset_index()
    t['GD'] = t.GF - t.GA
    t = t.sort_values(['Pts', 'GD', 'GF', 'team'], ascending=[False, False, False, True]).reset_index(drop=True)
    t.insert(0, 'pos', range(1, len(t) + 1))
    return t

def implied(o_w, o_d, o_l):
    p = [1 / o_w, 1 / o_d, 1 / o_l]; s = sum(p)
    return [x / s for x in p]

def league(start, m, out, ids):
    s = season_label(start)
    df = m[(m.season == s) & (m.competition == 'Premier League')].copy()
    df['date'] = pd.to_datetime(df.date)
    g = team_games(df)
    g['month'] = g.date.dt.strftime('%Y-%m')
    teams = sorted(g.team.unique())

    # Race: every team's game-by-game running total, and its table position at the end of that day.
    dates = sorted(g.date.unique())
    pos_on = {}
    for d in dates:
        for _, r in standings(g[g.date <= d]).iterrows(): pos_on[(r.team, d)] = r.pos
    race = []
    for t in teams:
        tg = g[g.team == t].reset_index(drop=True)
        cp = cgd = 0
        for i, r in tg.iterrows():
            cp += r.pts; cgd += r.gf - r.ga
            race.append(dict(team=name(t), team_id=ids.get(t, ''), game=i + 1, date=r.date.date(), month=r.month, opponent=name(r.opponent),
                             venue=r.venue, score=f'{r.gf}-{r.ga}', result=r.result, points=r.pts, cum_points=cp, cum_gd=cgd,
                             position=pos_on[(t, r.date)]))
    write(os.path.join(out, 'epl_race.csv'), race)

    # Leader after every matchday (date) and every change at the top.
    lead, prev = [], None
    for d in dates:
        st = standings(g[g.date <= d])
        a, b = st.iloc[0], st.iloc[1]
        lead.append(dict(date=pd.Timestamp(d).date(), leader=name(a.team), leader_pts=a.Pts, leader_played=a.P,
                         second=name(b.team), second_pts=b.Pts, second_played=b.P, margin=a.Pts - b.Pts, changed=prev is not None and a.team != prev))
        prev = a.team
    write(os.path.join(out, 'epl_leader_by_date.csv'), lead)

    # Table at each month's end.
    mt = []
    for mon in sorted(g.month.unique()):
        st = standings(g[g.month <= mon])
        for _, r in st.iterrows(): mt.append(dict(month=mon, **{**r.to_dict(), 'team': name(r.team)}))
    write(os.path.join(out, 'epl_month_tables.csv'), mt)

    # Final table + everything a league-level spread compares teams on.
    st = standings(g)
    prev_season = prev_points(start)
    att = attendances(start)
    xp = g.apply(lambda r: pd.Series(implied(r.odds_win, r.odds_draw, r.odds_loss), index=['pw', 'pd', 'pl']), axis=1)
    g = pd.concat([g, xp], axis=1)
    g['xpts'] = 3 * g.pw + g.pd
    home = standings(g[g.venue == 'H']).set_index('team'); away = standings(g[g.venue == 'A']).set_index('team')
    agg = g.groupby('team').agg(shots=('shots', 'sum'), shots_on_target=('shots_on_target', 'sum'), yellows=('yellows', 'sum'),
                                reds=('reds', 'sum'), xpts_odds=('xpts', 'sum'))
    rows = []
    status = {1: 'Champions', 2: 'Champions League', 3: 'Champions League', 4: 'Champions League', 5: 'UEFA Cup'}
    for _, r in st.iterrows():
        t = r.team; a = agg.loc[t]
        ht_trail = g[(g.team == t) & (g.ht_gf < g.ht_ga)]
        rows.append(dict(pos=r.pos, team=name(t), team_id=ids.get(t, ''), P=r.P, W=r.W, D=r.D, L=r.L, GF=r.GF, GA=r.GA, GD=r.GD, Pts=r.Pts,
                         home_pts=home.loc[t].Pts, away_pts=away.loc[t].Pts,
                         prev_season_pts=prev_season.get(t, ''), prev_season_pos=prev_season.get((t, 'pos'), 'promoted'),
                         shots=int(a.shots), shots_on_target=int(a.shots_on_target), goals_per_shot_on_target=round(r.GF / a.shots_on_target, 3),
                         yellows=int(a.yellows), reds=int(a.reds), xpts_from_odds=round(a.xpts_odds, 1), pts_minus_xpts=round(r.Pts - a.xpts_odds, 1),
                         trailed_at_ht=len(ht_trail), pts_from_ht_deficit=int(ht_trail.pts.sum()),
                         avg_attendance=att.get(name(t), ''), status=status.get(r.pos, 'Relegated' if r.pos >= 18 else '')))
    write(os.path.join(out, 'epl_table_final.csv'), rows)

    # Every result, home × away (heat table).
    write(os.path.join(out, 'epl_results_grid.csv'),
          [dict(home=name(r.home), away=name(r.away), date=r.date.date(), hg=r.hg, ag=r.ag, result={'W': 'H', 'D': 'D', 'L': 'A'}[outcome(r.hg, r.ag)]) for _, r in df.iterrows()])

    # Goals and home advantage by month.
    df['month'] = df.date.dt.strftime('%Y-%m'); df['goals'] = df.hg + df.ag
    gm = df.groupby('month').agg(matches=('goals', 'size'), goals=('goals', 'sum'), home_wins=('hg', lambda s: 0)).reset_index()
    for i, r in gm.iterrows():
        d = df[df.month == r.month]
        gm.loc[i, 'home_wins'] = int((d.hg > d.ag).sum()); gm.loc[i, 'draws'] = int((d.hg == d.ag).sum()); gm.loc[i, 'away_wins'] = int((d.hg < d.ag).sum())
    gm['goals_per_game'] = (gm.goals / gm.matches).round(2)
    gm['home_win_pct'] = (100 * gm.home_wins / gm.matches).round(1)
    write(os.path.join(out, 'epl_goals_by_month.csv'), gm.astype({'draws': int, 'away_wins': int}))

    # Upsets: wins the bookmakers gave the least chance (Bet365 closing-ish odds, margin removed).
    wins = g[g.result == 'W'].sort_values('pw').head(15)
    write(os.path.join(out, 'epl_upsets.csv'), [dict(date=r.date.date(), winner=name(r.team), loser=name(r.opponent), venue=r.venue, score=f'{r.gf}-{r.ga}',
                                                     odds=r.odds_win, implied_win_pct=round(100 * r.pw, 1)) for _, r in wins.iterrows()])

    # The unbeaten season, game by game (+ StatsBomb xG when present).
    champ = st.iloc[0].team
    sb = statsbomb_team(start)
    ug = []
    for i, r in g[g.team == champ].reset_index(drop=True).iterrows():
        x = sb.get((r.date.date().isoformat(), name(champ)), {})
        ug.append(dict(game=i + 1, date=r.date.date(), opponent=name(r.opponent), venue=r.venue, score=f'{r.gf}-{r.ga}', result=r.result,
                       ht=f'{r.ht_gf}-{r.ht_ga}', behind_at_ht=r.ht_gf < r.ht_ga, implied_win_pct=round(100 * r.pw, 1),
                       xg_for=x.get('xg', ''), xg_against=x.get('xg_against', ''), shots=x.get('shots', ''), ppda=x.get('ppda', '')))
    write(os.path.join(out, 'epl_champion_games.csv'), ug)

    # Summer spending: transfers into league clubs, opening of the window to 1 September (events.csv lists £5m+ / €7m+ moves only).
    clubs = {name(t) for t in teams}
    buys = []
    with open(os.path.join(ROOT, 'data', 'events.csv'), newline='') as f:
        for r in csv.DictReader(f):
            mt = re.match(r'(.+?): (.+?) → (.+?) \(£([\d.]+)m\)', r['summary'])
            if r['type'] == 'transfer' and mt and mt.group(3) in clubs and f'{start}-06-01' <= r['date'] <= f'{start}-09-01':
                buys.append(dict(date=r['date'], player=mt.group(1), from_club=mt.group(2), to_club=mt.group(3), fee_m_gbp=float(mt.group(4)), source_url=r['source_url']))
    write(os.path.join(out, 'epl_summer_signings.csv'), sorted(buys, key=lambda b: (b['to_club'], b['date'])), ['date', 'player', 'from_club', 'to_club', 'fee_m_gbp', 'source_url'])

    # Scorers, monthly awards, attendances (Wikipedia).
    write(os.path.join(out, 'epl_scorers.csv'), epl_scorers(start))
    write(os.path.join(out, 'epl_monthly_awards.csv'), monthly_awards(start))
    print(f'{s} Premier League: {len(df)} matches, champion {name(champ)} {st.iloc[0].Pts} pts')

def prev_points(start):
    path = os.path.join(ROOT, 'raw', 'football-data-co-uk', f'{str(start - 1)[2:]}{str(start)[2:]}', 'E0.csv')
    if not os.path.exists(path): return {}
    d = pd.read_csv(path, encoding='utf-8-sig').dropna(subset=['HomeTeam', 'FTHG'])
    d = d.rename(columns={'HomeTeam': 'home', 'AwayTeam': 'away', 'FTHG': 'hg', 'FTAG': 'ag'})
    d['ht'] = ''; d['date'] = pd.to_datetime(d.Date, dayfirst=True)
    for c in ('HS', 'AS', 'HST', 'AST', 'HY', 'AY', 'HR', 'AR', 'B365H', 'B365D', 'B365A', 'Referee'):
        if c not in d: d[c] = None
    st = standings(team_games(d))
    out = {r.team: r.Pts for _, r in st.iterrows()}
    out.update({(r.team, 'pos'): r.pos for _, r in st.iterrows()})
    return out

def attendances(start):
    w = wikitext(f'{start}–{str(start + 1)[2:]} FA Premier League')
    out = {}
    for r in table_rows(section(w, '==Attendances==')):
        if len(r) >= 5 and r[0].strip().isdigit(): out[r[1]] = int(r[4].replace(',', ''))
    return out

def epl_scorers(start):
    w = wikitext(f'{start}–{str(start + 1)[2:]} FA Premier League')
    return [dict(rank=int(r[0]), player=r[1], club=r[2], goals=int(r[3])) for r in table_rows(section(w, '==Top scorers==')) if len(r) >= 4 and r[0].isdigit()]

def monthly_awards(start):
    w = wikitext(f'{start}–{str(start + 1)[2:]} FA Premier League')
    out = []
    for r in table_rows(section(w, '===Monthly awards===')):
        if len(r) >= 3:
            # "Name (Club)", or "A (Club) & B (Club)" for a shared award
            mgr, ply = ([re.match(r'(.+?) \(([^)]+)\)$', p.strip()) for p in cell.split(' & ')] for cell in (r[1], r[2]))
            names = lambda ms, raw: ' & '.join(m.group(1) for m in ms) if all(ms) else raw
            clubs = lambda ms: ' & '.join(dict.fromkeys(m.group(2) for m in ms)) if all(ms) else ''
            out.append(dict(month=r[0], manager=names(mgr, r[1]), manager_club=clubs(mgr), player=names(ply, r[2]), player_club=clubs(ply)))
    return out

# ---------------------------------------------------------------------------
# StatsBomb (statsbomb.py build output)

def statsbomb_dir(start): return os.path.join(ROOT, 'data', 'statsbomb', season_label(start))

def statsbomb_team(start):
    path = os.path.join(statsbomb_dir(start), 'team_match.csv')
    if not os.path.exists(path): return {}
    tm = pd.read_csv(path)
    out = {}
    for _, r in tm.iterrows():
        opp = tm[(tm.match_id == r.match_id) & (tm.team != r.team)].iloc[0]
        out[(r.date, name(r.team))] = dict(xg=r.xg, xg_against=opp.xg, shots=r.shots, ppda=r.ppda)
    return out

def known_as(match_ids):
    """StatsBomb full name → the name people know (lineup nickname: Anderson Luís de Souza → Deco)."""
    out = {}
    for mid in match_ids:
        path = os.path.join(ROOT, 'raw', 'statsbomb', 'lineups', f'{mid}.json')
        if not os.path.exists(path): continue
        for team in json.load(open(path)):
            for p in team['lineup']: out[p['player_name']] = p.get('player_nickname') or p['player_name']
    return out

def statsbomb_tables(start, out):
    d = statsbomb_dir(start)
    if not os.path.exists(d): print('no StatsBomb data; skipping shot maps'); return
    shots = pd.read_csv(os.path.join(d, 'shots.csv'))
    known = known_as(shots.match_id.unique())
    for c in ('player', 'assisted_by'): shots.insert(shots.columns.get_loc(c) + 1, f'{c}_known_as', shots[c].map(known).fillna(shots[c]))
    shots['team'] = shots.team.map(name)
    top = shots[(shots.team == 'Arsenal')].groupby('player').agg(shots=('xg', 'size'), goals=('outcome', lambda s: (s == 'Goal').sum()), xg=('xg', 'sum'))
    scorer = top.sort_values('goals', ascending=False).index[0]
    sc = shots[(shots.team == 'Arsenal') & (shots.player == scorer) & (shots.date < f'{start + 1}-06-01')]
    matches = pd.read_csv(os.path.join(d, 'matches.csv'))
    sc = sc[sc.match_id.isin(matches[matches.competition == 'Premier League'].match_id)]
    sc.drop(columns=['team']).to_csv(os.path.join(out, 'epl_top_scorer_shots.csv'), index=False)
    final = matches[matches.stage.str.contains('Final', na=False)]
    if len(final):
        fid = final.iloc[0].match_id
        shots[shots.match_id == fid].to_csv(os.path.join(out, 'ucl_final_shots.csv'), index=False)
        tm = pd.read_csv(os.path.join(d, 'team_match.csv')).query('match_id == @fid')
        tm.assign(team=tm.team.map(name), opponent=tm.opponent.map(name)).to_csv(os.path.join(out, 'ucl_final_team.csv'), index=False)
        nodes = pd.read_csv(os.path.join(d, 'pass_nodes.csv')); edges = pd.read_csv(os.path.join(d, 'pass_network.csv'))
        nodes.insert(nodes.columns.get_loc('player') + 1, 'player_known_as', nodes.player.map(known).fillna(nodes.player))
        for c in ('passer', 'recipient'): edges.insert(edges.columns.get_loc(c) + 1, f'{c}_known_as', edges[c].map(known).fillna(edges[c]))
        nodes['team'] = nodes.team.map(name); edges['team'] = edges.team.map(name)
        nodes[nodes.match_id == fid].to_csv(os.path.join(out, 'ucl_final_pass_nodes.csv'), index=False)
        edges[edges.match_id == fid].to_csv(os.path.join(out, 'ucl_final_pass_network.csv'), index=False)
    print(f'StatsBomb: {scorer} {int(top.loc[scorer].goals)} league goals from {len(sc)} shots; final shots {len(shots[shots.match_id == fid]) if len(final) else 0}')

# ---------------------------------------------------------------------------
# Cup (Champions League)

STAGES = [('Q-1', 'First qualifying round'), ('Q-2', 'Second qualifying round'), ('Q-3', 'Third qualifying round'),
          ('Group', 'Group stage'), ('R16', 'Round of 16'), ('QF', 'Quarter-finals'), ('SF', 'Semi-finals'), ('final', 'Final')]
STAGE_RANK = {k: i for i, (k, _) in enumerate(STAGES)}

def stage_key(stage): return 'Group' if str(stage).startswith('Group') else stage

def decided(r):
    """How a leg ended, if not in 90 minutes: engsoccerdata puts 'away goals' or the shootout score in `pens`."""
    pens = str(r.pens)
    if pens == 'away goals': return 'away goals'
    if pens not in ('nan', 'NA'): return f'penalties {pens}'
    return 'extra time' if str(r.aet) not in ('nan', 'NA') else ''

def group_table(d):
    """UEFA group order (2003-04 rules): points, then among the tied clubs head-to-head points, goal difference
    and away goals, then overall goal difference and goals scored."""
    st = standings(team_games(d)).set_index('team')
    def h2h(tied):
        sub = d[d.home.isin(tied) & d.away.isin(tied)]
        t = {x: [0, 0, 0] for x in tied}
        for _, r in sub.iterrows():
            t[r.home][0] += 3 if r.hg > r.ag else 1 if r.hg == r.ag else 0
            t[r.away][0] += 3 if r.ag > r.hg else 1 if r.hg == r.ag else 0
            t[r.home][1] += r.hg - r.ag; t[r.away][1] += r.ag - r.hg; t[r.away][2] += r.ag
        return t
    order = []
    for pts in sorted(st.Pts.unique(), reverse=True):
        tied = list(st[st.Pts == pts].index)
        h = h2h(tied) if len(tied) > 1 else {tied[0]: [0, 0, 0]}
        order += sorted(tied, key=lambda x: (-h[x][0], -h[x][1], -h[x][2], -st.loc[x].GD, -st.loc[x].GF, x))
    st = st.loc[order].reset_index()
    st['pos'] = range(1, len(st) + 1)
    return st

def cup(start, out, ids):
    raw = pd.read_csv(os.path.join(ROOT, 'raw', 'ucl', 'engsoccerdata', 'champs.csv'))
    e = raw[raw.Season == start].copy()
    e['Date'] = pd.to_datetime(e.Date)
    e = e.sort_values('Date')
    e['decided'] = e.apply(decided, axis=1)
    # Scores after extra time where a leg went to it (hgoal/vgoal are the 90-minute score).
    e['hgoal'] = e.aethgoal.where(e.aethgoal.notna(), e.hgoal).astype(int)
    e['vgoal'] = e.aetvgoal.where(e.aetvgoal.notna(), e.vgoal).astype(int)
    country = {**dict(zip(e.home, e.hcountry)), **dict(zip(e.visitor, e.vcountry))}
    e['key'] = e['round'].map(stage_key)

    ms = [dict(date=r.Date.date(), stage=r.key, group=r['round'][5:] if r.key == 'Group' else '', leg=r.leg if str(r.leg) != 'nan' else '',
               home=name(r.home), home_country=r.hcountry, away=name(r.visitor), away_country=r.vcountry, hg=int(r.hgoal), ag=int(r.vgoal),
               ht=r.HT if str(r.HT) != 'nan' else '', tie_winner=name(r.tiewinner) if str(r.tiewinner) != 'nan' else '',
               decided_by=r.decided)
          for _, r in e.iterrows()]
    write(os.path.join(out, 'ucl_matches.csv'), ms)

    # Group tables.
    grp = []
    for gname in sorted(e[e.key == 'Group']['round'].unique()):
        d = e[e['round'] == gname].rename(columns={'visitor': 'away', 'hgoal': 'hg', 'vgoal': 'ag', 'HT': 'ht'})
        for c in ('HS', 'AS', 'HST', 'AST', 'HY', 'AY', 'HR', 'AR', 'B365H', 'B365D', 'B365A', 'Referee'): d[c] = None
        d['date'] = d.Date; d['ht'] = d.ht.fillna('')
        st = group_table(d)
        for _, r in st.iterrows():
            grp.append(dict(group=gname[5:], **{**r.to_dict(), 'team': name(r.team)}, country=country[r.team], country_name=COUNTRY[country[r.team]],
                            result='Round of 16' if r.pos <= 2 else 'UEFA Cup' if r.pos == 3 else 'Out'))
    write(os.path.join(out, 'ucl_groups.csv'), grp)

    # Knockout ties.
    ties = []
    for key in ('Q-1', 'Q-2', 'Q-3', 'R16', 'QF', 'SF', 'final'):
        d = e[e.key == key]
        seen = set()
        for _, r in d.iterrows():
            pair = frozenset((r.home, r.visitor))
            if pair in seen: continue
            seen.add(pair)
            legs = d[d.home.isin(pair) & d.visitor.isin(pair)].sort_values('Date')
            first = legs.iloc[0]; a, b = first.home, first.visitor
            ga = sum(l.hgoal if l.home == a else l.vgoal for _, l in legs.iterrows())
            gb = sum(l.hgoal if l.home == b else l.vgoal for _, l in legs.iterrows())
            how = next((x for x in legs.decided if x and x != 'extra time'), 'aggregate after extra time' if (legs.decided == 'extra time').any() else 'aggregate')
            if len(legs) == 1: how = 'single match'
            if how.startswith('penalties'): how = 'penalties ' + '-'.join(sorted(how.split()[1].split('-'), key=int, reverse=True))  # winner first
            ties.append(dict(stage=key, team_a=name(a), country_a=country[a], team_b=name(b), country_b=country[b],
                             leg1=f'{first.hgoal}-{first.vgoal}', leg1_date=first.Date.date(),
                             leg2=f'{legs.iloc[1].vgoal}-{legs.iloc[1].hgoal}' if len(legs) > 1 else '', leg2_date=legs.iloc[1].Date.date() if len(legs) > 1 else '',
                             agg=f'{ga}-{gb}', winner=name(first.tiewinner), decided_by=how))
    write(os.path.join(out, 'ucl_ties.csv'), ties)

    # How far every club got, and by country.
    reach = {}
    for _, r in e.iterrows():
        for t in (r.home, r.visitor): reach[t] = max(reach.get(t, -1), STAGE_RANK[r.key])
    champ = name(e[e.key == 'final'].iloc[0].tiewinner)
    entered = {t: min(STAGE_RANK[k] for k in e[(e.home == t) | (e.visitor == t)].key) for t in reach}
    clubs = [dict(team=name(t), team_id=ids.get(t, ''), country=country[t], country_name=COUNTRY[country[t]], entered=STAGES[entered[t]][1],
                  reached='Winners' if name(t) == champ else STAGES[reach[t]][1],
                  matches=int(((e.home == t) | (e.visitor == t)).sum())) for t in sorted(reach, key=lambda t: (-reach[t], t))]
    write(os.path.join(out, 'ucl_clubs.csv'), clubs)
    labels = [l for _, l in STAGES] + ['Winners']
    by_c = defaultdict(lambda: defaultdict(int))
    for c in clubs: by_c[c['country']][c['reached']] += 1
    rows = []
    for c, d in by_c.items():
        row = dict(country=c, country_name=COUNTRY[c], clubs=sum(d.values()), **{l: d.get(l, 0) for l in labels})
        row['best'] = next(l for l in reversed(labels) if d.get(l))
        rows.append(row)
    rows.sort(key=lambda r: (-labels.index(r['best']), -r['clubs'], r['country']))
    write(os.path.join(out, 'ucl_countries.csv'), rows)

    # Funnel + goals per stage.
    fun = []
    for key, label in STAGES:
        d = e[e.key == key]
        clubs_in = set(d.home) | set(d.visitor)
        fun.append(dict(stage=label, clubs=len(clubs_in), matches=len(d), goals=int((d.hgoal + d.vgoal).sum()),
                        goals_per_game=round((d.hgoal + d.vgoal).mean(), 2), home_win_pct=round(100 * (d.hgoal > d.vgoal).mean(), 1)))
    write(os.path.join(out, 'ucl_stages.csv'), fun)

    # Finalists' roads, match by match.
    fin = e[e.key == 'final'].iloc[0]
    roads = []
    for t in (fin.home, fin.visitor):
        d = e[(e.home == t) | (e.visitor == t)]
        for i, (_, r) in enumerate(d.iterrows()):
            h = r.home == t
            gf, ga = (r.hgoal, r.vgoal) if h else (r.vgoal, r.hgoal)
            roads.append(dict(team=name(t), n=i + 1, date=r.Date.date(), stage=r.key, opponent=name(r.visitor if h else r.home),
                              opponent_country=r.vcountry if h else r.hcountry, venue='N' if r.key == 'final' else 'H' if h else 'A',
                              score=f'{gf}-{ga}', result=outcome(gf, ga)))
    write(os.path.join(out, 'ucl_finalists_road.csv'), roads)

    # English clubs' roads (the book's home league).
    eng = []
    for t in sorted(t for t in reach if country[t] == 'ENG'):
        d = e[(e.home == t) | (e.visitor == t)]
        for i, (_, r) in enumerate(d.iterrows()):
            h = r.home == t
            gf, ga = (r.hgoal, r.vgoal) if h else (r.vgoal, r.hgoal)
            eng.append(dict(team=name(t), n=i + 1, date=r.Date.date(), stage=r.key, opponent=name(r.visitor if h else r.home),
                            venue='H' if h else 'A', score=f'{gf}-{ga}', result=outcome(gf, ga)))
    write(os.path.join(out, 'ucl_english_clubs.csv'), eng)

    write(os.path.join(out, 'ucl_scorers.csv'), ucl_scorers(start))
    print(f'{season_label(start)} Champions League: {len(e)} matches, {len(reach)} clubs, winners {champ}')

def ucl_scorers(start):
    w = wikitext(f'{start}–{str(start + 1)[2:]} UEFA Champions League')
    rows = []
    for r in table_rows(section(w, '===Top goalscorers===')):
        if len(r) >= 5 and r[0].isdigit():
            g, mins = int(r[3]), int(r[4])
            rows.append(dict(rank=int(r[0]), player=r[1], club=r[2], goals=g, minutes=mins, minutes_per_goal=round(mins / g)))
    return rows

def main(start):
    out = os.path.join(ROOT, 'briefs', season_label(start), 'data')
    os.makedirs(out, exist_ok=True)
    m = pd.read_csv(os.path.join(ROOT, 'data', 'matches.csv'), low_memory=False)
    ids = crosswalk()
    league(start, m, out, ids)
    cup(start, out, ids)
    statsbomb_tables(start, out)

if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) == 2 and a[0] == '--season' and a[1].isdigit(): main(int(a[1]))
    elif len(a) == 3 and a[0] == 'wiki-fetch' and a[1] == '--season' and a[2].isdigit(): wiki_fetch(int(a[2]))
    else: sys.exit(__doc__)
