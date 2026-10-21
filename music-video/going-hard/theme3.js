/* =========================================================================
   theme3.js — "GOING HARD" theme override (loaded after engine, before frame)
   Blade Runner 2049 × Ghost in the Shell × Vogue editorial.
   Deterministic: rand() + t only.
   ========================================================================= */
(function(){
'use strict';

/* ---- palette ---- */
var C = { cyan:'#19E6FF', mag:'#FF2BD6', red:'#FF2A3D', ivory:'#F2EEE6', deep:'#05060F', amber:'#FFB547' };
var CY = [25,230,255], MG = [255,43,214], RD = [255,42,61], IV = [242,238,230], AM = [255,181,71];
function hx(h,a){ return 'hsl('+h+','+a+')'; }
function rgb(a,b,c,d){ return 'rgba('+(a|0)+','+(b|0)+','+(c|0)+','+d+')'; }
function mix(A,B,k){ return [A[0]+(B[0]-A[0])*k, A[1]+(B[1]-A[1])*k, A[2]+(B[2]-A[2])*k]; }
function mixA(A,B,k,d){ return rgb(A[0]+(B[0]-A[0])*k, A[1]+(B[1]-A[1])*k, A[2]+(B[2]-A[2])*k, d); }
function mixS(A,B,k){ return 'rgb('+(A[0]+(B[0]-A[0])*k|0)+','+(A[1]+(B[1]-A[1])*k|0)+','+(A[2]+(B[2]-A[2])*k|0)+')'; }
function hexA(hex,a){ var n=parseInt(hex.slice(1),16); return 'rgba('+(n>>16&255)+','+(n>>8&255)+','+(n&255)+','+a+')'; }
function hexRGB(hex){ var n=parseInt(hex.slice(1),16); return [n>>16&255,n>>8&255,n&255]; }
function hslA(h,s,l,a){ return 'hsla('+h+','+s+'%,'+l+'%,'+a+')'; }

/* ---- beat helpers (deterministic, from BEATS/DOWNS) ---- */
function beatPos(t){
  var arr = (typeof BEATS!=='undefined'&&BEATS.length)?BEATS:null;
  if(arr){ var i=upperBound(arr,t),p=arr[i]; if(p!=null&&p>t){ var j=i-1; if(j<0)j=0; var a=arr[j],b=arr[i]; if(b>a)return (t-a)/(b-a); return 0; } return 0; }
  var sp=60/129; return (t/sp)%1;
}
function barPos(t){
  var arr=(typeof DOWNS!=='undefined'&&DOWNS.length)?DOWNS:null;
  if(arr){ var i=upperBound(arr,t),p=arr[i]; if(p!=null&&p>t){ var j=i-1; if(j<0)j=0; var a=arr[j],b=arr[i]; if(b>a)return (t-a)/(b-a); return 0; } return 0; }
  var sp=240/129; return (t/sp)%1;
}
function beatIdx(t){ var arr=(typeof BEATS!=='undefined'&&BEATS.length)?BEATS:null; if(arr){ var i=upperBound(arr,t); return (arr[i]!=null&&arr[i]>t)?Math.max(0,i-1):i; } return Math.floor(t/(60/129)); }
function barIdx(t){ var arr=(typeof DOWNS!=='undefined'&&DOWNS.length)?DOWNS:null; if(arr){ var i=upperBound(arr,t); return (arr[i]!=null&&arr[i]>t)?Math.max(0,i-1):i; } return Math.floor(t/(240/129)); }

/* ---- fontStack replacement (keep old four, add unb + jp) ---- */
if(typeof fontStack==='function'){
  try{
    var old = fontStack();
    fontStack = function(){
      var f = (old && typeof old==='object') ? old : {};
      if(typeof f.mono!=='function') f.mono=function(w,s){return (w||400)+' '+(s||12)+"px 'JetBrains Mono',monospace";};
      if(typeof f.inter!=='function') f.inter=function(w,s,it){return (w||400)+' '+(s||12)+(it?' italic':'')+"px 'Inter Tight',sans-serif";};
      if(typeof f.bodoni!=='function') f.bodoni=function(w,s,it){return (w||400)+' '+(s||12)+(it?' italic':'')+"px 'Bodoni Moda',serif";};
      if(typeof f.anton!=='function') f.anton=function(s){return '400 '+(s||12)+"px 'Anton',sans-serif";};
      f.unb=function(w,s){ return (w||400)+' '+(s||12)+"px 'Unbounded',sans-serif"; };
      f.jp=function(s){ return "400 "+(s||12)+"px 'IPAGothic',sans-serif"; };
      return f;
    };
  }catch(e){}
}

/* ---- 2. SECTION_TITLES (mutate) ---- */
try{
  var NEWT = { coast:'I. ANALOG COAST', signal:'II. HIGH SIGNAL', observe:'III. OBSERVATION', upload:'IV. UPLOAD', mosh:'V. DATAMOSH', red:'VI. RED SHIFT', reroute:'', city:'VII. NEON CITY', wake:'VIII. WAKE', final:'' };
  if(typeof SECTION_TITLES!=='undefined'){
    for(var k in SECTION_TITLES){ if(Object.prototype.hasOwnProperty.call(SECTION_TITLES,k) && !Object.prototype.hasOwnProperty.call(NEWT,k)) delete SECTION_TITLES[k]; }
    for(var k2 in NEWT){ if(Object.prototype.hasOwnProperty.call(NEWT,k2)) SECTION_TITLES[k2]=NEWT[k2]; }
  }
}catch(e){}

/* ---- 3. KW (mutate) ---- */
try{
  if(typeof KW!=='undefined'&&KW.length!==undefined){ KW.length=0; ['signal','neon','code','machine','light','city','dream','wake','upload','sync','hard','never'].forEach(function(x){ KW.push(x); }); }
}catch(e){}

/* ---- 1. moodParams ---- */
moodParams = function(mood){
  var P = {
    vault:  {sat:1.10, contrast:1.10, exposure:1.06, cool:0.04, warm:0.30, crush:0.14, letterbox:1, red:0.00, scan:0.10},
    drop:   {sat:1.32, contrast:1.22, exposure:1.03, cool:0.12, warm:0.05, crush:0.22, letterbox:0, red:0.00, scan:0.16},
    bridge: {sat:0.62, contrast:1.14, exposure:0.92, cool:0.26, warm:0.02, crush:0.28, letterbox:1, red:0.00, scan:0.06},
    build:  {sat:1.02, contrast:1.14, exposure:0.99, cool:0.28, warm:0.03, crush:0.18, letterbox:0, red:0.00, scan:0.20},
    denied: {sat:0.74, contrast:1.16, exposure:0.90, cool:0.34, warm:0.00, crush:0.34, letterbox:0, red:0.00, scan:0.45},
    chorus: {sat:1.26, contrast:1.25, exposure:1.02, cool:0.04, warm:0.06, crush:0.20, letterbox:0, red:0.45, scan:0.14},
    outro:  {sat:0.82, contrast:1.02, exposure:0.88, cool:0.16, warm:0.08, crush:0.26, letterbox:0, red:0.00, scan:0.10}
  };
  return P[mood] || P.vault;
};

/* ---- 4. baseHUDOp ---- */
baseHUDOp = function(mood,kick,t){
  switch(mood){
    case 'vault':  return 0.75;
    case 'drop':   return 0.50 + (kick||0)*0.22;
    case 'bridge': return 0.95;
    case 'build':  return 0.85;
    case 'denied': return 0.90;
    case 'chorus': return 0.45;
    case 'outro':  return 0.80;
    default:       return 0.70;
  }
};

/* ---- shared accent + HUD corner brackets ---- */
function accent(mood){
  if(mood==='chorus') return {c:C.red, a:RD, hex:C.red, alt:C.cyan};
  if(mood==='bridge') return {c:'#EAF6FF', a:IV, hex:'#EAF6FF', alt:C.cyan};
  return {c:C.cyan, a:CY, hex:C.cyan, alt:C.mag};
}
function drawBrackets(o,w,h,ac,op){
  var m=w*0.04, L=Math.min(w,h)*0.05, th=Math.max(1,w*0.0016);
  o.lineWidth=th; o.strokeStyle=hexA(ac.hex,op); o.beginPath();
  o.moveTo(m,m+L); o.lineTo(m,m); o.lineTo(m+L,m);
  o.moveTo(w-m-L,m); o.lineTo(w-m,m); o.lineTo(w-m,m+L);
  o.moveTo(w-m,h-m-L); o.lineTo(w-m,h-m); o.lineTo(w-m-L,h-m);
  o.moveTo(m+L,h-m); o.lineTo(m,h-m); o.lineTo(m,h-m-L);
  o.stroke();
}

/* ---- 5. drawHUD ---- */
drawHUD = function(o,w,h,minWH,vertical,t,mood,kick,rms,high,hudOp,F){
  if(!o||!F) return;
  var ac=accent(mood), op=clamp(hudOp,0,1), m=w*0.04, L=Math.min(w,h)*0.05;
  var th=Math.max(1,w*0.0016), fs=Math.max(10,minWH*0.018), fs2=fs*0.92;
  o.save(); o.lineJoin='miter';
  drawBrackets(o,w,h,ac,op);

  var g=floor24(t);
  function goff(){ if(mood==='denied'){ var s=rand(0.01+g*0.37,0.02+g*0.37); return (s-0.5)*minWH*0.02; } return 0; }

  /* top-left */
  o.textBaseline='top'; o.textAlign='left';
  o.font=F.mono(700,fs); o.fillStyle=hexA(ac.hex,op);
  o.fillText('GOING HARD \u25E2 TRANSMISSION 07', m+minWH*0.012, m+minWH*0.006+goff());
  var sync=(95.0+rms*4.9).toFixed(1);
  o.font=F.mono(400,fs2); o.fillStyle=hexA(ac.alt,op*0.85);
  o.fillText('NEURAL LINK \u00B7 SYNC '+sync+'%', m+minWH*0.012, m+minWH*0.006+fs*1.45+goff());

  /* top-right */
  o.textAlign='right';
  o.font=F.mono(700,fs); o.fillStyle=hexA(ac.hex,op);
  o.fillText(timecode(t), w-m-minWH*0.012, m+minWH*0.006+goff());
  var d1=((t*0.7)%999999)/999999, d2=((t*0.9+0.5)%999999)/999999;
  var lat=(34.0195+d1*0.0004).toFixed(4), lon=(118.4912+d2*0.0004).toFixed(4);
  o.font=F.mono(400,fs2); o.fillStyle=hexA(ac.alt,op*0.8);
  o.fillText('LAT '+lat+' N / LON '+lon+' W', w-m-minWH*0.012, m+minWH*0.006+fs*1.45+goff());

  /* right edge: katakana + tick ruler */
  var rx=w-m-minWH*0.02, cy=h*0.5, rr=vertical?minWH*0.16:minWH*0.30;
  o.save(); o.translate(rx,cy); o.rotate(Math.PI/2);
  o.textAlign='center'; o.textBaseline='middle';
  o.font=F.jp(vertical?minWH*0.018:minWH*0.02); o.fillStyle=hexA(ac.hex,op*0.45);
  o.fillText('\u30B4\u30FC\u30A4\u30F3\u30B0\u30FB\u30CF\u30FC\u30C9',0,0);
  o.restore();
  var rrx=w-m-minWH*0.035, rTop=cy-rr, rBot=cy+rr, n=vertical?12:24;
  o.lineWidth=th; o.strokeStyle=hexA(ac.hex,op*0.5); o.beginPath();
  o.moveTo(rrx,rTop); o.lineTo(rrx,rBot);
  for(var i=0;i<=n;i++){ var yy=rTop+(rBot-rTop)*i/n, tl=(i%4===0)?minWH*0.014:minWH*0.006; o.moveTo(rrx,yy); o.lineTo(rrx+tl,yy); }
  o.stroke();
  var syp=rTop+((t*0.12)%1)*(rBot-rTop);
  o.fillStyle=hexA(ac.alt,op*0.85); o.fillRect(rrx-minWH*0.004,syp-minWH*0.003,minWH*0.012,minWH*0.006);

  /* bottom-left telemetry (3 rolling lines) */
  var base=beatIdx(t), rows=3, lh=fs*1.5, ty=h-m-minWH*0.006-rows*lh;
  o.textAlign='left'; o.textBaseline='alphabetic';
  var pre=[
    function(n){ return '[nrl] packet 0x'+(0x1000+Math.floor(rand(0.1+n*0.73,0.2+n*0.73)*0xFFFF).toString(16).toUpperCase())+' ok'; },
    function(n){ return '[sig] carrier 129.'+((1+Math.floor(rand(0.3+n*0.41,0.4+n*0.41)*8))%10)+' bpm'; },
    function(n){ return '[bio] pulse 1'+((1+Math.floor(rand(0.5+n*0.29,0.6+n*0.29)*10))%10)+' \u00B7 '+(rand(0.7+n*0.17,0.8+n*0.17)>0.5?'stable':'sync'); },
    function(n){ return '[net] node TOKYO-7 \u2194 LA-'+((1+Math.floor(rand(0.9+n*0.53,1+n*0.53)*9))%10); }
  ];
  for(var r=0;r<rows;r++){
    var idx=base-r, alpha=(r===0)?op:op*(r===1?0.6:0.32);
    o.font=F.mono(400,fs2); o.fillStyle=hexA(ac.hex,alpha);
    o.fillText(pre[((idx%4)+4)%4](idx), m+minWH*0.012, ty+r*lh);
  }

  /* bottom-right: 24-bar spectrum + FREQ */
  var bw=minWH*0.16, bh=minWH*0.05, bx=w-m-minWH*0.012-bw, by=h-m-minWH*0.006-bh, bars=24, gap=bw/bars;
  var low=(typeof envVal==='function'&&ENV)?envVal(ENV.low,t):0.3, mid=(typeof envVal==='function'&&ENV)?envVal(ENV.rms,t):0.3, hi=(typeof envVal==='function'&&ENV)?envVal(ENV.high,t):0.3;
  for(var b=0;b<bars;b++){
    var shape=0.35+0.65*rand(0.2+b*0.31,0.3+b*0.31);
    var env=b<8?low:(b<16?mid:hi);
    var v=clamp(env*shape+(b%5===0?kick*0.5:0),0,1);
    var bh2=bh*0.15+bh*0.85*v;
    o.fillStyle=hexA(ac.hex,op*(0.35+0.6*v));
    o.fillRect(bx+b*gap+gap*0.18, by+bh-bh2, gap*0.64, bh2);
  }
  o.textAlign='right'; o.textBaseline='alphabetic';
  o.font=F.mono(400,fs2); o.fillStyle=hexA(ac.alt,op*0.8);
  o.fillText('FREQ 7.83 HZ', w-m-minWH*0.012, by-minWH*0.008);

  /* horizontal scan line sweeping every 2 bars */
  var sp=(t*0.12)%1, sy=lerp(m+minWH*0.02, h-m-minWH*0.02, sp);
  var grad=o.createLinearGradient(0,sy-2,0,sy+2);
  grad.addColorStop(0,hexA(ac.hex,0)); grad.addColorStop(0.5,hexA(ac.hex,op*0.18)); grad.addColorStop(1,hexA(ac.hex,0));
  o.fillStyle=grad; o.fillRect(m,sy-2,w-2*m,4);

  o.restore();
};

/* ---- 6. drawEditorial (BEHIND canvas) ---- */
drawEditorial = function(o,w,h,minWH,vertical,t,mood,F){
  if(!o||!F) return;
  var si=sectionIndexAt(t), sec=SECTIONS[si]; if(!sec) return;
  var title=SECTION_TITLES[sec.name]; if(!title) return;
  var dt=t-sec.start; if(dt>2.0) dt=2.0;
  var ac=accent(mood), p=clamp(dt/0.9,0,1), e=easeOutExpo(p), out=clamp((2.0-dt)/0.3,0,1);
  var fade=clamp(p*2,0,1)*out;
  var x=vertical?w*0.5:w*0.07, y=vertical?h*0.15:h*0.19;
  var num=title.split('.')[0], rest=title.slice(num.length).replace(/^\.\s*/,'').trim();
  var numS=minWH*(vertical?0.08:0.07), titS=minWH*(vertical?0.03:0.024);
  o.save(); o.textAlign=vertical?'center':'left'; o.textBaseline='alphabetic';
  var nx=vertical?x-numS*0.35:x, ny=y;
  o.font=F.bodoni(400,numS,true); o.fillStyle=hexA(ac.hex,fade*0.95);
  if(vertical){ o.fillText(num,x,ny); }
  else { o.fillText(num,nx,ny); }
  var numW=o.measureText(num).width;
  o.font=F.unb(300,titS); o.fillStyle=hexA(C.ivory,fade);
  if(vertical){ o.fillText(rest, x, ny+titS*1.9); }
  else { o.fillText(rest, nx+numW+minWH*0.022, ny-numS*0.12); }
  var ruleY=ny+(vertical?titS*2.6:minWH*0.012), ruleX0=vertical?x-minWH*0.12:x, ruleLen=minWH*(vertical?0.24:0.22);
  o.strokeStyle=hexA(ac.hex,fade); o.lineWidth=Math.max(1,minWH*0.0016);
  o.beginPath(); o.moveTo(ruleX0,ruleY); o.lineTo(ruleX0+ruleLen*easeInOutCubic(p),ruleY); o.stroke();
  o.restore();

  if(mood==='drop'||mood==='chorus'){
    var op2=clamp(out,0,1)*0.5;
    o.save(); o.font=F.mono(400,minWH*0.014); o.fillStyle=hexA(C.ivory,op2);
    o.textAlign=vertical?'center':'left'; o.textBaseline='alphabetic';
    o.fillText('SS2087 \u2014 LOOK 07', vertical?w*0.5:w*0.07, h*0.94);
    o.textAlign='right'; o.fillText('GOING HARD / 07', w*0.93, h*0.94);
    var cm=minWH*0.014, c=[ [w*0.05,h*0.05],[w*0.95,h*0.05],[w*0.05,h*0.95],[w*0.95,h*0.95] ];
    o.strokeStyle=hexA(C.ivory,op2); o.lineWidth=1; o.beginPath();
    c.forEach(function(pt){ o.moveTo(pt[0]-cm,pt[1]); o.lineTo(pt[0]+cm,pt[1]); o.moveTo(pt[0],pt[1]-cm); o.lineTo(pt[0],pt[1]+cm); });
    o.stroke(); o.restore();
  }
};

/* ---- 7. drawFrameRect (BEHIND canvas) ---- */
drawFrameRect = function(o,w,h,minWH,t,mood){
  if(!o) return;
  var m=w*0.06, x0=m, y0=m, x1=w-m, y1=h-m, per=2*((x1-x0)+(y1-y0));
  var double=(mood==='drop'||mood==='chorus'), th=Math.max(1,minWH*0.0014);
  o.save();
  o.strokeStyle=hexA(C.cyan,0.22); o.lineWidth=th;
  o.strokeRect(x0,y0,x1-x0,y1-y0);
  if(double){ o.strokeStyle=hexA(C.mag,0.20); o.strokeRect(x0+th*3,y0+th*3,(x1-x0)-th*6,(y1-y0)-th*6); }
  var bp=barPos(t), d=bp*per, x,y,seg=Math.max(20,per*0.06);
  function pt(dd){
    if(dd<0)dd+=per; if(dd>=per)dd-=per;
    var W=x1-x0,H=y1-y0;
    if(dd<W){ x=x0+dd; y=y0; }
    else if(dd<W+H){ x=x1; y=y0+(dd-W); }
    else if(dd<W+H+W){ x=x1-(dd-W-H); y=y1; }
    else { x=x0; y=y1-(dd-W-H-W); }
    return [x,y];
  }
  var a=pt(d), b=pt(d+seg*0.5), c=pt(d+seg);
  o.lineCap='round';
  o.strokeStyle=hexA(C.cyan,0.95); o.lineWidth=th*2.4; o.beginPath(); o.moveTo(a[0],a[1]); o.lineTo(b[0],b[1]); o.stroke();
  o.strokeStyle=hexA(C.mag,0.7); o.lineWidth=th*1.4; o.beginPath(); o.moveTo(b[0],b[1]); o.lineTo(c[0],c[1]); o.stroke();
  o.lineCap='butt';
  if(double){
    var cs=[[x0,y0],[x1,y0],[x0,y1],[x1,y1]];
    cs.forEach(function(pt2){ o.fillStyle=hexA(C.cyan,0.85); o.fillRect(pt2[0]-th*1.6,pt2[1]-th*1.6,th*3.2,th*3.2); });
  }
  o.restore();
};

/* ---- 8. drawTranscript (BEHIND canvas) ---- */
drawTranscript = function(o,w,h,minWH,vertical,t,L,kind,F){
  if(!o||!F||!L) return;
  var label=(kind==='vendor')?'SIGNAL \u203A ':'SUBJECT \u203A ';
  var lc=(kind==='vendor')?C.cyan:C.mag;
  var maxW=w*0.84, fs=minWH*0.022, lh=fs*1.5, padX=w*0.055, baseY=h*0.80;
  var words=L.words||[], total=words.length, full='';
  for(var i=0;i<total;i++){ full+=words[i].text; if(i<total-1) full+=' '; }
  var n=0; for(var i2=0;i2<total;i2++){ if(t>=words[i2].e) n+=words[i2].text.length+1; else if(t>=words[i2].s) n+=Math.floor((t-words[i2].s)/Math.max(0.001,words[i2].e-words[i2].s)*words[i2].text.length); }
  var shown=full.slice(0,n);
  var lines=wrapText(o,shown,maxW,F.inter(300,fs,true));
  var prev=null;
  if(typeof LYRICS!=='undefined'){ for(var j=LYRICS.length-1;j>=0;j--){ var P=LYRICS[j]; if(P!==L && P.end<t && (t-P.end)<4){ prev=P; break; } } }
  var prevLines=[];
  if(prev&&prev.words){ var pf=''; for(var p2=0;p2<prev.words.length;p2++){ pf+=prev.words[p2].text; if(p2<prev.words.length-1) pf+=' '; } prevLines=wrapText(o,pf,maxW,F.inter(300,fs,true)); }
  var topY=baseY-(lines.length+prevLines.length)*lh;
  o.save(); o.textAlign=vertical?'center':'left'; o.textBaseline='alphabetic';
  var cx=vertical?w*0.5:padX;
  if(prevLines.length){
    o.font=F.inter(300,fs,true); o.fillStyle=hexA(C.ivory,0.35);
    for(var pl=0;pl<prevLines.length;pl++) o.fillText(prevLines[pl],cx,topY+pl*lh);
    topY+=prevLines.length*lh;
  }
  o.font=F.mono(700,fs*0.85); o.fillStyle=hexA(lc,0.9);
  o.fillText(label,cx,topY);
  o.font=F.inter(300,fs,true); o.fillStyle=hexA(C.ivory,0.92);
  for(var l=0;l<lines.length;l++) o.fillText(lines[l],cx,topY+(l+1)*lh);
  if(Math.floor(t*4)%2===0){
    var last=lines[lines.length-1]||'', tw=o.measureText(last).width;
    o.fillStyle=hexA(C.ivory,0.85); o.fillRect(cx+tw+fs*0.2, topY+lines.length*lh-fs*0.9, fs*0.55, fs*1.0);
  }
  o.restore();
};
function wrapText(o,text,maxW,font){
  o.font=font; var words=text.split(' '), lines=[], cur='';
  for(var i=0;i<words.length;i++){ var test=cur?cur+' '+words[i]:words[i]; if(o.measureText(test).width>maxW && cur){ lines.push(cur); cur=words[i]; } else cur=test; }
  if(cur) lines.push(cur); return lines;
}

/* ---- 9. drawWhisper (FULL-SCREEN WORD SLAM) ---- */
drawWhisper = function(o,w,h,minWH,vertical,t,L,F){
  if(!o||!F||!L) return;
  var words=L.words||[]; if(!words.length) return;
  var wi=0; for(var i=0;i<words.length;i++){ if(t>=words[i].s) wi=i; else break; }
  var cur=words[wi], next=words[wi+1];
  var holdEnd=next?next.s:(L.end+0.4);
  var p=clamp((t-cur.s)/0.12,0,1), e=easeOutBack(p);
  var scale=1.4+(1-1.4)*e;
  var wordsToShow=vertical?[cur.text]:(words.slice(0,wi+1).map(function(x){return x.text;}));
  var maxW=w*0.86, fs=minWH*0.12, fit=fitFont(o,wordsToShow,fs,maxW,function(s){return F.unb(900,s);});
  var cx=w/2, cy=h/2, off=(1-p)*minWH*0.03, g=floor24(t);
  if(o===bctx){ o.fillStyle='rgba(5,6,15,0.5)'; o.fillRect(0,0,w,h); }
  o.save(); o.textAlign='center'; o.textBaseline='middle';
  o.font=F.unb(900,fs*fit);
  var lw=o.measureText(cur.text).width;
  for(var ec=2;ec>=1;ec--){
    var ep=clamp((p-0.05)*1.4,0,1), eo=1+ep*0.18*ec, ea=(1-ep)*0.5;
    o.font=F.unb(900,fs*fit*eo); o.lineWidth=Math.max(1,minWH*0.004); o.strokeStyle=hexA(C.ivory,ea*0.5);
    o.save(); o.translate(cx,cy); o.scale(eo,eo); o.strokeText(cur.text,0,0); o.restore();
  }
  o.font=F.unb(900,fs*fit);
  o.fillStyle=hexA(C.mag,0.85); o.fillText(cur.text,cx-off,cy);
  o.fillStyle=hexA(C.cyan,0.85); o.fillText(cur.text,cx+off,cy);
  o.fillStyle=hexA(C.ivory,1); o.fillText(cur.text,cx,cy);
  if(p<0.2){
    for(var s=0;s<6;s++){
      var sy=cy-lw*0.5+rand(0.1+s*0.41,0.2+s*0.41)*lw, sh=lw*rand(0.02+s*0.03,0.04+s*0.03);
      var dx=(rand(0.3+s*0.27,0.4+s*0.27)-0.5)*minWH*0.06;
      o.save(); o.globalCompositeOperation='lighter'; o.fillStyle=hexA(C.cyan,0.5);
      o.fillRect(cx-lw*0.5+dx,sy,lw,sh); o.restore();
    }
  }
  o.restore();
};
function fitFont(o,words,maxFs,maxW,fontFn){
  var f=maxFs; for(var i=0;i<8;i++){
    o.font=fontFn(f); var w=0; for(var j=0;j<words.length;j++){ w+=o.measureText(words[j]).width; if(j<words.length-1) w+=f*0.25; }
    if(w<=maxW) break; f*=0.9;
  }
  return clamp(f/maxFs,0.2,1);
}

/* ---- 10. drawChant (holographic tags) ---- */
drawChant = function(o,w,h,minWH,vertical,t,F){
  if(!o||!F) return;
  if(typeof LYRICS==='undefined') return;
  for(var li=0;li<LYRICS.length;li++){
    var L=LYRICS[li]; if(L.kind!=='chant') continue;
    if(t<L.start || t>L.end+0.6) continue;
    var words=L.words||[];
    for(var i=0;i<words.length;i++){
      var w0=words[i]; if(w0.s>t) continue;
      var pop=clamp((t-w0.s)/0.1,0,1), pe=easeOutBack(pop);
      var flick=(Math.floor(t*60)%4===0)?0.5:1;
    var glitch=0; if(t>L.end+0.3) glitch=clamp((t-(L.end+0.3))/0.3,0,1);
      var seed=li*7+i*13;
      var fx=0.14+0.72*rand(0.1+seed*0.37,0.2+seed*0.37);
      var fy=0.12+0.7*rand(0.3+seed*0.51,0.4+seed*0.51);
      if(fx>0.35&&fx<0.65) fx=(fx<0.5)?0.16+0.18*rand(0.5+seed,0.6+seed):0.66+0.18*rand(0.7+seed,0.8+seed);
      var x=fx*w, y=fy*h, rot=(rand(0.9+seed*0.29,1+seed*0.29)-0.5)*(6*Math.PI/180);
      var fs=minWH*0.028, txt=String(w0.text).toUpperCase();
      o.save(); o.translate(x,y); o.rotate(rot); o.scale(pe,pe); o.globalAlpha=flick*(1-glitch*0.85);
      if(glitch>0){ var gx=(rand(0.2+glitch*10,0.3+glitch*10)-0.5)*minWH*0.05; o.translate(gx,0); }
      o.font=F.unb(700,fs);
      var tw=o.measureText(txt).width, bw=tw+fs*1.6, bh=fs*1.7;
      o.strokeStyle=hexA(C.cyan,0.9); o.lineWidth=Math.max(1,minWH*0.002);
      o.beginPath();
      o.moveTo(-bw/2,-bh/2+fs*0.3); o.lineTo(-bw/2,-bh/2); o.lineTo(-bw/2+fs*0.3,-bh/2);
      o.moveTo(bw/2-fs*0.3,-bh/2); o.lineTo(bw/2,-bh/2); o.lineTo(bw/2,-bh/2+fs*0.3);
      o.moveTo(bw/2,bh/2-fs*0.3); o.lineTo(bw/2,bh/2); o.lineTo(bw/2-fs*0.3,bh/2);
      o.moveTo(-bw/2+fs*0.3,bh/2); o.lineTo(-bw/2,bh/2); o.lineTo(-bw/2,bh/2-fs*0.3);
      o.stroke();
      o.strokeStyle=hexA(C.mag,0.5); o.strokeRect(-bw/2+fs*0.25,-bh/2+fs*0.25,bw-fs*0.5,bh-fs*0.5);
      o.fillStyle=hexA(C.ivory,0.95); o.textAlign='center'; o.textBaseline='middle';
      o.fillText(txt,0,0);
      o.font=F.mono(400,fs*0.5); o.fillStyle=hexA(C.cyan,0.8); o.textAlign='left';
      o.fillText(String(i+1).padStart(2,'0'),-bw/2+fs*0.15,bh/2+fs*0.5);
      o.restore();
    }
  }
};

/* ---- 11. drawEvents (FRONT canvas) ---- */
drawEvents = function(o,w,h,minWH,vertical,t,F){
  if(!o||!F) return;
  if(typeof EVENTS==='undefined') return;
  for(var i=0;i<EVENTS.length;i++){
    var ev=EVENTS[i]; if(!ev) continue;
    var dur=ev.dur||1.0, p=clamp((t-ev.t)/dur,0,1);
    if(p<=0||p>=1) continue;
    var a=p<0.2?easeOutExpo(p/0.2):p>0.8?easeInOutSine(1-(p-0.8)/0.2):1;
    var mood=sectionIndexAt(t); mood=SECTIONS[mood]?SECTIONS[mood].mood:'drop';
    o.save(); o.globalAlpha=a;
    switch(ev.type){
      case 'boot':     drawBoot(o,w,h,minWH,vertical,t,ev,F); break;
      case 'coords':   drawCoords(o,w,h,minWH,vertical,t,ev,F); break;
      case 'scan':     drawScan(o,w,h,minWH,vertical,t,ev,F,mood); break;
      case 'signal':   drawSignal(o,w,h,minWH,vertical,t,ev,F); break;
      case 'upload':   drawUpload(o,w,h,minWH,vertical,t,ev,F); break;
      case 'spectrum': drawSpectrum(o,w,h,minWH,vertical,t,ev,F); break;
      case 'reroute':  drawReroute(o,w,h,minWH,vertical,t,ev,F); break;
      case 'end':      drawEnd(o,w,h,minWH,vertical,t,ev,F); break;
    }
    o.restore();
  }
};

function drawBoot(o,w,h,minWH,vertical,t,ev,F){
  var cx=w/2, cy=h/2, fs=minWH*0.02;
  o.textAlign='center'; o.textBaseline='middle';
  o.font=F.unb(500,fs*1.3); o.fillStyle=hexA(C.cyan,1);
  o.fillText('TRANSMISSION \u00B7 BOOT SEQUENCE',cx,cy-minWH*0.12);
  var lines=['ESTABLISHING LINK\u2026','CARRIER LOCKED 129.2','SUBJECT: UNKNOWN','DESTINATION: \u2014'];
  var start=ev.t, per=0.5, charSp=0.03;
  o.font=F.mono(400,fs);
  for(var i=0;i<lines.length;i++){
    var ly=cy-minWH*0.04+i*fs*1.9, lt=t-(start+0.3+i*per);
    if(lt<=0) continue;
    var n=Math.floor(lt/charSp*20), txt=lines[i].slice(0,n);
    o.textAlign='left'; o.fillStyle=hexA(C.ivory,1);
    o.fillText(txt,cx-minWH*0.16,ly);
    if(n>=lines[i].length){ o.fillStyle=hexA(C.cyan,1); o.fillText('\u2713',cx+minWH*0.16,ly); }
  }
  var prog=clamp((t-start)/Math.max(0.001,(ev.dur||1)),0,1);
  o.strokeStyle=hexA(C.cyan,0.6); o.lineWidth=Math.max(1,minWH*0.002);
  o.beginPath(); o.moveTo(cx-minWH*0.2,cy+minWH*0.12); o.lineTo(cx+minWH*0.2,cy+minWH*0.12); o.stroke();
  o.strokeStyle=hexA(C.mag,1); o.lineWidth=Math.max(1,minWH*0.003);
  o.beginPath(); o.moveTo(cx-minWH*0.2,cy+minWH*0.12); o.lineTo(cx-minWH*0.2+minWH*0.4*prog,cy+minWH*0.12); o.stroke();
}

function drawCoords(o,w,h,minWH,vertical,t,ev,F){
  var x=w*0.95, y=h*0.16, fs=minWH*0.018;
  o.textAlign='right'; o.textBaseline='top';
  var settle=clamp((t-ev.t)/0.8,0,1);
  function sc(base,dec){
    var out=''; for(var i=0;i<base.length;i++){
      if(i<base.length*settle) out+=base[i];
      else if(base[i]===' ') out+=' ';
      else out=String.fromCharCode(48+Math.floor(rand(0.1+i*0.37+t*0.5,0.2+i*0.37+t*0.5)*10));
    } return out;
  }
  o.font=F.mono(700,fs); o.fillStyle=hexA(C.cyan,1); o.fillText('LOST COAST',x,y);
  o.font=F.mono(400,fs); o.fillStyle=hexA(C.ivory,0.9);
  o.fillText(sc('34.0195 N 118.4912 W',4),x,y+fs*1.4);
  o.fillText(sc('ALT 12M',3),x,y+fs*2.8);
  o.fillText(sc('2087.10.21',4),x,y+fs*4.2);
}

function drawScan(o,w,h,minWH,vertical,t,ev,F,mood){
  var box=(typeof window!=='undefined'&&window.subjectScreenBox)?window.subjectScreenBox(t):null;
  if(!box) return;
  var ac=(mood==='chorus')?C.mag:C.cyan;
  var fx=box.x0, fy=box.y0, fw=box.x1-box.x0, fh=(box.y1-box.y0)*0.45;
  var cx=fx+fw/2, cy=fy+fh/2, r=Math.min(fw,fh)*0.6;
  var snap=easeOutBack(clamp((t-ev.t)/0.3,0,1));
  o.save(); o.translate(cx,cy); o.scale(snap,snap); o.translate(-cx,-cy);
  var b=Math.min(fw,fh)*0.14;
  o.strokeStyle=hexA(ac,1); o.lineWidth=Math.max(1,minWH*0.0022);
  o.beginPath();
  o.moveTo(fx,fy+b); o.lineTo(fx,fy); o.lineTo(fx+b,fy);
  o.moveTo(fx+fw-b,fy); o.lineTo(fx+fw,fy); o.lineTo(fx+fw,fy+b);
  o.moveTo(fx+fw,fy+fh-b); o.lineTo(fx+fw,fy+fh); o.lineTo(fx+fw-b,fy+fh);
  o.moveTo(fx+b,fy+fh); o.lineTo(fx,fy+fh); o.lineTo(fx,fy+fh-b);
  o.stroke();
  o.strokeStyle=hexA(ac,0.7); o.beginPath();
  o.moveTo(cx-r*0.3,cy); o.lineTo(cx+r*0.3,cy); o.moveTo(cx,cy-r*0.3); o.lineTo(cx,cy+r*0.3); o.stroke();
  o.setLineDash([minWH*0.008,minWH*0.008]); o.lineDashOffset=-t*minWH*0.05;
  o.strokeStyle=hexA(ac,0.8); o.beginPath(); o.arc(cx,cy,r,0,Math.PI*2); o.stroke(); o.setLineDash([]);
  var match=clamp((t-ev.t)/1.2,0,1)*99.4;
  o.font=F.mono(700,minWH*0.016); o.textAlign='left'; o.textBaseline='middle';
  o.fillStyle=hexA(ac,1); o.fillText('SUBJECT \u25CE 0x7F3A',fx,fy-minWH*0.03);
  o.font=F.mono(400,minWH*0.014); o.fillStyle=hexA(C.ivory,0.9);
  o.fillText('MATCH '+match.toFixed(1)+'%',fx,fy+fh+minWH*0.02);
  for(var c=0;c<3;c++){
    var dx=fx+fw+minWH*0.02+c*minWH*0.012, col='';
    for(var rr=0;rr<10;rr++) col+=String.fromCharCode(48+Math.floor(rand(0.2+c*0.3+rr*0.7+t*0.4,0.3+c*0.3+rr*0.7+t*0.4)*10));
    o.fillStyle=hexA(ac,0.6); o.fillText(col,dx,fy+rr*minWH*0.014);
  }
  o.restore();
}

function drawSignal(o,w,h,minWH,vertical,t,ev,F){
  var lost=(ev.text&&ev.text.indexOf('LOST')>=0);
  var col=lost?C.red:C.cyan, cy=h/2, fs=minWH*0.06;
  var g=floor24(t);
  o.save();
  o.fillStyle=hexA(col,0.12); o.fillRect(0,cy-minWH*0.06,w,minWH*0.12);
  o.font=F.unb(700,fs); o.textAlign='center'; o.textBaseline='middle';
  var off=minWH*0.012;
  o.fillStyle=hexA(C.mag,0.7); o.fillText(ev.text,w/2-off,cy);
  o.fillStyle=hexA(C.cyan,0.7); o.fillText(ev.text,w/2+off,cy);
  o.fillStyle=hexA(col,1); o.fillText(ev.text,w/2,cy);
  for(var s=0;s<5;s++){
    var sy=cy+rand(0.1+s*0.41,0.2+s*0.41)*minWH*0.12-minWH*0.06, sh=minWH*0.008;
    var dx=(rand(0.3+s*0.27,0.4+s*0.27)-0.5)*minWH*0.1;
    o.fillStyle=hexA(col,0.5); o.fillRect(w*0.2+dx,sy,w*0.6,sh);
  }
  o.restore();
}

function drawUpload(o,w,h,minWH,vertical,t,ev,F){
  var cx=w/2, cy=h/2, bw=minWH*0.5, bh=minWH*0.02;
  o.textAlign='center'; o.textBaseline='middle';
  o.font=F.unb(500,minWH*0.022); o.fillStyle=hexA(C.ivory,1);
  o.fillText('UPLOADING CONSCIOUSNESS',cx,cy-minWH*0.05);
  var p=clamp((t-ev.t)/Math.max(0.001,ev.dur),0,1);
  var q=Math.floor(p*12)/12, eased=easeInOutCubic(q);
  var pct=Math.round(eased*100);
  var cells=40, cw=bw/cells, filled=Math.floor(eased*cells);
  for(var i=0;i<cells;i++){
    o.fillStyle=i<filled?hexA(C.cyan,0.9):hexA(C.cyan,0.15);
    o.fillRect(cx-bw/2+i*cw+1,cy,cw-2,bh);
  }
  o.strokeStyle=hexA(C.mag,0.6); o.lineWidth=1; o.strokeRect(cx-bw/2,cy,bw,bh);
  o.font=F.mono(700,minWH*0.03); o.fillStyle=hexA(C.cyan,1);
  o.fillText(pct+'%',cx,cy+bh*1.6);
  o.font=F.mono(400,minWH*0.014); o.fillStyle=hexA(C.ivory,0.7);
  o.fillText('THRU '+(2.4+eased*12.6).toFixed(1)+' GB/s \u00B7 NODE TOKYO-7',cx,cy+bh*3);
}

function drawSpectrum(o,w,h,minWH,vertical,t,ev,F){
  var cx=w/2, cy=h/2, R=minWH*0.28, bars=64;
  var low=(typeof envVal==='function'&&ENV)?envVal(ENV.low,t):0.3,
      mid=(typeof envVal==='function'&&ENV)?envVal(ENV.rms,t):0.3,
      hi=(typeof envVal==='function'&&ENV)?envVal(ENV.high,t):0.3;
  o.save(); o.globalAlpha=0.6;
  for(var i=0;i<bars;i++){
    var ang=(i/bars)*Math.PI*2-Math.PI/2, shape=0.3+0.7*rand(0.2+i*0.31,0.3+i*0.31);
    var env=i<22?low:(i<44?mid:hi), v=clamp(env*shape,0,1), len=R*0.1+R*0.5*v;
    var x1=cx+Math.cos(ang)*R, y1=cy+Math.sin(ang)*R, x2=cx+Math.cos(ang)*(R+len), y2=cy+Math.sin(ang)*(R+len);
    o.strokeStyle=i%2?hexA(C.cyan,0.7):hexA(C.mag,0.7); o.lineWidth=Math.max(1,minWH*0.003);
    o.beginPath(); o.moveTo(x1,y1); o.lineTo(x2,y2); o.stroke();
  }
  o.strokeStyle=hexA(C.cyan,0.4); o.lineWidth=1; o.beginPath(); o.arc(cx,cy,R,0,Math.PI*2); o.stroke();
  o.restore();
}

function drawReroute(o,w,h,minWH,vertical,t,ev,F){
  var cx=w/2, y=h*0.08, fs=minWH*0.02, txt=ev.text||'REROUTING';
  o.font=F.mono(700,fs); o.textAlign='center'; o.textBaseline='middle';
  var tw=o.measureText(txt).width, cw=tw+fs*3, chh=fs*2.2;
  o.fillStyle=hexA(C.amber,0.15); o.fillRect(cx-cw/2,y-chh/2,cw,chh);
  o.strokeStyle=hexA(C.amber,0.9); o.lineWidth=Math.max(1,minWH*0.002); o.strokeRect(cx-cw/2,y-chh/2,cw,chh);
  o.fillStyle=hexA(C.amber,1); o.fillText('\u26A0 '+txt,cx+fs*0.3,y);
  if(Math.floor(t*4)%2===0){ o.beginPath(); o.arc(cx-cw/2+fs*0.6,y,fs*0.3,0,Math.PI*2); o.fill(); }
}

function drawEnd(o,w,h,minWH,vertical,t,ev,F){
  var cx=w/2, cy=h/2;
  var fadeOut=clamp((DUR-t)/0.8,0,1);
  o.save(); o.globalAlpha*=fadeOut;
  o.fillStyle='rgba(5,6,15,0.85)'; o.fillRect(0,0,w,h);
  var fs=minWH*0.14, fit=fitFont(o,["GOING HARD"],fs,w*0.9,function(s){return F.unb(900,s);});
  o.textAlign='center'; o.textBaseline='middle';
  o.font=F.unb(900,fs*fit);
  var settle=clamp((t-ev.t)/0.6,0,1), off=(1-settle)*minWH*0.02;
  o.fillStyle=hexA(C.mag,0.8); o.fillText('GOING HARD',cx-off,cy-minWH*0.06);
  o.fillStyle=hexA(C.cyan,0.8); o.fillText('GOING HARD',cx+off,cy-minWH*0.06);
  o.fillStyle=hexA(C.ivory,1); o.fillText('GOING HARD',cx,cy-minWH*0.06);
  o.font=F.bodoni(400,minWH*0.03,true); o.fillStyle=hexA(C.ivory,0.9);
  o.fillText('A TRANSMISSION IN EIGHT PARTS',cx,cy+minWH*0.06);
  o.strokeStyle=hexA(C.cyan,0.8); o.lineWidth=Math.max(1,minWH*0.002);
  o.beginPath(); o.moveTo(cx-minWH*0.15,cy+minWH*0.1); o.lineTo(cx+minWH*0.15,cy+minWH*0.1); o.stroke();
  o.restore();
}

/* ---- small helper ---- */
function floor24(t){ return Math.floor(t*24); }

})();
