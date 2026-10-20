import json,sys
from faster_whisper import WhisperModel
m=WhisperModel(sys.argv[1],device='cpu',compute_type='int8',cpu_threads=3)
prompt="Pokee on-prem. Pokee doesn't do your cloud. PokeeClaw on the perimeter, agentic and discreet. single-tenant, sovereign. enterprise."
import numpy as np
segs,info=m.transcribe(np.fromfile('song16.raw',np.float32),language='en',word_timestamps=True,initial_prompt=prompt,vad_filter=False,beam_size=5,condition_on_previous_text=False)
out=[]
for s in segs:
    out.append({'start':s.start,'end':s.end,'text':s.text,'words':[{'w':w.word,'s':w.start,'e':w.end,'p':w.probability} for w in s.words]})
    print('%.2f-%.2f %s'%(s.start,s.end,s.text),flush=True)
json.dump(out,open(f'asr_{sys.argv[1]}.json','w'),indent=1)
