const {test}=require('node:test');const assert=require('node:assert/strict');const {JSDOM}=require('jsdom');const fs=require('node:fs');
test('admin stop ends an active client even when a delayed tap returns the old deadline',async t=>{
 const dom=new JSDOM(fs.readFileSync('order-game/index.html','utf8'),{url:'https://game.test/order-game/',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.AbortSignal=AbortSignal;w.scrollTo=()=>{};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 const now=Date.now();let socket,release,finishes=0;
 const run={id:'round:round:player',day:'2026-11-10',deadline:now+90000,remaining:90000,orderElapsed:0,score:0,combo:0,orders:0,best:0,errors:0,seq:0,complete:false,order:[2,0,1,0,0,0,0,0],picks:Array(8).fill(0)};
 w.fetch=async(url,options={})=>{
  if(url.includes('api/session'))return Response.json({user:{name:'Player'},csrf:'test'});
  if(url.includes('/start'))return Response.json(run);
  if(url.includes('/tap'))return new Promise(resolve=>{release=()=>resolve(Response.json({...run,score:75,seq:1,accepted:true,picks:[1,0,0,0,0,0,0,0]}));});
  if(url.includes('/finish')){finishes++;return Response.json({...run,complete:true,deadline:Date.now(),remaining:0,score:75});}
  return Response.json({entries:[],total:0,page:1,day:run.day});
 };
 w.WebSocket=class{constructor(){socket=this;this.readyState=1;}send(){}};
 const wait=async check=>{for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}assert.fail('stop client timeout');};
 w.eval(fs.readFileSync('order-game/game.js','utf8'));await wait(()=>socket?.onmessage);
 const state=extra=>socket.onmessage({data:JSON.stringify({serverNow:Date.now(),phase:'round',count:1,readyCount:1,players:[],roundId:'round',startAt:now,endAt:now+90000,you:{ready:true,inRound:true},lastRound:null,...extra})});
 state();await wait(()=>w.document.body.classList.contains('playing'));w.document.querySelector('[data-product="0"]').click();assert.ok(release);
 state({phase:'waiting',roundId:null,startAt:null,endAt:null,readyCount:0,you:{ready:false,inRound:false},lastRound:{roundId:'round',stopped:true,failed:false,top:[]}});
 assert.equal(w.document.querySelector('[data-product="0"]').disabled,true);assert.equal(finishes,0,'wait for the in-flight request before fetching final score');
 release();await wait(()=>w.document.getElementById('result').open&&!w.document.getElementById('again').disabled);assert.equal(finishes,1);assert.equal(w.document.getElementById('resultScore').textContent,'75');assert.equal(w.document.getElementById('resultTitle').textContent,'Admin จบรอบแล้ว');assert.equal(w.document.querySelector('[data-product="0"]').disabled,true);
});
