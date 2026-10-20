import json,re,bisect,random
import numpy as np
random.seed(7)
A=json.load(open('analysis.json'));beats=A['beats'];downs=A['downbeats']
man=json.load(open('manifest_raw.json'));asr=json.load(open('asr_medium.json'))
DUR=243.19
def snap(t,grid=beats):
    i=bisect.bisect_left(grid,t);c=[g for g in grid[max(0,i-1):i+1]]
    return min(c,key=lambda g:abs(g-t)) if c else t
B=60/A['tempo']  # beat length
# ---------- sections ----------
SEC=[('intro',0,17.5,'vault'),('drop',17.5,30.0,'drop'),('verse1',30.0,65.1,'verse'),('prehook',65.1,72.78,'build'),
     ('chorus1',72.78,99.22,'chorus'),('verse2',99.22,147.24,'verse'),('bridge',147.24,173.34,'bridge'),
     ('denied',173.34,183.2,'denied'),('build2',183.2,186.9,'build'),('chorus2',186.9,218.4,'chorus'),('outro',218.4,DUR,'outro')]
sections=[]
for n,s,e,m in SEC:
    s2=0 if s==0 else round(snap(s),3);e2=DUR if e==DUR else round(snap(e),3)
    sections.append(dict(name=n,start=s2,end=e2,mood=m))
for i in range(len(sections)-1):sections[i]['end']=sections[i+1]['start']
# ---------- image pools ----------
idx=list(range(len(man)))
film=[i for i in idx if man[i]['group']=='film']; vogue=[i for i in idx if man[i]['group']!='film']
film.sort(key=lambda i:man[i]['lum'])            # darker first
bold=sorted(vogue,key=lambda i:-(man[i]['red']*2+man[i]['sat']))
# ---------- shot plan: (section, list of shot lengths in beats, transition palette, pool) ----------
PLAN={'vault':(8,['dissolve','lightleak']),'drop':(4,['flash','glitch','stripe','whip']),
      'verse':(4,['cut','cut','whip','slice','cut','stripe','zoom']),'build':(2,['zoom','cut','shutter','zoom']),
      'chorus':(2,['glitch','stripe','whip','flash','shutter','punch','slice','rgb']),'bridge':(12,['dissolve','lumafade']),
      'denied':(2,['cut','glitch','cut','flash']),'outro':(8,['dissolve','lightleak','dissolve'])}
want={'intro':5,'drop':7,'verse1':18,'prehook':8,'chorus1':20,'verse2':24,'bridge':6,'denied':10,'build2':3,'chorus2':21,'outro':6}
assert sum(want.values())==128,sum(want.values())
# pools per section
used=set()
def take(pool,n):
    out=[i for i in pool if i not in used][:n];used.update(out);return out
films_intro=take(film[::-1][:8],5)       # brighter golden film shots for intro
films_bridge=take([i for i in film if man[i]['bw']]+film,6)
films_outro=take(film,4)
chor=take(bold,41)                         # boldest red/white for choruses
rest=[i for i in vogue if i not in used]; random.shuffle(rest)
def mix(lst):  # alternate by luminance to avoid similar adjacent frames
    s=sorted(lst,key=lambda i:man[i]['lum']);out=[]
    while s: out.append(s.pop(0)); 
    # interleave dark/bright halves
    h=len(out)//2;r=[];a,b=out[:h],out[h:][::-1]
    for k in range(max(len(a),len(b))):
        if k<len(b):r.append(b[k])
        if k<len(a):r.append(a[k])
    return r
assign={'intro':films_intro,'bridge':films_bridge}
c=mix(chor);assign['chorus1']=c[:20];assign['chorus2']=c[20:41]
r=mix(rest);pos=0
for n in ['drop','verse1','prehook','verse2','denied','build2']:
    assign[n]=r[pos:pos+want[n]];pos+=want[n]
assign['outro']=films_outro+r[pos:pos+2];pos+=2
assert pos==len(r),(pos,len(r))
shots=[]
for s in sections:
    imgs=assign[s['name']];n=len(imgs);T0,T1=s['start'],s['end']
    beat_in=[b for b in beats if T0-1e-3<=b<T1-1e-3]
    if s['name']=='intro': cuts=[0]+[round(T1*k/n,3) for k in range(1,n)]
    elif s['name']=='outro':
        cuts=[T0+(T1-3.5-T0)*k/n for k in range(n)]
    else:
        # distribute n cuts on the beat grid, favouring downbeats
        L=len(beat_in);step=L/n;cuts=[]
        for k in range(n):
            j=int(round(k*step));j=min(j,L-1);t=beat_in[j]
            dn=min(downs,key=lambda d:abs(d-t))
            if abs(dn-t)<B*0.6 and s['mood'] in('verse','bridge'):t=dn
            cuts.append(t)
        cuts[0]=T0
    cuts=sorted(set(round(x,3) for x in cuts))
    while len(cuts)<n: cuts.append(round((cuts[-1]+T1)/2,3))
    pal=PLAN[s['mood']][1]
    for k,im in enumerate(imgs):
        st=cuts[k];en=cuts[k+1] if k+1<len(cuts) else T1
        tr=pal[k%len(pal)] if k>0 else {'vault':'fadein','drop':'flash','chorus':'flash','denied':'glitch','bridge':'lumafade','outro':'dissolve','build':'zoom','verse':'whip'}[s['mood']]
        moves=['pushin','pullout','panleft','panright','tiltup','tiltdown']
        mv=moves[(k*5+len(shots))%len(moves)] if s['mood']!='chorus' else ['pushin','punch','panleft','pushin','panright','pullout'][k%6]
        shots.append(dict(start=round(st,3),end=round(en,3),img=im,section=s['name'],transition=tr,move=mv,
                          focus=man[im]['focus']))
shots.sort(key=lambda x:x['start'])
for a,b in zip(shots,shots[1:]):a['end']=b['start']
shots[-1]['end']=DUR
assert len({s['img'] for s in shots})==128
# ---------- lyrics with word timings ----------
lines=json.load(open('lines_aligned.json'))
W=[w for s in asr for w in s['words']]
SYN={'pokey':'pokee','poki':'pokee','hokey':'pokee','pokeys':'pokees','cookies':'pokees','prim':'prem','pream':'prem','brand':'prem'}
def toks(x):
    o=[]
    for y in re.split(r"[\s\-—–/]+",x.lower()):
        y=re.sub(r"[^a-z0-9']","",y).strip("'")
        if y:o.append(SYN.get(y,y))
    return o
import difflib
aw=[];am=[]
for i,w in enumerate(W):
    for t in toks(w['w']):aw.append(t);am.append(i)
lw=[];lm=[]
disp=[]
for li,l in enumerate(lines):
    l['words']=[{'text':w} for w in l['text'].split()]
    for wi,w in enumerate(l['words']):
        for t in toks(w['text']):lw.append(t);lm.append((li,wi))
sm=difflib.SequenceMatcher(None,lw,aw,autojunk=False)
for a,b,n in sm.get_matching_blocks():
    for k in range(n):
        li,wi=lm[a+k];w=W[am[b+k]];d=lines[li]['words'][wi]
        d.setdefault('s',w['s']);d['e']=w['e']
out_lines=[]
for l in lines:
    if 'start' not in l:continue
    ws=l['words'];known=[i for i,w in enumerate(ws) if 's' in w]
    for i,w in enumerate(ws):
        if 's' in w:continue
        p=max([k for k in known if k<i],default=None);q=min([k for k in known if k>i],default=None)
        ts=ws[p]['e'] if p is not None else l['start'];te=ws[q]['s'] if q is not None else l['end']
        gp=(p if p is not None else -1);gq=(q if q is not None else len(ws))
        f0=(i-gp)/(gq-gp);w['s']=ts+(te-ts)*f0*0.98;w['e']=w['s']+max(0.12,(te-ts)/(gq-gp)*0.9)
    for w in ws:w['s']=round(w['s'],2);w['e']=round(w['e'],2)
    kind={'V':'vendor','L':'lead','S':'sung','W':'whisper'}[l['kind']]
    out_lines.append(dict(start=l['start'],end=max(l['end'],ws[-1]['e']),section=l['section'],kind=kind,text=l['text'],words=ws))
# denied chant: split ASR 'deny' words
den=[w for w in W if 173.3<=w['s']<=183.2 and 'den' in w['w'].lower()]
out_lines.append(dict(start=round(den[0]['s'],2),end=round(den[-1]['e'],2),section='denied',kind='chant',text=' '.join(['DENIED.']*len(den)),
     words=[{'text':'DENIED.','s':round(w['s'],2),'e':round(w['e'],2)} for w in den]))
out_lines.sort(key=lambda l:l['start'])
# ---------- HUD events ----------
ev=[]
def E(t,type,text,dur=1.2):ev.append(dict(t=round(t,2),type=type,text=text,dur=dur))
E(0.4,'boot','POKEE // ON-PREM NODE 01 — SECURE ENCLAVE',4.0)
E(5.0,'speaker','INCOMING: CLOUD VENDOR',2.5)
asr_beep=[w for w in W if 24.5<=w['s']<=28.6 and 'beep' in w['w'].lower()]
for k,w in enumerate(asr_beep): E(w['s'],'keycard','KEYCARD ACCEPTED' if k%3!=2 else 'BADGE 0x%04X OK'%(0x1A2F+k*97),0.6)
E(17.45,'drop','ON-PREM',1.6)
for l in out_lines:
    tx=l['text'].lower()
    if 'denied' in tx and l['kind']=='sung': 
        w=[x for x in l['words'] if 'denied' in x['text'].lower()][0];E(w['s'],'denied','PERMISSION DENIED',1.4)
    if 'sudo' in tx: E(l['words'][0]['s'],'denied','sudo: ACCESS DENIED',1.6)
    if 'root access' in tx: E(l['start'],'warn','ROOT ESCALATION ATTEMPT',2.0)
    if 'firewall' in tx: E(l['start'],'firewall','FIREWALL: ACTIVE',1.6)
    if 'handshake' in tx:
        w=[x for x in l['words'] if 'handshake' in x['text'].lower()][0];E(w['s'],'denied','TLS HANDSHAKE FAILED',2.0)
    if "cert's" in tx: E(l['start'],'warn','CERTIFICATE NOT SIGNED',1.8)
    if 'new model' in tx: E(l['start'],'notify','NEW MODEL LOADED — RUNNING LOCAL',2.2)
    if 'multi-tenant' in tx: E(l['start'],'warn','MULTI-TENANT REQUEST',1.6)
    if 'single-tenant' in tx: E(l['start'],'ok','SINGLE-TENANT ✓',1.6)
    if 'roadmap' in tx: E(l['start'],'redact','ROADMAP.PDF — CLASSIFIED',2.0)
    if 'federate' in tx: E(l['start'],'notify','FEDERATION REQUEST… PENDING',3.0)
for w in out_lines:
    if w['kind']=='chant':
        for x in w['words']:E(x['s'],'denied','ACCESS DENIED',0.5)
E(235.6,'denied','KEYCARD DENIED',2.2); E(239.0,'end','POKEE — ON-PREM',4.2)
ev.sort(key=lambda e:e['t'])
# ---------- audio envelope 30 Hz ----------
import subprocess
raw=subprocess.run(['ffmpeg','-v','error','-i','song.mp3','-ac','1','-ar','24000','-f','f32le','-'],capture_output=True).stdout
y=np.frombuffer(raw,np.float32);sr=24000;hop=sr//30
n=len(y)//hop;env=[];low=[]
spec_lo=[]
for i in range(n):
    x=y[i*hop:(i+2)*hop] if (i+2)*hop<=len(y) else y[i*hop:]
    env.append(np.sqrt(np.mean(x**2)))
    X=np.abs(np.fft.rfft(x*np.hanning(len(x))));f=np.fft.rfftfreq(len(x),1/sr)
    low.append(X[(f>30)&(f<140)].sum());spec_lo.append(X[(f>2000)&(f<8000)].sum())
def nz(a,p=99):a=np.array(a);return [int(v) for v in np.clip(255*a/np.percentile(a,p),0,255)]
T=dict(duration=DUR,fps_env=30,tempo=round(A['tempo'],2),beats=beats,downbeats=downs,kicks=A['kicks'],
       sections=sections,shots=shots,lyrics=out_lines,events=ev,
       images=[dict(file=m['file'],w=m['w'],h=m['h'],focus=m['focus'],group=m['group'],bw=m['bw']) for m in man],
       env=dict(rms=nz(env),low=nz(low),high=nz(spec_lo)))
open('site/timeline.js','w').write('window.TIMELINE='+json.dumps(T,separators=(',',':'))+';\n')
print('shots',len(shots),'lyrics',len(out_lines),'events',len(ev),'size',len(json.dumps(T))//1024,'KB')
for s in sections:print(s)
from collections import Counter;print(Counter(s['transition'] for s in shots))
print([ (s['start'],s['section'],s['transition']) for s in shots[:14]])
