import sys,re,subprocess,json
scene=sys.argv[1]
head=6; lib=open('src/lib.glsl').read().count('\n')+1
off=head+lib  # body line 1 = full line off+1
import os; src=open(f'shaders/{scene}.glsl' if os.path.exists(f'shaders/{scene}.glsl') else f'isaac/{scene}.glsl').read()
src=re.sub(r'^\s*```[a-z]*\s*$','',src,flags=re.M)
lines=src.split('\n')
err=sys.stdin.read()
seen=set()
for m in re.finditer(r'0:(\d+):',err):
    n=int(m.group(1))-off+1
    if n in seen: continue
    seen.add(n)
    print(f'--- body line {n}:')
    for k in range(max(1,n-1),min(len(lines),n+1)+1): print(f'{k}: {lines[k-1]}')
