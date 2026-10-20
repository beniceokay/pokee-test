const {chromium}=require('playwright');
const [W,H,step]=process.argv.slice(2).map(Number);
(async()=>{const b=await chromium.launch({args:['--ignore-gpu-blocklist']});const p=await b.newPage({viewport:{width:W,height:H}});
const cons=new Map();p.on('console',m=>{if(m.type()==='error'){const k=m.text().slice(0,200);cons.set(k,(cons.get(k)||0)+1)}});
await p.goto('http://127.0.0.1:8765/index.html?render=1');await p.waitForFunction(()=>window.ENGINE&&window.ENGINE.ready);await p.evaluate(()=>window.ENGINE.ready);
const r=await p.evaluate(step=>{const errs={};for(let t=-0.5;t<=244;t+=step){try{window.ENGINE.renderFrame(t)}catch(e){const k=(e.stack||String(e)).split('\n').slice(0,3).join(' | ').replace(/'[0-9.\-]+'/g,"'N'");(errs[k]=errs[k]||[]).push(+t.toFixed(2));}}return errs;},step);
for(const [k,v] of Object.entries(r))console.log(`${v.length}x  first t=${v[0]} last t=${v[v.length-1]}\n   ${k}`);
for(const [k,v] of cons)console.log('console.error x'+v,k);
console.log('distinct errors',Object.keys(r).length);await b.close();})();
