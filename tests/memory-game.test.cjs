const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {JSDOM}=require('jsdom');
const path=require('node:path');
const read=f=>readFileSync(path.join(__dirname,'..',f),'utf8');
test('memory game survives restart during mismatch and completes with saved results',async t=>{
 const d=new JSDOM(read('memory-game/index.html'),{url:'https://game.test/memory-game/',runScripts:'outside-only'});t.after(()=>d.window.close());
 const w=d.window;w.AbortSignal=AbortSignal;w.fetch=async()=>Response.json({user:{name:'LINE Tester',lineName:'LINE name'}});w.eval(read('memory-game/game.js'));const doc=w.document;
 await new Promise(r=>setTimeout(r,0));assert.equal(doc.querySelector('input'),null);assert.match(doc.getElementById('playerIdentity').textContent,/LINE Tester/);
 let cards=[...doc.querySelectorAll('.card')];cards[0].click();cards.find(c=>c.dataset.name!==cards[0].dataset.name).click();
 doc.getElementById('restart').click();await new Promise(r=>setTimeout(r,750));
 assert.equal(doc.querySelectorAll('.flipped').length,0);assert.equal(doc.getElementById('moves').textContent,'0');
 cards=[...doc.querySelectorAll('.card')];for(const name of new Set(cards.map(c=>c.dataset.name))){for(const c of cards.filter(c=>c.dataset.name===name))c.click();}
 assert.equal(doc.getElementById('pairs').textContent,'8');assert.ok(doc.getElementById('winModal').classList.contains('show'));
 assert.equal(JSON.parse(w.localStorage.getItem('makro-memory-stats-v2'))[0].moves,8);assert.equal(JSON.parse(w.localStorage.getItem('makro-memory-stats-v2'))[0].name,'LINE Tester');
 assert.equal(doc.querySelector('a').getAttribute('href'),'../');
});
test('home offers only matching and order games',t=>{
 const d=new JSDOM(read('index.html'),{url:'https://game.test/',runScripts:'outside-only'});t.after(()=>d.window.close());
 const doc=d.window.document;
 assert.equal(doc.querySelectorAll('#gameLobby .game-option').length,2);
 assert.ok(doc.querySelector('#gameLobby a[href="memory-game/"]'));
 assert.ok(doc.querySelector('#gameLobby a[href="order-game/"]'));
 assert.equal(doc.getElementById('chooseDifference'),null);
});
test('memory game does not use a previous locally stored name without a LINE session',async t=>{
 const d=new JSDOM(read('memory-game/index.html'),{url:'https://game.test/memory-game/',runScripts:'outside-only'});t.after(()=>d.window.close());const w=d.window;w.AbortSignal=AbortSignal;
 w.localStorage.setItem('makro-memory-player','Previous player');w.fetch=async()=>Response.json({user:null});w.eval(read('memory-game/game.js'));await new Promise(r=>setTimeout(r,0));
 w.document.querySelector('.card').click();assert.equal(w.document.querySelectorAll('.flipped').length,0);assert.equal(w.document.getElementById('loginAgain').hidden,false);
});
test('memory countdown expires in the background, blocks late matches and resets safely',async t=>{
 const d=new JSDOM(read('memory-game/index.html'),{url:'https://game.test/memory-game/',runScripts:'outside-only'});t.after(()=>d.window.close());const w=d.window;w.AbortSignal=AbortSignal;w.fetch=async()=>Response.json({user:{name:'Tester'}});let now=100000;w.Date.now=()=>now;w.eval(read('memory-game/game.js'));await new Promise(r=>setTimeout(r,0));const doc=w.document;const cards=[...doc.querySelectorAll('.card')];
 const names=[...new Set(cards.map(c=>c.dataset.name))];for(const name of names.slice(0,2))cards.filter(c=>c.dataset.name===name).forEach(c=>c.click());assert.match(doc.getElementById('memoryCombo').textContent,/×2/);
 now+=76000;doc.dispatchEvent(new w.Event('visibilitychange'));assert.equal(doc.getElementById('time').textContent,'00:14');assert.ok(doc.getElementById('timeMeter').classList.contains('urgent'));
 now+=14000;cards.find(c=>c.dataset.name===names[2]).click();assert.equal(doc.getElementById('time').textContent,'00:00');assert.match(doc.querySelector('#winModal h2').textContent,/หมดเวลา/);assert.equal(w.localStorage.getItem('makro-memory-stats-v2'),null);
 doc.getElementById('playAgain').click();assert.equal(doc.getElementById('time').textContent,'01:30');assert.equal(doc.querySelectorAll('.flipped').length,0);
});
