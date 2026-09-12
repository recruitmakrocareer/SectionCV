const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {JSDOM}=require('jsdom');
test('LIFF exchanges only the ID token and does not store credentials or redirect logged-in users', async t=>{
 const dom=new JSDOM('<!doctype html>',{url:'https://game.test/',runScripts:'outside-only'});t.after(()=>dom.window.close());
 const w=dom.window;w.AbortSignal=AbortSignal;
 w.liff={init:async options=>assert.equal(options.liffId,'2011516015-Fixture'),isLoggedIn:()=>true,getIDToken:()=>'test-token'};
 w.fetch=async(path,init)=>{assert.equal(path,'api/liff/session');assert.deepEqual(JSON.parse(init.body),{idToken:'test-token'});assert.equal(init.headers['X-CSRF-Token'],'challenge');return Response.json({user:{name:'Saved player'},csrf:'session-csrf'});};
 w.eval(readFileSync(require('node:path').join(__dirname,'../liff.js'),'utf8'));
 const result=await w.initializeMakroLiff('2011516015-Fixture',async path=>{assert.equal(path,'api/liff/config');return{csrf:'challenge'};});
 assert.equal(result.user.name,'Saved player');assert.equal(w.localStorage.length,0);assert.equal(w.sessionStorage.length,0);
 w.liff.isLoggedIn=()=>false;
 const signedOut=await w.initializeMakroLiff('2011516015-Fixture',()=>assert.fail('No token means no exchange'));
 assert.equal(signedOut.user,null);assert.equal(signedOut.liffUrl,'https://liff.line.me/2011516015-Fixture');
});

test('first LIFF registration saves contacts once and requests game start after confirmation', async t=>{
 const path=require('node:path');const root=path.join(__dirname,'..');
 const dom=new JSDOM(readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://game.test/',runScripts:'outside-only'});t.after(()=>dom.window.close());
 const w=dom.window;w.AbortSignal=AbortSignal;let starts=0;
 w.addEventListener('account:start',()=>starts++);
 w.initializeMakroLiff=async()=>({user:{lineName:'LINE player',name:'',phone:'',profileComplete:false},csrf:'verified',liffUrl:'https://liff.line.me/2011516015-Fixture'});
 w.fetch=async(url,options)=>{
  if(url==='api/session')return Response.json({lineReady:true,liffId:'2011516015-Fixture',user:null});
  if(url==='api/profile'){assert.equal(options.headers['X-CSRF-Token'],'verified');return Response.json({user:{lineName:'LINE player',name:'Player',phone:'0812345678',profileComplete:true}});}
  if(url.startsWith('api/leaderboard'))return Response.json({entries:[],page:1,totalPages:1,totalPlayers:0,totalRuns:0,averageFound:0,me:null});
  return Response.json({completedRuns:0,bestScoreMs:null,rank:null,recentRuns:[]});
 };
 w.eval(readFileSync(path.join(root,'account.js'),'utf8'));await w.MAKRO_ACCOUNT.ready;
 const $=s=>w.document.querySelector(s);
 assert.equal($('#playerName').value,'LINE player');assert.equal($('#savePlayer').textContent,'บันทึกและเริ่มเกม');
 $('#playerName').value='Player';$('#playerPhone').value='0812345678';$('#playerConsent').checked=true;
 $('#playerForm').dispatchEvent(new w.Event('submit',{cancelable:true}));await new Promise(setImmediate);
 assert.equal(starts,1);assert.equal(w.MAKRO_ACCOUNT.canPlay(),true);
 $('#playerForm').dispatchEvent(new w.Event('submit',{cancelable:true}));await new Promise(setImmediate);
 assert.equal(starts,1);
});
