"""Club tokens: reference spreads first, then club_marks/kits data, then a hand table."""
import csv,re,unicodedata
D=__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'../../data')
def norm(s):
    s=unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()
    s=re.sub(r'\b(fc|afc|f\.c\.|cf|sc|ac|as|fk|sk|cd|rc|ca|ogc|bk|rcd|vfl|vfb|ssc|nk|pfc|the)\b','',s)
    return re.sub(r'[^a-z0-9]','',s)
# the 20 clubs exactly as drawn on the Premier League spread
PL={'Arsenal':('ARS','heater','sleeves','#EF0107','#FFFFFF'),'Chelsea':('CHE','roundel','plain','#034694',None),'Manchester United':('MUN','heater','plain','#DA291C',None),
'Liverpool':('LIV','heater','plain','#C8102E',None),'Newcastle United':('NEW','heater','stripes','#15161A','#FFFFFF'),'Aston Villa':('AVL','heater','sleeves','#670E36','#95BFE5'),
'Charlton Athletic':('CHA','roundel','plain','#D4021D',None),'Bolton Wanderers':('BOL','roundel','band','#FFFFFF','#263C7E'),'Fulham':('FUL','heater','band','#FFFFFF','#15161A'),
'Birmingham City':('BIR','roundel','plain','#0033A0',None),'Middlesbrough':('MID','roundel','band','#E21A23','#FFFFFF'),'Southampton':('SOU','heater','stripes','#D71920','#FFFFFF'),
'Portsmouth':('POR','heater','plain','#001489',None),'Tottenham Hotspur':('TOT','heater','band','#FFFFFF','#132257'),'Blackburn Rovers':('BLB','heater','halves','#009EE0','#FFFFFF'),
'Manchester City':('MCI','roundel','plain','#6CABDD',None),'Everton':('EVE','heater','plain','#003399',None),'Leicester City':('LEI','roundel','plain','#003090',None),
'Leeds United':('LEE','roundel','plain','#FFFFFF',None),'Wolverhampton Wanderers':('WOL','roundel','plain','#FDB913',None)}
# tokens used elsewhere on the reference spreads (transfers, cup runs)
REF={'Sevilla':('SEV','heater','plain','#FFFFFF',None),'Borussia Dortmund':('BVB','roundel','plain','#FDE100',None),'Inter':('INT','roundel','stripes','#0068A8','#000000'),'Real Madrid':('RMA','roundel','trim','#FFFFFF','#FEBE10'),'Barcelona':('BAR','heater','stripes','#004D98','#A50044'),
'Marseille':('OM','plate','trim','#FFFFFF','#2FAEE0'),'Monaco':('MON','heater','halves','#E2001A','#FFFFFF'),'PSV Eindhoven':('PSV','roundel','stripes','#E30613','#FFFFFF'),'Celtic':('CEL','roundel','hoops','#018749','#FFFFFF'),'Rangers':('RAN','roundel','plain','#1B458F',None),
'Millwall':('MIL','roundel','plain','#001D5B',None),'Watford':('WAT','roundel','plain','#FBEE23',None),'Reading':('REA','roundel','hoops','#004494','#FFFFFF'),'West Bromwich Albion':('WBA','heater','stripes','#122F67','#FFFFFF'),
'Partizan':('PAR','heater','stripes','#000000','#FFFFFF'),'Burnley':('BUR','heater','sleeves','#6C1D45','#99D6EA'),'Stoke City':('STK','heater','stripes','#E03A3E','#FFFFFF'),'Cardiff City':('CAR','roundel','plain','#0070B5',None)}
MAP={'plain':'plain','solid':'plain','stripes':'stripes','hoops':'hoops','halves':'halves','band':'band','sash':'band','quarters':'halves','sleeves':'sleeves'}
FAM={'roundel':'roundel','heater':'heater','oval':'oval','plate':'plate','square':'plate','shield':'heater','hexagon':'plate'}
class Tok:
    def __init__(s):
        s.t={}
        marks=list(csv.DictReader(open(D+'/club_marks.csv',encoding='utf-8')))
        kits={norm(r['name']):r for r in csv.DictReader(open(D+'/kits.csv',encoding='utf-8'))}
        for r in marks:
            k=norm(r['name'])
            pat=MAP.get(r['pattern'],'plain'); c1=r['c1'] or '#888888'; c2=r['c2'] or None
            if pat!='plain' and not c2: pat='plain'
            s.t[k]=dict(code=r['code'],family=FAM.get(r['crest'],'roundel'),pattern=pat,c1=c1,c2=c2,src='marks')
        for k,r in kits.items():
            if k in s.t: continue
            pat=MAP.get(r['pattern'],'plain'); c1=r['c1'] or None
            if not c1: continue
            c2=r['c2'] or None
            if pat!='plain' and not c2: pat='plain'
            s.t[k]=dict(code=re.sub(r'[^A-Z]','',unicodedata.normalize('NFKD',r['name']).encode('ascii','ignore').decode().upper())[:3],family='roundel',pattern=pat,c1=c1,c2=c2,src='kits')
        for tbl in (REF,PL):
            for n,(code,fam,pat,a,b) in tbl.items():
                s.t[norm(n)]=dict(code=code,family=fam,pattern=pat,c1=a,c2=b,src='ref')
        s.alias={}
    def get(s,name):
        k=norm(name)
        k=s.alias.get(k,k)
        if k in s.t: return s.t[k]
        for c in s.t:
            if len(k)>=6 and (c.startswith(k) or k.startswith(c)): return s.t[c]
        return None
