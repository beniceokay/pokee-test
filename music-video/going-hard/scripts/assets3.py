import os,sys,json,numpy as np,cv2
from PIL import Image
src='raw';dst='site'
stats=json.load(open('stats.json')) if os.path.exists('stats.json') else {}
names=sys.argv[1:] or sorted(f[:-4] for f in os.listdir('masks') if f.endswith('.png') and not f.endswith('.tmp.png'))
for n in names:
    if n in stats and os.path.exists(f'{dst}/plate/{n}.jpg'): continue
    if not os.path.exists(f'depth/{n}.png'): continue
    im=Image.open(f'{src}/{n}.png').convert('RGB'); W=1920; H=round(im.height*W/im.width)
    im=im.resize((W,H),Image.LANCZOS); a=np.asarray(im)
    m=np.asarray(Image.open(f'masks/{n}.png').convert('L').resize((W,H),Image.BILINEAR)).astype(np.float32)/255
    # soften + slightly choke the matte edge
    m=np.clip((m-0.08)/0.84,0,1); m=cv2.GaussianBlur(m,(0,0),1.2)
    fg=np.dstack([a,(m*255).astype(np.uint8)])
    Image.fromarray(fg,'RGBA').save(f'{dst}/fg/{n}.webp',quality=90,method=4)
    im.save(f'{dst}/img/{n}.jpg',quality=90)
    # clean plate: inpaint dilated subject at 1/4 res, blur, paste back outside subject
    hard=(m>0.25).astype(np.uint8)
    dil=cv2.dilate(hard,np.ones((41,41),np.uint8))
    s=4; sm=cv2.resize(a,(W//s,H//s),interpolation=cv2.INTER_AREA); dm=cv2.resize(dil,(W//s,H//s),interpolation=cv2.INTER_NEAREST)
    inp=cv2.inpaint(cv2.cvtColor(sm,cv2.COLOR_RGB2BGR),dm,9,cv2.INPAINT_TELEA)
    inp=cv2.GaussianBlur(inp,(0,0),3); inp=cv2.cvtColor(cv2.resize(inp,(W,H),interpolation=cv2.INTER_CUBIC),cv2.COLOR_BGR2RGB)
    k=cv2.GaussianBlur(dil.astype(np.float32),(0,0),12)[...,None]
    plate=(a*(1-k)+inp*k).astype(np.uint8)
    Image.fromarray(plate).save(f'{dst}/plate/{n}.jpg',quality=88)
    d=Image.open(f'depth/{n}.png').convert('L').resize((960,round(960*H/W)),Image.BICUBIC); d.save(f'{dst}/depth/{n}.png')
    # subject stats
    cov=float(hard.mean()); ys,xs=np.nonzero(hard)
    if len(xs)>50:
        bb=[float(xs.min()/W),float(ys.min()/H),float(xs.max()/W),float(ys.max()/H)]
        cen=[float((m*np.arange(W)[None]).sum()/m.sum()/W),float((m*np.arange(H)[:,None]).sum()/m.sum()/H)]
        dz=np.asarray(d.resize((W,H)),np.float32)/255; sd=float(dz[hard>0].mean())
    else: bb=[0,0,1,1];cen=[.5,.5];sd=.5
    stats[n]=dict(cov=round(cov,3),bbox=[round(v,3) for v in bb],centroid=[round(v,3) for v in cen],subjDepth=round(sd,3),w=W,h=H)
    json.dump(stats,open('stats.json','w'));print(n,stats[n],flush=True)
