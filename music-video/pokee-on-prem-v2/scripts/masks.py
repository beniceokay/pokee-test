import os,time,sys
from rembg import new_session, remove
from PIL import Image
src='../pokee/site/img'; s=new_session('birefnet-general-lite')
fs=sorted(os.listdir(src))
for f in fs:
    out='masks/'+f.replace('.jpg','.png')
    if os.path.exists(out):continue
    t=time.time();im=Image.open(os.path.join(src,f)).convert('RGB')
    m=remove(im,session=s,only_mask=True,post_process_mask=False)
    m.save(out+'.tmp.png');os.replace(out+'.tmp.png',out)
    print(f,'%.1fs'%(time.time()-t),flush=True)
print('MASKSDONE')
