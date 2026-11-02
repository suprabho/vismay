import os,sys,time,random,urllib.request,urllib.error,re
OUT=sys.argv[1]
src=open(sys.argv[2]+'/tm_fetch.py',encoding='utf-8').read()
CLUBS=eval(re.search(r'CLUBS=(\{.*?\})',src).group(1))
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
# wait for the match fetch to finish
while os.popen('pgrep -f tm_fetch.py').read().strip(): time.sleep(5)
for n,i in CLUBS.items():
    for k,u in (('prev',f'https://www.transfermarkt.co.uk/x/leistungsdaten/verein/{i}/plus/1?reldata=%262002'),
                ('winter',f'https://www.transfermarkt.co.uk/x/transfers/verein/{i}/saison_id/2003/pos//detailpos/0/w_s/w')):
        p=f'{OUT}/club/{n}_{k}.html'
        if os.path.exists(p) and os.path.getsize(p)>5000: continue
        for a in range(5):
            try:
                r=urllib.request.Request(u,headers={'User-Agent':UA,'Accept-Language':'en-GB,en;q=0.9'})
                open(p,'wb').write(urllib.request.urlopen(r,timeout=30).read()); time.sleep(1.2+random.random()); break
            except Exception as e:
                print('ERR',e,u,flush=True); time.sleep(15*(a+1))
    print(n,flush=True)
print('DONE2',flush=True)
