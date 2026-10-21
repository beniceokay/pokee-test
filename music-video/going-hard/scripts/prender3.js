// node prender.js W H fps t0 t1 out.mp4 [stillsDir times...]
const {chromium}=require('playwright');const {spawn}=require('child_process');const fs=require('fs');
const [W,H,FPS,T0,T1]=process.argv.slice(2,7).map(Number);const out=process.argv[7];
const stills=process.argv[8];const stillTimes=process.argv.slice(9).map(Number);
(async()=>{
  const b=await chromium.launch({args:['--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
  const p=await b.newPage({viewport:{width:W,height:H},deviceScaleFactor:1});
  const errs=[];p.on('pageerror',e=>errs.push(e.stack));p.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errs.push(m.type()+': '+m.text())});
  await p.goto('http://127.0.0.1:8767/index.html?render=1');
  await p.waitForFunction(()=>window.ENGINE&&window.ENGINE.ready,null,{timeout:60000});
  await p.evaluate(()=>window.ENGINE.ready);
  const shot=async t=>{await p.evaluate(t=>window.ENGINE.renderFrame(t),t);return p.screenshot({type:'jpeg',quality:94});};
  if(stills){fs.mkdirSync(stills,{recursive:true});
    for(const t of stillTimes){await p.evaluate(t=>window.ENGINE.prepare(t-1,t+1),t);const t0=Date.now();fs.writeFileSync(`${stills}/t${t.toFixed(2)}.jpg`,await shot(t));console.log('still',t,(Date.now()-t0)+'ms');}
  }
  if(out!=='-'){
    const ff=spawn('ffmpeg',['-y','-v','error','-f','image2pipe','-framerate',String(FPS),'-c:v','mjpeg','-i','-','-c:v','libx264','-preset','medium','-crf','16','-pix_fmt','yuv420p','-r',String(FPS),out],{stdio:['pipe','inherit','inherit']});
    const n0=Math.round(T0*FPS),n1=Math.round(T1*FPS);const st=Date.now();
    let prepEnd=-1;for(let f=n0;f<n1;f++){const tt=f/FPS;if(tt>=prepEnd-1){await p.evaluate(([a,b])=>window.ENGINE.prepare(a,b),[tt,tt+6]);prepEnd=tt+6;}const img=await shot(f/FPS);if(!ff.stdin.write(img))await new Promise(r=>ff.stdin.once('drain',r));
      if((f-n0)%240===0)console.log(`frame ${f-n0}/${n1-n0} ${((Date.now()-st)/1000).toFixed(0)}s`);}
    ff.stdin.end();await new Promise(r=>ff.on('close',r));
  }
  console.log('errors:',JSON.stringify(errs.slice(0,10)));await b.close();console.log('done');
})().catch(e=>{console.error('FATAL',e);process.exit(1)});
