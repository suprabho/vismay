import sys,re,time,json,html,urllib.request,os,collections
SP=sys.argv[1]
IDS={'arsenal':142,'chelsea':536,'manu':1724,'liverpool':1563,'newcastle':1823,'villa':154,'charlton':527,'bolton':354,'fulham':1055,'birmingham':291,'boro':1697,'southampton':2471,'portsmouth':2049,'tottenham':2590,'blackburn':308,'mancity':1718,'everton':942,'leicester':1527,'leeds':1524,'wolves':2848}
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
out={}
for k,i in IDS.items():
    p=f'{SP}/sb/{k}.html'
    if not os.path.exists(p):
        r=urllib.request.Request(f'https://www.soccerbase.com/teams/team.sd?team_id={i}&teamTabs=results&season_id=133',headers={'User-Agent':UA})
        open(p,'wb').write(urllib.request.urlopen(r,timeout=30).read()); time.sleep(1.5)
    s=open(p,encoding='utf-8',errors='replace').read()
    ms=[]
    for m in re.finditer(r'<tr class="match"[^>]*>(.*?)</tr>',s,re.S):
        r=m.group(1)
        comp=re.search(r'title="Go to ([^"]+?) competition page"',r)
        d=re.search(r'results\.sd\?date=(\d{4}-\d\d-\d\d)',r)
        t=re.findall(r'team_id=(\d+)&amp;season_id=133&amp;teamTabs=results" title="Go to ([^"]+?) team page"',r)
        sc=re.search(r'<em>(\d+)</em>&nbsp;-&nbsp;<em>(\d+)</em>',r)
        note=re.findall(r'<span class="(?:comment|note|extra)[^"]*"[^>]*>([^<]*)',r)
        ms.append(dict(date=d.group(1) if d else None,comp=html.unescape(comp.group(1)) if comp else '',home=html.unescape(t[0][1]),hid=t[0][0],away=html.unescape(t[1][1]),aid=t[1][0],hg=int(sc.group(1)) if sc else None,ag=int(sc.group(2)) if sc else None,note=note))
    out[k]=dict(id=i,matches=ms)
    print(k,len(ms),collections.Counter(x['comp'] for x in ms),flush=True)
json.dump(out,open(f'{SP}/sb/all.json','w'),ensure_ascii=False)
