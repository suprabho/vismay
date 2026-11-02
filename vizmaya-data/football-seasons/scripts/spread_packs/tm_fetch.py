"""Polite, cached Transfermarkt fetch for 2003-04 Premier League clubs."""
import os,re,sys,time,random,urllib.request,urllib.error
OUT=sys.argv[1]
CLUBS={'arsenal':11,'chelsea':631,'manu':985,'liverpool':31,'newcastle':762,'villa':405,'charlton':358,'bolton':355,'fulham':931,'birmingham':337,'boro':641,'southampton':180,'portsmouth':1020,'tottenham':148,'blackburn':164,'mancity':281,'everton':29,'leicester':1003,'leeds':399,'wolves':543}
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
def get(url,path):
    if os.path.exists(path) and os.path.getsize(path)>5000: return open(path,encoding='utf-8',errors='replace').read()
    for attempt in range(6):
        try:
            r=urllib.request.Request(url,headers={'User-Agent':UA,'Accept-Language':'en-GB,en;q=0.9','Accept':'text/html'})
            b=urllib.request.urlopen(r,timeout=30).read().decode('utf-8','replace')
            open(path,'w',encoding='utf-8').write(b)
            time.sleep(1.1+random.random()*0.8)
            return b
        except urllib.error.HTTPError as e:
            print('HTTP',e.code,url,flush=True)
            if e.code in(404,): return ''
            time.sleep(20*(attempt+1))
        except Exception as e:
            print('ERR',e,url,flush=True); time.sleep(10*(attempt+1))
    print('GIVEUP',url,flush=True); return ''
ids=set()
for n,i in CLUBS.items():
    base='https://www.transfermarkt.co.uk/x'
    pages={'kader':f'{base}/kader/verein/{i}/saison_id/2003/plus/1',
           'all':f'{base}/leistungsdaten/verein/{i}/plus/1?reldata=%262003',
           'pl':f'{base}/leistungsdaten/verein/{i}/plus/1?reldata=GB1%262003',
           'plan':f'{base}/spielplan/verein/{i}/saison_id/2003/plus/1',
           'tr':f'{base}/transfers/verein/{i}/saison_id/2003'}
    for k,u in pages.items():
        h=get(u,f'{OUT}/club/{n}_{k}.html')
        if k=='plan':
            m=set(re.findall(r'spielbericht/index/spielbericht/(\d+)',h)); ids|=m
            print(n,len(m),'matches',flush=True)
print('total matches',len(ids),flush=True)
done=0
for mid in sorted(ids,key=int):
    get(f'https://www.transfermarkt.co.uk/x/aufstellung/spielbericht/{mid}',f'{OUT}/match/{mid}.html')
    done+=1
    if done%50==0: print('match',done,flush=True)
print('DONE',flush=True)
