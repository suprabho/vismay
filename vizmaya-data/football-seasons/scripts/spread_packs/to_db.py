"""Team/league packs + editorial rows for the Books tab, in the shapes of spreadPack.ts and bookSpreadSchema."""
import csv,html,importlib.util,io,json,os,re,sys,zipfile,datetime
SP=sys.argv[1]; OUT=sys.argv[2]
def load(n):
    spec=importlib.util.spec_from_file_location(n,os.path.join(os.path.dirname(os.path.abspath(__file__)),n+'.py')); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
ed=load('editorial'); gen=load('gen'); tk=load('tokens')
T=tk.Tok()
SOURCES='Sources: football-data.co.uk (league results, cards) · Soccerbase (all-competition results and dates) · Transfermarkt (lineups, league minutes, goals, shirt numbers, squad positions, transfers) · Wikipedia (fees, season events). League chart by round, not date; all-competition totals unless marked; penalty shoot-outs count as draws. RGB design proof, no bleed.'
REF={'arsenal':dict(left='#C8102E',right='#0E1B33',accent='#0A2A5C',highlight='#F4C542',draw='#F1D5D7',card='#22365A',outbg='#4A0D13',outedge='#EF0107',grid='#2A3C5C',outname='red',accentname='Navy'),
     'chelsea':dict(left='#034694',right='#0B1F3A',accent='#D7263D',highlight='#F2C94C',draw='#C9D6E8',card='#1E3A5F',outbg='#5E1424',outedge='#D7263D',grid='#2C4A6E',outname='red',accentname='Red'),
     'manu':dict(left='#B01E2B',right='#2A0E12',accent='#15161A',highlight='#F2C14E',draw='#EBCDD0',card='#4A1A20',outbg='#0E0B0C',outedge='#F2C14E',grid='#5A2A30',outname='black',accentname='Black')}
z=zipfile.ZipFile(os.environ.get('HANDOFF_ZIP','2003-04-league-cup-handoff.zip'))
groups={r['team']:r for r in csv.DictReader(io.StringIO(z.read('2003-04-league-cup-handoff/data/ucl_groups.csv').decode()))}
slug=lambda s:re.sub(r'^-+|-+$','',re.sub(r'[^a-z0-9]+','-',s.lower()))
clean=lambda x:re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>','',x))).strip()
def tok(t):
    if not t: return None
    return dict(family=t['family'],pattern=t['pattern'],c1=t['c1'].upper(),c2=t['c2'].upper() if t.get('c2') else None)
def keyline(tk_,pal):
    return pal.get('keyline') or ('#FFFFFF' if gen.contrast(tk_['c1'],pal['left'])<1.6 or gen.contrast('#15161A',pal['left'])<1.6 else '#15161A')
def palette(pal):
    return {'page1Ground':pal['left'],'page2Ground':pal['right'],'accent':pal['accent'],'eliminationCard':pal['outbg'],'highlight':pal['highlight'],'draw':pal['draw'],'grid':pal['grid'],'card':pal['card']}
def month_date(day,mon):
    m=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].index(mon)+1
    return f'{2003 if m>=7 else 2004}-{m:02d}-{int(day):02d}'
def strip_runs(runs):
    return [dict(comp=b['comp'],sub=b['sub'],rows=[{k:v for k,v in dict(label=r['label'],opp=r['opp'],token=tok(r['token']),legs=r['legs'],right=r['right'],out=r.get('out'),won=r.get('won'),dots=r.get('dots')).items() if v is not None or k=='token'} for r in b['rows']]) for b in runs]
def strip_win(w,note=None):
    row=lambda r:dict(name=r['name'],pos=r['pos'],code=r['code'],token=tok(r['token']),fee=r['fee'],jan=bool(r['jan']))
    return {'in':[row(r) for r in w['in']],'out':[row(r) for r in w['out']],'inTotal':w['in_total'],'outTotal':w['out_total'],'note':w['note']}
def strip_xi(xis):
    q=lambda p:{k:v for k,v in dict(shirt=p['shirt'],name=p['name'],new=True if p.get('new') else None).items() if v is not None}
    return [dict(label=x['label'],shape=x['shape'],lines={l:[q(p) for p in x['lines'][l]] for l in ('gk','d','m','f')}) for x in xis]
def base_pack(p,pal,headline):
    t=tok(p['token'])
    return dict(kind='team',name=p['name'],short=p['short'],code=p['code'],kicker=p['kicker'],token=t,
      design=dict(headline=list(headline),outEdge=pal['outedge'],outName=pal['outname'],accentName=pal['accentname'],keyline=keyline(p['token'],pal)),
      league=p['league'],all=p['all'],rounds=[dict(n=i+1,d=d,pos=x) for i,(x,d) in enumerate(zip(p['rounds'],p['round_dates']))],
      matches=[dict(d=m['date'],c=m['comp'],r=m['res']) for m in p['matches']],runs=strip_runs(p['runs']),xis=strip_xi(p['xis']),
      bubbles=[dict(label=b['label'],pos=b['pos'],min=b['min'],goals=b['goals'],games=b['games']) for b in p['bubbles']],
      window=strip_win(p['window']),radar={k:dict(v=v['v'],rank=v['rank']) for k,v in p['radar'].items()},radarRange=p['radar_range'],sources=SOURCES)
packs={}; rows={}
# ---- the 17 from the editorial file
COACH={'southampton':('Strachan, Wigley, Sturrock','Strachan, Scottish, 46, to 13 Feb. Wigley caretaker to 4 Mar. Sturrock from 4 Mar, from Plymouth.'),
 'tottenham':('Hoddle, then Pleat','Hoddle, English, 45, sacked 21 Sep after six games. Pleat, director of football, caretaker for the other 39.'),
 'leeds':('Reid, then Gray','Reid, English, 47, sacked 10 Nov. Gray, Scottish, 55, a Leeds great, caretaker to 10 May.')}
for k,e in ed.ED.items():
    p=json.load(open(f'{SP}/packs/{k}.json')); pal=ed.PAL[k]
    key='team:'+slug(p['fd'])
    packs[key]=base_pack(p,pal,e['headline'])
    name,bio=COACH.get(k,(e['coach'][0]['name'],e['coach'][0]['bio']))
    stat=e['stat']+(' '+e['stat_small'] if e.get('stat_small') else '')
    rows[key]=dict(subject=p['fd'],kind='team',palette=palette(pal),
      editorial=dict(headline=' '.join(e['headline']),storyStat=dict(value=stat,label=e['stat_label'],source='Season data pack'),story=e['story'],
        moments=[dict(date=m['date'],text=clean(m['text']),eventId=None) for m in e['moments']],notes=dict(climb=e['climb_title'].title().replace('The ','The '),bubble=e['people_title'].capitalize() if False else e['people_title'])),
      team=dict(turningPoint=p['round_dates'][e['turn_round']-1],coach=dict(name=name,context=bio,assistants='',sourceUrl=''),xiSplitDate='2004-01-01',storyPlayers=e['labels']))
# ---- the three reference clubs, read from their finished spreads
for k,pal in REF.items():
    s=open(f'{SP}/unpacked/{k}/template.html',encoding='utf-8').read()
    p=json.load(open(f'{SP}/packs/{k}.json'))
    key='team:'+slug(p['fd'])
    h=re.search(r'<h1[^>]*>(.*?)</h1>',s).group(1).split('<br>')
    pk=base_pack(p,pal,[clean(x) for x in h])
    # group card and Community Shield
    grp=[m for m in p['matches'] if m['comp']=='UCL' and m['label']=='GRP']
    g=groups[p['name'] if p['name']!='Man United' else 'Manchester United']
    for b in pk['runs']:
        for r in b['rows']:
            if r['label']=='GRP':
                r.update(opp=f'Group {g["group"]}',legs='',right=f'{gen.ord_(g["pos"])} · {g["Pts"]}',dots=[m['res'] for m in grp]); r.pop('token_',None)
        sub=re.search(r'<span>'+{'UCL':'CHAMPIONS LEAGUE','UC':'UEFA CUP','LC':'LEAGUE CUP','FAC':'FA CUP'}[b['comp']]+r'</span></div><div style="margin-top: 5px; font-size: 7.5px; line-height: 9px">([^<]*)',s)
        if sub: b['sub']=html.unescape(sub.group(1))
    cs=[m for m in p['matches'] if m['comp']=='CS']
    if cs:
        m=cs[0]; won=m['pens'][0]>m['pens'][1]
        pk['runs'].append(dict(comp='CS',sub=f'· 10 Aug · Cardiff · {"won" if won else "lost"} on penalties',rows=[dict(label='F',opp='Manchester United' if k=='arsenal' else 'Arsenal',token=tok(T.get('Manchester United' if k=='arsenal' else 'Arsenal')),legs=f'N {m["gf"]}-{m["ga"]}',right=f'{m["pens"][0]}-{m["pens"][1]} pens'+('' if won else ' OUT'),**({'won':True} if won else {'out':True}))]))
    # XIs and the window exactly as printed
    L=s.split('\n')
    xis=[]
    for m in re.finditer(r'left: (790|980)px; top: \d+px; width: 160px"><div[^>]*>([^<]*?) <span[^>]*>· ([^<]*)</span></div>(.*?)(?=<div style="position: absolute; left: (?:980|790)px; top: \d+px; width: 1?\d|$)',s):
        lines=dict(gk=[],d=[],m=[],f=[])
        dots=re.findall(r'left: ([\d.\-]+)px; top: ([\d.\-]+)px; width: 11px; height: 11px;[^"]*?background: ([^;"]+)[^"]*">(\d*)</span><span[^>]*>([^<]*)<',m.group(4))
        for x,y,bg,shirt,name in dots:
            line={'6.5':'gk','40.5':'d','82.5':'m','128.5':'f'}[x]
            q=dict(shirt=shirt,name=html.unescape(name))
            if 'accent' in bg: q['new']=True
            lines[line].append((float(y),q))
        xis.append(dict(label=clean(m.group(2)),shape=clean(m.group(3)),lines={l:[q for _,q in sorted(v,key=lambda a:a[0])] for l,v in lines.items()}))
    assert len(xis)==2 and all(sum(len(v) for v in x['lines'].values())==11 for x in xis),(k,[sum(len(v) for v in x['lines'].values()) for x in xis])
    pk['xis']=xis
    w=s[s.index('THE WINDOW / IN AND OUT'):s.index('Top 5 each way')]
    heads=re.findall(r'<span style="color: \{\{highlight\}\}">(IN|OUT)</span><span>([^<]*)</span>',w)
    rowsw={'in':[],'out':[]}
    side='in'
    for part in re.split(r'(?=<span style="color: \{\{highlight\}\}">(?:IN|OUT)</span>)',w)[1:]:
        side='in' if part.startswith('<span style="color: {{highlight}}">IN') else 'out'
        for r in re.finditer(r'font-size: 6px; font-weight: 800; color: \{\{highlight\}\}">(J?)</span><span[^>]*>([^<]+)</span><span[^>]*>(\w\w)</span>(.*?)font-stretch: 75%">([^<]+)</span><span[^>]*>([^<]+)</span>',part):
            code=r.group(5)
            byc=next((v for v in T.t.values() if v['code']==code),None)
            rowsw[side].append(dict(name=html.unescape(r.group(2)),pos=r.group(3),code=code,token=tok(byc),fee=html.unescape(r.group(6)),jan=r.group(1)=='J'))
    pk['window'].update({'in':rowsw['in'],'out':rowsw['out'],'inTotal':html.unescape(dict(heads)['IN']),'outTotal':html.unescape(dict(heads)['OUT']),'note':'Top 5 each way · other club as kit token + code · J = January window'})
    packs[key]=pk
    # editorial
    stat=re.search(r'font-size: 53px[^>]*>(.*?)</div>',s,re.S).group(1)
    statv=' '.join(clean(x) for x in re.findall(r'<span[^>]*>(.*?)</span>',stat))
    if k=='manu': statv='46 → 29'
    label=clean(re.search(r'font-size: 7\.5px; line-height: 9px; font-weight: 500[^>]*>(.*?)</div>',s).group(1))
    story=clean(re.search(r'<p style[^>]*>(.*?)</p>',s,re.S).group(1))
    mom=[]
    grid=s[s.index('top: 642px'):]; grid=grid[:grid.index('<!-- Season record')]
    for d,txt in re.findall(r'<b style="color: \{\{highlight\}\}">(\d+) (\w+)</b>(.*?)</div>',[(x) for x in [grid]][0]) and [(f'{a} {b}',c) for a,b,c in re.findall(r'<b style="color: \{\{highlight\}\}">(\d+) (\w+)</b>(.*?)</div>',grid)]:
        a,b=d.split(); mom.append(dict(date=month_date(a,b),text=clean(txt).lstrip('· ').strip(),eventId=None))
    climb=re.search(r'<span>(THE \w+) / LEAGUE POSITION</span>',s).group(1).title()
    people=re.search(r'<span>(THE PEOPLE[^<]*)</span>',s).group(1)
    tn=re.search(r'>R(\d+) · \w+, ',s); turn=int(tn.group(1))
    coach=re.search(r'COACH</span><span[^>]*>([^<]+)</span><span>([^<]+)</span>',s)
    labels=[html.unescape(x) for x in re.findall(r'text-anchor="\w+" font-family="[^"]*" font-size="7.5" font-weight="700" fill="#FFFFFF">([^<]+)<',s)]
    have={b['label'] for b in pk['bubbles']}
    rows[key]=dict(subject=p['fd'],kind='team',palette=palette(pal),
      editorial=dict(headline=' '.join(clean(x) for x in h),storyStat=dict(value=statv,label=label,source='Season data pack'),story=story,moments=mom[:4],notes=dict(climb=climb,bubble=html.unescape(people))),
      team=dict(turningPoint=p['round_dates'][turn-1],coach=dict(name=html.unescape(coach.group(1)),context=html.unescape(coach.group(2))[:200],assistants='',sourceUrl=''),xiSplitDate='2004-01-01',storyPlayers=[y for y in ({'Van Nistelrooy':'V. Nistelrooy'}.get(x,x) for x in labels) if y in have]))
# ---- the league spread
s=open(f'{SP}/unpacked/pl/template.html',encoding='utf-8').read()
PLT=lambda n:tok(T.get(n))
codes={'POR':'Portsmouth','CHE':'Chelsea','NEW':'Newcastle United','BOL':'Bolton Wanderers','MUN':'Manchester United','ARS':'Arsenal','BIR':'Birmingham City'}
monthly=[('AUG','Sheringham','POR'),('SEP','Lampard','CHE'),('OCT','Shearer','NEW'),('NOV','Okocha','BOL'),('DEC','Scholes','MUN'),('JAN','Henry','ARS'),('FEB','Bergkamp & Edu','ARS'),('MAR','Forssell','BIR'),('APR','Henry','ARS')]
sc=list(csv.DictReader(io.StringIO(z.read('2003-04-league-cup-handoff/data/epl_scorers.csv').decode())))
short=lambda n:{'Juan Pablo Ángel':'Ángel','Ruud van Nistelrooy':'Van Nistelrooy','Yakubu':'Yakubu','Robert Pires':'Pires'}.get(n,n.split()[-1])
packs['league:premier-league']=dict(kind='league',name='Premier League',
  honours=[dict(name='Thierry Henry',token=PLT('Arsenal'),items=['Golden Boot · 30 league goals','PFA Players’ Player of the Year','PFA Fans’ Player of the Year','FWA Footballer of the Year','Player of the Month · January, April','April: 7 goals in 8 days (3 v LIV, 4 v LEE)']),
           dict(name='Scott Parker',token=PLT('Charlton Athletic'),items=['PFA Young Player of the Year']),dict(name='Arsène Wenger',token=PLT('Arsenal'),items=['LMA and Premier League Manager of the Year'])],
  teamOfYear=dict(title='PFA TEAM OF THE YEAR · 6 ARS',players=['Henry','Van Nistelrooy','Gerrard','Vieira','Lampard','Pires','Lauren','Campbell','Terry','A. Cole','Howard']),
  monthly=[dict(month=a,player=b,code=c,token=PLT(codes[c])) for a,b,c in monthly],monthlyNote='Manager of the Month twice: Allardyce, Ranieri, Wenger',
  signings=dict(title='£5M-PLUS SIGNINGS, 1 JUNE – 1 SEPTEMBER',rows=[dict(code='CHE',token=PLT('Chelsea'),total='£107.8m',value=107.8,note='Duff, Crespo, Makélélé, Mutu, Verón +4'),dict(code='MUN',token=PLT('Manchester United'),total='£18.24m',value=18.24),dict(code='BLB',token=PLT('Blackburn Rovers'),total='£7.5m',value=7.5),dict(code='TOT',token=PLT('Tottenham Hotspur'),total='£6.25m',value=6.25),dict(code='BIR',token=PLT('Birmingham City'),total='£5.5m',value=5.5),dict(code='LIV',token=PLT('Liverpool'),total='£5m',value=5)],note='Other 19 clubs together: £42.5m'),
  scorers=[dict(player=short(r['player']),goals=int(r['goals']),token=PLT(r['club'].split('/')[0])) for r in sc],
  sources='Sources: football-data.co.uk (results) · Wikipedia, 2003–04 FA Premier League (scorers, monthly and season awards, PFA Team of the Year) · StatsBomb open data (Henry’s goals by date) and List of English football transfers summer 2003 (£5m-plus fees as reported) · contemporary reports (Ferdinand ban date) · events.csv (FA fine). Points 3/1/0, ties on GD then GF; R19 = each club’s 19th game. RGB design proof, no bleed.')
WIKI='https://en.wikipedia.org/wiki/2003%E2%80%9304_FA_Premier_League'
rows['league:premier-league']=dict(subject='Premier League',kind='league',palette=None,
  editorial=dict(headline='Nobody Beat Arsenal',storyStat=dict(value='20 → 0',label='Changes at the top before / after 1 February',source='Computed from the league table by matchday'),
    story='Six clubs led the table and the lead changed hands twenty times, all before February. Then Arsenal went top and nobody moved them: 26 won, 12 drawn, none lost.',
    moments=[dict(date='2003-09-21',text='0–0 at Old Trafford, the Battle: Vieira sent off, Arsenal fined £175,000',eventId=None),dict(date='2004-02-01',text='ARS 2–1 MCI at Highbury: the last change at the top',eventId=None),dict(date='2004-04-25',text='2–2 at White Hart Lane: champions with four games left',eventId=None),dict(date='2004-05-15',text='2–1 v Leicester: 38 games, no defeats',eventId=None)],notes={}),
  league=dict(awards=[dict(name=n,sourceUrl=WIKI) for n in ['Golden Boot: Thierry Henry, 30','PFA Players’ Player: Thierry Henry','PFA Fans’ Player: Thierry Henry','FWA Footballer of the Year: Thierry Henry','PFA Young Player: Scott Parker','LMA Manager of the Year: Arsène Wenger']],
    leadAnnotations=[dict(date='2004-01-20',text='Ferdinand’s ban begins. United took 2.27 a game before, 1.56 after'),dict(date='2004-02-01',text='ARS 2–1 MCI at Highbury: the last change at the top')],halfwayNote='Halfway: MUN 46, ARS 45, CHE 42'))
# ---- editorial only: spreads whose charts have no pack yet
u=open(f'{SP}/unpacked/ucl/template.html',encoding='utf-8').read()
rows['comp:champions-league']=dict(subject='Champions League',kind='competition',palette=None,editorial=dict(headline='The Outsiders',storyStat=dict(value='3 from 4',label='Porto’s goals from shots in the final · 0.50 xG',source='StatsBomb open data'),
    story='Seventy-two clubs set out in July. The last two were Porto, second in their group, and Monaco, twice through on away goals. Porto won 3-0.',moments=[],notes={}))
rows['team:barcelona']=dict(subject='Barcelona',kind='team',palette=None,editorial=dict(headline='The Turnaround',storyStat=dict(value='12 → 2',label='January low → final place',source='Season data pack'),
    story='Ronaldinho brought the spark. Davids brought balance. Rijkaard’s first season turned.',moments=[],notes={}),team=dict(turningPoint=None,coach=dict(name='',context='',assistants='',sourceUrl=''),xiSplitDate=None,storyPlayers=[]))
W='https://en.wikipedia.org/wiki/'
COACH_URL={'team:arsenal':'Ars%C3%A8ne_Wenger','team:chelsea':'Claudio_Ranieri','team:man-united':'Alex_Ferguson','team:liverpool':'G%C3%A9rard_Houllier','team:newcastle':'Bobby_Robson','team:aston-villa':"David_O'Leary",
 'team:charlton':'Alan_Curbishley','team:bolton':'Sam_Allardyce','team:fulham':'Chris_Coleman_(footballer)','team:birmingham':'Steve_Bruce','team:middlesbrough':'Steve_McClaren','team:southampton':'Paul_Sturrock',
 'team:portsmouth':'Harry_Redknapp','team:tottenham':'David_Pleat','team:blackburn':'Graeme_Souness','team:man-city':'Kevin_Keegan','team:everton':'David_Moyes','team:leicester':'Micky_Adams','team:leeds':'Eddie_Gray_(footballer,_born_1948)','team:wolves':'Dave_Jones_(footballer,_born_1956)'}
for k,u in COACH_URL.items(): rows[k]['team']['coach']['sourceUrl']=W+u
os.makedirs(OUT+'/packs',exist_ok=True)
for k,v in packs.items():
    json.dump(v,open(f'{OUT}/packs/{k.replace(":","__")}.json','w'),ensure_ascii=False,sort_keys=True,separators=(',',':'))
json.dump(rows,open(f'{OUT}/rows.json','w'),ensure_ascii=False,indent=1)
print('packs',len(packs),'rows',len(rows),'bytes',sum(len(json.dumps(v)) for v in packs.values()))
for k,r in rows.items():
    e=r['editorial']; pr=[]
    if len(e['headline'])>40: pr.append('headline')
    if len(e['storyStat']['value'])>16: pr.append('statv '+e['storyStat']['value'])
    if len(e['storyStat']['label'])>48: pr.append('label')
    if len(e['story'])>240: pr.append(f'story {len(e["story"])}')
    if len(e['story'].split())>30: pr.append(f'words {len(e["story"].split())}')
    if any(len(m['text'])>120 for m in e['moments']): pr.append('moment')
    t=r.get('team')
    if t and len(t['coach']['context'])>200: pr.append('coach')
    if pr: print(k,pr)
print({k:(rows[k]['editorial']['storyStat']['value'],rows[k]['editorial']['notes'],len(rows[k]['team']['storyPlayers'])) for k in ('team:arsenal','team:chelsea','team:man-united')})
print([ (r['label'],r['opp'],r.get('dots'),r['right']) for b in packs['team:arsenal']['runs'] for r in b['rows']])
print(packs['team:arsenal']['window']['in'][:2], packs['team:man-united']['xis'][0]['shape'])
print(packs['team:liverpool']['runs'][0]['rows'][0])
