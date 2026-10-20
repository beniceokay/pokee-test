import json,math
s=open('../pokee/site/timeline.js').read();T=json.loads(s[s.index('=')+1:s.rindex(';')])
st=json.load(open('stats.json'))
for i,im in enumerate(T['images']):
    n='%03d'%i
    if n not in st:
        im.update(file=f'img_v1/{n}.jpg',w=2560,h=1433,hasSubject=False,depth=f'depth/{n}.png',subject=dict(cov=0,bbox=[0,0,1,1],centroid=[.5,.5],depth=.5));continue
    x=st[n]
    has=0.03<x['cov']<0.80
    im.update(file=f'img/{n}.jpg',fg=f'fg/{n}.webp',plate=f'plate/{n}.jpg',depth=f'depth/{n}.png',w=x['w'],h=x['h'],
              focus=x['centroid'],hasSubject=has,subject=dict(cov=x['cov'],bbox=x['bbox'],centroid=x['centroid'],depth=x['subjDepth']))
FG={'vault':['float','rise','float'],'drop':['slidein','zoompop','echo','zoompop'],'verse':['float','sway','rise','slidein','float','zoompop'],
    'build':['zoompop','echo','strobe'],'chorus':['echo','zoompop','slidein','strobe','float','zoompop','echo','glitch'],
    'bridge':['float','rise','sway'],'denied':['glitch','strobe','glitch','zoompop'],'outro':['float','rise','float']}
BG={'vault':['plate'],'drop':['mono-red','plate','stripes','plate'],'verse':['plate','plate','dark','plate','halftone','plate'],
    'build':['dark','stripes','mono-red'],'chorus':['mono-red','plate','stripes','plate','dark','mono-red','halftone','plate'],
    'bridge':['dark','plate'],'denied':['mono-red','dark'],'outro':['plate','dark']}
mood={x['name']:x['mood'] for x in T['sections']}
cnt={}
for k,sh in enumerate(T['shots']):
    m=mood[sh['section']];c=cnt.get(m,0);cnt[m]=c+1
    im=T['images'][sh['img']]
    sh['fg']=FG[m][c%len(FG[m])] if im['hasSubject'] else 'none'
    sh['bg']=BG[m][c%len(BG[m])] if im['hasSubject'] else 'plate'
    a=(k*2.399)%(2*math.pi); sh['par']=[round(math.cos(a),3),round(math.sin(a)*0.5,3)]
    sh['focus']=im['focus']
open('../pokee2/site/timeline.js','w').write('window.TIMELINE='+json.dumps(T,separators=(',',':'))+';\n')
from collections import Counter
print(Counter(s['fg'] for s in T['shots']),Counter(s['bg'] for s in T['shots']),sum(i['hasSubject'] for i in T['images']))
