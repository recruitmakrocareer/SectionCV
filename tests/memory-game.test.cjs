const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {JSDOM}=require('jsdom');
const path=require('node:path');
const read=f=>readFileSync(path.join(__dirname,'..',f),'utf8');
test('memory game survives restart during mismatch and completes with saved results',async t=>{
 const d=new JSDOM(read('memory-game/index.html'),{url:'https://game.test/memory-game/',runScripts:'outside-only'});t.after(()=>d.window.close());
 const w=d.window;w.eval(read('memory-game/game.js'));const doc=w.document;
 doc.getElementById('playerName').value='Tester';
 let cards=[...doc.querySelectorAll('.card')];cards[0].click();cards.find(c=>c.dataset.name!==cards[0].dataset.name).click();
 doc.getElementById('restart').click();await new Promise(r=>setTimeout(r,750));
 assert.equal(doc.querySelectorAll('.flipped').length,0);assert.equal(doc.getElementById('moves').textContent,'0');
 cards=[...doc.querySelectorAll('.card')];for(const name of new Set(cards.map(c=>c.dataset.name))){for(const c of cards.filter(c=>c.dataset.name===name))c.click();}
 assert.equal(doc.getElementById('pairs').textContent,'8');assert.ok(doc.getElementById('winModal').classList.contains('show'));
 assert.equal(JSON.parse(w.localStorage.getItem('makro-memory-stats-v1'))[0].moves,8);
 assert.equal(doc.querySelector('a').getAttribute('href'),'../');
});
test('home offers both games and reveals spot game only after selection',t=>{
 const d=new JSDOM(read('index.html'),{url:'https://game.test/',runScripts:'outside-only'});t.after(()=>d.window.close());const w=d.window;w.scrollTo=()=>{};
 w.eval(read('lobby.js'));assert.ok(w.document.body.classList.contains('choosing-game'));
 assert.ok(w.document.querySelector('#gameLobby a[href="memory-game/"]'));
 w.document.getElementById('chooseDifference').click();assert.equal(w.document.body.classList.contains('choosing-game'),false);
});
