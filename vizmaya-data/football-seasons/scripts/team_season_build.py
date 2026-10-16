"""Build stage of scripts/team_season.py — cached raw pages → teams/<team>/<season>/ (see that folder's README)."""
import csv, html, json, os, re, unicodedata, datetime as dt
from collections import Counter, defaultdict

from team_season import (ROOT, TEAMS, raw_dir, out_dir, label, dash, text, write_csv, parse_match, bdf_match_ids,
                         bdf_squad_json, COMP_LABEL)

def read_csv(path):
    with open(path, newline='', encoding='utf-8-sig') as f: return list(csv.DictReader(f))

def wikitext(raw, title):
    p = os.path.join(raw, 'wikipedia', title.replace('/', '_') + '.json')
    return json.load(open(p, encoding='utf-8'))['parse']['wikitext'] if os.path.exists(p) else ''

# ---------------------------------------------------------------- crosswalk
# BDFutbol club names → crosswalk canonical_id (data/teams.csv); clubs outside the crosswalk get a slug.
BDF_ALIASES = {'Málaga': 'Malaga', 'Brøndby': 'Brondby', 'Athletic Club': 'Ath Bilbao', 'Deportivo de La Coruña': 'La Coruna', 'Atlético de Madrid': 'Ath Madrid',
               'Celta de Vigo': 'Celta', 'Racing de Santander': 'Santander', 'Real Sociedad': 'Sociedad',
               'Espanyol': 'Espanol', 'Real Madrid': 'Real Madrid'}

def slug(s):
    s = unicodedata.normalize('NFKD', s.replace('ø', 'o').replace('Ø', 'O')).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')

def crosswalk():
    rows = read_csv(os.path.join(ROOT, 'data', 'teams.csv'))
    by_fd = {}
    for r in rows:
        for n in (r['football_data_name'] + ' | ' + r['engsoccerdata_name'] + ' | ' + r['canonical_name']).split(' | '):
            if n.strip(): by_fd.setdefault(n.strip(), r['canonical_id'])
    def cid(bdf_name):
        n = BDF_ALIASES.get(bdf_name, bdf_name)
        return by_fd.get(n) or by_fd.get(bdf_name) or slug(bdf_name)
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
    for i, ch in enumerate(block):
        if ch in '[{': depth += 1
        if ch in ']}': depth -= 1
        if ch == '|' and depth == 2: parts.append(cur); cur = ''
        else: cur += ch
    parts.append(cur)
    out, pos = {}, 0
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
def build(team, start):
    cfg, raw, out = TEAMS[team], raw_dir(team, start), out_dir(team, start)
    os.makedirs(out, exist_ok=True)
    cid = crosswalk()
    me = cfg['bdf_name']
    team_html = open(os.path.join(raw, 'bdfutbol', 'team.html'), encoding='utf-8').read()
    ids = bdf_match_ids(team_html)
    comp_of = {mid: COMP_LABEL[c] for c in ('lig', 'uef', 'cop') for mid in ids[c]}

    # ---- league: every match, BDFutbol round, plus football-data extras
    league_rows = league_matches(raw, cid)
    fd = football_data(raw)
    for r in league_rows:
        x = fd.get((r['date'], r['home_fd'], r['away_fd'])) or fd.get((r['date'], r['home'], r['away']))
        if x and int(x['FTHG']) == r['hg'] and int(x['FTAG']) == r['ag']:
            r.update(ht=f"{x['HTHG']}-{x['HTAG']}", b365_home=x.get('B365H', ''), b365_draw=x.get('B365D', ''),
                     b365_away=x.get('B365A', ''), fd_matched='1')
    unmatched_fd = [r for r in league_rows if not r.get('fd_matched')]
    write_csv(os.path.join(out, 'league_matches.csv'),
              ['round', 'date', 'home_id', 'home', 'away_id', 'away', 'hg', 'ag', 'ht', 'home_yellow', 'away_yellow',
               'home_red', 'away_red', 'stadium', 'referee',
               'b365_home', 'b365_draw', 'b365_away', 'bdf_match_id'], league_rows)
    tables = league_tables(raw, league_rows, cid)
    write_csv(os.path.join(out, 'league_table_by_round.csv'),
              ['round', 'date_to', 'pos', 'team_id', 'team', 'played', 'won', 'drawn', 'lost', 'gf', 'ga', 'gd', 'pts',
               'pts_adjustment', 'pts_behind_leader', 'pts_above_relegation'], tables)
    by_round = {(t['round'], t['team_id']): t for t in tables}
    me_id = cid(me)
    final = [t for t in tables if t['round'] == 38]
    final_pos = {t['team_id']: t['pos'] for t in final}
    write_csv(os.path.join(out, 'league_table_final.csv'),
              ['pos', 'team_id', 'team', 'played', 'won', 'drawn', 'lost', 'gf', 'ga', 'gd', 'pts', 'pts_adjustment'], final)

    # ---- the club's competitive matches (BDFutbol pages) + Wikipedia cup extras (attendance)
    wt = wikitext(raw, cfg['wiki_season'].format(dash=dash(start)))
    wiki_boxes = wiki_match_boxes(wt)
    league_by_id = {r['bdf_match_id']: r for r in league_rows}
    matches, goals, lineups = [], [], []
    for n, mid in enumerate(ids['tot'], 1):
        m = parse_match(open(os.path.join(raw, 'bdfutbol', 'matches', f'{mid}.html'), encoding='utf-8').read())
        home = m['home'] == me
        side, opp_side = ('home', 'away') if home else ('away', 'home')
        opp = m['away'] if home else m['home']
        gf, ga = (m['hg'], m['ag']) if home else (m['ag'], m['hg'])
        comp = comp_of[mid]
        lr = league_by_id.get(mid, {})
        rnd = round_label(comp, m['round'])
        wb = wiki_boxes.get(m['date'].isoformat(), {})
        b365 = {'home': lr.get('b365_home', ''), 'draw': lr.get('b365_draw', ''), 'away': lr.get('b365_away', '')}
        p_win = implied_win(b365, side)
        tr = by_round.get((int(re.sub(r'\D', '', m['round']) or 0), me_id)) if comp == 'La Liga' else None
        scorers = lambda s: '; '.join(f"{g['player']} {g['minute']}'" + (' (pen)' if g['penalty'] else '') + (' (og)' if g['own_goal'] else '')
                                      for g in m['goals'] if g['side'] == s)
        managers = m['managers']
        row = dict(match_no=n, date=m['date'].isoformat(), weekday=m['date'].strftime('%a'), month=m['date'].strftime('%Y-%m'),
                   competition=comp, round=rnd, venue='H' if home else 'A', opponent=opp, opponent_id=cid(opp),
                   opponent_final_pos=final_pos.get(cid(opp), '') if comp == 'La Liga' else '',
                   home=m['home'], away=m['away'], hg=m['hg'], ag=m['ag'], gf=gf, ga=ga,
                   result='W' if gf > ga else 'D' if gf == ga else 'L',
                   points=(3 if gf > ga else 1 if gf == ga else 0) if comp == 'La Liga' else '',
                   ht=lr.get('ht', ''), aggregate=wb.get('aggregatescore', ''),
                   scorers_for=scorers(side), scorers_against=scorers(opp_side),
                   stadium=re.sub(r'\s*\(.*\)$', '', m['stadium']) or wb.get('stadium', ''),
                   city=(re.search(r'\((.*)\)$', m['stadium']) or [None, ''])[1] or wb.get('location', ''),
                   referee=m['referee'] or wb.get('referee', ''), attendance=wb.get('attendance', ''),
                   opponent_manager=(managers[1] if home else managers[0]) if len(managers) == 2 else '',
                   b365_win=b365[side] if b365['home'] else '', b365_draw=b365['draw'], b365_loss=b365[opp_side] if b365['home'] else '',
                   implied_win_prob=p_win,
                   league_pos_after=tr['pos'] if tr else '', league_pts_after=tr['pts'] if tr else '',
                   pts_behind_leader_after=tr['pts_behind_leader'] if tr else '',
                   bdf_match_id=mid)
        matches.append(row)
        for g in m['goals']:
            mine = g['side'] == side
            goals.append(dict(match_no=n, date=row['date'], competition=comp, round=rnd, opponent=opp, venue=row['venue'],
                              team=me if mine else opp, for_club='1' if mine else '0', minute=g['minute'],
                              period='1H' if g['minute'] and int(g['minute']) <= 45 else '2H',
                              player=g['player'], player_id=g['player_id'], penalty=g['penalty'], own_goal=g['own_goal'],
                              score_after=g['score'],
                              club_score_after='-'.join(g['score'].split('-')[::1 if home else -1])))
        for p in m['players']:
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

    # ---- squad: bios (BDFutbol + Transfermarkt) + per-competition totals from lineups, checked against BDFutbol's own
    squad, career = squad_table(raw, team_html, lineups, goals, me, start)
    write_csv(os.path.join(out, 'squad.csv'), list(squad[0].keys()), squad)
    write_csv(os.path.join(out, 'player_careers.csv'), ['player_id', 'player', 'season', 'club', 'division',
                                                        'age', 'apps', 'starts', 'minutes', 'goals', 'this_season'], career)

    # ---- per month: the chapter view
    months = month_table(matches, lineups, goals, me)
    write_csv(os.path.join(out, 'months.csv'), list(months[0].keys()), months)
    pm = player_months(lineups, me)
    write_csv(os.path.join(out, 'player_months.csv'), list(pm[0].keys()), pm)

    # ---- transfers (Wikipedia season page)
    tf = transfers(wt)
    write_csv(os.path.join(out, 'transfers.csv'), ['direction', 'window', 'player', 'position', 'nationality', 'age',
                                                   'other_club', 'other_club_country', 'type', 'fee', 'fee_eur_m',
                                                   'source_url'], tf)

    # ---- friendlies (Wikipedia "Results" table — date, competition, opponent, venue, score)
    fr = friendlies(wt)
    write_csv(os.path.join(out, 'friendlies.csv'), ['date', 'month', 'competition', 'opponent', 'venue', 'score', 'gf', 'ga',
                                                    'result', 'penalties'], fr)

    # ---- timeline: hand-picked club events (quotes checked against the cached Wikipedia pages) + events read off the data
    tl = timeline(raw, out, matches, goals, lineups, squad, tables, tf, me, me_id, start)
    write_csv(os.path.join(out, 'timeline.csv'), ['date', 'date_precision', 'month', 'kind', 'importance', 'title', 'detail',
                                                  'people', 'competition', 'match_no', 'source', 'source_url', 'evidence'], tl)

    # ---- Elo (ClubElo), when fetched
    elo = elo_table(raw, cfg, start, cid)
    if elo: write_csv(os.path.join(out, 'elo.csv'), ['date', 'club_id', 'club', 'elo', 'rank'], elo)

    summary = summarise(matches, goals, lineups, squad, tables, me_id, me, cfg, start)
    summary['checks'] = dict(league_matches=len(league_rows), league_rows_without_football_data=len(unmatched_fd),
                             club_matches=len(matches), **squad_checks(team_html, squad))
    json.dump(summary, open(os.path.join(out, 'summary.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)
    write_csv(os.path.join(out, 'key_numbers.csv'), ['metric', 'value'], key_numbers(summary))
    print(json.dumps(summary['checks'], indent=1))
    print('wrote', out)

# BDFutbol labels (1/48 Final, Round of 32 …) → the competition's own round names
UEFA_ROUNDS = {'1/48 Final': 'First round', '1/24 Final': 'Second round', 'Round of 32': 'Third round',
               'Round of 16': 'Fourth round', 'Round of 8': 'Quarter-final', 'Round of 4': 'Semi-final'}
CUP_ROUNDS = {'1/32 Final': 'Round of 64', 'Round of 32': 'Round of 32', 'Round of 16': 'Round of 16',
              'Round of 8': 'Quarter-final', 'Round of 4': 'Semi-final'}

def round_label(comp, r):
    if comp == 'La Liga': return re.sub(r'\D', '', r)
    leg = re.search(r'\((first|second) leg\)', r)
    base = re.sub(r'\s*\(.*\)', '', r).strip()
    name = (UEFA_ROUNDS if comp == 'UEFA Cup' else CUP_ROUNDS).get(base, base)
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

def league_tables(raw, rows, cid):
    """Standings after every round. Order is BDFutbol's own (PRG arrays: La Liga's head-to-head tie-breaks applied);
    the counts are recomputed from the results and checked against BDFutbol's points (PRGP)."""
    s = open(os.path.join(raw, 'bdfutbol', 'league.html'), encoding='utf-8').read()
    prg = {int(k): [int(x) for x in v.split(',')] for k, v in re.findall(r'PRG\[(\d+)\]=new Array\(([\d,]+)\)', s)}
    prgp = {int(k): [int(x) for x in v.split(',')] for k, v in re.findall(r'PRGP\[(\d+)\]=new Array\(([\d,]+)\)', s)}
    name_of = {}
    for r in rows: name_of[int(r['bdf_home'])] = r['home']; name_of[int(r['bdf_away'])] = r['away']
    stats = defaultdict(lambda: Counter())
    out = []
    for rnd in range(1, 39):
        played = [r for r in rows if r['round'] == rnd]
        for r in played:
            for me, gf, ga in ((r['home'], r['hg'], r['ag']), (r['away'], r['ag'], r['hg'])):
                c = stats[me]; c['played'] += 1; c['gf'] += gf; c['ga'] += ga
                c['won' if gf > ga else 'drawn' if gf == ga else 'lost'] += 1
                c['pts'] += 3 if gf > ga else 1 if gf == ga else 0
        order = [name_of[t] for t in prg[rnd]]
        official = {name_of[t]: prgp[t][rnd - 1] for t in prg[rnd]}  # BDFutbol's points, deductions included
        lead = official[order[0]]
        rel = official[order[16]]  # 17th = first relegation place (3 down)
        for pos, t in enumerate(order, 1):
            c = stats[t]
            adj = official[t] - c['pts']
            out.append(dict(round=rnd, date_to=max(r['date'] for r in played), pos=pos, team_id=cid(t), team=t,
                            played=c['played'], won=c['won'], drawn=c['drawn'], lost=c['lost'], gf=c['gf'], ga=c['ga'],
                            gd=c['gf'] - c['ga'], pts=official[t], pts_adjustment=adj or '',
                            pts_behind_leader=lead - official[t], pts_above_relegation=official[t] - rel))
    return out

def wiki_match_boxes(wt):
    """Cup match boxes on the club season page → {date: {attendance, referee, aggregatescore, stadium, location}}."""
    out = {}
    for b in templates(wt, 'football box collapsible'):
        a = wiki_template_args(b)
        try: d = dt.datetime.strptime(wiki_plain(a.get('date', '')), '%d %B %Y').date().isoformat()
        except ValueError: continue
        out[d] = {k: wiki_plain(a.get(k, '')) for k in ('attendance', 'referee', 'aggregatescore', 'stadium', 'location')}
        out[d]['attendance'] = out[d]['attendance'].replace(',', '')
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

def squad_table(raw, team_html, lineups, goals, me, start):
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
                   foot=t.get('foot', ''), joined=t.get('joined', ''), signed_from=t.get('signed_from', ''),
                   status=br.get('status', ''), academy=br.get('academy', ''), international=br.get('international', ''),
                   transfermarkt_id=t.get('tm_id', ''))
        tot = Counter()
        for comp, key in (('La Liga', 'liga'), ('UEFA Cup', 'uefa'), ('Copa del Rey', 'copa')):
            c = agg[pid][comp]; tot.update(c)
            for k in ('played', 'started', 'sub_apps', 'minutes', 'goals', 'yellow', 'red'):
                row[f'{key}_{k}'] = c[k]
        for k in ('played', 'started', 'sub_apps', 'minutes', 'goals', 'penalty_goals', 'yellow', 'second_yellow', 'red', 'bench_unused'):
            row[f'all_{k}'] = tot[k]
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
    for key, comp in ((None, 'liga'), ('UEF', 'uefa'), ('COP', 'copa')):
        for field, mine in (('PJ', 'played'), ('M', 'minutes'), ('G', 'goals')):
            arr = next(x['data'] for x in js[field] if x.get('tip') == key)
            for pid, v in zip(pids, arr): want[(pid, f'{comp}_{mine}')] = v
    diffs = []
    for r in squad:
        for (pid, k), v in want.items():
            if pid == r['player_id'] and int(r.get(k, 0) or 0) != int(v or 0):
                diffs.append(f"{r['player']} {k}: lineups {r.get(k)} vs BDFutbol {v}")
    return dict(squad_vs_bdfutbol_diffs=diffs)

def month_table(matches, lineups, goals, me):
    out = []
    for month in sorted({m['month'] for m in matches}):
        ms = [m for m in matches if m['month'] == month]
        lg = [m for m in ms if m['competition'] == 'La Liga']
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

def transfers(wt):
    out = []
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
                            fee=a.get('f', ''), fee_eur_m=fee_eur(a.get('f', '')), source_url=ref.group(1) if ref else ''))
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

def friendlies(wt):
    i = wt.find('== Results ==')
    seg = wt[i:wt.find('|}', i)] if i >= 0 else ''
    out = []
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

def timeline(raw, out, matches, goals, lineups, squad, tables, tf, me, me_id, start):
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
        ev.append(dict(r, month=r['date'][:7]))
    lg = [m for m in matches if m['competition'] == 'La Liga']
    def add(m, kind, imp, title, detail='', people=''):
        ev.append(dict(date=m['date'], date_precision='day', month=m['date'][:7], kind=kind, importance=imp, title=title,
                       detail=detail, people=people, competition=m['competition'], match_no=m['match_no'],
                       source='BDFutbol match', source_url=f"https://www.bdfutbol.com/en/p/p.php?id={m['bdf_match_id']}", evidence=''))
    score = lambda m: f"{m['home']} {m['hg']}–{m['ag']} {m['away']}"
    add(matches[0], 'match', 2, f"First match: {score(matches[0])}", f"Scorers: {matches[0]['scorers_for']}")
    add(matches[-1], 'match', 2, f"Last match: {score(matches[-1])}",
        f"Final league position {lg[-1]['league_pos_after']}, {lg[-1]['league_pts_after']} pts")
    # each club's league position low and the turn
    mine = [t for t in tables if t['team_id'] == me_id]
    low = max(mine, key=lambda t: (t['pos'], t['round']))
    m_low = next(m for m in lg if int(m['round']) == low['round'])
    add(m_low, 'milestone', 3, f"Low point: {low['pos']}th after round {low['round']}",
        f"{score(m_low)}; {low['pts_behind_leader']} pts behind the leader, {low['pts_above_relegation']} above the relegation places")
    # biggest wins / defeats, Clásicos, cup exits
    for m in matches:
        if m['opponent_id'] == 'real-madrid':
            add(m, 'match', 3, f"El Clásico: {score(m)}", f"For: {m['scorers_for'] or '—'}; against: {m['scorers_against'] or '—'}")
        elif m['gf'] - m['ga'] >= 4 or m['ga'] - m['gf'] >= 3:
            add(m, 'match', 2, ('Big win: ' if m['gf'] > m['ga'] else 'Heavy defeat: ') + score(m), f"{m['competition']} {m['round']}")
    for comp in ('UEFA Cup', 'Copa del Rey'):
        last = [m for m in matches if m['competition'] == comp][-1]
        add(last, 'match', 2, f"Out of the {comp}: {score(last)}", f"{last['round']}; aggregate {last['aggregate'] or '—'}")
    # streaks
    run, best = [], []
    for m in lg:
        run = run + [m] if m['result'] != 'L' else []
        if len(run) > len(best): best = run
    if best:
        add(best[0], 'milestone', 3, f"Unbeaten league run begins ({len(best)} matches)",
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
            ev.append(dict(date=f'{start + 1}-01-01', date_precision='window', month=f'{start + 1}-01', kind='transfer',
                           importance=2 if t['fee_eur_m'] or t['type'].startswith('Loan') else 1,
                           title=f"{'Arrives' if t['direction'] == 'in' else 'Leaves'}: {t['player']} ({t['type']})",
                           detail=f"{'from' if t['direction'] == 'in' else 'to'} {t['other_club']}; fee {t['fee']}", people=t['player'],
                           competition='', match_no='', source=f"{dash(start)} FC Barcelona season",
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

def summarise(matches, goals, lineups, squad, tables, me_id, me, cfg, start):
    lg = [m for m in matches if m['competition'] == 'La Liga']
    mine = [t for t in tables if t['team_id'] == me_id]
    low = max(mine, key=lambda t: (t['pos'], t['round']))
    half = lambda a, b: [m for m in lg if a <= int(m['round']) <= b]
    # table of the second half of the season (rounds 20-38) for every club
    r19 = {t['team_id']: t for t in tables if t['round'] == 19}
    r38 = {t['team_id']: t for t in tables if t['round'] == 38}
    second_half = sorted(({'team': r38[k]['team'], 'pts': r38[k]['pts'] - r19[k]['pts'],
                           'gd': r38[k]['gd'] - r19[k]['gd']} for k in r38), key=lambda x: (-x['pts'], -x['gd']))
    by_comp = {c: record([m for m in matches if m['competition'] == c]) for c in ('La Liga', 'UEFA Cup', 'Copa del Rey')}
    big_win = max(matches, key=lambda m: (m['gf'] - m['ga'], m['gf']))
    big_loss = min(matches, key=lambda m: (m['gf'] - m['ga'], -m['ga']))
    scorers = Counter(g['player'] for g in goals if g['for_club'] == '1' and not g['own_goal'])
    minute_buckets = Counter(min((int(g['minute']) - 1) // 15, 5) for g in goals if g['minute'] and g['for_club'] == '1')
    conceded_buckets = Counter(min((int(g['minute']) - 1) // 15, 5) for g in goals if g['minute'] and g['for_club'] == '0')
    span = ['1-15', '16-30', '31-45', '46-60', '61-75', '76-90']
    return dict(
        team=cfg['name'], season=label(start), manager='Frank Rijkaard',
        records=dict(all=record(matches), **by_comp,
                     league_home=record([m for m in lg if m['venue'] == 'H']), league_away=record([m for m in lg if m['venue'] == 'A'])),
        league=dict(final_pos=mine[-1]['pos'], points=mine[-1]['pts'],
                    champion=next(t['team'] for t in tables if t['round'] == 38 and t['pos'] == 1),
                    pts_behind_champion=mine[-1]['pts_behind_leader'],
                    low_point=dict(round=low['round'], date=low['date_to'], pos=low['pos'], pts=low['pts'],
                                   pts_behind_leader=low['pts_behind_leader'], pts_above_relegation=low['pts_above_relegation']),
                    first_half_rounds_1_19=dict(points=sum(m['points'] for m in half(1, 19)), pos_after=r19[me_id]['pos']),
                    second_half_rounds_20_38=dict(points=sum(m['points'] for m in half(20, 38)),
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
        clasicos=[{k: m[k] for k in ('date', 'venue', 'gf', 'ga', 'scorers_for', 'scorers_against')} for m in matches
                  if m['opponent_id'] == 'real-madrid'],
    )
