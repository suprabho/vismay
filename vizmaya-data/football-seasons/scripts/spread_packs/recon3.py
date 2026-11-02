import json,re,sys,collections,importlib.util
SP=sys.argv[1]
b=json.load(open(SP+'/packs/_base.json')); P=b['packs']; G=b['games']
SB=json.load(open(SP+'/sb/all.json'))
spec=importlib.util.spec_from_file_location('rc',os.path.join(os.path.dirname(os.path.abspath(__file__)),'refcal.py')); rc=importlib.util.module_from_spec(spec); spec.loader.exec_module(rc)
CM={'PL':'Premiership','UCL':'Champions League','UCLQ':'Champions League','UEFA-Cup (- 2009)':'UEFA Cup','UEFA-Cup Qualifikation':'UEFA Cup','FAC':'FA Cup','LC':'Carling Cup','CS':'Community Shield'}
out={}
ndate=nscore=0
for k,p in P.items():
    sb=SB[k]['matches']; used=set(); sid=str(SB[k]['id'])
    tm=sorted(p['matches'],key=lambda m:m['date'])
    res=[]
    for m in tm:
        comp=CM[m['comp']]
        ishome=m['venue']=='H'
        # match by comp + venue + nearest date
        cands=[(abs((__import__('datetime').date.fromisoformat(x['date'])-__import__('datetime').date.fromisoformat(m['date'])).days),i) for i,x in enumerate(sb) if i not in used and x['comp']==comp and (x['hid']==sid)==ishome]
        # for neutral / flipped ties, loosen
        if not cands or min(cands)[0]>6:
            cands=[(abs((__import__('datetime').date.fromisoformat(x['date'])-__import__('datetime').date.fromisoformat(m['date'])).days),i) for i,x in enumerate(sb) if i not in used and x['comp']==comp]
        d,i=min(cands); used.add(i); x=sb[i]
        gf,ga=(x['hg'],x['ag']) if x['hid']==sid else (x['ag'],x['hg'])
        flag=[]
        if d: flag.append(f"date TM {m['date']} SB {x['date']}"); ndate+=1
        if (gf,ga)!=(m['gf'],m['ga']): flag.append(f"score TM {m['gf']}-{m['ga']} {m['extra']} SB {gf}-{ga}"); nscore+=1
        if (x['hid']==sid)!=ishome: flag.append(f"venue TM {m['venue']} SB {x['home']} v {x['away']}")
        m['sb_date']=x['date']; m['sb_gf']=gf; m['sb_ga']=ga; m['sb_home']=x['hid']==sid
        if flag: print(k,m['comp'],m['rnd'],m['opp_short'],' | '.join(flag))
print('date diffs',ndate,'score diffs',nscore)
for key in ('arsenal','chelsea','manu'):
    r=rc.refcal(f'{SP}/unpacked/{key}/template.html')
    s=collections.Counter(m['sb_date'] for m in P[key]['matches'])
    print(key,'ref-only',[d for d in r if d not in s],'sb-only',[d for d in s if d not in r])
json.dump(P,open(SP+'/packs/_recon.json','w'),ensure_ascii=False)
