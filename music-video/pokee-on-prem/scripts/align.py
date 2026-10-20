import json,re,difflib
asr=json.load(open('asr_medium.json'))
W=[w for s in asr for w in s['words']]
SYN={'pokey':'pokee','poki':'pokee','hokey':'pokee','pokeys':'pokees','cookies':'pokees','prim':'prem','pream':'prem','brand':'prem'}
def norm(t):
    out=[]
    for x in re.split(r"[\s\-—–/]+",t.lower()):
        x=re.sub(r"[^a-z0-9']","",x).strip("'")
        if not x:continue
        x=SYN.get(x,x);out.append(x)
    return out
aw=[];amap=[]
for i,w in enumerate(W):
    for t in norm(w['w']):aw.append(t);amap.append(i)
lines=[];sec=None
for raw in open('lyrics.txt'):
    raw=raw.rstrip('\n')
    if raw.startswith('#'):sec=raw[1:];continue
    if not raw.strip():continue
    kind,txt=raw.split('|',1)
    lines.append(dict(section=sec,kind=kind,text=txt))
lw=[];lmap=[]
for li,l in enumerate(lines):
    for t in norm(l['text']):lw.append(t);lmap.append(li)
sm=difflib.SequenceMatcher(None,lw,aw,autojunk=False)
hits={}
for a,b,n in sm.get_matching_blocks():
    for k in range(n):hits.setdefault(lmap[a+k],[]).append(W[amap[b+k]])
for li,l in enumerate(lines):
    h=hits.get(li,[]);ntok=len(norm(l['text']))
    l['matched']=f"{len(h)}/{ntok}"
    if h:l['start']=round(min(w['s'] for w in h),2);l['end']=round(max(w['e'] for w in h),2)
for l in lines: print(l['section'],l['kind'],l.get('start'),l.get('end'),l['matched'],l['text'][:60])
json.dump(lines,open('lines_aligned.json','w'),indent=1)
