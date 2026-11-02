"""Reconciled matches + Transfermarkt players -> one complete team pack per club."""
import collections, csv, html, importlib.util, json, os, re, sys, unicodedata

SP = sys.argv[1]
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../data')


def load(n):
    spec = importlib.util.spec_from_file_location(n, os.path.join(os.path.dirname(os.path.abspath(__file__)),n+'.py'))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


tp, tk = load('tm_parse'), load('tokens')
T = tk.Tok()
rd = lambda p: open(p, encoding='utf-8', errors='replace').read()
B = json.load(open(f'{SP}/packs/_base.json'))
R = json.load(open(f'{SP}/packs/_recon.json'))
GAMES, TABLES, MET, RAD = B['games'], B['tables'], B['M'], B['RAD']
HIGH = {'gpg', 'win', 'away', 'cs'}
KICK = {'manu': 'MANCHESTER UNITED', 'mancity': 'MANCHESTER CITY', 'newcastle': 'NEWCASTLE UNITED', 'charlton': 'CHARLTON ATHLETIC', 'bolton': 'BOLTON WANDERERS', 'birmingham': 'BIRMINGHAM CITY', 'tottenham': 'TOTTENHAM HOTSPUR', 'blackburn': 'BLACKBURN ROVERS', 'leicester': 'LEICESTER CITY', 'leeds': 'LEEDS UNITED', 'wolves': 'WOLVERHAMPTON WANDERERS', 'villa': 'ASTON VILLA'}

# opponents' tokens the kit data does not reach; colours are the clubs' 2003-04 home kits
HAND = {
    'Steaua Bucharest': ('STE', 'roundel', 'halves', '#0B3D91', '#D21034'), 'Olympique Marseille': ('OM', 'plate', 'trim', '#FFFFFF', '#2FAEE0'),
    'Wimbledon FC (- 2004)': ('WIM', 'roundel', 'plain', '#1A2D69', None), 'Brighton & Hove Albion': ('BHA', 'roundel', 'stripes', '#0057B8', '#FFFFFF'),
    'Bristol City': ('BRC', 'roundel', 'plain', '#E21A23', None), 'KSC Lokeren (-2020)': ('LOK', 'roundel', 'plain', '#15161A', None),
    'Queens Park Rangers': ('QPR', 'roundel', 'hoops', '#1D5BA4', '#FFFFFF'), 'Dyskobolia Grodzisk Wielkopolski': ('DYS', 'roundel', 'plain', '#14824A', None),
    'Derby County': ('DER', 'roundel', 'band', '#FFFFFF', '#15161A'), 'Hull City': ('HUL', 'heater', 'stripes', '#F5A12D', '#15161A'), 'Ipswich Town': ('IPS', 'heater', 'plain', '#0033A0', None),
    'Feyenoord Rotterdam': ('FEY', 'roundel', 'halves', '#E30613', '#FFFFFF'), 'Stade Rennais FC': ('REN', 'heater', 'band', '#E2001A', '#15161A'), 'Djurgårdens IF': ('DIF', 'heater', 'stripes', '#005DA8', '#1B1B1F'),
    'Sheffield United': ('SHU', 'heater', 'stripes', '#E21A23', '#FFFFFF'), 'Sheffield Wednesday': ('SHW', 'heater', 'stripes', '#0033A0', '#FFFFFF'), 'Chesterfield FC': ('CHF', 'roundel', 'plain', '#0033A0', None),
    'FC Twente Enschede': ('TWE', 'roundel', 'plain', '#E21A23', None), 'Columbus Crew': ('CLB', 'roundel', 'plain', '#FEDD00', None), 'Peterborough United': ('PET', 'roundel', 'plain', '#0057B8', None),
    'CA Rosario Central': ('ROS', 'roundel', 'stripes', '#0033A0', '#FEDD00'), 'São Paulo Futebol Clube': ('SAO', 'heater', 'band', '#FFFFFF', '#E21A23'), 'Celta de Vigo': ('CEL', 'heater', 'plain', '#8CC0E8', None),
    'SS Lazio': ('LAZ', 'heater', 'plain', '#87D8F7', None), 'Rotherham United': ('ROT', 'roundel', 'plain', '#E21A23', None), 'Brentford FC': ('BRE', 'heater', 'stripes', '#E21A23', '#FFFFFF'),
    'Oxford United': ('OXF', 'roundel', 'plain', '#FFD200', None), 'Vitesse Arnhem': ('VIT', 'roundel', 'stripes', '#FFD200', '#15161A'), 'RSC Anderlecht': ('AND', 'plate', 'plain', '#5A2D82', None),
    'Cagliari Calcio': ('CAG', 'roundel', 'halves', '#C8102E', '#0A2A5C'), 'Huddersfield Town': ('HUD', 'heater', 'stripes', '#0E63AD', '#FFFFFF'), 'Motherwell FC': ('MOT', 'roundel', 'band', '#F2B300', '#8A1538'),
    'Preston North End': ('PNE', 'roundel', 'plain', '#FFFFFF', None), 'Kilmarnock FC': ('KIL', 'roundel', 'stripes', '#0033A0', '#FFFFFF'), 'Leyton Orient': ('LEY', 'roundel', 'plain', '#E21A23', None),
    'KRC Genk': ('GNK', 'roundel', 'plain', '#0033A0', None),
}
DISPLAY = {'Tottenham Hotspur': 'Tottenham', 'Queens Park Rangers': 'QPR', 'West Bromwich Albion': 'West Brom', 'Wolverhampton Wanderers': 'Wolves', 'Northampton Town': 'Northampton', 'Kidderminster Harriers': 'Kidderminster', 'Wycombe Wanderers': 'Wycombe', 'Dyskobolia Grodzisk Wielkopolski': 'Groclin Grodzisk', 'Steaua Bucharest': 'Steaua', 'Olympique Marseille': 'Marseille', 'Wimbledon FC (- 2004)': 'Wimbledon', 'NK Olimpija Ljubljana': 'Olimpija Ljubljana',
           'FK Partizan Belgrade': 'Partizan', 'FC Basel 1893': 'Basel', 'Vålerenga Fotball Elite': 'Vålerenga', 'RCD Mallorca': 'Mallorca', 'KSC Lokeren (-2020)': 'Lokeren', 'Genclerbirligi Ankara': 'Gençlerbirliği',
           'Darlington FC (- 2012)': 'Darlington', 'Total Network Solutions': 'TNS', 'Brighton & Hove Albion': 'Brighton'}


def token_for(name):
    n = html.unescape(name)
    if n in HAND:
        c, f, p, a, b = HAND[n]
        return dict(code=c, family=f, pattern=p, c1=a, c2=b)
    return T.get(n)


def disp(name):
    n = html.unescape(name)
    if n in DISPLAY:
        return DISPLAY[n]
    return re.sub(r'\s*\(-.*?\)|\s+(FC|AFC)$', '', n).strip()


# ---- normalise rounds -------------------------------------------------------
def norm_round(comp, rnd):
    r = rnd.lower()
    replay = 'replay' in r or 'decider' in r
    leg = 1 if '1st leg' in r else 2 if '2nd leg' in r else 0
    if comp == 'LC' and rnd == '2':
        return 'R2', False, 0
    if comp == 'UCLQ':
        return 'Q3', False, leg
    if comp == 'UCQ':
        return 'QR', False, leg
    if comp == 'UC' or comp == 'UCL':
        pass
    m = {'first round': 'R1', 'second round': 'R2', 'third round': 'R3', '3rd round': 'R3', 'fourth round': 'R4', '4th round': 'R4', 'fifth round': 'R5', '5th round': 'R5',
         'round of 16': 'R4', 'last 16': 'R4' if comp == 'UC' else 'R16', 'quarter-finals': 'QF', 'semi-finals': 'SF', 'final': 'F', 'group': 'GRP'}
    for k, v in m.items():
        if r.startswith(k):
            return v, replay, leg
    raise ValueError(comp + ' ' + rnd)


def matches(key, p):
    fd = p['fd']
    out = []
    for m in p['matches']:
        c = m['comp']
        comp = {'UEFA-Cup (- 2009)': 'UC', 'UEFA-Cup Qualifikation': 'UCQ'}.get(c, c)
        gf, ga = m['sb_gf'], m['sb_ga']
        date = m['sb_date']
        lab, replay, leg = ('', False, 0) if comp == 'PL' else ('F', False, 0) if comp == 'CS' else norm_round(comp, m['rnd'])
        neutral = comp == 'CS' or (comp == 'FAC' and lab in ('SF', 'F')) or (comp == 'LC' and lab == 'F')
        venue = 'N' if neutral else m['venue']
        pens = None
        if m['extra'] == 'on pens':
            pens = (m['gf'] - gf, m['ga'] - ga)
            if lab == 'Q3':  # two legs: TM adds the aggregate, not this leg, to the shootout
                prior = [x for x in p['matches'] if x['comp'] == c and x['rnd'] != m['rnd'] and x['opp'] == m['opp']]
                tot_f = gf + sum(x['sb_gf'] for x in prior); tot_a = ga + sum(x['sb_ga'] for x in prior)
                pens = (m['gf'] - tot_f, m['ga'] - tot_a)
        res = 'W' if gf > ga else 'L' if gf < ga else 'D'
        out.append(dict(mid=m['mid'], date=date, comp={'UCLQ': 'UCL', 'UCQ': 'UC'}.get(comp, comp), rawcomp=comp, label=lab, replay=replay, leg=leg, venue=venue, opp=html.unescape(m['opp']), gf=gf, ga=ga, res=res, pens=pens, aet=m['extra'] == 'AET', formation=m['formation'], coach=m['coach']))
    out.sort(key=lambda x: x['date'])
    return out


ORDER = {'Q3': 0, 'QR': 0, 'GRP': 1, 'R1': 1, 'R2': 2, 'R3': 3, 'R4': 4, 'R5': 5, 'R16': 5, 'QF': 6, 'SF': 7, 'F': 8}
SUBS = {
    'UC': 'Two legs per round · no group stage until 2004–05',
    'LC': 'Single matches',
    'FAC': 'Single matches, replay if drawn',
    'UCL': 'Third qualifying round, two legs · the losers drop into the UEFA Cup',
}


def runs(ms):
    blocks = []
    for comp in ('UCL', 'UC', 'LC', 'FAC'):
        sel = [m for m in ms if m['comp'] == comp]
        if not sel:
            continue
        groups = collections.OrderedDict()
        for m in sel:
            groups.setdefault(m['label'], []).append(m)
        keys = sorted(groups, key=lambda k: ORDER[k])
        rows = []
        for i, k in enumerate(keys):
            g = groups[k]
            last = i == len(keys) - 1
            if k == 'GRP':  # reference clubs only: their group card is not regenerated
                rows.append(dict(label=k, opp='Group', token=None, legs='', right='', tie_won=True))
                continue
            legs = ' · '.join(f'{m["venue"]} {m["gf"]}-{m["ga"]}' for m in g)
            opp = g[0]['opp']
            twoleg = any(m['leg'] for m in g)
            pens = next((m['pens'] for m in g if m['pens']), None)
            replay = any(m['replay'] for m in g)
            won = None
            if twoleg:
                a, b = sum(m['gf'] for m in g), sum(m['ga'] for m in g)
                right = f'{a}-{b}'
                if pens:
                    right = f'{pens[0]}-{pens[1]} pens'
                elif a == b:
                    # level on aggregate, no shootout: away goals decided it
                    away_us = sum(m['gf'] for m in g if m['venue'] == 'A')
                    away_them = sum(m['ga'] for m in g if m['venue'] == 'H')
                    right = f'{a}-{b} AG'
                    won = away_us > away_them
                else:
                    won = a > b
                if pens:
                    won = pens[0] > pens[1]
            else:
                m = g[-1]
                if pens:
                    right = f'{pens[0]}-{pens[1]} pens'
                    won = pens[0] > pens[1]
                elif replay:
                    right = 'replay'
                    won = m['gf'] > m['ga']
                else:
                    right = '1 leg'
                    won = m['gf'] > m['ga']
            row = dict(label=k, opp=disp(opp), token=token_for(opp), legs=legs, right=right, tie_won=won)
            if not won:
                row['out'] = True
                m = g[-1]
                if right in ('1 leg',):
                    right = f'{m["gf"]}-{m["ga"]}'
                row['right'] = right + ' OUT'
            elif k == 'F':
                row['won'] = True
                row['right'] = 'WON'
            if not won and not last:
                raise ValueError(f'lost tie mid-run {comp} {k} {opp}')
            rows.append(row)
        sub = SUBS[comp]
        if comp == 'LC':
            if any(r['label'] == 'SF' for r in rows):
                sub = 'Single matches, two-leg semi-final'
            if any(r['label'] == 'F' for r in rows):
                sub += ' · final at a neutral ground'
        if comp == 'FAC':
            if any(r['label'] == 'SF' for r in rows):
                sub = 'Single matches · semi-final at a neutral ground'
            if not any('·' in r['legs'] for r in rows):
                sub = 'Single matches' if not any(r['label'] == 'SF' for r in rows) else sub
        if comp == 'UC' and any(r['label'] == 'QR' for r in rows):
            sub = 'Qualifying round, then two legs per round · fair-play entry'
        blocks.append(dict(comp=comp, sub=sub, rows=rows))
    return blocks


# ---- players ----------------------------------------------------------------
SURNAME = {'Edwin van der Sar': 'Van der Sar', 'Seth Johnson': 'Seth Johnson', 'Simon Johnson': 'Simon Johnson', 'Luís Boa Morte': 'Boa Morte', 'Ruud van Nistelrooy': 'V. Nistelrooy', 'Paolo Di Canio': 'Di Canio', 'Boudewijn Zenden': 'Zenden', 'Juan Pablo Ángel': 'Ángel', 'Papa Bouba Diop': 'Diop',
           'Salomon Olembé': 'Olembé', 'El Hadji Diouf': 'Diouf', 'Shaun Wright-Phillips': 'Wright-Phillips', 'Robbie Keane': 'Keane', 'Jay-Jay Okocha': 'Okocha', 'Hermann Hreidarsson': 'Hreidarsson',
           'Teddy Sheringham': 'Sheringham', 'Mart Poom': 'Poom', 'Ole Gunnar Solskjaer': 'Solskjær', 'Harald Wapenaar': 'Wapenaar', 'Mark de Vries': 'De Vries', 'Michael Ricketts': 'Ricketts',
           'Jason Euell': 'Euell', 'Mario Jardel': 'Jardel', 'Alex Manninger': 'Manninger', 'Juninho Paulista': 'Juninho', 'Tugay Kerimoğlu': 'Tugay', 'Maik Taylor': 'Maik Taylor', 'Martin Taylor': 'Martin Taylor', 'Ben Roberts': 'Roberts', 'Lee Bowyer': 'Bowyer', 'Dion Dublin': 'Dublin'}


def short_name(n, others):
    if n in SURNAME:
        return SURNAME[n]
    parts = n.split()
    if len(parts) == 1:
        return n
    low = parts[-2].lower()
    last = ' '.join(parts[-2:]) if low in ('de', 'van', 'di', 'le', 'la', 'du', 'da', 'dos', 'el', "o'") else parts[-1]
    last = last[0].upper() + last[1:]
    if sum(1 for o in others if o != n and o.split()[-1] == parts[-1]) > 0:
        return f'{parts[0][0]}. {last}'
    return last


def group(detail, broad=''):
    d = detail or broad
    if 'Goalkeeper' in d:
        return 'GK'
    if 'Back' in d or d == 'Defender' or 'Defence' in d:
        return 'DF'
    if 'Midfield' in d or 'Winger' in d:
        return 'MF'
    if 'Forward' in d or 'Striker' in d or d == 'Attack':
        return 'FW'
    return 'MF'


def wing(detail):
    return 'Winger' in (detail or '')


SHAPE = {'4-4-2 double 6': '4-4-2', '4-4-2': '4-4-2', '4-1-4-1': '4-5-1', '4-2-3-1': '4-5-1', '4-4-1-1': '4-4-2', '4-1-3-2': '4-4-2', '4-4-2 Diamond': '4-4-2', '4-3-3 Attacking': '4-3-3', '4-3-3 Defending': '4-3-3', '3-5-2 flat': '3-5-2', '3-4-1-2': '3-5-2', '4-3-1-2': '4-4-2', '5-3-2': '5-3-2', '3-1-4-2': '3-5-2', '5-4-1': '5-4-1', '4-5-1': '4-5-1', '4-5-1 flat': '4-5-1'}
SIDEORDER = {'Left-Back': 0, 'Left Midfield': 0, 'Left Winger': 0, 'Centre-Back': 1, 'Defensive Midfield': 1, 'Central Midfield': 2, 'Attacking Midfield': 2, 'Second Striker': 1, 'Centre-Forward': 2, 'Right-Back': 3, 'Right Midfield': 3, 'Right Winger': 3}


def xis(key, ms, kader, names, jan_ids, tm_id):
    splits = (('AUG – DEC', lambda d: d < '2004-01-01'), ('JAN – MAY', lambda d: d >= '2004-01-01'))
    out = []
    missing = 0
    for label, f in splits:
        starts = collections.Counter()
        shirt = collections.defaultdict(collections.Counter)
        info = {}
        shapes = collections.Counter()
        for m in ms:
            if not f(m['date']):
                continue
            if m['comp'] == 'PL' and m['formation'] in SHAPE:
                shapes[SHAPE[m['formation']]] += 1
            p = f'{SP}/tm/match/{m["mid"]}.html'
            lu = tp.parse_lineup(rd(p)).get(str(tm_id), []) if os.path.exists(p) else []
            if len(lu) != 11:
                missing += 1
                continue
            for q in lu:
                starts[q['id']] += 1
                shirt[q['id']][q['shirt']] += 1
                info[q['id']] = q
        shape = shapes.most_common(1)[0][0] if shapes else '4-4-2'
        d, m_, f_ = [int(x) for x in shape.split('-')]
        def detail(i):
            return kader.get(i, {}).get('pos') or info[i]['pos']
        pool = collections.defaultdict(list)
        for i, n in starts.most_common():
            pool[group(detail(i))].append(i)
        gk = pool['GK'][:1]
        de = pool['DF'][:d]
        fw = pool['FW'][:f_]
        if len(fw) < f_:
            wide = [i for i in pool['MF'] if wing(detail(i))]
            fw += wide[:f_ - len(fw)]
        mf = [i for i in pool['MF'] if i not in fw][:m_]
        # short of a recognised player in a line: fill from the next most-used starters
        used = set(gk + de + mf + fw)
        rest = [i for i, _ in starts.most_common() if i not in used]
        while len(de) < d and rest:
            de.append(rest.pop(0))
        while len(mf) < m_ and rest:
            mf.append(rest.pop(0))
        while len(fw) < f_ and rest:
            fw.append(rest.pop(0))
        def mk(i):
            nm = info[i]['name']
            return dict(id=i, shirt=shirt[i].most_common(1)[0][0], name=short_name(nm, names), starts=starts[i], new=i in jan_ids and label.startswith('JAN'))
        def order(l):
            return sorted(l, key=lambda i: (SIDEORDER.get(detail(i), 2), -starts[i]))
        lines = dict(gk=[mk(i) for i in gk], d=[mk(i) for i in order(de)], m=[mk(i) for i in order(mf)], f=[mk(i) for i in order(fw)])
        out.append(dict(label=label, shape=shape, lines=lines))
    return out, missing


# ---- window -----------------------------------------------------------------
wiki = [r for r in csv.DictReader(open(D + '/transfers.csv', encoding='utf-8')) if r['source'] == 'wikipedia']


def winter_wiki():
    raw = json.load(open(D.replace('/data', '/raw/wikipedia/List of English football transfers winter 2003–04.json'), encoding='utf-8'))['wikitext']
    link = lambda x: re.sub(r'\[\[(?:[^\]|]*\|)?([^\]]*)\]\]', r'\1', re.sub(r'\{\{[^{}]*\}\}', '', x)).strip()
    out, date = [], ''
    for line in raw.split('\n'):
        if line.startswith(';'):
            date = line[1:].strip()
        m = re.match(r'\*(.*?) from (.*?) to (.*?),\s*(.*)$', line)
        if m:
            fee = m.group(4).strip()
            f = re.search(r'£([\d.]+)\s*(m|k)', fee, re.I)
            gbp_ = float(f.group(1)) * (1e6 if f.group(2).lower() == 'm' else 1e3) if f else ''
            out.append(dict(player=link(m.group(1)), from_club_name=link(m.group(2)), to_club_name=link(m.group(3)), fee=fee, fee_gbp=gbp_, date=date, source='wikipedia'))
    return out


wiki += winter_wiki()
RATE = 0.70


def nk(s):
    return re.sub(r'[^a-z]', '', unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower())


def wiki_fee(name, club, d):
    sur = nk(name.split()[-1])
    side = 'to_club_name' if d == 'in' else 'from_club_name'
    hits = [r for r in wiki if nk(r['player']).endswith(sur) and nk(r['player'])[:3] == nk(name)[:3] and r['fee_gbp'] and nk(club) in nk(r[side])]
    return (float(hits[0]['fee_gbp']), hits[0]) if hits else (None, None)


def tm_fee(f):
    m = re.search(r'€([\d.]+)(M|K|m|k)?', f)
    if not m:
        return None
    v = float(m.group(1))
    return v * (1e6 if m.group(2) in ('M', 'm') else 1e3 if m.group(2) in ('K', 'k') else 1)


def gbp(v):
    m = v / 1e6
    s = f'{m:.2f}'.rstrip('0').rstrip('.')
    return f'£{s}m'


def start_span(ms, tm_id):
    first, last = {}, {}
    for m in ms:
        p = f'{SP}/tm/match/{m["mid"]}.html'
        if not os.path.exists(p):
            continue
        for q in tp.parse_lineup(rd(p)).get(str(tm_id), []):
            first.setdefault(q['id'], m['date'])
            last[q['id']] = m['date']
    return first, last


def window(key, club_name, kader, pl, prev, tr, winter, names, jan_override):
    rows = {'in': [], 'out': []}
    tot = {'in': 0.0, 'out': 0.0}
    approx = False
    for d in ('in', 'out'):
        seen = set()
        for r in tr[d]:
            f = r['fee']
            if 'End of loan' in f or f == '-' or 'U18' in r['club'] or 'U21' in r['club'] or 'Unknown' in r['club'] or 'Without' in r['club'] or r['club'] == '':
                continue
            if 'Retired' in r['club'] or 'Career break' in r['club']:
                continue
            if r['id'] in seen:
                continue
            seen.add(r['id'])
            w, _ = wiki_fee(r['name'], club_name, d)
            e = tm_fee(f)
            low = f.lower()
            if 'loan' in low:
                fee = 'Loan'; val = 0; w = None
            elif w:
                fee = gbp(w); val = w
            elif e and e * RATE >= 25000:
                val = round(e * RATE / 5e4) * 5e4
                fee = '~' + gbp(val); approx = True
            elif 'free' in low:
                fee = 'Free'; val = 0
            else:
                fee = 'n/k'; val = 0
            tot[d] += val
            cl = re.sub(r'\s*\(-.*?\)', '', r['club'])
            t = token_for(r['club'])
            code = (t or {}).get('code') or tk.norm(cl).upper()[:3]
            weight = pl.get(r['id'], {}).get('min', 0) if d == 'in' else prev.get(r['id'], {}).get('min', 0)
            nm = r['name']
            rows[d].append(dict(id=r['id'], fullname=nm, name=short_name(nm, names + [x['fullname'] for x in rows[d]]), pos=group(r['pos']), club=cl, code=code, token=t, fee=fee, val=val, weight=weight, jan=r['id'] in jan_override[d]))
        rows[d].sort(key=lambda x: (-x['val'], -x['weight']))
    fmt = lambda t: (f'{gbp(round(t / 1e5) * 1e5)} known fees' if t >= 1e6 else f'{gbp(t)} known fees' if t else 'no known fees')
    return dict(**{'in': rows['in'][:5], 'out': rows['out'][:5]}, in_total=fmt(tot['in']), out_total=fmt(tot['out']), approx=approx,
                note=('Top 5 each way · other club as token + code · J = January · ~ = from € at 0.70' if any(x['fee'].startswith('~') for x in rows['in'][:5] + rows['out'][:5]) else 'Top 5 each way · other club as kit token + code · J = January window'), all=rows)


# ---- assemble ---------------------------------------------------------------
def build(key):
    p = R[key]
    fd = p['fd']
    tm = p['tm']
    ms = matches(key, p)
    g = GAMES[fd]
    pos = [TABLES[str(n)][fd] for n in range(1, 39)]
    pts = sum(3 if x['gf'] > x['ga'] else 1 if x['gf'] == x['ga'] else 0 for x in g)
    W = sum(x['gf'] > x['ga'] for x in g); Dr = sum(x['gf'] == x['ga'] for x in g); L = 38 - W - Dr
    league = dict(pos=pos[-1], pts=pts, W=W, D=Dr, L=L, GF=sum(x['gf'] for x in g), GA=sum(x['ga'] for x in g))
    a = dict(n=len(ms), W=sum(m['res'] == 'W' for m in ms), D=sum(m['res'] == 'D' for m in ms), L=sum(m['res'] == 'L' for m in ms), GF=sum(m['gf'] for m in ms), GA=sum(m['ga'] for m in ms))
    kader = tp.parse_kader(rd(f'{SP}/tm/club/{key}_kader.html'))
    pl = tp.squad_stats(tp.parse_squad(rd(f'{SP}/tm/club/{key}_pl.html')))
    allc = tp.squad_stats(tp.parse_squad(rd(f'{SP}/tm/club/{key}_all.html')))
    prev = tp.squad_stats(tp.parse_squad(rd(f'{SP}/tm/club/{key}_prev.html'))) if os.path.exists(f'{SP}/tm/club/{key}_prev.html') else {}
    tr = tp.parse_transfers(rd(f'{SP}/tm/club/{key}_tr.html'))
    winter = {'in': set(), 'out': set()}
    wp = f'{SP}/tm/club/{key}_winter.html'
    if os.path.exists(wp):
        w = tp.parse_transfers(rd(wp))
        winter = {'in': {r['id'] for r in w['in']}, 'out': {r['id'] for r in w['out']}}
    names = [v['name'] for v in pl.values()] + [v['name'] for v in allc.values()]
    bubbles = []
    for i, v in pl.items():
        if v['min'] <= 0:
            continue
        det = kader.get(i, {}).get('pos') or v['pos']
        bubbles.append(dict(id=i, name=v['name'], label=short_name(v['name'], names), pos=group(det, v['pos']), min=v['min'], goals=v['goals'], games=v['apps'], shirt=v['shirt']))
    first, last = start_span(ms, tm)
    wik = {'in': set(), 'out': set()}
    for d, side in (('in', 'to_club_name'), ('out', 'from_club_name')):
        for r in tr[d]:
            if any(x.get('date', '').endswith(('January 2004', 'February 2004', 'January 2004 ')) and nk(x['player']).endswith(nk(r['name'].split()[-1])) and nk(p['name']) in nk(x[side]) for x in wiki):
                wik[d].add(r['id'])
    jan_in = {i for i in winter['in'] if i in wik['in'] or first.get(i, '9') >= '2004-01-01' and i in first}
    jan_out = {i for i in winter['out'] if i in wik['out'] or last.get(i, '0') >= '2003-11-01'}
    jan_ids = jan_in
    xi, miss = xis(key, ms, kader, names, jan_ids, tm)
    rad = {}
    for k in ('gpg', 'win', 'away', 'cpg', 'cs', 'cards'):
        v = MET[fd][k]
        vals = [MET[c][k] for c in MET]
        rank = 1 + sum((u > v + 1e-9) if k in HIGH else (u < v - 1e-9) for u in vals)
        rad[k] = dict(v=v, rank=rank)
    pack = dict(key=key, name=p['name'], short=p['short'], code=p['code'], fd=fd, kicker=KICK.get(key, p['name'].upper()),
                league=league, rounds=pos, round_dates=[x['date'] for x in g], matches=ms, all=a, runs=runs(ms), bubbles=bubbles, xis=xi, xis_missing=miss,
                window=window(key, p['name'], kader, pl, prev, tr, winter, names, {'in': jan_in, 'out': jan_out}), radar=rad, radar_range=RAD, token=token_for(p['name']))
    return pack


if __name__ == '__main__':
    keys = sys.argv[2:] or list(R)
    for k in keys:
        pk = build(k)
        json.dump(pk, open(f'{SP}/packs/{k}.json', 'w'), ensure_ascii=False, indent=0)
        print(k, pk['league'], pk['all'], 'xi-missing', pk['xis_missing'], 'bubbles', len(pk['bubbles']))
