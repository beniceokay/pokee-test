import os,sys,time,numpy as np,torch
from transformers import pipeline
from PIL import Image
torch.set_num_threads(2)
p=pipeline('depth-estimation',model='depth-anything/Depth-Anything-V2-Small-hf',device='cpu')
src='raw'; fs=sorted(os.listdir(src)) if len(sys.argv)<2 else sys.argv[1:]
for f in fs:
    out='depth/'+os.path.basename(f)
    if os.path.exists(out):continue
    t=time.time();im=Image.open(os.path.join(src,os.path.basename(f))).convert('RGB');im.thumbnail((1024,1024))
    d=np.array(p(im)['predicted_depth'].squeeze(),dtype=np.float32)
    d=(d-d.min())/(d.max()-d.min()+1e-6)   # 1 = near
    Image.fromarray((d*255).astype(np.uint8)).resize(im.size,Image.BICUBIC).save(out)
    print(f,'%.1fs'%(time.time()-t),flush=True)
print('DEPTHDONE')
