const {test}=require('node:test');const assert=require('node:assert/strict');const {JSDOM}=require('jsdom');const fs=require('node:fs');
test('existing player edits names before each new round and ready waits for saving',async t=>{
 const dom=new JSDOM(fs.readFileSync('order-game/index.html','utf8'),{url:'https://game.test/order-game/',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.AbortSignal=AbortSignal;w.scrollTo=()=>{};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 let clock=Date.now(),name='Original',ready=false,phase='waiting',socket,release;const saved=[],intervals=[];w.Date.now=()=>clock;w.setInterval=fn=>{intervals.push(fn);return intervals.length;};w.clearInterval=()=>{};
 const state=()=>socket.onmessage({data:JSON.stringify({serverNow:clock,phase,count:1,readyCount:ready?1:0,players:[{name,ready,me:true}],roundId:phase==='round'?'round':null,startAt:clock,endAt:clock+90000,you:{ready,inRound:phase==='round'},lastRound:null})});
 const run=()=>({id:'same-player-run',day:'2026-11-10',remaining:90000,deadline:clock+90000,score:0,combo:0,orders:0,best:0,errors:0,seq:0,complete:false,order:[1,0,1,0,0,0,0,0],picks:Array(8).fill(0)});
 w.fetch=async(url,options={})=>{
  if(url.includes('api/session'))return Response.json({user:{name},csrf:'test'});
  if(url.includes('/name')){assert.equal(options.headers['X-CSRF-Token'],'test');saved.push(JSON.parse(options.body).name);return new Promise(resolve=>{release=()=>{name=saved.at(-1);state();resolve(Response.json({name}));};});}
  if(url.includes('/start'))return Response.json(run());
  if(url.includes('/finish'))return Response.json({...run(),complete:true,remaining:0});
  if(url.includes('/guest'))assert.fail('renaming must preserve the existing player');
  return Response.json({entries:[],total:0,page:1,day:'2026-11-10'});
 };
 w.WebSocket=class{constructor(){socket=this;this.readyState=1;this.sent=[];}send(data){this.sent.push(JSON.parse(data));}};
 const wait=async check=>{for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}assert.fail('name edit timed out');};
 w.eval(fs.readFileSync('order-game/game.js','utf8'));await wait(()=>socket?.onmessage);state();
 const input=w.document.getElementById('roundName'),start=w.document.getElementById('start');assert.equal(input.value,'Original');assert.equal(input.disabled,false);
 input.value='First round';input.dispatchEvent(new w.Event('input'));w.document.getElementById('nameForm').dispatchEvent(new w.Event('submit',{cancelable:true}));assert.equal(start.disabled,true);release();await wait(()=>!start.disabled);assert.match(w.document.getElementById('identity').textContent,/First round/);
 start.click();assert.deepEqual(socket.sent,[{type:'ready',ready:true}]);ready=true;state();assert.equal(input.disabled,true);
 phase='round';state();await wait(()=>w.document.body.classList.contains('playing'));
 clock+=90001;intervals.at(-1)();await wait(()=>w.document.getElementById('result').open&&!w.document.getElementById('again').disabled);
 phase='waiting';ready=false;state();w.document.getElementById('again').click();assert.equal(input.disabled,false);assert.equal(input.value,'First round');
 input.value='Second round';input.dispatchEvent(new w.Event('input'));start.click();assert.equal(socket.sent.length,1,'ready waits for the name response');release();await wait(()=>socket.sent.length===2);assert.deepEqual(saved,['First round','Second round']);assert.match(w.document.getElementById('identity').textContent,/Second round/);
});
