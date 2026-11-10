const {test}=require('node:test');const assert=require('node:assert/strict');const {JSDOM}=require('jsdom');const fs=require('node:fs');const path=require('node:path');
test('products stay put during partial taps and retries, then shuffle once after completing the order',async t=>{
 const d=new JSDOM(fs.readFileSync(path.join(__dirname,'../order-game/index.html'),'utf8'),{url:'https://game.test/order-game/',runScripts:'outside-only'});t.after(()=>d.window.close());const w=d.window;w.AbortSignal=AbortSignal;w.scrollTo=()=>{};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 let run={id:'test',day:'2026-11-10',remaining:90000,deadline:Date.now()+90000,score:0,combo:0,orders:0,best:0,errors:0,seq:0,complete:false,order:[2,0,1,0,0,0,0,0],picks:Array(8).fill(0)},requests=[],lose=false;
 w.fetch=async(url,options={})=>{
  if(url.includes('api/session'))return Response.json({user:{name:'Test'},csrf:'test'});
  if(url.includes('/start'))return Response.json(run);
  if(url.includes('/tap')){
   const data=JSON.parse(options.body);requests.push(data);
   if(data.seq>run.seq){const accepted=run.picks[data.product]<run.order[data.product];run.seq=data.seq;run.accepted=accepted;if(accepted){run.picks[data.product]++;if(run.order.every((n,i)=>n===run.picks[i])){run.orders++;run.picks=Array(8).fill(0);}}else {run.errors++;run.deadline-=5000;}}
   if(lose){lose=false;throw Error('lost response');}return Response.json(run);
  }
  return Response.json({entries:[],total:0,page:1,day:'2026-11-10'});
 };
 let socket;w.WebSocket=class{constructor(){socket=this;this.readyState=1;}send(){}};
 const wait=async check=>{for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}assert.fail('timed out');};
 w.eval(fs.readFileSync(path.join(__dirname,'../order-game/game.js'),'utf8'));await wait(()=>socket?.onmessage);
 const now=Date.now();socket.onmessage({data:JSON.stringify({serverNow:now,phase:'round',count:1,readyCount:1,players:[],roundId:'test-round',startAt:now,endAt:now+90000,you:{ready:true,inRound:true},lastRound:null})});await wait(()=>w.document.body.classList.contains('playing'));
 assert.equal(w.document.getElementById('dropBasket'),null);assert.equal(w.document.getElementById('send'),null);
 const positions=()=>[...w.document.querySelectorAll('.product')].map(b=>b.dataset.product);
 const before=positions();w.document.querySelector('[data-product="0"]').click();await wait(()=>requests.length===1&&!w.document.querySelector('.product').disabled);
 assert.deepEqual(positions(),before,'partial correct taps preserve every position');
 assert.match(w.document.querySelector('.order-quantity').textContent,/1\/2/);
 const after=positions();w.document.querySelector('[data-product="7"]').click();await wait(()=>requests.length===2&&!w.document.querySelector('.product').disabled);
 assert.deepEqual(positions(),after,'wrong taps do not shuffle');assert.match(w.document.getElementById('feedback').textContent,/หมดอายุ/);
 lose=true;w.document.querySelector('[data-product="0"]').click();await wait(()=>!w.document.getElementById('retryTap').hidden);
 assert.ok([...w.document.querySelectorAll('.product')].every(b=>b.disabled));
 w.document.getElementById('retryTap').click();await wait(()=>requests.length===4&&!w.document.querySelector('.product').disabled);
 assert.deepEqual(requests[2],requests[3]);assert.equal(run.picks[0],2);
 assert.deepEqual(positions(),before,'retrying a partial tap does not move products');
 w.document.querySelector('[data-product="2"]').click();await wait(()=>requests.length===5&&!w.document.querySelector('.product').disabled);
 assert.equal(run.orders,1);assert.ok(positions().every((id,i)=>id!==before[i]),'every product moves after the entire order is complete');
 assert.equal(w.document.querySelector('[data-product="0"] image').getAttribute('href'),'art/products-cute.png');
});

test('rapid taps update immediately, batch behind a slow response, and retry without double scoring',async t=>{
 const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../order-game/index.html'),'utf8'),{url:'https://game.test/order-game/',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.AbortSignal=AbortSignal;w.scrollTo=()=>{};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 let run={id:'fast',day:'2026-11-10',remaining:90000,deadline:Date.now()+90000,score:0,combo:0,orders:0,best:0,errors:0,seq:0,complete:false,order:[3,0,1,0,0,0,0,0],picks:Array(8).fill(0)};
 const requests=[],replies=[];
 w.fetch=async(url,options={})=>{
  if(url.includes('api/session'))return Response.json({user:{name:'Test'},csrf:'test'});
  if(url.includes('/start'))return Response.json(run);
  if(url.includes('/tap')){
   const data=JSON.parse(options.body);requests.push(data);
   if(data.seq>run.seq){run.seq=data.seq;for(const i of data.products??[data.product]){run.picks[i]++;if(run.order.every((n,j)=>n===run.picks[j])){run.orders++;run.score+=100;run.picks=Array(8).fill(0);break;}}run.accepted=true;}
   const snapshot=structuredClone(run);return new Promise((resolve,reject)=>replies.push({ok:()=>resolve(Response.json(snapshot)),fail:()=>reject(Error('lost response'))}));
  }
  return Response.json({entries:[],total:0,page:1,day:run.day});
 };
 let socket;w.WebSocket=class{constructor(){socket=this;this.readyState=1;}send(){}};
 const wait=async check=>{for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}assert.fail('timed out');};
 w.eval(fs.readFileSync(path.join(__dirname,'../order-game/game.js'),'utf8'));await wait(()=>socket?.onmessage);
 const now=Date.now();socket.onmessage({data:JSON.stringify({serverNow:now,phase:'round',count:2,readyCount:2,players:[],roundId:'fast-round',startAt:now,endAt:now+90000,you:{ready:true,inRound:true},lastRound:null})});await wait(()=>w.document.body.classList.contains('playing'));
 const button=i=>w.document.querySelector(`[data-product="${i}"]`),positions=()=>[...w.document.querySelectorAll('.product')].map(b=>b.dataset.product),before=positions();
 button(0).click();assert.match(w.document.querySelector('.order-quantity').textContent,/1\/3/);assert.equal(button(0).disabled,false,'network request does not disable further partial taps');
 button(0).click();button(0).click();button(2).click();assert.equal(requests.length,1,'only one request is in flight');assert.equal(button(0).disabled,true,'completed local order waits for confirmation');assert.deepEqual(positions(),before);
 replies[0].ok();await wait(()=>requests.length===2);assert.deepEqual(requests[1].products,[0,0,2]);assert.deepEqual(positions(),before,'no shuffle until server confirms the last batch');
 replies[1].fail();await wait(()=>!w.document.getElementById('retryTap').hidden);w.document.getElementById('retryTap').click();await wait(()=>requests.length===3);assert.deepEqual(requests[1],requests[2]);
 replies[2].ok();await wait(()=>w.document.getElementById('score').textContent==='100');assert.equal(run.orders,1);assert.ok(positions().every((id,i)=>id!==before[i]));
});

test('admin removal stops automatic reconnect and explains how to rejoin',async t=>{
 const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../order-game/index.html'),'utf8'),{url:'https://game.test/order-game/',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.AbortSignal=AbortSignal;w.scrollTo=()=>{};
 const scheduled=[];w.setTimeout=(fn,delay)=>{scheduled.push({fn,delay});return 1;};
 w.fetch=async url=>Response.json(url.includes('api/session')?{user:{name:'Player'},csrf:'test'}:{entries:[],total:0,page:1,day:'2026-11-10'});
 let socket;w.WebSocket=class{constructor(){socket=this;this.readyState=1;}send(){}};
 w.eval(fs.readFileSync(path.join(__dirname,'../order-game/game.js'),'utf8'));for(let i=0;i<30&&!socket?.onmessage;i++)await new Promise(r=>setTimeout(r,5));
 socket.onmessage({data:JSON.stringify({serverNow:Date.now(),phase:'waiting',count:1,readyCount:0,players:[],you:{ready:false,inRound:false},lastRound:null})});
 socket.onmessage({data:JSON.stringify({removed:true,serverNow:Date.now(),phase:'waiting',count:0,readyCount:0,players:[],you:{ready:false,inRound:false},lastRound:null})});
 assert.equal(w.document.getElementById('start').disabled,true,'removal notice blocks play before close handshake finishes');
 socket.readyState=3;socket.onclose({code:1006,reason:''});
 assert.match(w.document.getElementById('lobbyStatus').textContent,/Admin.*นำคุณออก/);assert.equal(w.document.getElementById('start').disabled,true);assert.equal(scheduled.length,0,'no reconnect timer after admin removal');
});
