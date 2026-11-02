"""Barcelona's team pack and the Champions League's competition pack, for to_db.py."""
import csv,html,json,re

clean=lambda x:re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>','',x))).strip()
RAW=re.compile(r'title="([^":]+): (\w+)(?:, (\w+))?"><span style="position: absolute; inset: 4%; background: (.*?); clip-path')
def css_token(fam,pat,css):
    h=[x.upper() for x in re.findall(r'#[0-9A-Fa-f]{6}',css)]
    if not pat:
        pat='plain' if len(h)==1 else 'stripes' if 'repeating' in css and '90deg' in css else 'hoops' if 'repeating' in css else 'halves'
    if pat=='plain': return dict(family=fam,pattern=pat,c1=h[0],c2=None)
    if pat=='sleeves': return dict(family=fam,pattern=pat,c1=h[1],c2=h[0])
    return dict(family=fam,pattern=pat,c1=h[0],c2=h[1])
def tokens_in(line): return [css_token(f,p,c) for _,f,p,c in RAW.findall(line)]
def first_token(line):
    t=tokens_in(line); return t[0] if t else None
def spans(line): return [t for t in (html.unescape(x).strip() for x in re.findall(r'>([^<]+)<',line)) if t]
def pos(line):
    m=re.search(r'left: ([\d.\-]+)px; top: ([\d.\-]+)px;(?: width: ([\d.]+)px;)?',line)
    return float(m.group(1)),float(m.group(2)),float(m.group(3) or 0)

def ucl_pack(sp,T,tok,z,io):
    u=open(f'{sp}/unpacked/ucl/template.html',encoding='utf-8').read()
    L=u.split('\n')
    # map
    i=u.find('Map: countries'); m=u[i:u.find('</svg>',i)]
    countries=[dict(d=d,shade=float(o)) for d,o in re.findall(r'<path d="([^"]+)" fill="#FFFFFF" fill-opacity="([\d.]+)"',m)]
    dots=[];pins=[]
    for a in re.findall(r'<circle ([^>]*)>',m):
        g=dict(re.findall(r'([\w-]+)="([^"]*)"',a))
        if g['r']=='2.3': dots.append(dict(x=float(g['cx']),y=float(g['cy']),shade=float(g['fill-opacity'])))
        else: pins.append(dict(x=float(g['cx']),y=float(g['cy']),tone='winner' if 'highlight' in g['fill'] else 'runner'))
    keys=[dict(x=float(x),shade=float(o)) for x,o in re.findall(r'<rect x="([\d.]+)" y="290" width="10" height="7" fill="#FFFFFF" fill-opacity="([\d.]+)"',m)]
    texts=[]
    for a,t in re.findall(r'<text ([^>]*)>(.*?)</text>',m):
        g=dict(re.findall(r'([\w-]+)="([^"]*)"',a))
        texts.append(dict(x=float(g['x']),y=float(g['y']),size=float(g.get('font-size','6')),weight=int(g.get('font-weight','400')),anchor=g.get('text-anchor','start'),tone='winner' if 'highlight' in g.get('fill','') else 'runner' if 'silver' in g.get('fill','') else 'text',text=clean(t.replace('<tspan',' <tspan'))))
    # bracket
    boxes=[]
    for n in range(59,87):
        l=L[n]; x,y,w=pos(l); s=[t for t in spans(l)]
        ag='AG' in s; s=[t for t in s if t!='AG']
        boxes.append(dict(x=x,y=y,w=w,mirror=x>267,label=s[0],token=first_token(l),legs=s[1] if len(s)==3 else '',agg=s[-1],ag=ag,out='opacity: 0.5' in l[:400],finalist=s[0] in ('Porto','POR','Monaco','MON')))
    links=[dict(d=d,finalist='highlight' in c) for d,c in re.findall(r'<path d="([^"]+)" stroke="([^"]+)"',L[87])]
    columns=[dict(x=pos(L[n])[0],w=pos(L[n])[2],label=clean(L[n])) for n in range(92,99)]
    ft=tokens_in(L[89])
    record=[dict(value=spans(L[n])[0],label=spans(L[n])[1]) for n in range(101,105)]
    # groups
    groups=[]
    for n in range(110,118):
        l=L[n]; name=clean(re.search(r'>(GROUP \w)<',l).group(1)); rows=[]
        for part in re.split(r'(?=<div style="height: 13px;)',l)[1:]:
            s=spans(part)
            res=[{'{{highlight}}':'W','#C9D6E8':'D','{{accent}}':'L'}[c] for c in re.findall(r'width: 4\.2px; height: 4\.2px; border-radius: 50%; background: ([^;]+);',part)]
            rows.append(dict(pos=int(s[0]),club=s[1],token=first_token(part),results=res,pts=int(s[-1]),finalist='background: transparent' not in part[:200]))
        for r in rows:
            assert len(r['results'])==6 and sum({'W':3,'D':1,'L':0}[x] for x in r['results'])==r['pts'],(name,r)
        groups.append(dict(name=name,rows=rows))
    gcsv=list(csv.DictReader(io.StringIO(z.read('2003-04-league-cup-handoff/data/ucl_groups.csv').decode())))
    assert sorted(int(r['Pts']) for r in gcsv)==sorted(x['pts'] for g in groups for x in g['rows'])
    # finalists
    fin=[]
    for a,b in ((120,134),(134,148)):
        head=spans(L[a]); games=[]
        for n in range(a+1,b):
            s=spans(L[n]); stage=s[0] if len(s)==4 else ''
            score,code,venue=s[-3:]
            x,y=[int(v) for v in score.split('-')]
            games.append(dict(stage=stage,score=score,code=code,token=first_token(L[n]),venue=venue,r='W' if x>y else 'D' if x==y else 'L',final=stage=='F'))
        w,d,l_=[int(v) for v in head[1].split('-')]
        assert (sum(g['r']=='W' for g in games),sum(g['r']=='D' for g in games),sum(g['r']=='L' for g in games))==(w,d,l_),head
        fin.append(dict(name=head[0].title(),token=first_token(L[a]),record=head[1],goals=head[2],state=head[3],games=games))
    # final
    circ=re.findall(r'<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" fill="([^"]+)" fill-opacity="[\d.]+" stroke="([^"]+)"',L[151])
    shots=[dict(x=float(a),y=float(b),r=float(c),goal=f!='none',winner='highlight' in s) for a,b,c,f,s in circ]
    tf=list(csv.DictReader(io.StringIO(z.read('2003-04-league-cup-handoff/data/ucl_final_team.csv').decode())))
    assert len(shots)==13==sum(int(r['shots']) for r in tf),(len(shots))
    labels=[dict(x=pos(L[n])[0],y=pos(L[n])[1],text=clean(L[n])) for n in range(152,155)]
    bars=[]
    for n in range(158,170,2):
        v=spans(L[n+1]); bars.append(dict(label=clean(L[n]),a=v[0],b=v[1],av=float(v[0]),bv=float(v[1])))
    scorers=[]
    for n in range(173,181):
        s=spans(L[n]); scorers.append(dict(rank=int(s[0]),player=s[1],token=first_token(L[n]),goals=int(s[2]),per=s[3]))
    odd=[];odt=[]
    for n in range(183,189):
        s=spans(L[n]); odd.append(dict(text=f'{s[0]} · {s[-1]}',source='Champions League results, 2003-04'));odt.append(tokens_in(L[n]))
    title=lambda n:clean(L[n])
    pack=dict(kind='competition',name='Champions League',code='UCL',kicker='CHAMPIONS LEAGUE',fieldTitle=title(55),bracketTitle=title(58),bracketNote=clean(L[99]),
      groupsTitle=spans(L[108])[-1],groupsSub=clean(L[109]),groupsNote=spans(L[118])[-1],finalistsTitle=title(119),finalTitle=title(150),
      map=dict(countries=countries,dots=dots,pins=pins,keys=keys,texts=texts),
      bracket=dict(boxes=boxes,links=links,columns=columns,winner=dict(name='Porto',token=ft[0]),runner=dict(name='Monaco',token=ft[1]),score=clean(L[90]),lines=[x.strip() for x in re.sub(r'<br\s*/?>','|',L[91]).replace('</div>','').split('|')] if False else ['FINAL · 26 MAY','GELSENKIRCHEN']),
      record=record,groups=groups,finalists=fin,final=dict(shots=shots,labels=labels,leaders=re.findall(r' d="([^"]+)"',L[155]),bars=bars,note=clean(L[170]),caption=' '.join(spans(L[156]))),
      scorers=scorers,scorersNote=clean(L[181]),oddityTokens=odt,sources=clean(L[190].replace('<br>',' · ')))
    return pack,odd

EXTRA={'Sporting CP':('SCP','heater','hoops','#007A3D','#FFFFFF'),'Fenerbahçe':('FEN','heater','stripes','#FFED00','#0A2A5C'),'Murcia':('MUR','heater','stripes','#C8102E','#FFFFFF'),'Gramanet':('GRA','roundel','stripes','#C8102E','#FFFFFF')}
def barca_pack(sp,T,tok,gen):
    get0=T.get
    def get(n):
        if n in EXTRA:
            c,f,p,a,b=EXTRA[n]; return dict(code=c,family=f,pattern=p,c1=a,c2=b)
        return get0(n)
    T=type('Toks',(),{'get':staticmethod(get)})
    d=f'{sp}/barca_zip/fc-barcelona-2003-04'
    rd=lambda f:list(csv.DictReader(open(f'{d}/{f}.csv',encoding='utf-8')))
    ms=rd('matches'); sq=rd('squad'); tr=rd('transfers'); lm=rd('league_matches')
    league=[m for m in ms if m['competition']=='La Liga']
    code={'La Liga':'PL','UEFA Cup':'UC','Copa del Rey':'CDR'}
    a=dict(n=len(ms),W=sum(m['result']=='W' for m in ms),D=sum(m['result']=='D' for m in ms),L=sum(m['result']=='L' for m in ms),GF=sum(int(m['gf']) for m in ms),GA=sum(int(m['ga']) for m in ms))
    assert (a['n'],a['W'],a['D'],a['L'],a['GF'],a['GA'])==(52,29,12,11,89,46),a
    lg=dict(pos=int(league[-1]['league_pos_after']),pts=int(league[-1]['league_pts_after']),W=sum(m['result']=='W' for m in league),D=sum(m['result']=='D' for m in league),L=sum(m['result']=='L' for m in league),GF=sum(int(m['gf']) for m in league),GA=sum(int(m['ga']) for m in league))
    assert (lg['pos'],lg['pts'],lg['GF'],lg['GA'])==(2,72,63,39),lg
    # league-wide radar, the same maths as the Premier League's (a red counts twice)
    clubs={}
    for r in lm:
        hg,ag=int(r['hg']),int(r['ag'])
        for c,v,gf,ga,y,rd_ in ((r['home'],'H',hg,ag,r['home_yellow'],r['home_red']),(r['away'],'A',ag,hg,r['away_yellow'],r['away_red'])):
            clubs.setdefault(c,[]).append(dict(v=v,gf=gf,ga=ga,cards=int(y or 0)+2*int(rd_ or 0)))
    assert len(clubs)==20 and all(len(g)==38 for g in clubs.values())
    def met(g):
        pts=lambda l:sum(3 if x['gf']>x['ga'] else 1 if x['gf']==x['ga'] else 0 for x in l)
        return dict(gpg=sum(x['gf'] for x in g)/38,win=sum(x['gf']>x['ga'] for x in g)/38,away=pts([x for x in g if x['v']=='A'])/19,cpg=sum(x['ga'] for x in g)/38,cs=sum(x['ga']==0 for x in g),cards=sum(x['cards'] for x in g)/38)
    M={c:met(g) for c,g in clubs.items()}
    rng={k:dict(min=min(m[k] for m in M.values()),max=max(m[k] for m in M.values()),avg=sum(m[k] for m in M.values())/20) for k in ('gpg','win','away','cpg','cs','cards')}
    me=M['Barcelona']; HIGH={'gpg','win','away','cs'}
    radar={k:dict(v=me[k],rank=1+sum((u[k]>me[k]+1e-9) if k in HIGH else (u[k]<me[k]-1e-9) for u in M.values())) for k in rng}
    # cup runs
    def run(comp,labels,sub):
        rows=[]; sel=[m for m in ms if m['competition']==comp]
        for rname,lab in labels:
            g=[m for m in sel if m['round'].startswith(rname)]
            legs=' · '.join(f'{m["venue"]} {m["gf"]}-{m["ga"]}' for m in g)
            two=len(g)>1
            x,y=sum(int(m['gf']) for m in g),sum(int(m['ga']) for m in g)
            t=T.get(g[0]['opponent'])
            r=dict(label=lab,opp=g[0]['opponent'],token=tok(t),legs=legs,right=f'{x}-{y}' if two else '1 leg')
            if x<y: r.update(right=f'{x}-{y} OUT',out=True)
            rows.append(r)
        return dict(comp={'UEFA Cup':'UC','Copa del Rey':'CDR'}[comp],sub=sub,rows=rows)
    runs=[run('UEFA Cup',[('First round','R1'),('Second round','R2'),('Third round','R3'),('Fourth round','R4')],'Two legs per round · no group stage until 2004–05'),
          run('Copa del Rey',[('Round of 64','R64'),('Round of 32','R32'),('Round of 16','R16'),('Quarter-final','QF')],'Single matches, then two-leg ties')]
    # XIs exactly as printed on the reference
    t=open(f'{sp}/unpacked/barca/template.html',encoding='utf-8').read()
    def xi(var,new):
        m=re.search(var+r' = xi\((\[\[\[.*?\]\]\]), ',t); arr=json.loads(m.group(1).replace("'",'"'))
        q=lambda p:dict(shirt=str(p[2]),name=p[0],**({'new':True} if p[0] in new else {}))
        return dict(gk=[q(p) for p in arr[0]],d=[q(p) for p in arr[1]],m=[q(p) for p in arr[2]],f=[q(p) for p in arr[3]])
    xis=[dict(label='AUG – 11 JAN',shape='no settled XI',lines=xi('xiBefore',[])),dict(label='14 JAN – MAY',shape='4-3-3',lines=xi('xiAfter',['Davids','Oleguer']))]
    grp=lambda p:{'GK':'GK','FW':'FW','MF':'MF'}.get(p,'DF')
    bubbles=[dict(label=s['player'],pos=grp(s['position']),min=int(s['liga_minutes']),goals=int(s['liga_goals']),games=int(s['liga_played'])) for s in sq if int(s['liga_minutes'] or 0)>0]
    assert sum(b['goals'] for b in bubbles)<=lg['GF']
    # the window, in euros as the pack reports them
    short={'Giovanni van Bronckhorst':'Van Bronckhorst','Ricardo Quaresma':'Quaresma','de Boer':'De Boer'}
    win={'in':[],'out':[]}; tot={'in':0.0,'out':0.0}
    for r in tr:
        if r['type']=='Promote' or r['other_club'] in ('YS','') : continue
        v=float(r['fee_eur_m'] or 0); tot[r['direction']]+=v
        fee=f'€{v:g}m' if v else 'Loan' if r['type']=='Loan' else 'Free' if r['fee']=='Free' else 'n/k'
        c=T.get(r['other_club'])
        win[r['direction']].append(dict(name=short.get(r['player'],r['player']),pos=r['position'] if r['position'] in ('GK','DF','MF','FW') else 'MF',code=(c or {}).get('code') or re.sub(r'[^A-Z]','',r['other_club'].upper())[:3],token=tok(c),fee=fee,jan=r['window']=='winter',_v=v))
    for k in win:
        win[k].sort(key=lambda x:-x['_v']); win[k]=[{a:b for a,b in r.items() if a!='_v'} for r in win[k][:5]]
    window={'in':win['in'],'out':win['out'],'inTotal':f'€{tot["in"]:g}m known fees','outTotal':f'€{tot["out"]:g}m known fees','note':'Top 5 each way · other club as kit token + code · J = January window · fees in euros'}
    pack=dict(kind='team',name='Barcelona',short='Barça',code='BAR',kicker='FC BARCELONA',leagueName='La Liga',token=dict(family='heater',pattern='stripes',c1='#A50044',c2='#004D98'),
      design=dict(headline=['The','Turnaround'],outEdge='#A82045',outName='garnet',accentName='Garnet',keyline='#15161A'),league=lg,all=a,
      rounds=[dict(n=int(m['round']),d=m['date'],pos=int(m['league_pos_after'])) for m in league],matches=[dict(d=m['date'],c=code[m['competition']],r=m['result']) for m in ms],
      runs=runs,xis=xis,bubbles=bubbles,window=window,radar=radar,radarRange=rng,
      sources='Sources: BDFutbol (matches, lineups, minutes, standings, cards) · football-data.co.uk (odds) · Wikipedia, Transfermarkt (transfers, fees). League chart by round, not date; all-competition totals unless marked. RGB design proof, no bleed.')
    return pack
