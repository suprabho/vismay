"""Package a book's league- and cup-level spreads for a design agent: one folder, CSVs + one Markdown file.

  python3 -I scripts/handoff.py --season 2003

Writes briefs/<season>/handoff/:
  HANDOFF.md            the whole job in one file: the task, rules, design system, flatplan, every spread's brief,
                        data dictionary, open checks
  spreads.csv           one row per spread (copy, chart spec, design notes, checks)
  beats.csv             the story beats the spreads hang on
  system/*.csv          the locked series system: page, type_scale, palette, chart_style, chart_forms, templates,
                        template_regions (grid units and millimetres), plus system.json
  data/*.csv            every data file the spreads use, with data_dictionary.csv describing each column

Reads briefs/<season>/spreads.yaml and data/ (run spreads.py, then briefs.py, first) and the system from the admin
(`pnpm --filter admin exec tsx scripts/exportSeasonSystem.ts`, run for you; pass --system <json> to skip it).
"""
import csv, importlib.util, json, os, shutil, subprocess, sys
import pandas as pd
import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(os.path.dirname(ROOT))
_spec = importlib.util.spec_from_file_location('briefs', os.path.join(ROOT, 'scripts', 'briefs.py'))
briefs = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(briefs)

STATSBOMB = 'StatsBomb open data: 120 × 80 pitch, x along the length, y across; every event from the acting team’s view, attacking left → right (x = 120 is the goal being attacked). `minute` is elapsed minutes (print minute + 1).'

# file → (what it is, source, {column: meaning}). Every column must be described; the build fails otherwise.
DICTIONARY = {
    'epl_table_final.csv': ('Premier League final table with everything the league spreads compare clubs on.', 'football-data.co.uk; attendance from worldfootball.net via Wikipedia', {
        'pos': 'Final position (3/1/0, then goal difference, goals scored)', 'team': 'Club, as printed', 'team_id': 'Crosswalk id (internal)',
        'P': 'Played', 'W': 'Won', 'D': 'Drawn', 'L': 'Lost', 'GF': 'Goals for', 'GA': 'Goals against', 'GD': 'Goal difference', 'Pts': 'Points',
        'home_pts': 'Points from home games', 'away_pts': 'Points from away games',
        'prev_season_pts': 'Points in 2002-03 (blank = promoted)', 'prev_season_pos': 'Position in 2002-03, or "promoted"',
        'shots': 'Shots, season total', 'shots_on_target': 'Shots on target, season total', 'goals_per_shot_on_target': 'GF ÷ shots on target',
        'yellows': 'Yellow cards', 'reds': 'Red cards',
        'xpts_from_odds': 'Points the Bet365 pre-match odds implied (3 × P(win) + P(draw) per game, bookmaker margin removed)',
        'pts_minus_xpts': 'Pts − xpts_from_odds: above zero = beat the market', 'trailed_at_ht': 'Games behind at half-time',
        'pts_from_ht_deficit': 'Points won from those games', 'avg_attendance': 'Average home league attendance',
        'status': 'Champions / Champions League / UEFA Cup / Relegated (blank = none)'}),
    'epl_race.csv': ('Every club’s league season game by game: the line race, the slope and the results strips come from here.', 'football-data.co.uk', {
        'team': 'Club', 'team_id': 'Crosswalk id (internal)', 'game': 'The club’s game number, 1–38', 'date': 'Match date', 'month': 'YYYY-MM',
        'opponent': 'Opponent', 'venue': 'H home / A away', 'score': 'Score from this club’s side, "for-against"', 'result': 'W / D / L for this club',
        'points': 'Points from this game', 'cum_points': 'Running points total', 'cum_gd': 'Running goal difference',
        'position': 'Table position at the end of that match date'}),
    'epl_leader_by_date.csv': ('Who was top after every match date, and every change at the top.', 'football-data.co.uk', {
        'date': 'Match date', 'leader': 'Club top that night', 'leader_pts': 'Its points', 'leader_played': 'Its games played',
        'second': 'Club second', 'second_pts': 'Its points', 'second_played': 'Its games played', 'margin': 'Points gap first to second',
        'changed': 'True if the leader changed that date'}),
    'epl_month_tables.csv': ('The full table at the end of each month.', 'football-data.co.uk', {
        'month': 'YYYY-MM (table as at the last match date of the month)', 'pos': 'Position', 'team': 'Club', 'P': 'Played', 'W': 'Won', 'D': 'Drawn',
        'L': 'Lost', 'GF': 'Goals for', 'GA': 'Goals against', 'Pts': 'Points', 'GD': 'Goal difference'}),
    'epl_results_grid.csv': ('All 380 league results, for the 20 × 20 grid.', 'football-data.co.uk', {
        'home': 'Home club', 'away': 'Away club', 'date': 'Match date', 'hg': 'Home goals', 'ag': 'Away goals', 'result': 'H home win / D draw / A away win'}),
    'epl_goals_by_month.csv': ('Goals and results by calendar month.', 'football-data.co.uk', {
        'month': 'YYYY-MM', 'matches': 'Games played', 'goals': 'Goals', 'home_wins': 'Home wins', 'draws': 'Draws', 'away_wins': 'Away wins',
        'goals_per_game': 'Goals ÷ matches', 'home_win_pct': 'Home wins as % of matches'}),
    'epl_upsets.csv': ('The 15 least likely wins of the season by the bookmakers’ prices.', 'football-data.co.uk (Bet365 odds)', {
        'date': 'Match date', 'winner': 'Winning club', 'loser': 'Losing club', 'venue': 'Winner’s venue, H / A', 'score': 'Winner’s side first',
        'odds': 'Bet365 decimal odds on the winner', 'implied_win_pct': 'Win chance those odds implied, margin removed (%)'}),
    'epl_summer_signings.csv': ('Every £5m-plus signing by a Premier League club, 1 June – 1 September 2003.', 'Wikipedia, List of English football transfers summer 2003 (via events.csv)', {
        'date': 'Date of the move', 'player': 'Player', 'from_club': 'Selling club', 'to_club': 'Buying club', 'fee_m_gbp': 'Reported fee, £ millions',
        'source_url': 'Source link where one was recorded'}),
    'epl_champion_games.csv': ('The champions’ (Arsenal’s) 38 league games, with StatsBomb match stats.', 'football-data.co.uk; StatsBomb open data', {
        'game': 'Game number', 'date': 'Match date', 'opponent': 'Opponent', 'venue': 'H / A', 'score': 'Arsenal first', 'result': 'W / D',
        'ht': 'Half-time score, Arsenal first', 'behind_at_ht': 'True if behind at half-time',
        'implied_win_pct': 'Arsenal’s win chance from Bet365 odds (%)', 'xg_for': 'StatsBomb expected goals for', 'xg_against': 'StatsBomb expected goals against',
        'shots': 'Arsenal shots (StatsBomb)', 'ppda': 'Passes allowed per defensive action (lower = more pressing)'}),
    'epl_top_scorer_shots.csv': ('Every Premier League shot by Thierry Henry, 2003-04. ' + STATSBOMB, 'StatsBomb open data — logo and credit required', {
        'match_id': 'StatsBomb match id', 'date': 'Match date', 'player': 'StatsBomb full name', 'player_known_as': 'Name to print',
        'period': '1 or 2', 'minute': 'Elapsed minute (print + 1)', 'second': 'Second', 'x': 'Shot location x (0–120)', 'y': 'Shot location y (0–80)',
        'end_x': 'Where the shot ended, x', 'end_y': 'Where the shot ended, y', 'xg': 'Expected goals value of the chance',
        'outcome': 'Goal / Saved / Off T / Blocked / Post / Wayward', 'body_part': 'Foot / head', 'shot_type': 'Open Play / Penalty / Free Kick',
        'technique': 'Volley, half volley, …', 'under_pressure': 'True if pressed', 'first_time': 'True if first-time',
        'assisted_by': 'StatsBomb full name of the passer', 'assisted_by_known_as': 'Passer, name to print'}),
    'epl_scorers.csv': ('Premier League top scorers.', 'Wikipedia, 2003–04 FA Premier League', {
        'rank': 'Rank (ties share one)', 'player': 'Player', 'club': 'Club (Saha: both clubs that season)', 'goals': 'League goals'}),
    'epl_monthly_awards.csv': ('Premier League Manager and Player of the Month.', 'Wikipedia, 2003–04 FA Premier League', {
        'month': 'Month (no award in May)', 'manager': 'Manager of the Month', 'manager_club': 'His club', 'player': 'Player of the Month (shared in February)',
        'player_club': 'Club'}),
    'ucl_matches.csv': ('Every Champions League match, first qualifying round to final.', 'engsoccerdata (jalapic)', {
        'date': 'Match date', 'stage': 'Q-1 / Q-2 / Q-3 / Group / R16 / QF / SF / final', 'group': 'Group letter (group stage only)', 'leg': '1 or 2 (two-legged ties)',
        'home': 'Home club', 'home_country': 'Home club’s country code', 'away': 'Away club', 'away_country': 'Away club’s country code',
        'hg': 'Home goals (after extra time where played)', 'ag': 'Away goals (after extra time)', 'ht': 'Half-time score',
        'tie_winner': 'Who went through (knockouts)', 'decided_by': 'Blank, "extra time", "away goals" or "penalties h-a"'}),
    'ucl_groups.csv': ('The eight final group tables, ordered by UEFA 2003-04 rules (head-to-head first).', 'engsoccerdata (jalapic)', {
        'group': 'A–H', 'team': 'Club', 'pos': 'Position', 'P': 'Played', 'W': 'Won', 'D': 'Drawn', 'L': 'Lost', 'GF': 'Goals for', 'GA': 'Goals against',
        'Pts': 'Points', 'GD': 'Goal difference', 'country': 'Country code', 'country_name': 'Country',
        'result': 'Round of 16 / UEFA Cup (3rd) / Out'}),
    'ucl_ties.csv': ('Every two-legged tie and the final, with aggregates.', 'engsoccerdata (jalapic)', {
        'stage': 'Q-1 … final', 'team_a': 'Home club in leg 1', 'country_a': 'Its country code', 'team_b': 'Away club in leg 1', 'country_b': 'Its country code',
        'leg1': 'Leg 1, team_a first', 'leg1_date': 'Leg 1 date', 'leg2': 'Leg 2, team_a first', 'leg2_date': 'Leg 2 date', 'agg': 'Aggregate, team_a first',
        'winner': 'Who went through', 'decided_by': 'aggregate / away goals / penalties w-l (winner first) / aggregate after extra time / single match'}),
    'ucl_clubs.csv': ('All 72 clubs: where each entered and how far it got.', 'engsoccerdata (jalapic)', {
        'team': 'Club', 'team_id': 'Crosswalk id (internal)', 'country': 'Country code', 'country_name': 'Country', 'entered': 'Stage it entered at',
        'reached': 'Furthest stage (Winners for the champions)', 'matches': 'Matches played'}),
    'ucl_countries.csv': ('Each country’s clubs by the stage they went out at (heat table).', 'engsoccerdata (jalapic)', {
        'country': 'Country code', 'country_name': 'Country', 'clubs': 'Clubs entered',
        'First qualifying round': 'Clubs out here', 'Second qualifying round': 'Clubs out here', 'Third qualifying round': 'Clubs out here',
        'Group stage': 'Clubs out here', 'Round of 16': 'Clubs out here', 'Quarter-finals': 'Clubs out here', 'Semi-finals': 'Clubs out here',
        'Final': 'Clubs that lost the final', 'Winners': 'Clubs that won it', 'best': 'Furthest stage any of its clubs reached'}),
    'ucl_stages.csv': ('The funnel: clubs, matches and goals at each stage.', 'engsoccerdata (jalapic)', {
        'stage': 'Stage', 'clubs': 'Clubs that played in it', 'matches': 'Matches', 'goals': 'Goals', 'goals_per_game': 'Goals ÷ matches',
        'home_win_pct': 'Home wins as % of matches (the final was at a neutral ground; Porto were listed home)'}),
    'ucl_finalists_road.csv': ('Porto’s and Monaco’s 13 games each, in order.', 'engsoccerdata (jalapic)', {
        'team': 'Finalist', 'n': 'Game number', 'date': 'Match date', 'stage': 'Stage', 'opponent': 'Opponent', 'opponent_country': 'Its country code',
        'venue': 'H / A / N (neutral, the final)', 'score': 'Finalist first', 'result': 'W / D / L'}),
    'ucl_english_clubs.csv': ('Every Champions League game by the four English clubs.', 'engsoccerdata (jalapic)', {
        'team': 'Club', 'n': 'Game number', 'date': 'Match date', 'stage': 'Stage', 'opponent': 'Opponent', 'venue': 'H / A', 'score': 'English club first',
        'result': 'W / D / L'}),
    'ucl_scorers.csv': ('Champions League top scorers (four goals or more), including qualifying.', 'UEFA via Wikipedia, 2003–04 UEFA Champions League', {
        'rank': 'Rank (ties share one)', 'player': 'Player', 'club': 'Club', 'goals': 'Goals', 'minutes': 'Minutes played', 'minutes_per_goal': 'Minutes ÷ goals'}),
    'ucl_final_shots.csv': ('Every shot in the 2004 final, Porto 3–0 Monaco. ' + STATSBOMB, 'StatsBomb open data — logo and credit required', {
        'match_id': 'StatsBomb match id', 'date': 'Match date', 'team': 'Porto / Monaco', 'player': 'StatsBomb full name', 'player_known_as': 'Name to print',
        'period': '1 or 2', 'minute': 'Elapsed minute (print + 1)', 'second': 'Second', 'x': 'Location x (0–120)', 'y': 'Location y (0–80)',
        'end_x': 'End x', 'end_y': 'End y', 'xg': 'Expected goals value', 'outcome': 'Goal / Saved / Off T / Blocked / Wayward', 'body_part': 'Foot / head',
        'shot_type': 'Open Play / …', 'technique': 'Technique', 'under_pressure': 'True if pressed', 'first_time': 'True if first-time',
        'assisted_by': 'StatsBomb full name of the passer', 'assisted_by_known_as': 'Passer, name to print'}),
    'ucl_final_team.csv': ('Team match stats for the final.', 'StatsBomb open data — logo and credit required', {
        'match_id': 'StatsBomb match id', 'date': 'Match date', 'team': 'Team', 'opponent': 'Opponent', 'passes': 'Passes attempted', 'pass_pct': 'Pass completion %',
        'shots': 'Shots', 'xg': 'Expected goals', 'pressures': 'Pressure events', 'pressures_final_third': 'In the attacking third',
        'pressures_middle_third': 'In the middle third', 'pressures_defensive_third': 'In its own third', 'counterpresses': 'Counter-presses',
        'ppda': 'Passes allowed per defensive action'}),
    'ucl_final_pass_nodes.csv': ('Final pass network: each player’s average position and passes, up to his team’s first substitution. ' + STATSBOMB, 'StatsBomb open data — logo and credit required', {
        'match_id': 'StatsBomb match id', 'team': 'Team', 'player': 'StatsBomb full name', 'player_known_as': 'Name to print', 'avg_x': 'Average x of his passes',
        'avg_y': 'Average y', 'passes_made': 'Completed passes', 'until_minute': 'Network cut-off minute (first substitution)'}),
    'ucl_final_pass_network.csv': ('Final pass network links: completed passes between pairs, same cut-off.', 'StatsBomb open data — logo and credit required', {
        'match_id': 'StatsBomb match id', 'team': 'Team', 'passer': 'StatsBomb full name', 'passer_known_as': 'Name to print', 'recipient': 'StatsBomb full name',
        'recipient_known_as': 'Name to print', 'passes': 'Completed passes passer → recipient'}),
}

def system_json(path):
    if path: return json.load(open(path))
    r = subprocess.run(['pnpm', '--silent', '--filter', 'admin', 'exec', 'tsx', 'scripts/exportSeasonSystem.ts'], cwd=REPO, capture_output=True, text=True, check=True)
    return json.loads(r.stdout)

def region_mm(r, page):
    """Grid units → millimetres on the spread, the way the Books-tab thumbnails place them."""
    m, half = page['margins'], page['columns'] / 2
    live_w = page['widthMm'] - m['outerMm'] - m['innerMm']
    x = lambda v: m['outerMm'] + v / half * live_w if v <= half else page['widthMm'] + m['innerMm'] + (v - half) / half * live_w
    y = lambda v: m['topMm'] + v / page['rows'] * (page['heightMm'] - m['topMm'] - m['bottomMm'])
    if r['kind'] == 'image' and r['y'] == 0 and r['h'] == page['rows'] and r['w'] == half:  # full-page image bleeds
        left = 0 if r['x'] < half else page['widthMm']
        return dict(left_mm=left, top_mm=0, width_mm=page['widthMm'], height_mm=page['heightMm'], bleeds=True)
    return dict(left_mm=round(x(r['x']), 1), top_mm=round(y(r['y']), 1), width_mm=round(x(r['x'] + r['w']) - x(r['x']), 1),
                height_mm=round(y(r['y'] + r['h']) - y(r['y']), 1), bleeds=False)

def write_csv(path, rows, cols=None):
    pd.DataFrame(rows, columns=cols).to_csv(path, index=False, quoting=csv.QUOTE_MINIMAL)

def main(start, sys_path):
    season = f'{start}-{str(start + 1)[2:]}'
    label = f'{start}–{str(start + 1)[2:]}'
    base = os.path.join(ROOT, 'briefs', season)
    out = os.path.join(base, 'handoff')
    if os.path.exists(out): shutil.rmtree(out)
    for d in ('system', 'data'): os.makedirs(os.path.join(out, d))
    src = yaml.safe_load(open(os.path.join(base, 'spreads.yaml')))
    sysd = system_json(sys_path)
    if sysd['version'] != src['system_version']: sys.exit(f"spreads.yaml is set for system v{src['system_version']}, the admin is on v{sysd['version']}")
    page, templates = sysd['page'], {t['id']: t for t in sysd['templates']}
    beats = {b['id']: b for b in src['beats']}
    order = {c: i for i, c in enumerate(briefs.chapters(start))}
    spreads = sorted(src['spreads'], key=lambda s: order[s['chapter']])
    num = {s['id']: i + 1 for i, s in enumerate(spreads)}

    # --- data + dictionary
    dict_rows, dict_md = [], []
    for f in sorted(os.listdir(os.path.join(base, 'data'))):
        if not f.endswith('.csv'): continue
        if f not in DICTIONARY: sys.exit(f'data/{f} has no entry in DICTIONARY')
        shutil.copy(os.path.join(base, 'data', f), os.path.join(out, 'data', f))
        what, source, cols = DICTIONARY[f]
        df = pd.read_csv(os.path.join(base, 'data', f))
        missing = [c for c in df.columns if c not in cols]
        if missing: sys.exit(f'data/{f}: columns without a description: {missing}')
        spread_ids = [s['id'] for s in spreads if f in ((s.get('chart') or {}).get('data') or [])]
        dict_md += [f'### `data/{f}`', '', f'{what} {len(df)} rows. Source: {source}. Used by: {", ".join(spread_ids) or "— (reference)"}.', '',
                    '| column | meaning |', '|---|---|'] + [f'| `{c}` | {cols[c]} |' for c in df.columns] + ['']
        dict_rows += [dict(file=f'data/{f}', column=c, meaning=cols[c], source=source, rows=len(df), used_by=' '.join(spread_ids)) for c in df.columns]
    write_csv(os.path.join(out, 'data', 'data_dictionary.csv'), dict_rows)
    n_data = len({r['file'] for r in dict_rows})

    # --- system
    json.dump(sysd, open(os.path.join(out, 'system', 'system.json'), 'w'), ensure_ascii=False, indent=1)
    p = page
    write_csv(os.path.join(out, 'system', 'page.csv'), [
        dict(key='spread_trim', value=f"{p['spreadWidthMm']} × {p['heightMm']} mm (two {p['widthMm']} × {p['heightMm']} mm pages)"),
        dict(key='bleed', value=f"{p['bleedMm']} mm"),
        *[dict(key=f'margin_{k[:-2]}', value=f'{v} mm') for k, v in p['margins'].items()],
        dict(key='columns', value=f"{p['columns']} across the spread ({p['columns'] // 2} per page)"), dict(key='rows', value=p['rows']),
        dict(key='gutter', value=f"{p['gutterMm']} mm"), dict(key='baseline', value=f"{p['baselineMm']} mm"),
        dict(key='grid_to_mm', value='x ≤ 6: outer + x/6 × 177 mm; x > 6: 210 + inner + (x−6)/6 × 177 mm; y: top + y/8 × 235 mm (template_regions.csv has it done)')])
    write_csv(os.path.join(out, 'system', 'type_scale.csv'), [dict(role=t['role'], label=t['label'], face=t['face'], size_pt=t['sizePt'], leading_pt=t['leadingPt'],
              weight=t['weight'], tracking=t.get('tracking', ''), caps=t.get('caps', False), use=t['use']) for t in sysd['typeScale']])
    write_csv(os.path.join(out, 'system', 'palette.csv'), [dict(token=k, hex=v) for k, v in sysd['palette'].items()] +
              [dict(token=f'result_{k}', hex=v) for k, v in sysd['resultColours'].items()])
    write_csv(os.path.join(out, 'system', 'chart_style.csv'), [dict(rule=r['label'], value=r['value']) for r in sysd['chartStyle']])
    write_csv(os.path.join(out, 'system', 'chart_forms.csv'), [dict(form=k, label=v['label'], reads=v['reads'],
              templates=' '.join(t for t in templates if k in templates[t]['forms'])) for k, v in sysd['chartForms'].items()])
    write_csv(os.path.join(out, 'system', 'templates.csv'), [dict(template=t['id'], label=t['label'], role=t['role'], description=t['description'], use=t['use'],
              body_words=f"{t['words']['min']}–{t['words']['max']}", chart_forms=' '.join(t['forms']), headline_scale=t['headlineScale']) for t in sysd['templates']])
    regions = [dict(template=t['id'], region=r['kind'], x=r['x'], y=r['y'], w=r['w'], h=r['h'], **region_mm(r, page)) for t in sysd['templates'] for r in t['regions']]
    write_csv(os.path.join(out, 'system', 'template_regions.csv'), regions)

    # --- spreads + beats
    srows = []
    for s in spreads:
        c, t = s.get('chart') or {}, templates[s['template']]
        pr = c.get('preset')
        srows.append(dict(
            no=num[s['id']], file_name=f"{num[s['id']]:02d}-{s['id']}", id=s['id'], competition=s['competition'], chapter=s['chapter'],
            chapter_label=briefs.chapter_label(s['chapter']), template=s['template'], role=t['role'], chart_form=s['form'], beat_id=s.get('beat') or '',
            kicker=s.get('kicker', ''), headline=s['headline'], stat_value=s['stat']['value'], stat_label=s['stat']['label'],
            body=s.get('body') or '', body_words=briefs.words(s.get('body')), body_budget=f"{t['words']['min']}–{t['words']['max']}",
            caption=s.get('caption') or '', source_line=s.get('source') or '', data_files=' '.join(f'data/{d}' for d in c.get('data') or []),
            books_preset=(f"{pr['preset']}" + (f" teams={','.join(pr['teams'])}" if pr.get('teams') else '') + (f" month={pr['month']}" if pr.get('month') else '')) if pr else '',
            chart_encode=c.get('encode', ''), chart_highlight=c.get('highlight', ''), chart_annotate=' | '.join(c.get('annotate') or []),
            chart_notes=c.get('notes', ''), design_notes=' | '.join(s.get('design') or []), check_before_print=' | '.join(s.get('checks') or []),
            statsbomb_credit='yes' if 'StatsBomb' in (s.get('source') or '') else 'no'))
    write_csv(os.path.join(out, 'spreads.csv'), srows)
    write_csv(os.path.join(out, 'beats.csv'), [dict(id=b['id'], month=b.get('month') or '', kind=b['kind'], strength=b['strength'], text=b['text'],
              teams=b.get('teams') or '', evidence=b.get('evidence') or '', spreads=' '.join(s['id'] for s in spreads if s.get('beat') == b['id'])) for b in src['beats']])

    # --- HANDOFF.md
    md = briefs.md_table
    rhythm = ''.join({'frame': 'F', 'hero': 'H', 'dense': 'D', 'breather': 'B'}[templates[s['template']]['role']] for s in spreads)
    ts = pd.DataFrame(sysd['typeScale'])[['role', 'face', 'sizePt', 'leadingPt', 'weight', 'use']].rename(columns={'sizePt': 'size pt', 'leadingPt': 'leading pt'})
    pal = pd.DataFrame([dict(token=k, hex=f'`{v}`') for k, v in sysd['palette'].items()])
    tmpl_md = []
    for t in sysd['templates']:
        reg = pd.DataFrame([dict(region=r['kind'], grid=f"x {r['x']} y {r['y']} w {r['w']} h {r['h']}",
                                 mm=('full page, bleeds' if (m := region_mm(r, page))['bleeds'] else f"{m['left_mm']}, {m['top_mm']} · {m['width_mm']} × {m['height_mm']}"))
                            for r in t['regions']])
        tmpl_md += [f"**{t['label']}** (`{t['id']}`, {t['role']}) — {t['description']} {t['use']} Body {t['words']['min']}–{t['words']['max']} words. "
                    f"Charts: {', '.join(sysd['chartForms'][f]['label'].lower() for f in t['forms'])}.", '', md(reg), '']
    flat = pd.DataFrame([dict(no=r['no'], file=r['file_name'], chapter=r['chapter_label'], template=r['template'], role=r['role'], chart=r['chart_form'],
                              headline=r['headline'].replace('|', '/')) for r in srows])
    checks = [f"- [ ] **{s['id']}** — {c}" for s in spreads for c in s.get('checks') or []]
    statsbomb = [r['id'] for r in srows if r['statsbomb_credit'] == 'yes']
    doc = [
        f'# Handoff: {label} season book — league and cup spreads', '',
        f'For a design agent. Everything needed to design the {len(spreads)} Premier League (league-level) and Champions League (cup-level) '
        f'spreads of the {label} book is in this folder: this file, `spreads.csv`, `beats.csv`, `system/` and `data/`. Nothing outside it is needed.', '',
        '## The job', '',
        f"Design {len(spreads)} print spreads, each {p['spreadWidthMm']} × {p['heightMm']} mm (two {p['widthMm']} × {p['heightMm']} mm pages) plus {p['bleedMm']} mm bleed, "
        'one claim per spread proved by one visual. Unless told otherwise, deliver one file per spread named by `file_name` in `spreads.csv` '
        '(e.g. `03-L02.svg` or `.pdf`) at 1:1 with bleed, and one contact sheet of all spreads in order.', '',
        '**Rules**', '',
        '1. The design system below is locked. Use its grid, template regions, type roles, palette and chart style; don’t add colours or move regions.',
        '2. The copy (kicker, headline, stat, body, caption, source line) is written and fact-checked. Set it as given. If something won’t fit its region, say which spread and by how much rather than rewriting it.',
        '3. Draw every chart from the CSV named in its brief, never from the numbers in the copy; if the two disagree, flag it.',
        '4. At most two coloured series per chart (accent, then second); everything else muted. Direct labels, no legends. A source line under every chart.',
        '5. Results are always W ink, D draw-grey, L accent.',
        '6. No club crests, logos, kit or photographs of real people. Breather and cover image regions get illustrations as briefed (objects and places, no likenesses).',
        f"7. StatsBomb data needs the StatsBomb logo and credit on the spread: {', '.join(statsbomb)}.",
        '8. Type faces are roles (Headline, Text, Numerals), not fonts. Pick one family per role, use it on every spread and say which you picked. Numerals need tabular figures.', '',
        '## Files', '',
        md(pd.DataFrame([
            dict(file='HANDOFF.md', what='This file: the job, rules, system, flatplan, every brief, the data dictionary, open checks'),
            dict(file='spreads.csv', what=f'{len(spreads)} rows, one per spread: copy, chart spec, design notes, checks'),
            dict(file='beats.csv', what=f'{len(beats)} story beats the spreads hang on'),
            dict(file='system/page.csv', what='Trim, bleed, margins, grid, baseline'),
            dict(file='system/type_scale.csv', what='Type roles, sizes, leading, weights'),
            dict(file='system/palette.csv', what='Colour tokens and result colours'),
            dict(file='system/chart_style.csv', what='How every chart is drawn'),
            dict(file='system/chart_forms.csv', what='Allowed chart forms and the templates that take them'),
            dict(file='system/templates.csv', what='The seven spread templates'),
            dict(file='system/template_regions.csv', what='Every template region in grid units and millimetres'),
            dict(file='system/system.json', what='The same system as one JSON object'),
            dict(file='data/*.csv', what=f'{n_data} data files the charts are drawn from'),
            dict(file='data/data_dictionary.csv', what='Every data column described, with source and the spreads that use it'),
        ])), '',
        f"## Design system (v{sysd['version']})", '',
        f"**Page and grid.** Spread {p['spreadWidthMm']} × {p['heightMm']} mm, bleed {p['bleedMm']} mm. Margins: top {p['margins']['topMm']}, bottom {p['margins']['bottomMm']}, "
        f"outer {p['margins']['outerMm']}, inner (gutter side) {p['margins']['innerMm']} mm. {p['columns']} columns across the spread ({p['columns'] // 2} per page) × {p['rows']} rows, "
        f"{p['gutterMm']} mm gutters, {p['baselineMm']} mm baseline. Region positions below are in grid units (x/w in columns, the page break at x = 6; y/h in rows) "
        'and in millimetres from the spread’s top-left trim corner (left, top · width × height). A block ending on x = 6 stops at the inner margin; one crossing it runs across the gutter.', '',
        '**Type scale**', '', md(ts), '',
        '**Palette**', '', md(pal), '',
        f"Results: W `{sysd['resultColours']['W']}` (ink), D `{sysd['resultColours']['D']}` (draw), L `{sysd['resultColours']['L']}` (accent).", '',
        '**Chart style**', '', md(pd.DataFrame([dict(rule=r['label'], value=r['value']) for r in sysd['chartStyle']])), '',
        '**Chart forms**', '', md(pd.DataFrame([dict(form=k, label=v['label'], reads=v['reads']) for k, v in sysd['chartForms'].items()])), '',
        '**Rhythm.** Spreads alternate hero (one big chart) → dense (comparison, timeline, table) → breather (one big number and an illustration). '
        'Frames (cover, intro) sit outside the rhythm.', '',
        '**Templates**', '', *tmpl_md,
        '## Flatplan', '',
        f'Reading order, rhythm `{rhythm}` (F frame, H hero, D dense, B breather). Club- and match-level spreads and other leagues will slot in between later.', '',
        md(flat), '',
        '## Spread briefs', '',
        *[briefs.brief(s, num[s['id']], beats, internal=False) for s in spreads],
        '## Data dictionary', '',
        'Dates are ISO (YYYY-MM-DD). Scores are "a-b" with the side named in the column description first. '
        'Team names are as they should be printed. ' + STATSBOMB, '',
        *dict_md,
        '## Open checks before print', '',
        'Claims in the copy that rest on sources outside these data files. They don’t block layout; keep the copy as given and leave these to the editor.', '',
        *checks, '']
    open(os.path.join(out, 'HANDOFF.md'), 'w').write('\n'.join(doc))
    print(f'{season} handoff: {len(spreads)} spreads, {len(beats)} beats, {n_data} data files (+ dictionary), system v{sysd["version"]} → {out}')

if __name__ == '__main__':
    a = sys.argv[1:]
    sys_path = None
    if '--system' in a:
        i = a.index('--system'); sys_path = a[i + 1]; a = a[:i] + a[i + 2:]
    if len(a) == 2 and a[0] == '--season' and a[1].isdigit(): main(int(a[1]), sys_path)
    else: sys.exit(__doc__)
