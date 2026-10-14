"""Merge raw sources into data/matches.csv — one row per match, 2002/03 onward.
Columns: date, season, month, competition, stage, home, away, hg, ag, (aet/pens notes), source + league extras."""
import csv, json, re, glob, os, datetime as dt
import pandas as pd
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = lambda *p: os.path.join(ROOT, 'raw', *p)
LEAGUE = {'E0':'Premier League','E1':'Championship','SP1':'LaLiga','I1':'Serie A','D1':'Bundesliga','F1':'Ligue 1','N1':'Eredivisie','P1':'Primeira Liga','SC0':'Scottish Premiership'}
def season_of(d):  # Jul-Jun season; summer tournaments get the calendar year label of the season just ended
    return f"{d.year}-{str(d.year+1)[2:]}" if d.month >= 7 else f"{d.year-1}-{str(d.year)[2:]}"
rows = []
# 1) Domestic leagues (football-data.co.uk)
EXTRA = ['HS','AS','HST','AST','HC','AC','HY','AY','HR','AR','Referee','Attendance','HxG','AxG','B365H','B365D','B365A']
for f in sorted(glob.glob(R('football-data-co-uk','*','*.csv'))):
    if os.path.getsize(f) < 100: continue
    with open(f, encoding='utf-8-sig', errors='replace', newline='') as fh:
        rd = csv.reader(fh); hdr = [h.strip() for h in next(rd)]
        recs = [dict(zip(hdr, line[:len(hdr)])) for line in rd if line]
    df = pd.DataFrame(recs)
    df = df[(df.get('HomeTeam','') != '') & (df['FTHG'].astype(str).str.strip() != '')]
    code = os.path.basename(f)[:-4]
    for _, r in df.iterrows():
        d = None
        for fmt in ('%d/%m/%Y','%d/%m/%y'):
            try: d = dt.datetime.strptime(str(r['Date']).strip(), fmt); break
            except ValueError: pass
        if d is None: continue
        sd = os.path.basename(os.path.dirname(f)); row = dict(season=f"20{sd[:2]}-{sd[2:]}", date=d.date(), competition=LEAGUE[code], stage='League', home=r['HomeTeam'].strip(), away=r['AwayTeam'].strip(),
                   hg=int(float(r['FTHG'])), ag=int(float(r['FTAG'])), ht=f"{r.get('HTHG','')}-{r.get('HTAG','')}", note='', source='football-data.co.uk')
        for c in EXTRA: row[c] = r.get(c, '')
        rows.append(row)
# 2) UCL 2002/03-2016/17 (engsoccerdata; Season = start year)
e = pd.read_csv(R('ucl','engsoccerdata','champs.csv'))
e = e[(e.Season >= 2002) & (e.Season <= 2015)]
for _, r in e.iterrows():
    note = ' '.join(x for x in [('aet' if str(r.aet) not in ('nan','NA') else ''), (f"pens {r.pens}" if str(r.pens) not in ('nan','NA') else '')] if x)
    rows.append(dict(season=f"{r.Season}-{str(r.Season+1)[2:]}", date=pd.to_datetime(r.Date).date(), competition='Champions League', stage=r['round'], home=r.home, away=r.visitor,
                     hg=int(r.hgoal), ag=int(r.vgoal), ht=r.HT if str(r.HT)!='nan' else '', note=note, source='engsoccerdata'))
# 3) UCL 2017/18 onward (openfootball json, else txt)
def strip(t): return re.sub(r'\s*\([A-Z]{3}\)\s*$', '', t.strip())
for y in range(2016, 2027):
    s = f"{y}-{str(y+1)[2:]}"; jf = R('ucl','openfootball',f"{y}-{str(y+1)[2:]}.json"); tf = R('ucl','openfootball',f"{y}-{str(y+1)[2:]}-cl.txt")
    got = 0
    if os.path.exists(jf) and not os.path.exists(tf):
        for m in json.load(open(jf))['matches']:
            ft = m.get('score',{}).get('ft')
            if not ft: continue
            rows.append(dict(season=s, date=dt.date.fromisoformat(m['date']), competition='Champions League', stage=m['round'], home=strip(m['team1']), away=strip(m['team2']),
                             hg=ft[0], ag=ft[1], ht='-'.join(map(str,m['score'].get('ht',[]))), note='aet' if m['score'].get('et') else '', source='openfootball'))
            got += 1
    if got == 0 and os.path.exists(tf):
        stage, cur, year = '', None, y
        for line in open(tf, encoding='utf-8'):
            if line.startswith('▪'): stage = line[1:].strip(); continue
            dm = re.search(r'(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (\w{3}) (\d{1,2})(?: (\d{4}))?', line)
            if dm and ' v ' not in line:
                yr = int(dm.group(4)) if dm.group(4) else None
                d = dt.datetime.strptime(f"{dm.group(2)} {dm.group(3)} {yr or y}", "%b %d %Y").date()
                if not yr and d.month < 7: d = d.replace(year=y+1)
                cur = d; continue
            mm = re.search(r'^\s*(?:\d{2}:\d{2})?\s*(.+?)\s+v\s+(.+?)\s+(\d+)-(\d+)(.*)$', line)
            if mm and cur:
                rest = mm.group(5); hg, ag = int(mm.group(3)), int(mm.group(4))
                pe = re.match(r'\s*pen\.\s*(\d+)-(\d+)\s*a\.e\.t\.', rest)
                if pe:  # leading score was the shootout; real result is the a.e.t. score
                    rest = f"pens {hg}-{ag}; " + rest; hg, ag = int(pe.group(1)), int(pe.group(2))
                rows.append(dict(season=s, date=cur, competition='Champions League', stage=stage, home=strip(mm.group(1)), away=strip(mm.group(2)),
                                 hg=hg, ag=ag, ht=(re.search(r'\((\d+-\d+)\)', rest) or [None,''])[1], note=rest.strip(), source='openfootball-txt'))
# 4) Internationals (martj42): World Cup, Euros + their qualifiers, Nations League, friendlies
i = pd.read_csv(R('international','results.csv'), parse_dates=['date'])
i = i[i.date >= '2002-07-01']
for _, r in i.iterrows():
    if pd.isna(r.home_score): continue
    rows.append(dict(season=(f"{r.date.year}-{str(r.date.year+1)[2:]}" if r.date.month>=8 else f"{r.date.year-1}-{str(r.date.year)[2:]}"), date=r.date.date(), competition=r.tournament, stage='', home=r.home_team, away=r.away_team, hg=int(r.home_score), ag=int(r.away_score),
                     ht='', note=f"{r.city}, {r.country}" + (' (neutral)' if r.neutral else ''), source='martj42'))
m = pd.DataFrame(rows)
m['date'] = pd.to_datetime(m['date'])
m = m[m.date >= '2002-07-01'].sort_values(['date','competition'])
m['month'] = m.date.dt.strftime('%Y-%m')
cols = ['date','season','month','competition','stage','home','away','hg','ag','ht','note','source'] + EXTRA
m[cols].to_csv(os.path.join(ROOT,'data','matches.csv'), index=False)
# Coverage report
focus = list(LEAGUE.values()) + ['Champions League','FIFA World Cup','UEFA Euro']
cov = m[m.competition.isin(focus)].pivot_table(index='season', columns='competition', values='home', aggfunc='count', fill_value=0)
cov.to_csv(os.path.join(ROOT,'data','coverage_by_season.csv'))
print(len(m), 'matches'); print(cov.to_string())
