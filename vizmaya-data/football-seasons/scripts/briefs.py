"""Render the league- and cup-level design briefs from briefs/<season>/spreads.yaml.

  python3 -I scripts/briefs.py --season 2003

Writes, next to spreads.yaml:
  premier-league.md     league-level briefs (fact sheet + one brief per spread)
  champions-league.md   cup-level briefs
  flatplan.md           every spread in reading order, with role and data status
  plan.json             the same beats + spreads as a Books-tab plan (planSchema in
                        apps/admin/lib/seasonBooks/plan.ts); check it with
                        `pnpm --filter admin exec tsx scripts/checkSeasonPlan.ts <plan.json> <season>`

The fact sheets read briefs/<season>/data/ (scripts/spreads.py), so rebuild that first.
"""
import json, os, sys
import pandas as pd
import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROLE = {'cover': 'frame', 'intro': 'frame', 'hero': 'hero', 'comparison': 'dense', 'timeline': 'dense', 'table': 'dense', 'breather': 'breather'}
TEMPLATE_LABEL = {'cover': 'Cover', 'intro': 'Season intro', 'hero': 'Hero', 'comparison': 'Comparison', 'timeline': 'Timeline', 'table': 'Table', 'breather': 'Breather'}
FORM_LABEL = {'line-race': 'Line race', 'bar': 'Bars', 'slope': 'Slope', 'strip': 'Results strip', 'scatter': 'Scatter', 'small-multiples': 'Small multiples',
              'pitch': 'Pitch map', 'timeline': 'Timeline', 'bracket': 'Bracket', 'table': 'Table', 'heat-table': 'Heat table', 'big-number': 'Big number', 'image': 'Photo-style'}
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
COMPETITIONS = {'Premier League': ('premier-league.md', 'league'), 'Champions League': ('champions-league.md', 'cup')}

def chapter_label(c):
    if c == 'cover': return 'Cover'
    if c == 'intro': return 'Season intro'
    if c == 'outro': return 'Season in numbers'
    y, m = c.split('-')
    return f'{MONTHS[int(m) - 1]} {y}'

def chapters(start):
    months = [f'{start + (m > 12)}-{(m - 1) % 12 + 1:02d}' for m in range(8, 20)]
    return ['cover', 'intro', *months, 'outro']

def words(s): return len((s or '').split())

def md_table(df):
    cols = list(df.columns)
    out = ['| ' + ' | '.join(cols) + ' |', '|' + '|'.join('---' for _ in cols) + '|']
    out += ['| ' + ' | '.join(str(v) for v in row) + ' |' for row in df.itertuples(index=False)]
    return '\n'.join(out)

def status(s): return 'data' if s.get('chart', {}).get('preset') else 'card'

def brief(s, num, beats):
    c = s.get('chart') or {}
    t = s['template']
    title = f"{s['stat']['value']} {s['headline']}" if t == 'breather' else s['headline']  # a breather's headline completes its number
    lines = [f"### {num:02d} · {s['id']} — {title}", '',
             f"**{chapter_label(s['chapter'])}** · {TEMPLATE_LABEL[t]} ({ROLE[t]}) · {FORM_LABEL[s['form']]}" + (f" · kicker “{s['kicker']}”" if s.get('kicker') else ''), '']
    if s.get('beat'):
        b = beats[s['beat']]
        lines += [f"**Beat** ({b['kind']}, strength {b['strength']}): {b['text']}", '']
    lines += [f"**Headline** — {s['headline']}", '',
              f"**Stat** — {s['stat']['value']} · {s['stat']['label']}", '']
    chart = []
    if c.get('data'): chart.append('Data: ' + ', '.join(f'[`{d}`](data/{d})' for d in c['data']))
    if c.get('preset'):
        p = c['preset']
        chart.append(f"Books-tab binding: `{p['preset']}`" + (f", teams {', '.join(p['teams'])}" if p.get('teams') else '') + (f", month {p['month']}" if p.get('month') else ''))
    for k, label in (('encode', 'Encode'), ('highlight', 'Highlight'), ('notes', 'Notes')):
        if c.get(k): chart.append(f'{label}: {c[k]}')
    for a in c.get('annotate') or []: chart.append(f'Annotate: {a}')
    lines += ['**Chart**', ''] + [f'- {x}' for x in chart] + ['']
    if s.get('body'):
        lines += [f"**Body** ({words(s['body'])} words)", '', '> ' + s['body'], '']
    if s.get('caption'): lines += [f"**Caption** — {s['caption']}", '']
    if s.get('source'): lines += [f"**Source line** — {s['source']}", '']
    if s.get('design'): lines += ['**Design notes**', ''] + [f'- {d}' for d in s['design']] + ['']
    if s.get('checks'): lines += ['**Check before print**', ''] + [f'- [ ] {d}' for d in s['checks']] + ['']
    return '\n'.join(lines)

# ---------------------------------------------------------------------------
# Fact sheets (from the built data)

def league_facts(d):
    t = pd.read_csv(os.path.join(d, 'epl_table_final.csv'))
    sc = pd.read_csv(os.path.join(d, 'epl_scorers.csv'))
    gm = pd.read_csv(os.path.join(d, 'epl_goals_by_month.csv'))
    lead = pd.read_csv(os.path.join(d, 'epl_leader_by_date.csv'))
    champ = t.iloc[0]
    goals, games = int(gm.goals.sum()), int(gm.matches.sum())
    table = t[['pos', 'team', 'P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts', 'status']].fillna('')
    return '\n'.join([
        '## The competition at a glance', '',
        f"- Champions: **{champ.team}**, {champ.W}–{champ.D}–{champ.L}, {champ.Pts} points, {champ.Pts - t.iloc[1].Pts} clear of {t.iloc[1].team}.",
        f"- {games} games, {goals:,} goals ({goals / games:.2f} a game); the lead changed hands {int(lead.changed.sum())} times between {lead.leader.nunique()} clubs, last on {lead[lead.changed].date.max()}.",
        f"- Top scorer: {sc.iloc[0].player} ({sc.iloc[0].club}) {sc.iloc[0].goals}; then {', '.join(f'{r.player} {r.goals}' for r in sc.iloc[1:4].itertuples())}.",
        f"- Relegated: {', '.join(t[t.status == 'Relegated'].team)} (all on {t[t.status == 'Relegated'].Pts.max()} points).",
        '', md_table(table), ''])

def cup_facts(d):
    st = pd.read_csv(os.path.join(d, 'ucl_stages.csv'))
    ties = pd.read_csv(os.path.join(d, 'ucl_ties.csv'))
    sc = pd.read_csv(os.path.join(d, 'ucl_scorers.csv'))
    clubs = pd.read_csv(os.path.join(d, 'ucl_clubs.csv'))
    f = ties[ties.stage == 'final'].iloc[0]
    ko = ties[ties.stage.isin(['R16', 'QF', 'SF', 'final'])][['stage', 'team_a', 'team_b', 'leg1', 'leg2', 'agg', 'winner', 'decided_by']].fillna('')
    return '\n'.join([
        '## The competition at a glance', '',
        f"- Winners: **{f.winner}**, {f['agg']} against {f.team_b if f.winner == f.team_a else f.team_a} in the final ({f.leg1_date}).",
        f"- {len(clubs)} clubs from {clubs.country.nunique()} countries; {int(st.matches.sum())} matches, {int(st.goals.sum())} goals.",
        f"- Top scorer: {sc.iloc[0].player} ({sc.iloc[0].club}) {sc.iloc[0].goals}; then {', '.join(f'{r.player} {r.goals}' for r in sc.iloc[1:4].itertuples())}.",
        '', '**Stages**', '', md_table(st), '', '**Knockout ties**', '', md_table(ko), ''])

# ---------------------------------------------------------------------------

def plan_json(src):
    beats = [dict(id=b['id'], text=b['text'], month=b.get('month'), kind=b['kind'], strength=b['strength'], teams=b.get('teams') or '', evidence=b.get('evidence') or '')
             for b in src['beats']]
    spreads = []
    for s in src['spreads']:
        c = s.get('chart') or {}
        notes = ' '.join(x for x in [c.get('encode'), c.get('highlight'), *(f'Annotate: {a}' for a in c.get('annotate') or []), c.get('notes')] if x)
        p = c.get('preset')
        spreads.append(dict(
            id=s['id'], chapter=s['chapter'], template=s['template'], beatId=s.get('beat'), headline=s['headline'],
            chart=dict(form=s['form'], sketch=[], notes=notes[:1000],
                       data=dict(preset=p['preset'], competition=p['competition'], teams=p.get('teams') or [], month=p.get('month')) if p else None),
            stat=dict(value=s['stat']['value'], label=s['stat']['label']),
            body=s.get('body') or '', caption=s.get('caption') or '', status=status(s),
            notes='\n'.join(['Design: ' + d for d in s.get('design') or []] + ['Check: ' + d for d in s.get('checks') or []] +
                            ([f"Source: {s['source']}"] if s.get('source') else []))[:2000]))
    return dict(beats=beats, spreads=spreads)

def main(start):
    season = f'{start}-{str(start + 1)[2:]}'
    base = os.path.join(ROOT, 'briefs', season)
    src = yaml.safe_load(open(os.path.join(base, 'spreads.yaml')))
    beats = {b['id']: b for b in src['beats']}
    order = {c: i for i, c in enumerate(chapters(start))}
    spreads = sorted(src['spreads'], key=lambda s: order[s['chapter']])  # stable: keeps YAML order within a chapter
    num = {s['id']: i + 1 for i, s in enumerate(spreads)}
    data = os.path.join(base, 'data')
    label = f'{start}–{str(start + 1)[2:]}'

    for comp, (fname, level) in COMPETITIONS.items():
        mine = [s for s in spreads if s['competition'] == comp]
        facts = league_facts(data) if level == 'league' else cup_facts(data)
        head = [f'# {comp} {label} — {level}-level spreads', '',
                f'Design briefs for the {comp} spreads of the {label} season book: {len(mine)} spreads, numbered by their place in the book '
                f'(see [flatplan.md](flatplan.md)). Rendered from [spreads.yaml](spreads.yaml) by `scripts/briefs.py`; edit the YAML, not this file.', '',
                'Every spread is one claim (the headline) proved by one visual, set on the locked series system '
                '([system.ts](../../../apps/admin/lib/seasonBooks/system.ts), SYSTEM_VERSION ' + str(src['system_version']) + '): '
                '12 × 8 spread grid, accent `#D7372B`, second `#1F5AA6`, muted `#8A8780`, results W ink / D draw-grey / L accent, '
                'at most two coloured series, direct labels, a Label-style source line under every chart.', '',
                facts, '## Spreads', '']
        body = [brief(s, num[s['id']], beats) for s in mine]
        open(os.path.join(base, fname), 'w').write('\n'.join(head + body))

    rows = []
    for s in spreads:
        c = s.get('chart') or {}
        rows.append(dict(no=num[s['id']], chapter=chapter_label(s['chapter']), id=s['id'], competition=s['competition'],
                         template=TEMPLATE_LABEL[s['template']], role=ROLE[s['template']], form=FORM_LABEL[s['form']],
                         headline=s['headline'].replace('|', '/'), data=', '.join(c.get('data') or []) or '—', status=status(s)))
    rhythm = ''.join({'frame': 'F', 'hero': 'H', 'dense': 'D', 'breather': 'B'}[ROLE[s['template']]] for s in spreads)
    flat = [f'# {label} book — league and cup spreads, flatplan', '',
            f'{len(spreads)} spreads in reading order ({sum(s["competition"] == "Premier League" for s in spreads)} Premier League, '
            f'{sum(s["competition"] == "Champions League" for s in spreads)} Champions League, plus the cover). '
            f'{len(src["beats"])} beats. Rhythm: `{rhythm}` (F frame, H hero, D dense, B breather).', '',
            'Club- and match-level spreads, and the other leagues, slot in between these later; months with no league/cup spread here '
            'are left to them. `status` is the Books-tab status the card starts at: `data` = bound to a Pull-real-data preset, '
            '`card` = headline + chart notes, data in `data/` but not a preset.', '',
            md_table(pd.DataFrame(rows)), '',
            '## Importing into the Books tab', '',
            '`plan.json` is a full `planSchema` plan (beats + spreads). Check it with',
            '`pnpm --filter admin exec tsx scripts/checkSeasonPlan.ts ../../vizmaya-data/football-seasons/briefs/' + season + '/plan.json ' + str(start) + '`,',
            f'then load it into the `{season}` book (PUT `/api/footshorts/books/{season}` with `{{ revision, title, plan }}`, revision from a GET). Sketches are empty:',
            'the chart notes carry the sketch until someone draws one.', '']
    open(os.path.join(base, 'flatplan.md'), 'w').write('\n'.join(flat))

    json.dump(plan_json({**src, 'spreads': spreads}), open(os.path.join(base, 'plan.json'), 'w'), ensure_ascii=False, indent=1)
    budget = {'cover': (0, 80), 'intro': (80, 150), 'hero': (80, 150), 'comparison': (80, 150), 'timeline': (80, 150), 'table': (80, 150), 'breather': (0, 60)}
    for s in spreads:
        lo, hi = budget[s['template']]
        if not lo <= words(s.get('body')) <= hi: print(f"  {s['id']}: body {words(s.get('body'))} words, {s['template']} takes {lo}–{hi}")
    print(f'{season}: {len(spreads)} spreads, {len(src["beats"])} beats → {base}')

if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) == 2 and a[0] == '--season' and a[1].isdigit(): main(int(a[1]))
    else: sys.exit(__doc__)
