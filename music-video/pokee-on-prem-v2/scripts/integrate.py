import sys
p='site/index.html';s=open(p).read()
def R(a,b,n=1):
    global s
    c=s.count(a); assert c==n,(a[:80],c); s=s.replace(a,b)
# 1. load the compositor module
R('<script src="timeline.js"></script>','<script src="timeline.js"></script>\n<script src="footage2.js"></script>')
# 2. layered sampling flag in the transition shader
R("uniform int uT; uniform float uP;","uniform int uT; uniform float uP; uniform float uLay;")
R("  vec2 p=(uv-uvC)/r; p=rot(p,ro); vec2 s=uvC+r*0.5*p;","  vec2 p=(uv-uvC)/r; p=rot(p,ro); vec2 s=uLay>0.5?uv:uvC+r*0.5*p;")
# 3. behind-text canvas routing
R("let overlayCanvas, octx;","let overlayCanvas, octx, behindCanvas, bctx, texBehind=null, shotFBO=[null,null];")
R("  drawEditorial(o,w,h,minWH,vertical,t,mood,F);","  bctx.clearRect(0,0,w,h); drawEditorial(bctx,w,h,minWH,vertical,t,mood,F); drawFrameRect(bctx,w,h,minWH,t,mood);")
R("  if(kind==='whisper'){ drawWhisper(o,w,h,minWH,vertical,t,L,F); return; }","  if(kind==='whisper'){ drawWhisper(bctx,w,h,minWH,vertical,t,L,F); return; }")
R("  if(mood==='chorus'){ drawChorusSung(o,w,h,minWH,vertical,t,L,F); }","  if(mood==='chorus'){ drawChorusSung(bctx,w,h,minWH,vertical,t,L,F); }")
R("function drawLyrics(o,w,h,minWH,vertical,t,mood,F){","""function drawFrameRect(o,w,h,minWH,t,mood){
  // thin magazine frame the model breaks out of
  const ins=minWH*0.06; const a={vault:0.5,drop:0.75,verse:0.6,build:0.7,chorus:0.85,bridge:0.4,denied:0.6,outro:0.5}[mood]||0.6;
  o.save(); o.strokeStyle='rgba(244,239,230,'+a+')'; o.lineWidth=Math.max(1.5,minWH*0.0016);
  o.strokeRect(ins,ins,w-ins*2,h-ins*2); o.restore();
}
function drawLyrics(o,w,h,minWH,vertical,t,mood,F){""")
# 4. resize: behind canvas + per-shot FBOs
R("  overlayCanvas.width=W; overlayCanvas.height=H;","""  overlayCanvas.width=W; overlayCanvas.height=H; behindCanvas.width=W; behindCanvas.height=H;
  for(let i=0;i<2;i++){ if(shotFBO[i]){ gl.deleteFramebuffer(shotFBO[i].f); gl.deleteTexture(shotFBO[i].t); } shotFBO[i]=makeFBO(sceneW,sceneH); }
  if(texBehind){ gl.deleteTexture(texBehind); } texBehind=makeTex(W,H);""")
R("  octx=overlayCanvas.getContext('2d');","  octx=overlayCanvas.getContext('2d'); behindCanvas=document.createElement('canvas'); bctx=behindCanvas.getContext('2d');")
# 5. no full preload; compositor prepares windows
R("  await loadImages();\n","")
R("  readyResolve();","  if(glOK){ if(!Footage2.init(gl)) console.error('Footage2.init failed'); await Footage2.prepare(IMAGES,SHOTS,0,12); }\n  readyResolve();")
R("  ready:readyPromise,","  ready:readyPromise,\n  prepare:(t0,t1)=>Footage2.prepare(IMAGES,SHOTS,t0,t1),")
open(p,'w').write(s);print('patched static parts')
s=open(p).read()
def R(a,b,n=1):
    global s
    c=s.count(a); assert c==n,(a[:80],c); s=s.replace(a,b)
# 6. renderFrame: overlay first, layered shots into FBOs, then the transition pass samples them 1:1
R("""  gl.bindFramebuffer(gl.FRAMEBUFFER,sceneFBO.f);
  gl.viewport(0,0,sceneW,sceneH);
  gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT);
""","""  // overlays first: behind-text feeds the layer compositor
  renderOverlay(t);
  gl.activeTexture(gl.TEXTURE0);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  gl.bindTexture(gl.TEXTURE_2D,texText); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,overlayCanvas);
  gl.bindTexture(gl.TEXTURE_2D,texBehind); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,behindCanvas);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  const needA = inWin && tr!=='cut' && prevIdx>=0;
  if(needA) renderLayered(prevIdx,t,shotFBO[0],g.mood,kick);
  renderLayered(si,t,shotFBO[1],g.mood,kick);

  gl.bindFramebuffer(gl.FRAMEBUFFER,sceneFBO.f);
  gl.viewport(0,0,sceneW,sceneH);
  gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT);
""")
R("""  drawQuad();

  // bloom downsample""","""  gl.uniform1f(u.uLay,1.0);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,shotFBO[0].t); gl.uniform1i(u.uA,0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,shotFBO[1].t); gl.uniform1i(u.uB,1);
  drawQuad();

  // bloom downsample""")
R("""  // text overlay -> texture
  renderOverlay(t);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,texText);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,overlayCanvas); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
""","")
R("function renderFrame(t){","""function beatInfo(t){
  const bi=Math.max(0,upperBound(BEATS,t)-1); const b0=BEATS[bi]||0, b1=BEATS[bi+1]||(b0+0.418);
  const ph=clamp((t-b0)/Math.max(0.05,b1-b0),0,1);
  let kp=0; const ki=upperBound(KICKS,t)-1; if(ki>=0){ const dt=t-KICKS[ki]; if(dt<0.18) kp=Math.exp(-dt/0.06); }
  let dp=1; const di=upperBound(DOWNS,t)-1; if(di>=0){ const dt=t-DOWNS[di]; if(dt<0.12) dp=1+0.006*Math.exp(-dt/0.04); }
  return {beatIndex:bi,beatPhase:ph,bar2Phase:((bi%8)+ph)/8,kickPulse:kp,downPulse:dp};
}
function renderLayered(idx,t,fbo,mood,kick){
  const s=SHOTS[idx]; const tr=shotTransform(idx,t); const b=beatInfo(t);
  const dur=Math.max(0.001,s.end-s.start);
  let scale=tr.scale; if(s.move==='punch') scale*=1+0.015*b.kickPulse;
  if(mood==='chorus') scale*=b.downPulse;
  Footage2.renderShot({fbo:fbo.f,W:sceneW,H:sceneH,image:IMAGES[s.img],imageIndex:s.img,shot:s,shotIndex:idx,t,
    u:clamp((t-s.start)/dur,0,1),base:{scale,ox:tr.ox,oy:tr.oy,focus:tr.focus},kick,kickPulse:b.kickPulse,
    beatPhase:b.beatPhase,beatIndex:b.beatIndex,bar2Phase:b.bar2Phase,downPulse:b.downPulse,mood,
    sinceStart:t-s.start,behindTex:texBehind});
  gl.disable(gl.BLEND); gl.activeTexture(gl.TEXTURE0);
}
function renderFrame(t){""")
open(p,'w').write(s);print('patched renderFrame')
