"""Read match marks back out of a reference calendar: {date: [(shape,colour)]}"""
import re,sys,calendar,datetime
def refcal(path):
    s=open(path,encoding='utf-8').read()
    L=s.split('\n')
    line=[l for l in L if 'grid-template-columns: repeat(7, 11px)' in l][0]
    months=[(2003,8),(2003,9),(2003,10),(2003,11),(2003,12),(2004,1),(2004,2),(2004,3),(2004,4),(2004,5)]
    parts=line.split('grid-template-columns: repeat(7, 11px)')[1:]
    out={}
    for (y,m),p in zip(months,parts):
        # iterate cells
        cells=re.findall(r'<span style="width: 11px; height: 8\.5px(?:; display: flex;(?: gap: 1px;)? align-items: center; justify-content: center)?">(.*?)</span>(?=<span style="width: 11px|</div>)|<span style="width: 11px; height: 8\.5px"></span>',p,re.S)
        toks=re.findall(r'<span style="width: 11px; height: 8\.5px([^"]*)">((?:<span style="[^"]*"></span>)*)</span>',p)
        day=0
        for st,inner in toks:
            if 'display' not in st: continue
            day+=1
            marks=re.findall(r'<span style="([^"]*)"></span>',inner)
            ms=[x for x in marks if '1.3px' not in x]
            if ms:
                out[datetime.date(y,m,day).isoformat()]=[('sq' if 'radius' not in x and 'rotate' not in x else 'ci' if 'radius' in x else 'di',re.search(r'background: ([^;]+)',x).group(1)) for x in ms]
    return out
if __name__=='__main__':
    print(refcal(sys.argv[1]))
