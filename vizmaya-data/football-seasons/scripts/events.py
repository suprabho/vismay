"""Layer 2 — monthly events (manager changes, transfers, and everything else) for one season.

  python3 -I scripts/events.py fetch    --season 2003   season's Wikipedia pages → raw/wikipedia/ (cached)
  python3 -I scripts/events.py tables   --season 2003   → data/manager_changes.csv, data/transfers.csv (rows for this season replaced)
  python3 -I scripts/events.py text     --season 2003   articles → raw/wikipedia_text/<season>/*.txt (tables dropped,
                                                        citations kept inline as ⟨url⟩) + manifest.json for the extractor
  pnpm --filter @footshorts/worker history:events -- --season=2003     Claude extracts events, each with a verbatim
                                                        quote checked against the page → raw/events_llm/<season>/*.json
  python3 -I scripts/events.py build    --season 2003   → data/events.csv (this season's rows replaced)

events.csv: date, season, month, type, competition, teams (canonical ids), team_names, people, summary, fee,
source_url, origin, source_page, evidence, verified (blank — for the hand check), notes.
"""
import csv, json, os, re, sys, time, urllib.parse, urllib.request, datetime as dt
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I drops the script dir
from players import (WIKI, DATA, ROOT, TM, TM_COMPS, wiki_title, season_label, parse_table, tables_in, plain,
                     link_text, read_csv, read_gz, club_matcher)

NATIONS = ['English', 'Spanish', 'Italian', 'German', 'French', 'Dutch', 'Portuguese', 'Scottish']
LEAGUES = list(TM_COMPS.values()) + ['Championship']
UA = {'User-Agent': 'vizmaya-football-seasons/1.0 (hello@promad.design)'}

# Book-specific picks: the clubs and stories a season's chapters lean on. Missing pages are skipped.
SEASON_EXTRAS = {
    2003: ['Arsenal F.C.', 'Chelsea F.C.', 'Manchester United F.C.', 'Liverpool F.C.', 'Newcastle United F.C.',
           'Leeds United A.F.C.', 'FC Porto', 'Real Madrid CF', 'FC Barcelona', 'Valencia CF', 'Deportivo de La Coruña',
           'AC Milan', 'Juventus FC', 'Inter Milan', 'AS Monaco FC', 'Olympique Lyonnais', 'FC Bayern Munich',
           'SV Werder Bremen', 'Celtic F.C.', 'Rangers F.C.', 'Sporting CP', 'AFC Ajax', 'PSV Eindhoven'],
}
SEASON_STORIES = {
    2003: ['UEFA Euro 2004', 'UEFA Euro 2004 final', '2004 UEFA Champions League final', '2004 FA Cup final',
           'Battle of Old Trafford'],
}

def dash(start): return f'{start}–{str(start + 1)[2:]}'

def season_pages(start):
    """[(title, kind)] — kind: league | review | transfers | club | competition | story."""
    s = dash(start)
    pages = [(wiki_title(c, start), 'league') for c in LEAGUES]
    pages += [(f'{s} in {n} football', 'review') for n in NATIONS]
    pages += [(t, 'transfers') for n in NATIONS for t in (f'List of {n} football transfers summer {start}',
                                                            f'List of {n} football transfers winter {s}')]
    pages += [(f'{s} {club} season', 'club') for club in SEASON_EXTRAS.get(start, [])]
    pages += [(f'{s} UEFA Cup', 'competition'), (f'{s} FA Cup', 'competition'), (f'{s} Football League Cup', 'competition')]
    pages += [(t, 'story') for t in SEASON_STORIES.get(start, [])]
    return pages

def page_path(title): return os.path.join(WIKI, f'{title}.json')
def page_url(title): return 'https://en.wikipedia.org/wiki/' + urllib.parse.quote(title.replace(' ', '_'))

def fetch(start):
    os.makedirs(WIKI, exist_ok=True)
    titles = [t for t, _ in season_pages(start)]
    have = [t for t in titles if os.path.exists(page_path(t))]
    todo = [t for t in titles if t not in have]
    missing = []
    for i in range(0, len(todo), 40):  # one existence query per 40 titles, then fetch only real pages
        q = urllib.parse.urlencode({'action': 'query', 'titles': '|'.join(todo[i:i + 40]), 'redirects': 1, 'format': 'json', 'formatversion': 2})
        d = json.load(urllib.request.urlopen(urllib.request.Request(f'https://en.wikipedia.org/w/api.php?{q}', headers=UA), timeout=30))['query']
        gone = {p['title'] for p in d['pages'] if p.get('missing')}
        norm = {n['from']: n['to'] for n in d.get('normalized', [])}
        missing += [t for t in todo[i:i + 40] if norm.get(t, t) in gone]
    got = 0
    for t in todo:
        if t in missing: continue
        q = urllib.parse.urlencode({'action': 'parse', 'page': t, 'prop': 'wikitext', 'redirects': 1, 'format': 'json', 'formatversion': 2})
        body = json.load(urllib.request.urlopen(urllib.request.Request(f'https://en.wikipedia.org/w/api.php?{q}', headers=UA), timeout=30))
        if 'parse' in body:
            json.dump(body['parse'], open(page_path(t), 'w')); got += 1
        time.sleep(1)
    print(f'{got} fetched, {len(have)} cached, {len(missing)} not on Wikipedia: {missing}')

# ---------------------------------------------------------------- tables

MONTHS = {m: i for i, m in enumerate(['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
                                      'september', 'october', 'november', 'december'], 1)}

def parse_date(s):
    """'22 September 2003' / 'September 22, 2003' / '2003-09-22' → ISO, else ''."""
    s = plain(s)
    m = re.search(r'(\d{4})-(\d{2})-(\d{2})', s)
    if m: return m.group(0)
    m = re.search(r'(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})', s) or re.search(r'([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})', s)
    if not m: return ''
    a, b, y = m.groups()
    day, mon = (a, b) if a.isdigit() else (b, a)
    mi = MONTHS.get(mon.lower()) or MONTHS.get(next((k for k in MONTHS if k.startswith(mon.lower()[:3])), ''), 0)
    try: return dt.date(int(y), mi, int(day)).isoformat()
    except ValueError: return ''

def ref_url(raw):
    m = re.search(r'\|\s*url\s*=\s*([^|}\s]+)', raw) or re.search(r'\[(https?://\S+)', raw)
    return m.group(1) if m else ''

def wiki_tables(title):
    path = page_path(title)
    if not os.path.exists(path): return []
    return [parse_table_raw(t) for t in tables_in(json.load(open(path))['wikitext'])]

def parse_table_raw(t):
    """parse_table, but keep raw cell text (refs intact) so citations can be read."""
    return parse_table(t)

def col(header, *pats):
    cols = [plain(c).lower() for c in header]
    return next((i for i, c in enumerate(cols) for p in pats if re.search(p, c)), None)

def tables(start):
    s, match = season_label(start), club_matcher()
    managers, transfers = [], []
    for title, kind in season_pages(start):
        if kind in ('league', 'review'):
            comp = next((c for c in LEAGUES if wiki_title(c, start) == title), '')
            for header, rows in wiki_tables(title):
                team, out_, how, vac, inn, app = (col(header, r'^team|^club'), col(header, r'outgoing'), col(header, r'manner|departure|reason'),
                                                  col(header, r'date of vacancy|vacancy'), col(header, r'incoming|replaced'), col(header, r'date of appointment|appointment'))
                if None in (team, out_, inn): continue
                for r in rows:
                    if len(r) <= max(x for x in (team, out_, how, vac, inn, app) if x is not None): continue
                    club_name = plain(link_text(r[team])[0]) or plain(r[team])
                    date = parse_date(r[vac]) if vac is not None else ''
                    managers.append(dict(season=s, date=date, competition=comp, club=match(club_name, comp, s) if comp else '', club_name=club_name,
                                         outgoing=link_text(r[out_])[0], incoming=link_text(r[inn])[0],
                                         reason=plain(r[how]) if how is not None else '', appointed=parse_date(r[app]) if app is not None else '',
                                         source_url=ref_url(r[vac]) if vac is not None else '' or ref_url(r[app] if app is not None else ''),
                                         source_page=page_url(title)))
        elif kind == 'transfers':
            for header, rows in wiki_tables(title):
                d, name, frm, to, fee = (col(header, r'^date'), col(header, r'^name|^player'), col(header, r'from'), col(header, r'^moving to|^to'), col(header, r'^fee'))
                if None in (d, name, frm, to): continue
                for r in rows:
                    if len(r) <= max(x for x in (d, name, frm, to, fee) if x is not None): continue
                    gbp = re.search(r'\{\{\s*ntsh\s*\|\s*(\d+)', r[fee]) if fee is not None else None
                    transfers.append(dict(season=s, date=parse_date(r[d]), player=link_text(r[name])[0],
                                          from_club_name=link_text(r[frm])[0], to_club_name=link_text(r[to])[0],
                                          fee=plain(r[fee]) if fee is not None else '', fee_gbp=gbp.group(1) if gbp and gbp.group(1) != '0' else '',
                                          fee_eur='', source='wikipedia', source_url=ref_url(r[fee]) if fee is not None else '', source_page=page_url(title)))
    # Transfermarkt: every move it knows for the season (sparse before 2012 — only players still active after 2012).
    tm_season = f'{str(start)[2:]}/{str(start + 1)[2:]}'
    for r in read_gz('transfers'):
        if r['transfer_season'] != tm_season: continue
        eur = r['transfer_fee'].split('.')[0]
        transfers.append(dict(season=s, date=r['transfer_date'], player=r['player_name'], from_club_name=r['from_club_name'],
                              to_club_name=r['to_club_name'], fee='', fee_gbp='', fee_eur=eur if eur not in ('', '0') else '',
                              source='transfermarkt', source_url='', source_page=''))
    # Same move from both sources → keep the Wikipedia row (it has the fee as published + citation).
    seen, deduped = set(), []
    for t in sorted(transfers, key=lambda t: t['source'] != 'wikipedia'):
        key = (t['player'].lower().split()[-1] if t['player'] else '', t['date'][:7])
        if t['source'] == 'transfermarkt' and key in seen: continue
        seen.add(key); deduped.append(t)
    replace_season(os.path.join(DATA, 'manager_changes.csv'), s, managers)
    replace_season(os.path.join(DATA, 'transfers.csv'), s, sorted(deduped, key=lambda t: t['date']))
    print(f'{s}: {len(managers)} manager changes, {len(deduped)} transfers '
          f'({sum(t["source"] == "wikipedia" for t in deduped)} Wikipedia, {sum(t["source"] == "transfermarkt" for t in deduped)} Transfermarkt)')

def replace_season(path, season, rows):
    old = [r for r in read_csv(path) if r['season'] != season] if os.path.exists(path) else []
    out = old + rows
    if not out: return
    with open(path, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0] if rows else out[0])); w.writeheader(); w.writerows(out)

# ---------------------------------------------------------------- text for the extractor

def to_text(wikitext):
    """Readable prose: tables, infoboxes, galleries and files dropped; citations kept as ⟨url⟩."""
    t = wikitext
    for tbl in tables_in(t): t = t.replace(tbl, '')
    t = re.sub(r'<ref[^>/]*>(.*?)</ref>', lambda m: f' ⟨{ref_url(m.group(1))}⟩ ' if ref_url(m.group(1)) else '', t, flags=re.S)
    t = re.sub(r'<ref[^>]*/>', '', t)
    t = re.sub(r'<!--.*?-->', '', t, flags=re.S)
    for _ in range(4):  # nested templates, innermost first (keep simple inline ones' text)
        t = re.sub(r'\{\{\s*(?:nowrap|small|center|lang\|[a-z]+)\s*\|([^{}]*)\}\}', r'\1', t, flags=re.I)
        t = re.sub(r'\{\{[^{}]*\}\}', '', t)
    t = re.sub(r'\[\[(?:File|Image|Category):[^\]]*(\[\[[^\]]*\]\][^\]]*)*\]\]', '', t, flags=re.I)
    t = re.sub(r'\[\[(?:[^|\]]+\|)?([^\]]+)\]\]', r'\1', t)
    t = re.sub(r'\[https?://\S+\s+([^\]]+)\]', r'\1', t)
    t = re.sub(r"'''?|<[^>]+>", '', t)
    t = re.sub(r'\n{3,}', '\n\n', t)
    return t.strip()

def text(start):
    s = season_label(start)
    out_dir = os.path.join(ROOT, 'raw', 'wikipedia_text', s)
    os.makedirs(out_dir, exist_ok=True)
    manifest = []
    for title, kind in season_pages(start):
        if kind == 'transfers' or not os.path.exists(page_path(title)): continue
        body = to_text(json.load(open(page_path(title)))['wikitext'])
        if len(body) < 500: continue
        fname = re.sub(r'[^\w.–-]+', '_', title) + '.txt'
        with open(os.path.join(out_dir, fname), 'w') as f: f.write(body)
        manifest.append(dict(title=title, kind=kind, url=page_url(title), file=fname, chars=len(body)))
    json.dump(dict(season=s, start=start, window=[f'{start}-05-01', f'{start + 1}-07-31'], pages=manifest),
              open(os.path.join(out_dir, 'manifest.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'{len(manifest)} articles → {out_dir} ({sum(p["chars"] for p in manifest) // 1000}k chars)')

# ---------------------------------------------------------------- build

NOTABLE_GBP, NOTABLE_EUR = 5_000_000, 7_000_000
EVENT_COLS = ['date', 'season', 'month', 'type', 'importance', 'competition', 'teams', 'team_names', 'people', 'summary',
              'fee', 'source_url', 'origin', 'source_page', 'evidence', 'verified', 'notes']

def surnames(people): return {p.split()[-1].lower() for p in people if p.strip()}

ON_PITCH = {'match', 'record', 'controversy', 'suspension', 'international', 'award'}

def same_happening(x, row, people, teams):
    """Same date (a month-only date matches any day in it), and the same story: same type with a
    shared person (or team, when nobody is named), or — across on-pitch types — the same 2+ teams
    or a shared person ("Battle of Old Trafford" filed as both match and controversy)."""
    a, b = x['date'], row['date']
    if not (a == b or (len(a) == 7 and b.startswith(a)) or (len(b) == 7 and a.startswith(b))): return False
    their_people, their_teams = surnames(x['people'].split(' | ')), set(filter(None, x['team_names'].split(' | ')))
    shared_people, shared_teams = their_people & surnames(people), their_teams & set(teams)
    if x['type'] == row['type']:
        return bool(shared_people) or (len(shared_teams) >= 2) or (not people and bool(shared_teams))
    if x['type'] in ON_PITCH and row['type'] in ON_PITCH:
        return bool(shared_people) or (len(teams) >= 2 and len(shared_teams) >= 2)
    return False

def build(start):
    s, match = season_label(start), club_matcher()
    def teams_of(names, comp):
        ids = [match(n, comp, s) for n in names]
        return ' | '.join(i for i in ids if i)
    events = []
    for m in read_csv(os.path.join(DATA, 'manager_changes.csv')):
        if m['season'] != s or not m['date']: continue
        how = f' ({m["reason"].lower()})' if m['reason'] else ''
        events.append(dict(date=m['date'], type='manager_change', importance=2, competition=m['competition'], teams=m['club'],
                           team_names=m['club_name'], people=f'{m["outgoing"]} | {m["incoming"]}',
                           summary=f'{m["club_name"]}: {m["outgoing"]} out{how}; {m["incoming"]} appointed'
                                   + (f' {m["appointed"]}' if m['appointed'] and m['appointed'] != m['date'] else ''),
                           fee='', source_url=m['source_url'], origin='wikipedia:managerial-changes', source_page=m['source_page'], evidence=''))
    for t in read_csv(os.path.join(DATA, 'transfers.csv')):
        if t['season'] != s or not t['date']: continue
        gbp, eur = int(t['fee_gbp'] or 0), int(t['fee_eur'] or 0)
        if gbp < NOTABLE_GBP and eur < NOTABLE_EUR: continue
        fee = t['fee'] or f'€{eur / 1e6:g}m'
        events.append(dict(date=t['date'], type='transfer', importance=3 if gbp >= 15_000_000 or eur >= 20_000_000 else 2, competition='',
                           teams=teams_of([t['from_club_name'], t['to_club_name']], ''), team_names=f'{t["from_club_name"]} | {t["to_club_name"]}',
                           people=t['player'], summary=f'{t["player"]}: {t["from_club_name"]} → {t["to_club_name"]} ({fee})', fee=fee,
                           source_url=t['source_url'], origin=f'{t["source"]}:transfers', source_page=t['source_page'], evidence=''))
    structured = list(events)
    llm_dir = os.path.join(ROOT, 'raw', 'events_llm', s)
    dupes = 0
    extracted = [(e, page) for f in (sorted(os.listdir(llm_dir)) if os.path.isdir(llm_dir) else [])
                 for page in [json.load(open(os.path.join(llm_dir, f)))] for e in page['events']]
    # Day-precision and more important events first, so month-only mentions fold into them.
    extracted.sort(key=lambda ep: (-len(ep[0]['date']), -ep[0]['importance']))
    for e, page in extracted:
        if True:
            row = dict(date=e['date'], type=e['type'], importance=e['importance'], competition=e['competition'],
                       teams=teams_of(e['teams'], e['competition']), team_names=' | '.join(e['teams']), people=' | '.join(e['people']),
                       summary=e['summary'], fee='', source_url=e['source_url'], origin=f'claude:{page["title"]}',
                       source_page=page['url'], evidence=e['evidence'])
            # Same happening seen twice (two articles, or an article + a table row): same type, same date
            # (or same month at month precision), and a shared person — or a shared team when no people.
            twin = next((x for x in events if same_happening(x, row, e['people'], e['teams'])), None)
            if twin:
                dupes += 1
                twin['importance'] = max(int(twin['importance']), e['importance'])
                if not twin['source_url'] and e['source_url']: twin['source_url'] = e['source_url']
                if not twin['evidence']: twin['evidence'], twin['origin'] = e['evidence'], twin['origin'] + f' + claude:{page["title"]}'
                continue
            events.append(row)
    # Keep the hand check: verified/notes survive a rebuild when origin + date + type + summary still match.
    path = os.path.join(DATA, 'events.csv')
    old = read_csv(path) if os.path.exists(path) else []
    checked = {(r['origin'], r['date'], r['type'], r['summary']): (r['verified'], r['notes']) for r in old if r['season'] == s}
    for e in events:
        e.update(season=s, month=e['date'][:7], verified='', notes='')
        e['verified'], e['notes'] = checked.get((e['origin'], e['date'], e['type'], e['summary']), ('', ''))
    events.sort(key=lambda e: (e['date'], -int(e['importance']), e['type']))
    rows = [r for r in old if r['season'] != s] + [{k: e.get(k, '') for k in EVENT_COLS} for e in events]
    with open(path, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=EVENT_COLS); w.writeheader(); w.writerows(rows)
    by = defaultdict(int)
    for e in events: by[e['type']] += 1
    print(f'{s}: {len(events)} events ({len(structured)} from tables, {len(events) - len(structured)} from Claude, '
          f'{dupes} duplicates merged); {dict(sorted(by.items(), key=lambda x: -x[1]))}; '
          f'{sum(1 for e in events if e["verified"])} keep a previous hand check')

# ---------------------------------------------------------------- review page sync
# The "Events Review" artifact keeps one db document per event in collection `events`.
# review-export writes those documents as JSON files (for ArtifactData batch writes);
# review-import reads them back (an ArtifactData `list` saved with out_dir) into events.csv.

def event_id(r):
    import hashlib
    return hashlib.sha1('|'.join((r['origin'], r['date'], r['type'], r['summary'])).encode()).hexdigest()[:16]

def review_export(start, out):
    s = season_label(start)
    os.makedirs(out, exist_ok=True)
    rows = [r for r in read_csv(os.path.join(DATA, 'events.csv')) if r['season'] == s]
    for r in rows:
        doc = {k: r[k] for k in EVENT_COLS}
        doc['importance'] = int(r['importance'] or 1)
        with open(os.path.join(out, f'{event_id(r)}.json'), 'w') as f: json.dump(doc, f, ensure_ascii=False)
    print(f'{len(rows)} event documents → {out}')

def review_import(start, src):
    s, path = season_label(start), os.path.join(DATA, 'events.csv')
    reviewed = {}
    for root, _, files in os.walk(src):
        for f in files:
            if f.endswith('.json'):
                d = json.load(open(os.path.join(root, f)))
                d = d.get('data', d)  # tolerate a {data: …} wrapper
                reviewed[f[:-5]] = (d.get('verified', ''), d.get('notes', ''))
    rows, changed = read_csv(path), 0
    for r in rows:
        if r['season'] != s: continue
        v = reviewed.get(event_id(r))
        if v and (r['verified'], r['notes']) != v: r['verified'], r['notes'] = v; changed += 1
    with open(path, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=EVENT_COLS); w.writeheader(); w.writerows(rows)
    print(f'{changed} events updated from the review page ({sum(1 for v in reviewed.values() if v[0])} checked so far)')

if __name__ == '__main__':
    args = sys.argv[1:]
    if args[:1] in (['review-export'], ['review-import']) and len(args) == 4 and args[1] == '--season' and args[2].isdigit():
        (review_export if args[0] == 'review-export' else review_import)(int(args[2]), args[3]); sys.exit()
    if len(args) != 3 or args[1] != '--season' or not args[2].isdigit(): sys.exit(__doc__)
    {'fetch': fetch, 'tables': tables, 'text': text, 'build': build}.get(args[0], lambda _: sys.exit(__doc__))(int(args[2]))
