import re,html,json,os,sys,glob
TAG=re.compile(r'<[^>]+>')
def clean(x): return re.sub(r'\s+',' ',html.unescape(TAG.sub(' ',x))).strip()
def rows(h): return re.findall(r'<tr[^>]*>(.*?)</tr>',h,re.S)
def tds(r): return re.findall(r'<td\b([^>]*)>(.*?)</td>',r,re.S)

def parse_plan(h):
    out=[]
    # each competition box starts with a header holding the competition name
    parts=re.split(r'<div class="box">',h)
    for p in parts:
        m=re.search(r'<a name="(\w*)"',p)
        hd=re.search(r'<img[^>]*(?:title|alt)="([^"]+)"[^>]*class="[^"]*(?:wettbewerb|continental)',p)
        hd2=re.search(r'class="content-box-headline[^>]*>(.*?)</',p,re.S)
        title=None
        t=re.search(r'content-box-headline[^>]*>\s*(?:<[^>]+>\s*)*([^<]+)',p)
        if t: title=clean(t.group(1))
        for tr in re.findall(r'<tr[^>]*>(.*?)</tr>',p,re.S):
            if 'spielbericht/index/spielbericht/' not in tr: continue
            cells=[c for a,c in tds(tr)]
            txt=[clean(c) for c in cells]
            mid=re.search(r'spielbericht/index/spielbericht/(\d+)',tr).group(1)
            date=None
            for t2 in txt:
                d=re.search(r'(\d\d)/(\d\d)/(\d{4})',t2)
                if d: date=f'{d.group(3)}-{d.group(2)}-{d.group(1)}'; break
            res=clean(cells[-1])
            resclass=re.search(r'class="(redtext|greentext|greytext)"',cells[-1])
            opp_ids=re.findall(r'href="/[^"]*/startseite/verein/(\d+)(?:/saison_id/\d+)?"',tr)
            names=re.findall(r'<a title="([^"]+)" href="/[^"]*/startseite/verein/(\d+)/saison_id/\d+"[^>]*>',tr)
            out.append({'comp':title,'mid':mid,'date':date,'cells':txt,'res':res,'rc':resclass.group(1) if resclass else '', 'names':names})
    return out
if __name__=='__main__':
    h=open(sys.argv[1],encoding='utf-8',errors='replace').read()
    p=parse_plan(h)
    print(len(p))
    import collections
    print(collections.Counter(x['comp'] for x in p))
    for x in p[:3]+p[-8:]: print(x)

# ---- squad / lineups / transfers ---------------------------------------
def parse_squad(h):
    """Player rows of a leistungsdaten (detailed) page."""
    out=[]
    t=h[h.find('class="items"'):]
    for m in re.finditer(r'<tr class="(?:odd|even)">(.*?)</tr>\s*(?=<tr class="(?:odd|even)">|</tbody>)',t,re.S):
        r=m.group(1)
        pid=re.search(r'/profil/spieler/(\d+)',r)
        if not pid: continue
        shirt=re.search(r'rn_nummer[^>]*>([^<]*)<',r)
        name=re.search(r'<a title="([^"]+)" href="/[^"]*/profil/spieler/\d+"',r)
        pos=re.search(r'<td title="([^"]*)" class="zentriert rueckennummer',r)
        # strip the nested inline table, keep the top-level cells
        tail=r[r.rfind('</table>'):]
        cells=[clean(c) for a,c in tds(tail)]
        out.append({'id':pid.group(1),'name':html.unescape(name.group(1)),'shirt':clean(shirt.group(1)) if shirt else '','pos':html.unescape(pos.group(1)) if pos else '','cells':cells})
    return out
def num(x):
    x=x.replace("'",'').replace('.','').replace(',','').strip()
    return int(x) if x.isdigit() else 0
def squad_stats(rows):
    """cells: age, nat, in-squad, apps, goals, assists, yel, 2yel, red, on, off, ppg, minutes"""
    o={}
    for r in rows:
        c=r['cells']
        c=c if len(c)>=13 else c+['']*13
        o[r['id']]={'id':r['id'],'name':r['name'],'shirt':r['shirt'],'pos':r['pos'],'age':c[0],'apps':num(c[3]),'goals':num(c[4]),'assists':num(c[5]),'on':num(c[9]),'off':num(c[10]),'min':num(c[-1])}
    return o
def parse_kader(h):
    """shirt + position + birth date from the detailed squad page."""
    out={}
    t=h[h.find('class="items"'):]
    for m in re.finditer(r'<tr class="(?:odd|even)">(.*?)</tr>\s*(?=<tr class="(?:odd|even)">|</tbody>)',t,re.S):
        r=m.group(1)
        pid=re.search(r'/profil/spieler/(\d+)',r)
        if not pid: continue
        name=re.search(r'<a [^>]*href="/[^"]*/profil/spieler/\d+"[^>]*>\s*([^<]+?)\s*</a>',r)
        shirt=re.search(r'rn_nummer[^>]*>([^<]*)<',r)
        pos=re.search(r'title="([^"]*)" class="zentriert rueckennummer',r)
        pos2=re.search(r'</table>',r)
        sub=re.findall(r'<tr>\s*<td>\s*([^<]+?)\s*</td>\s*</tr>',r)
        out[pid.group(1)]={'id':pid.group(1),'name':html.unescape(name.group(1)) if name else '','shirt':clean(shirt.group(1)) if shirt else '','pos':html.unescape(sub[0]) if sub else (html.unescape(pos.group(1)) if pos else '')}
    return out
def parse_lineup(h):
    """{club_tm_id: [ {shirt,id,name,pos} ]} for the two starting XIs."""
    out={}
    for m in re.finditer(r'<h2 class="content-box-headline[^>]*>\s*<a title="[^"]*" href="/[^"]*/startseite/verein/(\d+)[^"]*">.*?</a>\s*Starting Line-up\s*</h2>(.*?)(?=<h2 class="content-box-headline|$)',h,re.S):
        club=m.group(1); body=m.group(2); ps=[]
        for b in re.finditer(r'<td\s+class="zentriert rueckennummer[^"]*"\s+title="([^"]*)"\s*>\s*<div class="rn_nummer">\s*([^<]*?)\s*</div>.*?/profil/spieler/(\d+)".*?(?:alt|title)="([^"]+)"',body,re.S):
            ps.append({'pos':html.unescape(b.group(1)),'shirt':b.group(2),'id':b.group(3),'name':html.unescape(b.group(4))})
        out[club]=ps
    return out
def parse_transfers(h):
    """arrivals, departures: player id, name, position, other club id/name, league, fee text."""
    res={}
    a=h.find('>Arrivals<'); d=h.find('>Departures<')
    if a<0: a=h.find('Arrivals')
    if d<0: d=h.find('Departures')
    for key,part in (('in',h[a:d]),('out',h[d:d+200000])):
        rows=[]
        for m in re.finditer(r'<tr class="(?:odd|even)">(.*?)</tr>\s*(?=<tr class="(?:odd|even)">|</tbody>)',part,re.S):
            r=m.group(1)
            pid=re.search(r'/profil/spieler/(\d+)',r)
            if not pid: continue
            name=re.search(r'<a title="([^"]+)" href="/[^"]*/profil/spieler/\d+"',r)
            sub=re.findall(r'<tr>\s*<td>\s*([^<]+?)\s*</td>\s*</tr>',r)
            cl=re.search(r'<a title="([^"]+)" href="/[^"]*/startseite/verein/(\d+)',r)
            league=re.search(r'href="/[^"]*/transfers/wettbewerb/[^"]*"[^>]*>([^<]+)<',r)
            fee=re.search(r'<td class="rechts[^"]*"[^>]*>(.*?)</td>',r,re.S)
            rows.append({'id':pid.group(1),'name':html.unescape(name.group(1)),'pos':html.unescape(sub[0]) if sub else '','club':html.unescape(cl.group(1)) if cl else '','club_id':cl.group(2) if cl else '','league':html.unescape(league.group(1)) if league else '','fee':clean(fee.group(1)) if fee else ''})
        res[key]=rows
    return res
