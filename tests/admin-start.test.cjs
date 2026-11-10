const {test}=require('node:test');const assert=require('node:assert/strict');const {JSDOM}=require('jsdom');const fs=require('node:fs');
test('admin start is offered only when ready and handles stale readiness and repeated clicks',async t=>{
 const dom=new JSDOM(fs.readFileSync('live.html','utf8'),{url:'https://game.test/live.html',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.sessionStorage.setItem('mk_admin_key','test-only');
 const intervals=[];w.setInterval=fn=>{intervals.push(fn);return intervals.length;};w.clearInterval=()=>{};
 let state={serverNow:Date.now(),canStart:false,live:false,phase:'waiting',roundId:null,count:2,readyCount:1,players:[],scores:[]};let posts=0,release;
 w.fetch=async(url,options)=>{
  assert.equal(options.headers['X-Admin-Key'],'test-only');
  if(options.method==='POST'){posts++;return new Promise(resolve=>{release=resolve;});}
  return Response.json(state);
 };
 const wait=async check=>{for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}assert.fail('admin state timeout');};
 w.eval(fs.readFileSync('live.js','utf8'));await wait(()=>w.document.getElementById('waitingTitle').textContent.includes('2 คน'));
 const button=w.document.getElementById('startGame');assert.equal(button.hidden,true);
 state.canStart=true;state.readyCount=2;await intervals[0]();assert.equal(button.hidden,false);assert.equal(button.disabled,false);
 button.click();button.click();assert.equal(posts,1);assert.equal(button.disabled,true);
 state.canStart=false;state.readyCount=1;release(Response.json({error:'มีผู้เล่นยังไม่พร้อม'},{status:409}));await wait(()=>button.hidden);assert.match(w.document.getElementById('startStatus').textContent,/ยังไม่พร้อม/);
 state.canStart=true;state.count=1;state.readyCount=1;await intervals[0]();assert.equal(button.hidden,false);assert.equal(button.disabled,false);button.click();assert.equal(posts,2);
 state={...state,canStart:false,live:true,phase:'round',roundId:'round',round:{startAt:Date.now()+5000,endAt:Date.now()+95000,count:1}};
 release(Response.json({ok:true}));await wait(()=>w.document.getElementById('phase').textContent==='กำลังนับถอยหลัง');assert.equal(button.hidden,true);
});
