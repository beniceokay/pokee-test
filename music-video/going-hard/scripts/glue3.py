p='site/index.html';s=open(p).read()
def R(a,b,n=1):
    global s
    c=s.count(a); assert c==n,(a[:60],c); s=s.replace(a,b)
R('<title>POKEE — ON-PREM</title>','<title>GOING HARD</title>')
# CSS font shorthand needs the style BEFORE weight/size; the old order made canvas ignore italic fonts
R("inter:(w,s,it)=>`${w||600} ${s}px ${it?'italic ':''}'Inter Tight',sans-serif`","inter:(w,s,it)=>`${it?'italic ':''}${w||600} ${s}px 'Inter Tight',sans-serif`")
R("bodoni:(w,s,it)=>`${w||400} ${s}px ${it?'italic ':''}'Bodoni Moda',serif`","bodoni:(w,s,it)=>`${it?'italic ':''}${w||400} ${s}px 'Bodoni Moda',serif`")
fonts=''.join(f"addFont('Unbounded',{w},'normal','url(\"fonts/unbounded-latin-{w}-normal.woff2\") format(\"woff2\")');\n" for w in (300,500,700,900))
fonts+="addFont('IPAGothic',400,'normal','url(\"fonts/ipag.ttf\") format(\"truetype\")');\n"
a="addFont('JetBrains Mono',700,'normal','url(\"fonts/jetbrains-mono-latin-700-normal.woff2\") format(\"woff2\")');\n"
R(a,a+fonts)
helper='''
/* ---- subject box in screen pixels for the current shot (inverse of Footage2's camera transform) ---- */
window.subjectScreenBox=function(t){
  const si=shotIndexAt(t); const s=SHOTS[si]; if(!s) return null; const im=IMAGES[s.img];
  if(!im||!im.hasSubject||!im.subject) return null;
  const tr=shotTransform(si,t); let scale=tr.scale, focus=tr.focus, ox=tr.ox, oy=tr.oy;
  if(s.crop){ const c=(sceneH>sceneW)?s.crop.vert:s.crop.land; scale*=c.scale; focus=c.focus; ox+=(focus[0]-0.5)/scale; oy+=(focus[1]-0.5)/scale; }
  const rx=W/im.w, ry=H/im.h, m=Math.max(rx,ry), kx=rx/m, ky=ry/m;
  const toScr=(cx,cy)=>{ const vx=(cx-focus[0]-ox)*scale+focus[0], vy=(cy-focus[1]-oy)*scale+focus[1];
    return [((vx-0.5)/kx+0.5)*W, ((vy-0.5)/ky+0.5)*H]; };
  const b=im.subject.bbox; const p0=toScr(b[0],b[1]), p1=toScr(b[2],b[3]);
  return {x0:Math.max(0,p0[0]),y0:Math.max(0,p0[1]),x1:Math.min(W,p1[0]),y1:Math.min(H,p1[1])};
};
'''
theme=open('site/theme3.js').read()
R("init();\n})();\n</script>", helper+"\n/* ===== theme3.js (Isaac) inlined so it overrides the engine's scoped functions ===== */\n"+theme+"\ninit();\n})();\n</script>")
open(p,'w').write(s);print('glued')
