import os,json,sys
from PIL import Image,ImageStat
import numpy as np
src=sys.argv[1];fs=sorted(os.listdir(src));man=[]
for i,f in enumerate(fs):
    im=Image.open(os.path.join(src,f)).convert('RGB')
    w,h=im.size;s=2560/max(w,h) if w>=h else 2560/h
    im2=im.resize((round(w*s),round(h*s)),Image.LANCZOS)
    name='%03d.jpg'%i;im2.save('site/img/'+name,quality=90,optimize=True)
    a=np.asarray(im.resize((96,54))).astype(float)/255
    r,g,b=a[...,0],a[...,1],a[...,2];mx=a.max(-1);mn=a.min(-1)
    sat=float(np.mean((mx-mn)/(mx+1e-6)));lum=float(np.mean(0.2126*r+0.7152*g+0.0722*b))
    red=float(np.mean((r>0.45)&(r>g*1.6)&(r>b*1.6)));blue=float(np.mean((b>r*1.2)&(b>0.3)))
    # rough subject focus: saliency proxy = column/row of max local contrast
    gr=np.asarray(im.convert('L').resize((64,36))).astype(float)
    gx=np.abs(np.diff(gr,axis=1))[:-1,:];gy=np.abs(np.diff(gr,axis=0))[:,:-1];e=gx+gy
    ys,xs=np.mgrid[0:e.shape[0],0:e.shape[1]];wsum=e.sum()+1e-6
    fx=float((e*xs).sum()/wsum/e.shape[1]);fy=float((e*ys).sum()/wsum/e.shape[0])
    grp='film' if f.startswith('a_beautiful') else 'vogue'
    man.append(dict(file='img/'+name,src=f,w=im2.width,h=im2.height,sat=round(sat,3),lum=round(lum,3),red=round(red,3),blue=round(blue,3),bw=sat<0.08,focus=[round(fx,2),round(fy,2)],group=grp))
json.dump(man,open('manifest_raw.json','w'),indent=0)
print(len(man),'film',sum(m['group']=='film' for m in man),'bw',sum(m['bw'] for m in man))
