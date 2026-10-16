"""Build stage of scripts/team_season.py — cached raw pages → teams/<team>/<season>/ (see that folder's README)."""
import csv, html, json, os, re, unicodedata, datetime as dt
from collections import Counter, defaultdict

from team_season import (ROOT, TEAMS, WIKI_DIR, raw_dir, out_dir, label, dash, text, write_csv, parse_match,
                         bdf_match_ids, bdf_squad_json, COMP_LABEL)

def read_csv(path):
    with open(path, newline='', encoding='utf-8-sig') as f: return list(csv.DictReader(f))

def wikitext(raw, title):
    p = os.path.join(WIKI_DIR, title.replace('/', '_') + '.json')
    return json.load(open(p, encoding='utf-8'))['parse']['wikitext'] if os.path.exists(p) else ''

# ---------------------------------------------------------------- crosswalk
# BDFutbol club names → football-data.co.uk names, for joining the two league files
BDF_ALIASES = {'Málaga': 'Malaga', 'Brøndby': 'Brondby', 'Athletic Club': 'Ath Bilbao', 'Deportivo de La Coruña': 'La Coruna',
               'Atlético de Madrid': 'Ath Madrid', 'Celta de Vigo': 'Celta', 'Racing de Santander': 'Santander',
               'Real Sociedad': 'Sociedad', 'Espanyol': 'Espanol', 'Manchester United': 'Man United',
               'Manchester City': 'Man City', 'Wolverhampton': 'Wolves', 'Blackburn Rovers': 'Blackburn',
               'Bolton Wanderers': 'Bolton', 'Charlton Athletic': 'Charlton'}

def slug(s):
    s = unicodedata.normalize('NFKD', s.replace('ø', 'o').replace('Ø', 'O')).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')

CLUB_NOISE = {'fc', 'afc', 'cf', 'ac', 'sc', 'ssc', 'as', 'sl', 'cd', 'ud', 'rc', 'rcd', 'sd', 'ca', 'club', 'de', 'f', 'c'}

def club_key(s):
    return tuple(t for t in slug(s).split('-') if t and t not in CLUB_NOISE)

def crosswalk():
    """Club name (any source's spelling) → data/teams.csv canonical_id: exact spelling first, then the one club whose
    name starts with the same word and contains, or is contained in, the given name ('Leeds' ↔ 'Leeds United').
    Clubs outside the crosswalk get a slug."""
    rows = read_csv(os.path.join(ROOT, 'data', 'teams.csv'))
    lookup, keys = {}, defaultdict(set)
    for r in rows:
        for col in ('canonical_name', 'football_data_name', 'openfootball_name', 'engsoccerdata_name', 'clubelo_name',
                    'transfermarkt_name'):
            for n in filter(None, (x.strip() for x in r.get(col, '').split(' | '))):
                lookup.setdefault(club_key(n), r['canonical_id']); keys[r['canonical_id']].add(club_key(n))
        keys[r['canonical_id']].add(club_key(r['canonical_id']))
    def cid(name):
        k = club_key(BDF_ALIASES.get(name, name))
        if k in lookup: return lookup[k]
        if club_key(name) in lookup: return lookup[club_key(name)]
        hits = {c for c, ks in keys.items() for x in ks
                if x and k and x[0] == k[0] and (set(x) <= set(k) or set(k) <= set(x))}
        return hits.pop() if len(hits) == 1 else slug(name)
    return cid

# ---------------------------------------------------------------- Wikipedia helpers
def wiki_plain(s):
    s = re.sub(r'<ref[^>]*/>|<ref[^>]*>.*?</ref>', '', s, flags=re.S)
    s = re.sub(r'\{\{flagicon\|[^}]*\}\}', '', s)
    s = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]*)\]\]', r'\1', s)
    s = re.sub(r"'{2,}", '', s)
    return html.unescape(s.replace('&nbsp;', ' ')).strip()

def wiki_template_args(block):
    """{{name |a=1 |b=[[x|y]] }} → {'a': '1', 'b': '[[x|y]]'} (pipes inside [[ ]] / {{ }} kept)."""
    depth, cur, parts = 0, '', []
    block = re.sub(r'\s*\}\}\s*$', '}}', block)
    for i, ch in enumerate(block):
        if ch in '[{': depth += 1
        if ch in ']}': depth -= 1
        if ch == '|' and depth == 2: parts.append(cur); cur = ''
        else: cur += ch
    parts.append(cur)
    out, pos = {}, 0
    if parts: parts[-1] = re.sub(r'\s*\}\}$', '', parts[-1])
    for p in parts[1:]:
        k, eq, v = p.partition('=')
        if eq and re.fullmatch(r'\s*[\w ]+\s*', k): out[k.strip()] = v.strip()
        else: pos += 1; out[f'_{pos}'] = p.strip()
    return out

def templates(wt, name):
    """Every {{name ...}} block in wikitext (balanced braces)."""
    out, i = [], 0
    while True:
        i = wt.find('{{' + name, i)
        if i < 0: return out
        depth, j = 0, i
        while j < len(wt):
            if wt.startswith('{{', j): depth += 1; j += 2; continue
            if wt.startswith('}}', j):
                depth -= 1; j += 2
                if depth == 0: break
                continue
            j += 1
        out.append(wt[i:j]); i = j

# ---------------------------------------------------------------- build
COMP_KEY = {'UEFA Cup': 'uefa', 'Copa del Rey': 'copa', 'Champions League': 'ucl', 'Community Shield': 'shield',
            'Supercopa de España': 'supercopa', 'FA Cup': 'facup', 'League Cup': 'leaguecup'}
# football-data.co.uk extras (present in some leagues' files only): our name → (home column, away column)
FD_EXTRAS = {'shots': ('HS', 'AS'), 'sot': ('HST', 'AST'), 'corners': ('HC', 'AC'), 'fouls': ('HF', 'AF')}

def build(team, start):
    cfg, raw, out = TEAMS[team], raw_dir(team, start), out_dir(team, start)
    os.makedirs(out, exist_ok=True)
    cid = crosswalk()
    me, league = cfg['bdf_name'], cfg['league']
    team_html = open(os.path.join(raw, 'bdfutbol', 'team.html'), encoding='utf-8').read()
    ids = bdf_match_ids(team_html)
    comp_of = {mid: (league if k == 'lig' else COMP_LABEL.get(k, k)) for k, v in ids.items()
               if k not in ('tot', 'pre', '1a') for mid in v}

    # ---- league: every match, BDFutbol round, plus football-data extras
    league_rows = league_matches(raw, cid)
    fd = football_data(raw)
    for r in league_rows:
        x = fd.get((r['date'], r['home_fd'], r['away_fd'])) or fd.get((r['date'], r['home'], r['away']))
        if x and int(x['FTHG']) == r['hg'] and int(x['FTAG']) == r['ag']:
            r.update(ht=f"{x['HTHG']}-{x['HTAG']}", b365_home=x.get('B365H', ''), b365_draw=x.get('B365D', ''),
                     b365_away=x.get('B365A', ''), fd_matched='1')
            for k, (h, a) in FD_EXTRAS.items():
                r[f'home_{k}'], r[f'away_{k}'] = x.get(h, ''), x.get(a, '')
    unmatched_fd = [r for r in league_rows if not r.get('fd_matched')]
    write_csv(os.path.join(out, 'league_matches.csv'),
              ['round', 'date', 'home_id', 'home', 'away_id', 'away', 'hg', 'ag', 'ht']
              + [f'{s}_{k}' for k in FD_EXTRAS for s in ('home', 'away')]
              + ['home_yellow', 'away_yellow', 'home_red', 'away_red', 'stadium', 'referee',
                 'b365_home', 'b365_draw', 'b365_away', 'bdf_match_id'], league_rows)
    n_rounds = max(r['round'] for r in league_rows)
    tables = league_tables(raw, league_rows, cid, cfg.get('relegated', 3))
    write_csv(os.path.join(out, 'league_table_by_round.csv'),
              ['round', 'date_to', 'pos', 'team_id', 'team', 'played', 'won', 'drawn', 'lost', 'gf', 'ga', 'gd', 'pts',
               'pts_adjustment', 'pts_behind_leader', 'pts_above_relegation'], tables)
    by_round = {(t['round'], t['team_id']): t for t in tables}
    me_id = cid(me)
    final = [t for t in tables if t['round'] == n_rounds]
    final_pos = {t['team_id']: t['pos'] for t in final}
    write_csv(os.path.join(out, 'league_table_final.csv'),
              ['pos', 'team_id', 'team', 'played', 'won', 'drawn', 'lost', 'gf', 'ga', 'gd', 'pts', 'pts_adjustment'], final)

    # ---- the club's competitive matches: BDFutbol pages (lineups) + cup ties only Wikipedia has (scores, scorers)
    season_page = cfg['wiki_season'].format(dash=dash(start))
    wt = wikitext(raw, season_page)
    wiki_boxes = wiki_match_boxes(wt, me)
    league_by_id = {r['bdf_match_id']: r for r in league_rows}
    games = [('bdf', mid, parse_match(open(os.path.join(raw, 'bdfutbol', 'matches', f'{mid}.html'), encoding='utf-8').read()))
             for mid in ids['tot']]
    bdf_dates = {g[2]['date'].isoformat() for g in games}
    games += [('wiki', None, m) for m in wiki_cup_matches(wt, me, set(comp_of.values()), bdf_dates, cfg)]
    games.sort(key=lambda g: g[2]['date'])
    fill_from_competition_pages(games, me, raw, start, comp_of)
    squad_ids = squad_name_index(raw, team_html)
    for src, _, m in games:  # Wikipedia scorers → the squad's names and BDFutbol ids
        if src != 'wiki': continue
        mine = 'home' if m['home'] == me else 'away'
        for g in m['goals']:
            if g['side'] == mine and not g['own_goal']:
                short = match_name(g.get('player_link') or g['player'], squad_ids, squad_ids['_full'])
                if short in squad_ids: g['player'], g['player_id'] = short, squad_ids[short]
    matches, goals, lineups = [], [], []
    for n, (src, mid, m) in enumerate(games, 1):
        home = m['home'] == me
        side, opp_side = ('home', 'away') if home else ('away', 'home')
        opp = m['away'] if home else m['home']
        gf, ga = (m['hg'], m['ag']) if home else (m['ag'], m['hg'])
        comp = comp_of[mid] if src == 'bdf' else m['competition']
        lr = league_by_id.get(mid, {})
        rnd = round_label(comp, m['round'], league)
        wb = wiki_boxes.get(m['date'].isoformat(), {})
        b365 = {'home': lr.get('b365_home', ''), 'draw': lr.get('b365_draw', ''), 'away': lr.get('b365_away', '')}
        tr = by_round.get((int(re.sub(r'\D', '', m['round']) or 0), me_id)) if comp == league else None
        scorers = lambda s: '; '.join(f"{g['player']} {g['minute']}'".replace(" '", '') + (' (pen)' if g['penalty'] else '')
                                      + (' (og)' if g['own_goal'] else '') for g in m['goals'] if g['side'] == s)
        managers = m.get('managers', [])
        row = dict(match_no=n, date=m['date'].isoformat(), weekday=m['date'].strftime('%a'), month=m['date'].strftime('%Y-%m'),
                   competition=comp, round=rnd, venue='N' if m.get('neutral') or comp == 'Community Shield' else 'H' if home else 'A',
                   opponent=opp, opponent_id=cid(opp),
                   opponent_final_pos=final_pos.get(cid(opp), '') if comp == league else '',
                   home=m['home'], away=m['away'], hg=m['hg'], ag=m['ag'], gf=gf, ga=ga,
                   result='W' if gf > ga else 'D' if gf == ga else 'L',
                   penalties=m.get('penalties') or wb.get('penaltyscore', ''),  # home–away, like hg/ag
                   points=(3 if gf > ga else 1 if gf == ga else 0) if comp == league else '',
                   ht=lr.get('ht', ''), aggregate=m.get('aggregate') or wb.get('aggregatescore', ''),
                   scorers_for=scorers(side), scorers_against=scorers(opp_side),
                   stadium=re.sub(r'\s*\(.*\)$', '', m['stadium']) or wb.get('stadium', ''),
                   city=(re.search(r'\((.*)\)$', m['stadium']) or [None, ''])[1] or wb.get('location', ''),
                   referee=m['referee'] or wb.get('referee', ''), attendance=m.get('attendance') or wb.get('attendance', ''),
                   opponent_manager=(managers[1] if home else managers[0]) if len(managers) == 2 else '',
                   **{f'{k}_{w}': lr.get(f'{side if w == "for" else opp_side}_{k}', '') for k in FD_EXTRAS for w in ('for', 'against')},
                   b365_win=b365[side] if b365['home'] else '', b365_draw=b365['draw'],
                   b365_loss=b365[opp_side] if b365['home'] else '', implied_win_prob=implied_win(b365, side),
                   league_pos_after=tr['pos'] if tr else '', league_pts_after=tr['pts'] if tr else '',
                   pts_behind_leader_after=tr['pts_behind_leader'] if tr else '',
                   source='BDFutbol' if src == 'bdf' else 'Wikipedia', has_lineups='1' if src == 'bdf' else '0',
                   bdf_match_id=mid or '')
        matches.append(row)
        for g in m['goals']:
            mine = g['side'] == side
            goals.append(dict(match_no=n, date=row['date'], competition=comp, round=rnd, opponent=opp, venue=row['venue'],
                              team=me if mine else opp, for_club='1' if mine else '0', minute=g['minute'],
                              # BDFutbol writes stoppage time as 92'; only a tie that went to extra time has ET goals
                              period=('1H' if int(g['minute']) <= 45 else 'ET' if int(g['minute']) > 90 and 'a.e.t.' in rnd
                                      else '2H') if g['minute'] else '',
                              player=g['player'], player_id=g['player_id'], player_link=g.get('player_link', ''),
                              penalty=g['penalty'], own_goal=g['own_goal'],
                              score_after=g['score'],
                              club_score_after='-'.join(g['score'].split('-')[::1 if home else -1]) if g['score'] else ''))
        for p in m.get('players', []):
            mins = minutes(p)
            gl = [g for g in m['goals'] if g['player_id'] == p['player_id'] and not g['own_goal']]
            lineups.append(dict(match_no=n, date=row['date'], competition=comp, round=rnd,
                                team=me if p['side'] == side else opp, for_club='1' if p['side'] == side else '0',
                                number=p['number'], player=p['player'], player_id=p['player_id'], nation=p['nation'],
                                started=p['started'], sub_on=p['sub_on'], sub_off=p['sub_off'],
                                minutes=mins if (p['started'] == '1' or p['sub_on']) else 0,
                                played='1' if (p['started'] == '1' or p['sub_on']) else '0',
                                goals=len(gl), penalty_goals=sum(1 for g in gl if g['penalty']),
                                yellow=p['yellow'], yellow_min=p['yellow_min'], second_yellow=p['second_yellow'],
                                red=p['red'], sent_off_min=p['sent_off_min'],
                                missed_penalty=p['missed_penalty'], injured=p['injured']))
    write_csv(os.path.join(out, 'matches.csv'), list(matches[0].keys()), matches)
    write_csv(os.path.join(out, 'goals.csv'), list(goals[0].keys()), goals)
    write_csv(os.path.join(out, 'lineups.csv'), list(lineups[0].keys()), lineups)
    comps = list(dict.fromkeys([league] + [m['competition'] for m in matches if m['competition'] != league]))

    # ---- squad: bios (BDFutbol + Transfermarkt) + per-competition totals from lineups, checked against BDFutbol's own
    squad, career = squad_table(raw, team_html, lineups, goals, me, start, comps, league)
    write_csv(os.path.join(out, 'squad.csv'), list(squad[0].keys()), squad)
    write_csv(os.path.join(out, 'player_careers.csv'), ['player_id', 'player', 'season', 'club', 'division',
                                                        'age', 'apps', 'starts', 'minutes', 'goals', 'this_season'], career)

    # ---- per month: the chapter view
    months = month_table(matches, lineups, goals, league)
    write_csv(os.path.join(out, 'months.csv'), list(months[0].keys()), months)
    pm = player_months(lineups, me)
    write_csv(os.path.join(out, 'player_months.csv'), list(pm[0].keys()), pm)

    # ---- transfers (Wikipedia season page)
    tf = transfers(wt, start)
    write_csv(os.path.join(out, 'transfers.csv'), ['direction', 'window', 'date', 'player', 'position', 'nationality', 'age',
                                                   'other_club', 'other_club_country', 'type', 'fee', 'fee_eur_m',
                                                   'fee_gbp_m', 'source_url'], tf)

    # ---- friendlies (Wikipedia: a results table or friendly match boxes)
    fr = friendlies(wt, me)
    write_csv(os.path.join(out, 'friendlies.csv'), ['date', 'month', 'competition', 'opponent', 'venue', 'score', 'gf', 'ga',
                                                    'result', 'penalties'], fr)

    # ---- timeline: hand-picked club events (quotes checked against the cached Wikipedia pages) + events read off the data
    tl = timeline(raw, out, matches, goals, lineups, squad, tables, tf, me, me_id, start, cfg, season_page)
    write_csv(os.path.join(out, 'timeline.csv'), ['date', 'date_precision', 'month', 'kind', 'importance', 'title', 'detail',
                                                  'people', 'competition', 'match_no', 'source', 'source_url', 'evidence'], tl)

    # ---- the league's top scorers (Pichichi / Golden Boot table on the league season page)
    league_page = LEAGUE_PAGES.get(cfg['fd_league'], '').format(dash=dash(start))
    ts = top_scorers(wikitext(raw, league_page), me)
    if ts: write_csv(os.path.join(out, 'league_top_scorers.csv'), ['rank', 'player', 'club', 'goals', 'club_is_us', 'source'],
                     [dict(r, source=league_page) for r in ts])

    # ---- StatsBomb event data (marquee seasons; built by scripts/statsbomb.py into data/statsbomb/<season>/)
    sb = statsbomb_tables(out, cfg, start, matches, me_id)

    # ---- Elo (ClubElo), when fetched
    elo = elo_table(raw, cfg, start, cid)
    if elo: write_csv(os.path.join(out, 'elo.csv'), ['date', 'club_id', 'club', 'elo', 'rank'], elo)

    summary = summarise(matches, goals, lineups, squad, tables, me_id, me, cfg, start, team_html, comps)
    summary['checks'] = dict(league_matches=len(league_rows), league_rows_without_football_data=len(unmatched_fd),
                             club_matches=len(matches), statsbomb_matches=sb, wikipedia_only_matches=sum(m['source'] == 'Wikipedia' for m in matches),
                             goal_rows_vs_scores=goal_mismatches(matches, goals), **squad_checks(team_html, squad))
    json.dump(summary, open(os.path.join(out, 'summary.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)
    write_csv(os.path.join(out, 'key_numbers.csv'), ['metric', 'value'], key_numbers(summary))
    print(json.dumps(summary['checks'], indent=1, ensure_ascii=False))
    print('wrote', out)

COMP_PAGES = {'FA Cup': '{dash} FA Cup', 'League Cup': '{dash} Football League Cup',
              'Community Shield': '{start} FA Community Shield'}

def fill_from_competition_pages(games, me, raw, start, comp_of):
    """Club pages that list only the club's scorers (results tables): take the opponents' scorers, stadium and referee
    from the competition page's match box for the same tie, when it has one."""
    rows = {}
    for comp, title in COMP_PAGES.items():
        for r in wiki_rows(wikitext(raw, title.format(dash=dash(start), start=start)), me):
            if r['me_home'] or r['me_away']: rows[(comp, r['date'])] = r
    for src, mid, m in games:
        # a drawn final decided on penalties: the shoot-out score, turned to this row's home–away order
        r = rows.get((comp_of.get(mid) or m.get('competition'), m['date']))
        if r and m['hg'] == m['ag'] and not m.get('penalties') and r['penalties']:
            pk = re.findall(r'\d+', r['penalties'])
            same = (r['me_home'] and m['home'] == me) or (r['me_away'] and m['away'] == me)
            m['penalties'] = '–'.join(pk if same else pk[::-1])
        if src != 'wiki' or m.get('scorers_complete'): continue
        r = rows.get((m['competition'], m['date']))
        if not r: continue
        mine = 'home' if m['home'] == me else 'away'
        their = 'away' if mine == 'home' else 'home'
        theirs_there = [g for g in r['goals'] if g['side'] == ('away' if r['me_home'] else 'home')]
        m['goals'] += [dict(g, side=their, player_id='', score='') for g in theirs_there]
        m['stadium'] = m['stadium'] or r['stadium']
        m['referee'] = m['referee'] or r['referee']
        if len(m['goals']) == m['hg'] + m['ag']:
            running_scores(m['goals']); m['scorers_complete'] = '1'

LEAGUE_PAGES = {'SP1': '{dash} La Liga', 'E0': '{dash} FA Premier League'}

def top_scorers(wt, me):
    """The league page's top-scorer table (rank and goals carried down rowspans for ties)."""
    m = re.search(r'==+\s*(?:Top scorers|Pichichi Trophy)\s*==+.*?(\{\|.*?\n\|\})', wt, re.S)
    if not m: return []
    out, rank, goals = [], '', ''
    for row in re.split(r'\n\|-+[^\n]*', m.group(1))[1:]:
        cells = [c for c in table_cells(row)]
        if not cells or not any('[[' in c for c in cells): continue
        nums = [wiki_plain(c) for c in cells if re.fullmatch(r'\s*\d+\s*', wiki_plain(c))]
        text_cells = [c for c in cells if not re.fullmatch(r'\s*\d+\s*', wiki_plain(c))]
        if len(nums) == 2: rank, goals = nums
        elif len(nums) == 1 and len(cells) == 3: rank = nums[0]   # rank cell starts a tie group; goals follow
        elif len(nums) == 1: goals = nums[0]
        player, club = wiki_plain(text_cells[0]).strip(), wiki_plain(text_cells[1]).strip() if len(text_cells) > 1 else ''
        out.append(dict(rank=rank, player=player, club=club, goals=goals,
                        club_is_us='1' if slug(me) in slug(club) else ''))
    # a tie group's first row carries the goals in its last cell; fill rows of the group that came before it
    for i in range(len(out) - 1, 0, -1):
        if out[i - 1]['rank'] == out[i]['rank'] and not out[i - 1]['goals']: out[i - 1]['goals'] = out[i]['goals']
    return out

SB_FILES = ['matches', 'shots', 'pass_network', 'pass_nodes', 'pressures', 'team_match']

def statsbomb_tables(out, cfg, start, matches, me_id):
    """The club's StatsBomb matches → statsbomb_*.csv with our match_no added. Returns the match count (0 = none)."""
    src = os.path.join(ROOT, 'data', 'statsbomb', label(start))
    if not cfg.get('statsbomb') or not os.path.exists(os.path.join(src, 'matches.csv')): return 0
    by_date = {m['date']: m['match_no'] for m in matches}
    ours = {r['match_id']: by_date.get(r['date'], '') for r in read_csv(os.path.join(src, 'matches.csv'))
            if me_id in (r['home_club'], r['away_club'])}
    for f in SB_FILES:
        rows = [dict(match_no=ours[r['match_id']], **r) for r in read_csv(os.path.join(src, f'{f}.csv')) if r['match_id'] in ours]
        if rows: write_csv(os.path.join(out, f'statsbomb_{f}.csv'), list(rows[0].keys()), rows)
    return len(ours)

def goal_mismatches(matches, goals):
    """Matches whose goal rows don't add up to the score (Wikipedia scorer lists can be incomplete)."""
    out = []
    for m in matches:
        f = sum(1 for g in goals if g['match_no'] == m['match_no'] and g['for_club'] == '1')
        a = sum(1 for g in goals if g['match_no'] == m['match_no'] and g['for_club'] == '0')
        if (f, a) != (m['gf'], m['ga']): out.append(f"{m['date']} {m['opponent']}: rows {f}-{a} vs score {m['gf']}-{m['ga']}")
    return out

# BDFutbol labels (1/48 Final, Round of 32 …) → the competition's own round names
UEFA_ROUNDS = {'1/48 Final': 'First round', '1/24 Final': 'Second round', 'Round of 32': 'Third round',
               'Round of 16': 'Fourth round', 'Round of 8': 'Quarter-final', 'Round of 4': 'Semi-final'}
CUP_ROUNDS = {'1/32 Final': 'Round of 64', 'Round of 32': 'Round of 32', 'Round of 16': 'Round of 16',
              'Round of 8': 'Quarter-final', 'Round of 4': 'Semi-final'}

UCL_ROUNDS = {'Qualifying Fase 3': 'Third qualifying round', 'Round of 16': 'Round of 16', 'Round of 8': 'Quarter-final',
              'Round of 4': 'Semi-final', 'Semifinal': 'Semi-final', 'Final': 'Final'}

def round_label(comp, r, league):
    if comp == league: return re.sub(r'\D', '', r)
    gp = re.match(r'Group phase game (\d+)', r)
    if gp: return f'Group stage, matchday {gp.group(1)}'
    leg = re.search(r'\((first|second) leg\)', r)
    base = re.sub(r'\s*\(.*\)', '', r).strip()
    name = {'UEFA Cup': UEFA_ROUNDS, 'Copa del Rey': CUP_ROUNDS, 'Champions League': UCL_ROUNDS}.get(comp, {}).get(base, base)
    return name + (f', {leg.group(1)} leg' if leg else '')

def implied_win(b365, side):
    try:
        inv = {k: 1 / float(v) for k, v in b365.items()}
    except (ValueError, ZeroDivisionError):
        return ''
    return round(inv[side] / sum(inv.values()), 3)

def minutes(p, full=90):
    on = int(p['sub_on']) if p['sub_on'] else (0 if p['started'] == '1' else None)
    if on is None: return 0
    off = int(p['sub_off']) if p['sub_off'] else full
    if p['sent_off_min']: off = min(off, int(p['sent_off_min'].split()[0]))
    return max(off - on, 0)

def league_matches(raw, cid):
    s = open(os.path.join(raw, 'bdfutbol', 'league.html'), encoding='utf-8').read()
    out = []
    for rnd, r in re.findall(r"<tr class='jornadai[^']*'[^>]*data-jornada='(\d+)'>(.*?)</tr>", s, re.S):
        if 'p.php' not in r: continue
        mid = re.search(r'p\.php\?id=(\d+)', r).group(1)
        date = re.search(r'(\d{2}/\d{2}/\d{4})', r).group(1)
        names = [text(x) for x in re.findall(r"<a href='\.\./p/p\.php\?id=\d+'>([^<]+)</a>", r)
                 if not re.fullmatch(r'\s*\d{2}/\d{2}/\d{4}\s*', x)]
        crests = re.findall(r"i/eg/(\d+)\w*\.png", r)
        sc = re.findall(r"<div class='resultat-gols([^>]*)>(\d+)</div>", r)
        g = [int(x[1]) for x in sc]
        cards = [(re.search(r"data-tg='(\d+)'", a) or [0, 0])[1] for a, _ in sc]
        reds = [(re.search(r"data-tv='(\d+)'", a) or [0, 0])[1] for a, _ in sc]
        cells = re.findall(r"<td class='text-left'>(.*?)</td>", r, re.S)
        home, away = names[0], names[1]
        out.append(dict(round=int(rnd), date=dt.datetime.strptime(date, '%d/%m/%Y').date().isoformat(),
                        home_id=cid(home), home=home, away_id=cid(away), away=away, hg=g[0], ag=g[1],
                        home_yellow=cards[0], away_yellow=cards[1], home_red=reds[0], away_red=reds[1],
                        stadium=text(cells[0]) if cells else '', referee=text(cells[1]) if len(cells) > 1 else '',
                        bdf_match_id=mid, bdf_home=crests[0], bdf_away=crests[1],
                        home_fd=BDF_ALIASES.get(home, home), away_fd=BDF_ALIASES.get(away, away)))
    return out

def football_data(raw):
    p = os.path.join(raw, 'football-data.csv')
    if not os.path.exists(p): return {}
    out = {}
    for r in read_csv(p):
        if not r.get('HomeTeam'): continue
        d = dt.datetime.strptime(r['Date'], '%d/%m/%y' if len(r['Date']) == 8 else '%d/%m/%Y').date().isoformat()
        out[(d, r['HomeTeam'], r['AwayTeam'])] = r
    return out

def league_tables(raw, rows, cid, relegated=3):
    """Standings after every round. Order is BDFutbol's own (PRG arrays: the league's own tie-breaks applied);
    the counts are recomputed from the results and checked against BDFutbol's points (PRGP)."""
    s = open(os.path.join(raw, 'bdfutbol', 'league.html'), encoding='utf-8').read()
    prg = {int(k): [int(x) for x in v.split(',')] for k, v in re.findall(r'PRG\[(\d+)\]=new Array\(([\d,]+)\)', s)}
    prgp = {int(k): [int(x) for x in v.split(',')] for k, v in re.findall(r'PRGP\[(\d+)\]=new Array\(([\d,]+)\)', s)}
    name_of = {}
    for r in rows: name_of[int(r['bdf_home'])] = r['home']; name_of[int(r['bdf_away'])] = r['away']
    stats = defaultdict(lambda: Counter())
    out = []
    for rnd in range(1, max(r['round'] for r in rows) + 1):
        played = [r for r in rows if r['round'] == rnd]
        for r in played:
            for me, gf, ga in ((r['home'], r['hg'], r['ag']), (r['away'], r['ag'], r['hg'])):
                c = stats[me]; c['played'] += 1; c['gf'] += gf; c['ga'] += ga
                c['won' if gf > ga else 'drawn' if gf == ga else 'lost'] += 1
                c['pts'] += 3 if gf > ga else 1 if gf == ga else 0
        order = [name_of[t] for t in prg[rnd]]
        official = {name_of[t]: prgp[t][rnd - 1] for t in prg[rnd]}  # BDFutbol's points, deductions included
        lead = official[order[0]]
        rel = official[order[len(order) - relegated]]  # the first relegation place (18th of 20 when 3 go down)
        for pos, t in enumerate(order, 1):
            c = stats[t]
            adj = official[t] - c['pts']
            out.append(dict(round=rnd, date_to=max(r['date'] for r in played), pos=pos, team_id=cid(t), team=t,
                            played=c['played'], won=c['won'], drawn=c['drawn'], lost=c['lost'], gf=c['gf'], ga=c['ga'],
                            gd=c['gf'] - c['ga'], pts=official[t], pts_adjustment=adj or '',
                            pts_behind_leader=lead - official[t], pts_above_relegation=official[t] - rel))
    return out

# Wikipedia season pages: section heading → competition (the last matching heading above a match applies)
WIKI_COMPS = [(r'community shield', 'Community Shield'), (r'\bfa cup', 'FA Cup'), (r'league cup', 'League Cup'),
              (r'champions league', 'Champions League'), (r'uefa cup', 'UEFA Cup'), (r'copa del rey', 'Copa del Rey'),
              (r'premier league|la liga', 'league'), (r'pre-season|friendl', 'Friendly')]
MONTHS = 'January February March April May June July August September October November December'.split()

def wiki_date(s):
    m = re.search(r'\{\{\s*start date\s*\|(\d{4})\|(\d{1,2})\|(\d{1,2})', s, re.I)
    if m: return dt.date(int(m[1]), int(m[2]), int(m[3]))
    m = re.search(r'(\d{1,2}) (' + '|'.join(MONTHS) + r') (\d{4})', wiki_plain(s))
    return dt.date(int(m[3]), MONTHS.index(m[2]) + 1, int(m[1])) if m else None

def box_goals(text_, side):
    """goals1/goals2 of a football box → [{side, player, minute, stoppage, penalty, own_goal}] (cards skipped)."""
    out = []
    for seg in re.split(r'<br\s*/?>|\n', text_):
        g = re.search(r'\{\{goal\|([^}]*)\}\}', seg)
        if not g: continue
        player = wiki_plain(re.sub(r'\{\{.*?\}\}', '', seg)).strip(' ,;')
        link = link_target(seg)
        for tok in g.group(1).split('|'):
            mm = re.fullmatch(r'\s*(\d+)(?:\+(\d+))?\s*', tok)
            if mm: out.append(dict(side=side, player=player, player_link=link, minute=mm[1], stoppage=mm[2] or '',
                                   penalty='', own_goal=''))
            elif out and re.search(r'pen', tok, re.I): out[-1]['penalty'] = '1'
            elif out and re.search(r'o\.?g|own', tok, re.I): out[-1]['own_goal'] = '1'
    return out

def table_goals(text_, side):
    """'[[Paul Scholes|Scholes]] (2) 64', 68'' → goals; (o.g.) marks an opponent's own goal."""
    out, name, link = [], '', ''
    links = iter(link_target(m.group(0)) for m in re.finditer(r'\[\[[^\]]*\]\]', text_)
                 if not re.match(r'\[\[(own goal|penalty)', m.group(0), re.I))
    for chunk in re.split(r"(\d+(?:\+\d+)?'(?:\s*\((?:pen\.|o\.g\.)\))?)", wiki_plain(text_)):
        mm = re.match(r"(\d+)(?:\+(\d+))?'", chunk)
        if mm:
            out.append(dict(side=side, player=name, player_link=link, minute=mm[1], stoppage=mm[2] or '',
                            penalty='1' if 'pen.' in chunk else '', own_goal='1' if 'o.g.' in chunk else ''))
        elif re.search(r'[A-Za-zÀ-ÿ]', chunk):
            name = re.sub(r'\(\d+\)|[,()]', ' ', chunk).strip()
            link = next(links, '')
    return out

def link_target(s):
    """First [[Target|text]] in s → 'Target' without a disambiguation suffix ('Joe Cole', not 'Cole')."""
    m = re.search(r'\[\[([^|\]]+)', s)
    return re.sub(r'\s*\(.*?\)\s*$', '', m.group(1)).strip() if m else ''

def running_scores(goals):
    h = a = 0
    for g in sorted(goals, key=lambda g: (int(g['minute']), int(g['stoppage'] or 0))):
        if g['side'] == 'home': h += 1
        else: a += 1
        g['score'] = f'{h}-{a}'
    return goals

def wiki_rows(wt, me):
    """Every match on a club season page: football boxes (both teams' scorers) and results tables (club's scorers)."""
    me_key = slug(me)
    is_me = lambda t: me_key in slug(wiki_plain(t)) or slug(wiki_plain(t)) in me_key
    heads = [(m.start(), m.group(1).strip()) for m in re.finditer(r'^=+\s*([^=\n]+?)\s*=+\s*$', wt, re.M)]
    def comp_at(pos):
        comp = ''
        for p, h in heads:
            if p > pos: break
            for pat, c in WIKI_COMPS:
                if re.search(pat, h, re.I): comp = c; break
        return comp
    out, seen = [], set()
    for name in ('football box collapsible', 'Football box collapsible', 'footballbox collapsible', 'Football box',
                 'football box'):
        i = 0
        for b in templates(wt, name):
            pos = wt.find(b, i); i = pos + 1
            if pos in seen: continue  # 'football box' also finds every 'football box collapsible'
            seen.add(pos)
            a = wiki_template_args(b)
            d = wiki_date(a.get('date', ''))
            sc = re.search(r'(\d+)\s*[–-]\s*(\d+)', wiki_plain(a.get('score', '')))
            if not d or not sc: continue
            home, away = wiki_plain(a.get('team1', '')), wiki_plain(a.get('team2', ''))
            goals = running_scores(box_goals(a.get('goals1', ''), 'home') + box_goals(a.get('goals2', ''), 'away'))
            out.append(dict(source='box', competition=comp_at(pos), date=d, round=wiki_plain(re.sub(r'<br\s*/?>', ' ', a.get('round', ''))),
                            home=home, away=away, me_home=is_me(home), me_away=is_me(away), hg=int(sc[1]), ag=int(sc[2]),
                            aet='1' if re.search(r'a\.?e\.?t|aet', a.get('score', '') + a.get('result', ''), re.I) else '',
                            goals=goals, both_sides='1', stadium=wiki_plain(a.get('stadium', '')).split(',')[0].strip(),
                            location=wiki_plain(a.get('location', '')), attendance=wiki_plain(a.get('attendance', '')).replace(',', ''),
                            referee=re.sub(r'\s*\(.*?\)', '', wiki_plain(a.get('referee', ''))),
                            penalties=wiki_plain(a.get('penaltyscore', '')), aggregate=wiki_plain(a.get('aggregatescore', ''))))
    # results tables: Date | (Round) | Opponents | H/A | Result F–A | Scorers | Attendance …
    for t in re.finditer(r'\{\|.*?\n\|\}', wt, re.S):
        tab = t.group(0)
        hdr = [wiki_plain(h).lower() for h in re.findall(r'^!\s*(.*?)\s*$', tab, re.M)]
        # one competition per table; a mixed table (a Competition column: Barça's friendlies list) is left to friendlies()
        if not hdr or 'date' not in hdr[0] or not any('opponent' in h for h in hdr) or any('competition' in h for h in hdr):
            continue
        col = lambda key: next((i for i, h in enumerate(hdr) if key in h), None)
        for row in tab.split('|-')[1:]:
            cells = [c[1:].strip() for c in row.split('\n') if c.startswith('|') and not c.startswith('|}')]
            if len(cells) < len(hdr) - 1: continue
            d = wiki_date(cells[0])
            res = re.search(r'(\d+)\s*[–-]\s*(\d+)', wiki_plain(cells[col('result')])) if col('result') is not None else None
            if not d or not res: continue
            ha = wiki_plain(cells[col('h/a')]).strip() if col('h/a') is not None else ''
            opp = wiki_plain(cells[col('opponent')])
            gf, ga = int(res[1]), int(res[2])  # these tables write the club's score first (F–A)
            home_is_me = ha != 'A'
            goals = table_goals(cells[col('scorer')], 'home' if home_is_me else 'away') if col('scorer') is not None else []
            att = col('attendance')
            out.append(dict(source='table', competition=comp_at(t.start()), date=d,
                            round=wiki_plain(cells[col('round')]) if col('round') is not None else '',
                            home=me if home_is_me else opp, away=opp if home_is_me else me, me_home=home_is_me,
                            me_away=not home_is_me, neutral='1' if ha == 'N' else '',
                            hg=gf if home_is_me else ga, ag=ga if home_is_me else gf,
                            aet='1' if re.search(r'aet', cells[col('result')], re.I) else '', goals=goals, both_sides='',
                            stadium='', location='', attendance=wiki_plain(cells[att]).replace(',', '') if att is not None and att < len(cells) else '',
                            referee='', penalties='', aggregate=''))
    return sorted(out, key=lambda r: r['date'])

def wiki_match_boxes(wt, me):
    """{date: attendance, referee, aggregate, stadium, location, penalties} for enriching BDFutbol's matches."""
    return {r['date'].isoformat(): dict(attendance=r['attendance'], referee=r['referee'], aggregatescore=r['aggregate'],
                                        stadium=r['stadium'], location=r['location'], penaltyscore=r['penalties'])
            for r in wiki_rows(wt, me) if r['me_home'] or r['me_away']}

def wiki_cup_matches(wt, me, have, bdf_dates, cfg):
    """Competitive ties BDFutbol doesn't cover (England's FA Cup and League Cup) → parse_match-shaped dicts."""
    out = []
    for r in wiki_rows(wt, me):
        comp = r['competition']
        if not comp or comp in ('Friendly', 'league') or comp in have or not (r['me_home'] or r['me_away']): continue
        if r['date'].isoformat() in bdf_dates: continue
        home, away = (me, r['away']) if r['me_home'] else (r['home'], me)
        # England's FA Cup semi-finals and both cup finals are played at neutral grounds
        neutral = r.get('neutral') or (comp == 'FA Cup' and re.search(r'(?i)semi|final', r['round'])) or \
            (comp == 'League Cup' and re.fullmatch(r'(?i)\s*final\s*', r['round']))
        out.append(dict(competition=comp, date=r['date'], round=r['round'] + (' (a.e.t.)' if r['aet'] else ''),
                        neutral='1' if neutral else '',
                        home=home, away=away, hg=r['hg'], ag=r['ag'], stadium=r['stadium'], referee=r['referee'],
                        attendance=r['attendance'], penalties=r['penalties'], aggregate=r['aggregate'], managers=[],
                        goals=[dict(g, player_id='', score=g.get('score', '')) for g in r['goals']], players=[],
                        scorers_complete=r['both_sides']))
    return out

def parse_player_page(path):
    s = open(path, encoding='utf-8').read()
    t = re.sub(r'<script.*?</script>|<style.*?</style>', '', s, flags=re.S)
    t = html.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', t)))
    t = t[t.find('Remove ads'):]
    f = lambda pat: (re.search(pat, t) or [None, ''])[1].strip()
    bio = dict(full_name=f(r'Complete name (.*?) Date of birth'), birth_date=f(r'Date of birth (\d{2}/\d{2}/\d{4})'),
               birth_place=re.sub(r'\s+\(\s*(.*?)\s*\)', r' (\1)', f(r'Place of birth (.*?) Birth Country')), birth_country=f(r'Birth Country (.*?) (?:Nationality|Position)'),
               nationality=f(r'Nationality (.*?) Position'), position=f(r'Position (.*?) (?:Height|Weight|Previous)'),
               height_cm=f(r'Height (\d+) cm'), weight_kg=f(r'Weight (\d+) kg'))
    if bio['birth_date']:
        bio['birth_date'] = dt.datetime.strptime(bio['birth_date'], '%d/%m/%Y').date().isoformat()
    career = []
    i = t.find('GO GC NR')
    seg = t[i:t.find(' Total ', i)] + ' Total'
    row = re.compile(r'(\d{4}(?:-\d{2})?) (.+?) (?:(\d)ª(B?) )?(\d{1,2}) ((?:[\d-]+ ){17}[\d-]+)(?: (\d+))?'
                     r'(?= (?:19|20)\d{2}(?:-\d{2})? \D| Total)')
    for m in row.finditer(seg):
        n = [int(x) if x != '-' else None for x in m.group(6).split()]
        # PM SM CM AM RM IM C TC W D L Min YC RD G GP GO GC
        career.append(dict(season=m.group(1), club=m.group(2),
                           division=f'{m.group(3)}ª{m.group(4)}' if m.group(3) else '', age=m.group(5),
                           apps=n[0], starts=n[1], minutes=n[11], goals=n[14]))
    return bio, career

def transfermarkt_squad(raw):
    """Transfermarkt's season squad page → {name: detailed position, height, foot, joined, signed_from (+ fee note)}."""
    p = os.path.join(raw, 'transfermarkt', 'squad.html')
    if not os.path.exists(p): return {}
    s = open(p, encoding='utf-8').read()
    out = {}
    for row in re.split(r'<tr class="(?:odd|even)">', s)[1:]:
        row = row[:row.find('</tr>', row.find('rechts hauptlink'))]
        name = re.search(r'<td class="hauptlink">\s*<a href="/[^/]+/profil/spieler/(\d+)">\s*(.*?)\s*</a>', row, re.S)
        if not name: continue
        pos = re.search(r'<tr>\s*<td>\s*(.*?)\s*</td>\s*</tr>', row, re.S)
        cells = re.findall(r'<td class="zentriert">(.*?)</td>', row, re.S)
        frm = re.search(r'<a title="([^"]*)" href="/[^"]*/startseite/verein/', row)
        joined = text(cells[5]) if len(cells) > 5 else ''
        out[text(name.group(2))] = dict(
            tm_id=name.group(1), tm_position=text(pos.group(1)) if pos else '',
            height_tm=text(cells[3]).replace(',', '.').rstrip('m') if len(cells) > 3 else '',
            foot=text(cells[4]).replace('N/A', '') if len(cells) > 4 else '',
            joined=dt.datetime.strptime(joined, '%d/%m/%Y').date().isoformat() if re.fullmatch(r'\d{2}/\d{2}/\d{4}', joined) else '',
            signed_from=html.unescape(frm.group(1)).replace(': Ablöse', ' — fee:') if frm else '')
    return out

def squad_table(raw, team_html, lineups, goals, me, start, comps, league):
    js = bdf_squad_json(team_html)
    pids = js['COD'][0]['data']
    # BDFutbol's squad table rows (names in order of the JSON arrays)
    bdf_rows = squad_rows(team_html)
    tm = transfermarkt_squad(raw)
    agg = defaultdict(lambda: defaultdict(Counter))
    shirt = {}
    for l in lineups:
        if l['for_club'] != '1': continue
        c = agg[l['player_id']][l['competition']]
        shirt.setdefault(l['player_id'], Counter())[l['number']] += 1
        for k in ('played', 'started', 'minutes', 'goals', 'penalty_goals', 'yellow', 'second_yellow', 'red'):
            c[k] += int(l[k] or 0)
        c['sub_apps'] += 1 if l['played'] == '1' and l['started'] == '0' else 0
        c['subbed_off'] += 1 if l['sub_off'] else 0
        c['bench_unused'] += 1 if l['played'] == '0' else 0
    rows, careers = [], []
    season_tag = label(start)
    gk_conceded = conceded_by_keeper(lineups, goals, {p for p, r in bdf_rows.items() if r['bdf_pos'] == 'GK'})
    # goals in cup ties that only Wikipedia has (scorers already mapped to squad ids in build)
    lineup_comps = {l['competition'] for l in lineups}
    wiki_goals = Counter((g['competition'], g['player_id']) for g in goals
                         if g['for_club'] == '1' and not g['own_goal'] and g['competition'] not in lineup_comps)
    for i, pid in enumerate(pids):
        if not pid: continue
        pid = str(pid)
        ppath = os.path.join(raw, 'bdfutbol', 'players', f'{pid}.html')
        bio, career = parse_player_page(ppath) if os.path.exists(ppath) else ({}, [])
        br = bdf_rows.get(pid, {})
        short = br.get('player', '')
        t = tm_match(tm, short, bio.get('full_name', ''))
        row = dict(player_id=pid, player=short, full_name=bio.get('full_name', ''),
                   shirt=(shirt.get(pid) or Counter({'': 1})).most_common(1)[0][0],
                   position=br.get('bdf_pos', ''), position_detail=t.get('tm_position', '') or bio.get('position', ''),
                   birth_date=bio.get('birth_date', ''),
                   age_at_season_start=age_on(bio.get('birth_date', ''), dt.date(start, 9, 1)),
                   birth_place=bio.get('birth_place', ''), birth_country=bio.get('birth_country', ''),
                   nationality=bio.get('nationality', '') or bio.get('birth_country', ''), height_cm=bio.get('height_cm', ''), weight_kg=bio.get('weight_kg', ''),
                   # Transfermarkt shows the player's latest spell at the club; a later one says nothing about this season
                   foot=t.get('foot', ''), **({} if t.get('joined', '') > f'{start + 1}-06-30' else
                                             dict(joined=t.get('joined', ''), signed_from=t.get('signed_from', ''))),
                   **({'joined': '', 'signed_from': ''} if t.get('joined', '') > f'{start + 1}-06-30' else {}),
                   status=br.get('status', ''), academy=br.get('academy', ''), international=br.get('international', ''),
                   transfermarkt_id=t.get('tm_id', ''))
        tot = Counter()
        for comp in comps:
            key = 'league' if comp == league else COMP_KEY.get(comp, slug(comp))
            if comp not in lineup_comps:  # Wikipedia-only cups: goals only
                row[f'{key}_goals'] = wiki_goals.get((comp, pid), 0)
                continue
            c = agg[pid][comp]; tot.update(c)
            for k in ('played', 'started', 'sub_apps', 'minutes', 'goals', 'yellow', 'red'):
                row[f'{key}_{k}'] = c[k]
        for k in ('played', 'started', 'sub_apps', 'minutes', 'goals', 'penalty_goals', 'yellow', 'second_yellow', 'red', 'bench_unused'):
            row[f'all_{k}'] = tot[k]
        row['all_goals'] += sum(v for (c, p), v in wiki_goals.items() if p == pid)  # every competition
        row['all_goals_conceded'] = gk_conceded.get(pid, 0) if row['position'] == 'GK' else ''
        row['minutes_per_goal'] = round(tot['minutes'] / tot['goals']) if tot['goals'] else ''
        row['prev_club'] = neighbour_club(career, season_tag, -1)
        row['next_club'] = neighbour_club(career, season_tag, +1)
        rows.append(row)
        for c in career:
            careers.append(dict(player_id=pid, player=short,
                                this_season='1' if c['season'] == season_tag and c['club'] == me else '', **c))
    rows.sort(key=lambda r: (-r['all_minutes'], r['player']))
    return rows, careers

def squad_name_index(raw, team_html):
    """{short name: BDFutbol id} for the squad, plus '_full': {full name: short name}."""
    rows = squad_rows(team_html)
    idx = {r['player']: pid for pid, r in rows.items()}
    full = {}
    for pid, r in rows.items():
        pp = os.path.join(raw, 'bdfutbol', 'players', f'{pid}.html')
        if os.path.exists(pp): full[parse_player_page(pp)[0].get('full_name', '')] = r['player']
    idx['_full'] = full
    return idx

def match_name(name, names, full=None):
    """Wikipedia's scorer (link target or display name) → the squad's short name: exact, all words inside a short or
    full name, then surname. Unmatched names come back unchanged."""
    if name in names: return name
    k = slug(name).split('-')
    for n in names:
        if n != '_full' and set(k) <= set(slug(n).split('-')): return n
    for f, n in (full or {}).items():
        if f and set(k) <= set(slug(f).split('-')): return n
    for n in names:
        if n != '_full' and slug(n).split('-')[-1] == k[-1]: return n
    return name

def neighbour_club(career, season, step):
    """Club of the season before / after (most minutes if several), from the player's BDFutbol career table."""
    start = int(season[:4])
    for k in range(1, 4):
        y = start + step * k
        rows = [c for c in career if c['season'][:4] == str(y) and c['club']]
        if rows:
            best = max(rows, key=lambda c: (c['minutes'] or 0, c['division'] == '1ª'))
            return best['club'] + (f" ({best['division']})" if best['division'] and best['division'] != '1ª' else '')
    return ''

def tm_match(tm, short, full):
    for nm, v in tm.items():
        a, b = slug(nm), slug(short)
        if a == b or (full and a in slug(full)) or (b and b in a.split('-')):
            return v
    return {}

BDF_DOTS = {'dot-alta': 'signed', 'dot-durant': 'signed mid-season', 'dot-baixa': 'left mid-season',
            'dot-filial-puja': 'promoted from reserves', 'dot-internacional1': 'international'}
BDF_POS = {'por': 'GK', 'ltd': 'RB', 'lti': 'LB', 'cen': 'CB', 'mig': 'MF', 'dav': 'FW', 'dac': 'FW'}

def squad_rows(team_html):
    """BDFutbol's squad table → {player_id: {player, bdf_pos, status, academy, international}}."""
    seg = team_html[team_html.find('taulaplantilla'):]
    seg = seg[:seg.find('Players from the youth team')]
    out = {}
    for row in re.findall(r'<tr[^>]*>(.*?)</tr>', seg, re.S):
        pid = re.search(r"href='\.\./j/j(\d+)\.html'", row)
        if not pid or pid.group(1) in out: continue
        name = re.search(r"<span class='font-weight-bold[^']*'>(.*?)</span>", row)
        dots = re.findall(r"class='dot (dot-[\w-]+)'", row)
        pos = re.search(r'<div class="fit (\w+)"></div>', row)
        out[pid.group(1)] = dict(player=text(name.group(1)) if name else '', bdf_pos=BDF_POS.get(pos.group(1), '') if pos else '',
                                 status='; '.join(BDF_DOTS[d] for d in dots if d in BDF_DOTS and d != 'dot-internacional1'),
                                 academy='1' if 'filial' in row else '', international='1' if 'dot-internacional1' in dots else '')
    return out

def age_on(birth, day):
    if not birth: return ''
    b = dt.date.fromisoformat(birth)
    return day.year - b.year - ((day.month, day.day) < (b.month, b.day))

def conceded_by_keeper(lineups, goals, keepers):
    """Goals conceded while each keeper was on the pitch (own goals for the opponent count too)."""
    conceded = Counter()
    by_match = defaultdict(list)
    for l in lineups: by_match[l['match_no']].append(l)
    for rows in by_match.values():
        against = [g for g in goals if g['match_no'] == rows[0]['match_no'] and g['for_club'] == '0']
        for l in rows:
            if l['for_club'] != '1' or l['player_id'] not in keepers or l['played'] != '1': continue
            on = int(l['sub_on'] or 0); off = int(l['sub_off'] or l['sent_off_min'].split(' ')[0] or 999)
            conceded[l['player_id']] += sum(1 for g in against if on <= int(g['minute'] or 0) <= off)
    return conceded

def squad_checks(team_html, squad):
    js = bdf_squad_json(team_html)
    pids = [str(p) for p in js['COD'][0]['data']]
    want = {}
    tips = {None: 'league', 'UEF': 'uefa', 'COP': 'copa', 'CHA': 'ucl', 'SHI': 'shield', 'SUP': 'supercopa'}
    for x in js['PJ']:
        key, comp = x.get('tip'), tips.get(x.get('tip'), str(x.get('tip')).lower())
        for field, mine in (('PJ', 'played'), ('M', 'minutes'), ('G', 'goals')):
            arr = next(y['data'] for y in js[field] if y.get('tip') == key)
            for pid, v in zip(pids, arr): want[(pid, f'{comp}_{mine}')] = v
    diffs = []
    for r in squad:
        for (pid, k), v in want.items():
            if pid == r['player_id'] and int(r.get(k, 0) or 0) != int(v or 0):
                diffs.append(f"{r['player']} {k}: lineups {r.get(k)} vs BDFutbol {v}")
    return dict(squad_vs_bdfutbol_diffs=diffs)

def month_table(matches, lineups, goals, league):
    out = []
    for month in sorted({m['month'] for m in matches}):
        ms = [m for m in matches if m['month'] == month]
        lg = [m for m in ms if m['competition'] == league]
        sc = Counter(g['player'] for g in goals if g['for_club'] == '1' and g['date'][:7] == month and not g['own_goal'])
        last = [m for m in lg if m['league_pos_after'] != '']
        out.append(dict(month=month, matches=len(ms), won=sum(m['result'] == 'W' for m in ms),
                        drawn=sum(m['result'] == 'D' for m in ms), lost=sum(m['result'] == 'L' for m in ms),
                        gf=sum(m['gf'] for m in ms), ga=sum(m['ga'] for m in ms),
                        league_matches=len(lg), league_points=sum(m['points'] for m in lg),
                        league_points_possible=3 * len(lg),
                        league_pos_end=last[-1]['league_pos_after'] if last else '',
                        league_pts_behind_leader_end=last[-1]['pts_behind_leader_after'] if last else '',
                        top_scorer='; '.join(f'{p} {n}' for p, n in sc.most_common(3)),
                        competitions='; '.join(dict.fromkeys(m['competition'] for m in ms))))
    return out

def player_months(lineups, me):
    agg = defaultdict(Counter)
    for l in lineups:
        if l['for_club'] != '1' or l['played'] != '1': continue
        k = (l['date'][:7], l['player_id'], l['player'])
        agg[k]['apps'] += 1; agg[k]['starts'] += int(l['started']); agg[k]['minutes'] += int(l['minutes'])
        agg[k]['goals'] += int(l['goals']); agg[k]['yellow'] += int(l['yellow']); agg[k]['red'] += int(l['red'])
    return [dict(month=m, player_id=p, player=n, **{k: c[k] for k in ('apps', 'starts', 'minutes', 'goals', 'yellow', 'red')})
            for (m, p, n), c in sorted(agg.items())]

def fee_eur(fee):
    m = re.search(r'€\s*([\d.]+)\s*M', fee or '')
    return m.group(1) if m else ''

def table_cells(row):
    """One wikitable row → cell texts (newline or ||-separated, header cells too, attributes dropped)."""
    cells = []
    for line in row.split('\n'):
        line = line.strip()
        if not line or line[0] not in '|!' or line.startswith(('|}', '|-', '|+')): continue
        for c in re.split(r'\|\||!!', line[1:]):
            c = re.sub(r'^\s*(?:[\w-]+=(?:"[^"]*"|[^\s|\[{]+)\s*)+\|(?!\|)', '', c)
            cells.append(c.strip())
    return cells

def fee_gbp(fee):
    m = re.search(r'£\s*([\d.,]+)\s*(m|million)?', fee or '', re.I)
    if not m: return ''
    v = float(m.group(1).replace(',', ''))
    return round(v if m.group(2) else v / 1e6, 2)

def transfer_tables(wt, start):
    """Transfer wikitables (English club pages): a Player/Name column and a From or To column."""
    out = []
    for t in re.finditer(r'\{\|.*?\n\|\}', wt, re.S):
        tab = t.group(0)
        hdr = [wiki_plain(h).lower() for h in table_cells(tab.split('|-')[0] + '\n' + (tab.split('|-')[1] if tab.split('|-')[0].count('!') < 2 else ''))]
        hdr = [h for h in hdr if h] or hdr
        pcol = next((i for i, h in enumerate(hdr) if 'player' in h or h == 'name'), None)
        fcol = next((i for i, h in enumerate(hdr) if h in ('from', 'transferred from')), None)
        tcol = next((i for i, h in enumerate(hdr) if h in ('to', 'transferred to')), None)
        if pcol is None or (fcol is None and tcol is None): continue
        before = wiki_plain(wt[max(0, t.start() - 400):t.start()]).lower()
        loan = 'loan' in before[-120:]
        direction = 'in' if fcol is not None else 'out'
        col = lambda key: next((i for i, h in enumerate(hdr) if key in h), None)
        for row in re.split(r'\n\|-+[^\n]*', tab)[1:]:
            c = table_cells(row)
            if len(c) <= max(pcol, fcol or tcol) or wiki_plain(c[pcol]).strip().lower() in ('player', 'name'): continue
            d = wiki_date(c[col('date')]) if col('date') is not None and col('date') < len(c) else None
            fee = wiki_plain(re.sub(r'\{\{#tag:ref.*?\}\}', '', c[col('fee')])).strip() if col('fee') is not None and col('fee') < len(c) else ''
            ref = re.search(r'url\s*=\s*([^|}\s]+)', row)
            window = '' if not d else 'summer' if d.month in (5, 6, 7, 8, 9) else 'winter' if d.month in (12, 1, 2) else 'in-season'
            out.append(dict(direction=direction, window=window, date=d.isoformat() if d else '',
                            player=wiki_plain(c[pcol]).strip(), position=wiki_plain(c[col('pos')]) if col('pos') is not None else '',
                            nationality=(re.search(r'\{\{flagicon\|(\w+)', c[pcol]) or [None, ''])[1], age='',
                            other_club=wiki_plain(c[fcol if direction == 'in' else tcol]).strip(), other_club_country='',
                            type='Loan' if loan or re.search(r'loan', fee, re.I) else 'Transfer', fee=fee,
                            fee_eur_m=fee_eur(fee), fee_gbp_m=fee_gbp(fee), source_url=ref.group(1) if ref else ''))
    return out

def transfers(wt, start):
    out = transfer_tables(wt, start)
    for name, direction in (('fb in2 player', 'in'), ('fb out2 player', 'out')):
        for b in templates(wt, name):
            a = wiki_template_args(b)
            ref = re.search(r'url\s*=\s*([^|}\s]+)', a.get('os', '') + b)
            age = re.search(r'\{\{age\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\}\}', a.get('age', ''))
            out.append(dict(direction=direction, window={'S': 'summer', 'W': 'winter'}.get(a.get('w', ''), a.get('w', '')),
                            player=wiki_plain(a.get('p', '')), position=a.get('pos', ''), nationality=a.get('nb', ''),
                            age=age_on(f'{age[1]}-{int(age[2]):02d}-{int(age[3]):02d}',
                                       dt.date(int(age[4]), int(age[5]), int(age[6]))) if age else '',
                            other_club=wiki_plain(a.get('fcl' if direction == 'in' else 'ncl', '')),
                            other_club_country=a.get('fcnat' if direction == 'in' else 'ncnat', ''),
                            type=wiki_plain(re.sub(r'\{\{[ynp]\}\}|\{\{arrow\}\}', '', a.get('type', ''))).strip(),
                            date='', fee=a.get('f', ''), fee_eur_m=fee_eur(a.get('f', '')), fee_gbp_m='',
                            source_url=ref.group(1) if ref else ''))
    return out

def elo_table(raw, cfg, start, cid):
    out = []
    lo, hi = dt.date(start, 6, 1), dt.date(start + 1, 6, 30)
    for club in [cfg['clubelo']] + cfg['elo_rivals']:
        p = os.path.join(raw, 'clubelo', f'{club}.csv')
        if not os.path.exists(p) or os.path.getsize(p) < 50: continue
        for r in read_csv(p):
            a, b = dt.date.fromisoformat(r['From']), dt.date.fromisoformat(r['To'])
            if b < lo or a > hi: continue
            out.append(dict(date=max(a, lo).isoformat(), club_id=cid(r['Club']), club=r['Club'],
                            elo=round(float(r['Elo']), 1), rank=r['Rank']))
    return out

def friendlies(wt, me):
    """Friendlies: match boxes / results tables under a pre-season or friendlies heading, else the Barça-style
    'Results' table (date, competition, opponent, venue, score)."""
    out = []
    for r in wiki_rows(wt, me):
        if r['competition'] != 'Friendly' or not (r['me_home'] or r['me_away']): continue
        venue = 'N' if r.get('neutral') else 'H' if r['me_home'] else 'A'
        gf, ga = (r['hg'], r['ag']) if r['me_home'] else (r['ag'], r['hg'])
        pens = r['penalties']
        res = 'W' if gf > ga else 'L' if gf < ga else 'D'
        out.append(dict(date=r['date'].isoformat(), month=r['date'].strftime('%Y-%m'), competition=r['round'] or 'Friendly',
                        opponent=r['away'] if r['me_home'] else r['home'], venue=venue, score=f"{r['hg']}–{r['ag']}",
                        gf=gf, ga=ga, result=res, penalties=pens))
    if out: return out
    i = wt.find('== Results ==')
    seg = wt[i:wt.find('|}', i)] if i >= 0 else ''
    for cell in seg.split('|-')[2:]:
        c = [wiki_plain(x).strip() for x in cell.strip().split('\n') if x.startswith('|')]
        c = [x.lstrip('|').strip() for x in c]
        if len(c) < 5: continue
        d = dt.datetime.strptime(c[0], '%d %B %Y').date()
        m = re.match(r'(\d+)–(\d+)(?:\s*\((\d+)–(\d+)p\))?', c[4])
        venue = c[3]
        a, b = int(m.group(1)), int(m.group(2))
        # Wikipedia writes the score home–away (checked: Man City 2–1 at their stadium opening, Porto 2–0 at the
        # Dragão opening). At a neutral venue the order isn't certain, so no result is derived there.
        pens = f'{m.group(3)}–{m.group(4)}' if m.group(3) else ''
        if venue == 'N':
            gf = ga = res = ''
        else:
            gf, ga = (b, a) if venue == 'A' else (a, b)
            if pens and venue == 'A': pens = f'{m.group(4)}–{m.group(3)}'
            res = 'W' if gf > ga else 'L' if gf < ga else ('D' + (' (won pens)' if pens and int(pens[0]) > int(pens[-1]) else
                                                               ' (lost pens)' if pens else ''))
        out.append(dict(date=d.isoformat(), month=d.strftime('%Y-%m'), competition=c[1], opponent=c[2], venue=venue,
                        score=c[4], gf=gf, ga=ga, result=res, penalties=pens))
    return out

def norm(s):
    return re.sub(r'\s+', ' ', wiki_plain(s).replace('&nbsp;', ' ')).strip()

def timeline(raw, out, matches, goals, lineups, squad, tables, tf, me, me_id, start, cfg, season_page):
    """club_events.csv (hand file, committed next to the pack) + events computed from the data."""
    ev = []
    hand = os.path.join(out, 'club_events.csv')
    pages = {}
    for r in (read_csv(hand) if os.path.exists(hand) else []):
        page = r['source']
        if page not in pages: pages[page] = norm(wikitext(raw, page))
        quote = norm(r['evidence'])
        if quote and quote not in pages[page]:
            print(f"  ! quote not found on '{page}': {r['evidence'][:80]}")
            r['evidence'] = '[NOT FOUND ON PAGE] ' + r['evidence']
        if not r.get('match_no'):  # a dated event on a match day links to that match
            m = next((m for m in matches if m['date'] == r['date'] and r['date_precision'] == 'day'), None)
            if m: r['match_no'] = m['match_no']
        ev.append(dict(r, month=r['date'][:7]))
    league = cfg['league']
    lg = [m for m in matches if m['competition'] == league]
    page_url = 'https://en.wikipedia.org/wiki/' + season_page.replace(' ', '_')
    def add(m, kind, imp, title, detail='', people=''):
        bdf = m['source'] == 'BDFutbol'
        ev.append(dict(date=m['date'], date_precision='day', month=m['date'][:7], kind=kind, importance=imp, title=title,
                       detail=detail, people=people, competition=m['competition'], match_no=m['match_no'],
                       source='BDFutbol match' if bdf else season_page,
                       source_url=f"https://www.bdfutbol.com/en/p/p.php?id={m['bdf_match_id']}" if bdf else page_url, evidence=''))
    score = lambda m: f"{m['home']} {m['hg']}–{m['ag']} {m['away']}" + (f" ({m['penalties']} pens)" if m['penalties'] else '')
    add(matches[0], 'match', 2, f"First match: {score(matches[0])}", f"Scorers: {matches[0]['scorers_for']}")
    add(matches[-1], 'match', 2, f"Last match: {score(matches[-1])}",
        f"Final league position {lg[-1]['league_pos_after']}, {lg[-1]['league_pts_after']} pts")
    # each club's league position low and the turn
    mine = [t for t in tables if t['team_id'] == me_id]
    settled = [t for t in mine if t['round'] > len(mine) // 6]  # the first rounds' order is mostly alphabetical noise
    low = max(settled, key=lambda t: (t['pos'], t['round']))
    m_low = next(m for m in lg if int(m['round']) == low['round'])
    if low['pos'] - mine[-1]['pos'] >= 3:  # only a real dip: for a team top all season it isn't a story
        add(m_low, 'milestone', 3, f"Low point: {low['pos']}th after round {low['round']}",
            f"{score(m_low)}; {low['pts_behind_leader']} pts behind the leader, "
            f"{low['pts_above_relegation']} above the relegation places")
    # big games (rivals from TEAMS), biggest wins / defeats, how each cup ended
    rivals = cfg.get('rivals', {})
    for m in matches:
        if m['opponent_id'] in rivals:
            label_ = rivals[m['opponent_id']]
            add(m, 'match', 3 if label_ != 'Big game' or m['competition'] != league else 2,
                f"{label_ + ': ' if label_ != 'Big game' else ''}{score(m)}",
                f"{m['competition']} {m['round']}. For: {m['scorers_for'] or '—'}; against: {m['scorers_against'] or '—'}")
        elif m['gf'] - m['ga'] >= 4 or m['ga'] - m['gf'] >= 3:
            add(m, 'match', 2, ('Big win: ' if m['gf'] > m['ga'] else 'Heavy defeat: ') + score(m), f"{m['competition']} {m['round']}")
    for comp in dict.fromkeys(m['competition'] for m in matches if m['competition'] != league):
        last = [m for m in matches if m['competition'] == comp][-1]
        is_final = re.fullmatch(r'(?i)final', last['round'].strip()) or comp == 'Community Shield'
        pk = [int(x) for x in re.findall(r'\d+', last['penalties'])]
        mine_first = last['home'] == me
        won = last['result'] == 'W' or (last['result'] == 'D' and len(pk) == 2 and
                                        (pk[0] > pk[1] if mine_first else pk[1] > pk[0]))
        if is_final and won: title = f"Wins the {comp}: {score(last)}"
        elif is_final: title = f"Loses the {comp} final: {score(last)}"
        else: title = f"Out of the {comp}: {score(last)}"
        add(last, 'match', 3 if is_final and won else 2, title,
            f"{last['round']}" + (f"; aggregate {last['aggregate']}" if last['aggregate'] else ''))
    # streaks
    run, best = [], []
    for m in lg:
        run = run + [m] if m['result'] != 'L' else []
        if len(run) > len(best): best = run
    if best:
        add(best[0], 'milestone', 3 if len(best) >= 10 else 2, f"Unbeaten league run begins ({len(best)} matches)",
            f"From round {best[0]['round']} to round {best[-1]['round']} ({best[-1]['date']})")
    run, best = [], []
    for m in lg:
        run = run + [m] if m['result'] == 'W' else []
        if len(run) > len(best): best = run
    if best:
        add(best[0], 'milestone', 2, f"Longest league winning run begins ({len(best)} wins)",
            f"From round {best[0]['round']} to round {best[-1]['round']} ({best[-1]['date']})")
    # debuts and first goals of the players the season is about (new signings, academy, mid-season arrivals)
    first_app, first_goal = {}, {}
    for l in lineups:
        if l['for_club'] == '1' and l['played'] == '1': first_app.setdefault(l['player_id'], l)
    for g in goals:
        if g['for_club'] == '1' and not g['own_goal']: first_goal.setdefault(g['player_id'], g)
    by_no = {m['match_no']: m for m in matches}
    for r in squad:
        new = r['status'] or r['academy']
        if not new or r['player_id'] not in first_app: continue
        l = first_app[r['player_id']]
        why = r['status'] or 'academy'
        add(by_no[l['match_no']], 'debut', 2 if r['all_minutes'] > 1500 else 1,
            f"Competitive debut: {r['player']} ({why})", f"{'started' if l['started'] == '1' else 'came on ' + l['sub_on'] + chr(39)} v {by_no[l['match_no']]['opponent']}", r['player'])
        if r['player_id'] in first_goal:
            g = first_goal[r['player_id']]
            add(by_no[g['match_no']], 'goal', 2 if r['all_goals'] >= 5 else 1, f"First goal: {r['player']}",
                f"{g['minute']}' v {g['opponent']}", r['player'])
    for l in lineups:
        if l['for_club'] == '1' and (l['red'] != '0' or l['second_yellow'] != '0'):
            add(by_no[l['match_no']], 'discipline', 1, f"Sent off: {l['player']}", f"{l['sent_off_min']}' v {by_no[l['match_no']]['opponent']}", l['player'])
    # transfers with a known window but no exact date → month precision
    for t in tf:
        if t['window'] == 'winter':
            d = t.get('date') or f'{start + 1}-01-01'
            ev.append(dict(date=d, date_precision='day' if t.get('date') else 'window', month=d[:7], kind='transfer',
                           importance=2 if t['fee_eur_m'] or t['type'].startswith('Loan') else 1,
                           title=f"{'Arrives' if t['direction'] == 'in' else 'Leaves'}: {t['player']} ({t['type']})",
                           detail=f"{'from' if t['direction'] == 'in' else 'to'} {t['other_club']}; fee {t['fee']}", people=t['player'],
                           competition='', match_no='', source=season_page,
                           source_url=t['source_url'], evidence=''))
    ev.sort(key=lambda e: (e['date'], -int(e['importance'] or 0)))
    return ev

def key_numbers(summary):
    """summary.json flattened to metric / value rows; metric is the dotted path (records.La Liga.won)."""
    rows = []
    def walk(path, v):
        if isinstance(v, dict):
            for k, x in v.items(): walk(f'{path}.{k}' if path else k, x)
        elif isinstance(v, list) and v and isinstance(v[0], dict):
            for i, x in enumerate(v, 1): walk(f'{path}.{i}', x)
        elif isinstance(v, list) and v and isinstance(v[0], (list, tuple)):
            for x in v: rows.append(dict(metric=f'{path}.{x[0]}', value=x[1]))
        elif isinstance(v, list):
            rows.append(dict(metric=path, value=' '.join(map(str, v))))
        else:
            rows.append(dict(metric=path, value=v))
    walk('', {k: v for k, v in summary.items() if k != 'checks'})
    return rows

# ---------------------------------------------------------------- summary
def streaks(seq, ok):
    best, cur, best_span, cur_start = 0, 0, None, None
    for i, m in enumerate(seq):
        if ok(m):
            cur += 1; cur_start = i if cur == 1 else cur_start
            if cur > best: best, best_span = cur, (seq[cur_start]['date'], m['date'])
        else: cur = 0
    return dict(length=best, from_=best_span[0] if best_span else '', to=best_span[1] if best_span else '')

def record(ms):
    return dict(played=len(ms), won=sum(m['result'] == 'W' for m in ms), drawn=sum(m['result'] == 'D' for m in ms),
                lost=sum(m['result'] == 'L' for m in ms), gf=sum(m['gf'] for m in ms), ga=sum(m['ga'] for m in ms),
                clean_sheets=sum(m['ga'] == 0 for m in ms), failed_to_score=sum(m['gf'] == 0 for m in ms))

def bdf_managers(team_html):
    seg = team_html[team_html.find('taulaentrenadors'):team_html.find('taulaplantilla')]
    return [text(n) for n in re.findall(r"<span class=[\"']font-weight-bold[^\"']*[\"']>(.*?)</span>", seg)]

def summarise(matches, goals, lineups, squad, tables, me_id, me, cfg, start, team_html, comps):
    league = cfg['league']
    lg = [m for m in matches if m['competition'] == league]
    n = max(t['round'] for t in tables); h = n // 2
    mine = [t for t in tables if t['team_id'] == me_id]
    low = max((t for t in mine if t['round'] > len(mine) // 6), key=lambda t: (t['pos'], t['round']))
    half = lambda a, b: [m for m in lg if a <= int(m['round']) <= b]
    # table of the second half of the season for every club
    r19 = {t['team_id']: t for t in tables if t['round'] == h}
    r38 = {t['team_id']: t for t in tables if t['round'] == n}
    second_half = sorted(({'team': r38[k]['team'], 'pts': r38[k]['pts'] - r19[k]['pts'],
                           'gd': r38[k]['gd'] - r19[k]['gd']} for k in r38), key=lambda x: (-x['pts'], -x['gd']))
    by_comp = {c: record([m for m in matches if m['competition'] == c]) for c in comps}
    big_win = max(matches, key=lambda m: (m['gf'] - m['ga'], m['gf']))
    big_loss = min(matches, key=lambda m: (m['gf'] - m['ga'], -m['ga']))
    scorers = Counter(g['player'] for g in goals if g['for_club'] == '1' and not g['own_goal'])
    # 15-minute bands of normal time; stoppage time counts in its half's last band, extra time is left out
    minute_buckets = Counter(min((int(g['minute']) - 1) // 15, 5) for g in goals if g['period'] in ('1H', '2H') and g['for_club'] == '1')
    conceded_buckets = Counter(min((int(g['minute']) - 1) // 15, 5) for g in goals if g['period'] in ('1H', '2H') and g['for_club'] == '0')
    span = ['1-15', '16-30', '31-45', '46-60', '61-75', '76-90']
    return dict(
        team=cfg['name'], season=label(start), competition=league, manager=' / '.join(bdf_managers(team_html)),
        records=dict(all=record(matches), **by_comp,
                     league_home=record([m for m in lg if m['venue'] == 'H']), league_away=record([m for m in lg if m['venue'] == 'A'])),
        league=dict(final_pos=mine[-1]['pos'], points=mine[-1]['pts'],
                    champion=next(t['team'] for t in tables if t['round'] == n and t['pos'] == 1),
                    pts_behind_champion=mine[-1]['pts_behind_leader'],
                    low_point=dict(round=low['round'], pos=low['pos'], pts=low['pts'],
                                   date=next((m['date'] for m in lg if int(m['round']) == low['round']), low['date_to']),
                                   pts_behind_leader=low['pts_behind_leader'], pts_above_relegation=low['pts_above_relegation']),
                    first_half=dict(rounds=f'1-{h}', points=sum(m['points'] for m in half(1, h)), pos_after=r19[me_id]['pos']),
                    second_half=dict(rounds=f'{h + 1}-{n}', points=sum(m['points'] for m in half(h + 1, n)),
                                                  rank_in_second_half_table=next(i for i, x in enumerate(second_half, 1) if x['team'] == me)),
                    second_half_table=second_half[:6],
                    position_by_round=[t['pos'] for t in mine]),
        streaks=dict(unbeaten_league=streaks(lg, lambda m: m['result'] != 'L'), wins_league=streaks(lg, lambda m: m['result'] == 'W'),
                     unbeaten_all=streaks(matches, lambda m: m['result'] != 'L'), winless_league=streaks(lg, lambda m: m['result'] != 'W')),
        biggest_win={k: big_win[k] for k in ('date', 'competition', 'opponent', 'venue', 'gf', 'ga')},
        heaviest_defeat={k: big_loss[k] for k in ('date', 'competition', 'opponent', 'venue', 'gf', 'ga')},
        top_scorers_all=scorers.most_common(8),
        goals_by_15_min={'for': {span[k]: v for k, v in sorted(minute_buckets.items())},
                         'against': {span[k]: v for k, v in sorted(conceded_buckets.items())}},
        players_used=sum(1 for r in squad if r['all_played']),
        big_games=[dict(label=cfg.get('rivals', {})[m['opponent_id']], opponent=m['opponent'],
                        **{k: m[k] for k in ('date', 'competition', 'venue', 'gf', 'ga', 'penalties', 'scorers_for', 'scorers_against')})
                   for m in matches if m['opponent_id'] in cfg.get('rivals', {})],
    )
