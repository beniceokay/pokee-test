const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--ignore-gpu-blocklist']});const p=await b.newPage({viewport:{width:1280,height:720}});
const errs=new Map();const add=k=>errs.set(k,(errs.get(k)||0)+1);
p.on('console',m=>{if(m.type()==='error')add(m.text().replace(/[0-9.]+/g,'N').slice(0,160))});p.on('pageerror',e=>add('PAGE '+e.message.slice(0,160)));
await p.goto('http://127.0.0.1:8767/index.html?render=1');await p.waitForFunction(()=>window.ENGINE&&window.ENGINE.ready);await p.evaluate(()=>window.ENGINE.ready);
for(let t=0;t<=+(process.env.T1||122);t+=0.5){await p.evaluate(async t=>{await ENGINE.prepare(t-1,t+1);ENGINE.renderFrame(t);},t);}
console.log([...errs].map(([k,v])=>v+'x '+k).join('\n')||'no errors');await b.close();})();
