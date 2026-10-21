import json,bisect,math,subprocess,os
import numpy as np
A=json.load(open('analysis.json'));beats=A['beats'];downs=A['downbeats'];DUR=122.08
_B=60/A['tempo']
while beats[-1]+_B<DUR: beats.append(round(beats[-1]+_B,3))
while downs[-1]+4*_B<DUR: downs.append(round(downs[-1]+4*_B,3))
stats=json.load(open('stats.json')) if os.path.exists('stats.json') else {}
def snapD(t):
    return min(downs,key=lambda d:abs(d-t))
# ---- sections (name, start, end, mood, image list) ----
coast_int=[2,1,15,10,20,14,4]
coast_rest=[i for i in range(30) if i not in coast_int]
fashion=list(range(31,47))
SEC=[('coast',0,14.42,'vault',coast_int),
     ('signal',14.42,42.47,'drop',coast_rest[:16]+[30]+coast_rest[16:]+fashion[:6]),
     ('observe',42.47,48.11,'bridge',[47,48,49,50,51]),
     ('upload',48.11,53.73,'build',fashion[6:]),
     ('mosh',53.73,59.35,'denied',[52,53,54,55]),
     ('red',59.35,87.47,'chorus',list(range(56,67))+list(range(67,76))),
     ('reroute',87.47,89.35,'build',[76]),
     ('city',89.35,111.78,'drop',list(range(77,102))),
     ('wake',111.78,119.28,'outro',[102,103]),
     ('final',119.28,DUR,'outro',[104])]
assert sorted(i for s in SEC for i in s[4])==list(range(105))
sections=[dict(name=n,start=s,end=e,mood=m) for n,s,e,m,_ in SEC]
TR={'vault':['dissolve','lightleak','lumafade'],'drop':['glitch','rgb','whip','flash','slice','zoom','shutter','punch','cut','glitch'],
    'bridge':['lumafade','dissolve'],'build':['zoom','cut','shutter','glitch'],'denied':['glitch','rgb','cut'],
    'chorus':['rgb','glitch','flash','slice','whip','punch','shutter','cut'],'outro':['dissolve','lumafade']}
FG={'vault':['float','rise','sway'],'drop':['zoompop','slidein','echo','float','strobe','zoompop','glitch','rise'],
    'bridge':['float','rise'],'build':['zoompop','strobe','echo'],'denied':['glitch','float','glitch'],
    'chorus':['echo','zoompop','float','strobe','slidein','glitch','zoompop','rise'],'outro':['float','rise']}
BG={'vault':['plate'],'drop':['plate','dark','stripes','plate','halftone','plate'],'bridge':['plate','dark'],
    'build':['dark','stripes','halftone'],'denied':['dark','halftone','plate'],'chorus':['mono-red','plate','dark','mono-red','plate'],
    'outro':['plate','dark']}
MOVES=['pushin','pullout','panleft','panright','tiltup','tiltdown']
shots=[];k=0
for (n,T0,T1,m,imgs) in SEC:
    nimg=len(imgs)
    if m in('vault','outro','bridge') or nimg<=2:
        cuts=[T0+(T1-T0)*j/nimg for j in range(nimg)]
    else:
        bi=[b for b in beats if T0-1e-3<=b<T1-1e-3]; L=len(bi)
        cuts=[bi[min(L-1,int(round(j*L/nimg)))] for j in range(nimg)]; cuts[0]=T0
    for j,im in enumerate(imgs):
        st=cuts[j]; en=cuts[j+1] if j+1<nimg else T1
        x=stats.get('%03d'%im); has=bool(x) and 0.03<x['cov']<0.85
        tr=('fadein' if k==0 else (TR[m][j%len(TR[m])] if j>0 else {'drop':'flash','chorus':'flash','denied':'glitch','build':'zoom','bridge':'lumafade','outro':'dissolve','vault':'dissolve'}[m]))
        a=(k*2.399)%(2*math.pi)
        shots.append(dict(start=round(st,3),end=round(en,3),img=im,section=n,transition=tr,move=MOVES[(k*5)%6] if m!='outro' else 'pushin',
            fg=(FG[m][j%len(FG[m])] if has else 'none'),bg=(BG[m][j%len(BG[m])] if has else 'plate'),
            par=[round(math.cos(a),3),round(math.sin(a)*0.5,3)],focus=(x['centroid'] if x else [0.5,0.5])))
        k+=1
for a,b in zip(shots,shots[1:]): a['end']=b['start']
# ---- text ----
def bt(t): return min(beats,key=lambda b:abs(b-t))
def line(kind,sec,words_times,text=None):
    ws=[dict(text=w,s=round(s,2),e=round(e,2)) for w,s,e in words_times]
    return dict(start=ws[0]['s'],end=ws[-1]['e'],section=sec,kind=kind,text=text or ' '.join(w for w,_,_ in words_times),words=ws)
def typed(kind,sec,t0,text,dur):
    w=text.split();n=len(w);step=dur/n
    return line(kind,sec,[(x,t0+i*step,t0+(i+1)*step) for i,x in enumerate(w)],text)
def slam(sec,t0,words,beats_per=1):
    i=bisect.bisect_left(beats,t0-0.05);out=[]
    for j,wd in enumerate(words):
        s=beats[i+j*beats_per];e=beats[min(len(beats)-1,i+(j+1)*beats_per)]
        out.append((wd,s,e))
    return line('whisper',sec,out)
def caption(sec,t0,text,dur):
    return typed('sung',sec,t0,text,dur)
B=60/A['tempo']
L=[typed('vendor','coast',2.4,'transmission 07 — lost coast, 2087',2.4),
   typed('lead','coast',6.2,'i drove until the road turned into code.',3.0),
   typed('vendor','coast',10.4,'analog world: disconnecting…',2.2),
   slam('signal',14.42,['GOING','HARD.'],2),
   caption('signal',21.9,'she wore the sunset like armor,',2.6),
   caption('signal',31.3,'and the signal knew her name.',2.6),
   typed('vendor','observe',42.6,'subject under observation',1.8),
   typed('lead','observe',44.6,'i know you are watching.',2.0),
   slam('upload',48.11,['UPLOAD.'],4),
   caption('mosh',54.2,'i dissolved into the light',3.0),
   slam('red',59.35,['RED.','SHIFT.'],2),
   caption('red',66.9,'love at the speed of light',2.4),
   caption('red',76.3,'we never sleep inside the machine',2.8),
   typed('vendor','reroute',87.6,'rerouting… new node found',1.6),
   slam('city',89.35,['NEON.','NEVER.','SLEEPS.'],2),
   caption('city',98.8,'the city never logs off,',2.4),
   caption('city',104.4,'and neither do we.',2.2),
   typed('vendor','wake',112.2,'connection unstable',1.8),
   typed('lead','wake',115.4,'wake up.',1.4),
   slam('final',119.28,['GOING','HARD.'],1)]
i=bisect.bisect_left(beats,81.8)
L.append(line('chant','red',[('SYNC',beats[i+j],beats[i+j]+0.3) for j in range(8)]))
L.sort(key=lambda l:l['start'])
# ---- events ----
E=[]
def ev(t,type,text,dur): E.append(dict(t=round(t,2),type=type,text=text,dur=dur))
ev(0.2,'boot','TRANSMISSION 07 // LOST COAST',4.6)
ev(4.9,'coords','LOST COAST',8.5)
ev(12.75,'signal','SIGNAL ACQUIRED',1.55)
ev(46.0,'signal','SIGNAL LOST',1.9)
ev(48.15,'upload','UPLOADING CONSCIOUSNESS',5.4)
ev(61.2,'spectrum','',5.4)
ev(87.5,'reroute','REROUTING — NODE TOKYO-7',1.8)
ev(103.0,'spectrum','',1.4)
ev(120.0,'end','GOING HARD',2.08)
# face-scan reticles on strong portrait shots (not during slams/boot)
busy=[(l['start']-0.2,l['end']+0.5) for l in L if l['kind']=='whisper']+[(0,5)]
cand=[]
for s in shots:
    x=stats.get('%03d'%s['img'])
    if not x or s['fg']=='none': continue
    bb=x['bbox']; tall=bb[3]-bb[1]
    if x['cov']>0.22 and tall>0.55 and s['end']-s['start']>0.8 and not any(a<s['start']<b for a,b in busy):
        cand.append(s)
last=-9
for s in cand:
    if s['start']-last>6: ev(s['start']+0.05,'scan','SUBJECT',min(2.6,s['end']-s['start']-0.1)); last=s['start']
E.sort(key=lambda e:e['t'])
# ---- envelope ----
raw=subprocess.run(['ffmpeg','-v','error','-i','song.wav','-ac','1','-ar','24000','-f','f32le','-'],capture_output=True).stdout
y=np.frombuffer(raw,np.float32);sr=24000;hop=sr//30;n=len(y)//hop;env=[];low=[];hi=[]
for i in range(n):
    x=y[i*hop:(i+2)*hop];env.append(np.sqrt(np.mean(x**2)))
    X=np.abs(np.fft.rfft(x*np.hanning(len(x))));f=np.fft.rfftfreq(len(x),1/sr)
    low.append(X[(f>30)&(f<140)].sum());hi.append(X[(f>2000)&(f<8000)].sum())
nz=lambda a:[int(v) for v in np.clip(255*np.array(a)/np.percentile(a,99),0,255)]
imgs=[]
for i in range(105):
    nme='%03d'%i;x=stats.get(nme)
    if x: imgs.append(dict(file=f'img/{nme}.jpg',fg=f'fg/{nme}.webp',plate=f'plate/{nme}.jpg',depth=f'depth/{nme}.png',w=x['w'],h=x['h'],focus=x['centroid'],
                       hasSubject=0.03<x['cov']<0.85,subject=dict(cov=x['cov'],bbox=x['bbox'],centroid=x['centroid'],depth=x['subjDepth']),group='p3',bw=False))
    else: imgs.append(dict(file=f'img/{nme}.jpg',depth=f'depth/{nme}.png',w=1920,h=1075,focus=[.5,.5],hasSubject=False,subject=dict(cov=0,bbox=[0,0,1,1],centroid=[.5,.5],depth=.5),group='p3',bw=False))
T=dict(duration=DUR,fps_env=30,tempo=round(A['tempo'],2),beats=beats,downbeats=downs,kicks=A['kicks'],sections=sections,shots=shots,lyrics=L,events=E,images=imgs,env=dict(rms=nz(env),low=nz(low),high=nz(hi)))
open('site/timeline.js','w').write('window.TIMELINE='+json.dumps(T,separators=(',',':'))+';\n')
from collections import Counter
print(len(shots),'shots',len(L),'lines',len(E),'events','scans',sum(e['type']=='scan' for e in E),'stats',len(stats))
print(Counter(s['fg'] for s in shots));print(Counter(s['transition'] for s in shots))
