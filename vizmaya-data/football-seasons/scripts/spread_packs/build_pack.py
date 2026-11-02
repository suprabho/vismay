"""Build one team data pack per club from football-data + Transfermarkt + Wikipedia lists."""
import csv,json,re,sys,os,collections,importlib.util,unicodedata
SP=sys.argv[1]
D=__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'../../data')
spec=importlib.util.spec_from_file_location('tp',os.path.join(os.path.dirname(os.path.abspath(__file__)),'tm_parse.py')); tp=importlib.util.module_from_spec(spec); spec.loader.exec_module(tp)
rd=lambda p:open(p,encoding='utf-8',errors='replace').read()
# key: (tm id, football-data name, display, short, code)
CLUBS=[('arsenal',11,'Arsenal','Arsenal','Arsenal','ARS'),('chelsea',631,'Chelsea','Chelsea','Chelsea','CHE'),('manu',985,'Man United','Manchester United','United','MUN'),
('liverpool',31,'Liverpool','Liverpool','Liverpool','LIV'),('newcastle',762,'Newcastle','Newcastle United','Newcastle','NEW'),('villa',405,'Aston Villa','Aston Villa','Villa','AVL'),
('charlton',358,'Charlton','Charlton Athletic','Charlton','CHA'),('bolton',355,'Bolton','Bolton Wanderers','Bolton','BOL'),('fulham',931,'Fulham','Fulham','Fulham','FUL'),
('birmingham',337,'Birmingham','Birmingham City','Birmingham','BIR'),('boro',641,'Middlesbrough','Middlesbrough','Boro','MID'),('southampton',180,'Southampton','Southampton','Southampton','SOU'),
('portsmouth',1020,'Portsmouth','Portsmouth','Portsmouth','POR'),('tottenham',148,'Tottenham','Tottenham Hotspur','Spurs','TOT'),('blackburn',164,'Blackburn','Blackburn Rovers','Blackburn','BLB'),
('mancity',281,'Man City','Manchester City','City','MCI'),('everton',29,'Everton','Everton','Everton','EVE'),('leicester',1003,'Leicester','Leicester City','Leicester','LEI'),
('leeds',399,'Leeds','Leeds United','Leeds','LEE'),('wolves',543,'Wolves','Wolverhampton Wanderers','Wolves','WOL')]
BYTM={str(c[1]):c for c in CLUBS}; BYFD={c[2]:c for c in CLUBS}
all_rows=list(csv.DictReader(open(D+'/matches.csv',encoding='utf-8')))
L=[r for r in all_rows if r['season']=='2003-04' and r['competition']=='Premier League']
L.sort(key=lambda r:r['date'])
assert len(L)==380
# ---------- league maths: table after each club's nth game
games=collections.defaultdict(list)
for r in L:
    h,a,hg,ag=r['home'],r['away'],int(r['hg']),int(r['ag'])
    games[h].append(dict(date=r['date'],opp=a,v='H',gf=hg,ga=ag,y=int(r['HY'] or 0),rd=int(r['HR'] or 0)))
    games[a].append(dict(date=r['date'],opp=h,v='A',gf=ag,ga=hg,y=int(r['AY'] or 0),rd=int(r['AR'] or 0)))
assert all(len(v)==38 for v in games.values()) and len(games)==20
def pts(g): return 3 if g['gf']>g['ga'] else 1 if g['gf']==g['ga'] else 0
def table_at(n):
    t=[]
    for c,g in games.items():
        s=g[:n]; p=sum(pts(x) for x in s); gf=sum(x['gf'] for x in s); ga=sum(x['ga'] for x in s)
        t.append((-p,-(gf-ga),-gf,c))
    t.sort(); return {c:i+1 for i,(_,_,_,c) in enumerate(t)}
TABLES={n:table_at(n) for n in range(1,39)}
def metrics(c):
    g=games[c]; w=sum(x['gf']>x['ga'] for x in g); away=[x for x in g if x['v']=='A']
    return dict(gpg=sum(x['gf'] for x in g)/38,win=w/38,away=sum(pts(x) for x in away)/19,cpg=sum(x['ga'] for x in g)/38,cs=sum(x['ga']==0 for x in g),cards=sum(x['y']+2*x['rd'] for x in g)/38)
M={c:metrics(c) for c in games}
HIGH={'gpg','win','away','cs'}
def rank(c,k):
    vals=[M[x][k] for x in M]
    v=M[c][k]
    return 1+sum((u>v+1e-9) if k in HIGH else (u<v-1e-9) for u in vals)
RAD={}
for k in ['gpg','win','away','cpg','cs','cards']:
    vals=[M[x][k] for x in M]; RAD[k]=dict(min=min(vals),max=max(vals),avg=sum(vals)/20)
# ---------- cup scores from wikipedia, to undo TM's "on pens" totals
cups=list(csv.DictReader(open(D+'/cup_matches.csv',encoding='utf-8')))
COMP={'Premier League':'PL','UEFA Champions League':'UCL','UEFA Champions League Qualifying':'UCLQ','Champions League Qualifying':'UCLQ','UEFA Cup':'UC','FA Cup':'FAC','EFL Cup':'LC','League Cup':'LC','Community Shield':'CS'}
RM={'First Round':'R1','Second Round':'R2','Third Round':'R3','Fourth Round':'R4','Fifth Round':'R5','Round of 16':'R4','Quarter-Finals':'QF','Semi-Finals':'SF','Final':'F','Sixth Round':'QF'}
def nat_key(x): return unicodedata.normalize('NFKD',x).encode('ascii','ignore').decode().lower()
def surname(n,dupes=()):
    p=n.split()
    return n if len(p)==1 else ' '.join(p[1:]) if p[0].lower() in ('de','van') else p[-1]
packs={}
for key,tm,fd,name,short,code in CLUBS:
    plan=tp.parse_plan(rd(f'{SP}/tm/club/{key}_plan.html'))
    ms=[]
    for p in plan:
        comp=COMP.get(p['comp'],p['comp'])
        cells=p['cells']; rnd=cells[0]
        n=p['names']
        hid=n[0][1]; aid=n[1][1]
        isH=hid==str(tm); opp=n[1] if isH else n[0]
        res=p['res']
        m=re.match(r'(\d+):(\d+)(.*)',res)
        hg,ag=int(m.group(1)),int(m.group(2)); extra=m.group(3).strip()
        form=cells[7] if len(cells)>10 else ''
        coach=cells[8] if len(cells)>10 else ''
        att=cells[9] if len(cells)>10 else ''
        ms.append(dict(mid=p['mid'],date=p['date'],comp=comp,rnd=rnd,venue='H' if isH else 'A',opp=opp[0],opp_id=opp[1],opp_short=(cells[6] if isH else cells[4]),gf=hg if isH else ag,ga=ag if isH else hg,extra=extra,rc=p['rc'],formation=form,coach=coach,att=att))
    ms.sort(key=lambda x:x['date'])
    packs[key]=dict(key=key,tm=tm,fd=fd,name=name,short=short,code=code,matches=ms)
json.dump(dict(packs=packs,games=games,M=M,RAD=RAD,tables=TABLES),open(SP+'/packs/_base.json','w'),ensure_ascii=False,indent=0)
# report
for k,p in packs.items():
    c=collections.Counter(m['comp'] for m in p['matches'])
    odd=[(m['date'],m['comp'],m['rnd'],m['venue'],m['opp_short'],m['gf'],m['ga'],m['extra']) for m in p['matches'] if m['extra']]
    print(k,dict(c),odd)
