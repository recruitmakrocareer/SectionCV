const {test}=require('node:test');const assert=require('node:assert/strict');const {JSDOM}=require('jsdom');const fs=require('node:fs');const path=require('node:path');
test('pointer drop adds one product, ignores outside drops, and preserves tap selection',async t=>{
 const d=new JSDOM(fs.readFileSync(path.join(__dirname,'../order-game/index.html'),'utf8'),{url:'https://game.test/order-game/',runScripts:'outside-only'});t.after(()=>d.window.close());const w=d.window;w.AbortSignal=AbortSignal;w.scrollTo=()=>{};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.fetch=async url=>Response.json(url.includes('api/session')?{user:{name:'Test'},csrf:'test'}:url.includes('/start')?{id:'test',day:'2026-09-14',remaining:90000,score:0,combo:0,orders:0,best:0,errors:0,seq:0,complete:false,order:[1,0,1,0,0,0,0,0]}:{entries:[],total:0,page:1,day:'2026-09-14'});
 w.eval(fs.readFileSync(path.join(__dirname,'../order-game/game.js'),'utf8'));await new Promise(r=>setTimeout(r,10));w.document.getElementById('start').click();await new Promise(r=>setTimeout(r,10));
 assert.ok(w.document.body.classList.contains('playing'));
 w.document.getElementById('dropBasket').getBoundingClientRect=()=>({left:0,right:300,top:300,bottom:400});const cards=w.document.querySelectorAll('.product');
 const pointer=(node,type,x,y)=>node.dispatchEvent(new w.MouseEvent(type,{bubbles:true,clientX:x,clientY:y,button:0}));
 pointer(cards[0],'pointerdown',10,10);pointer(cards[0],'pointermove',40,330);pointer(cards[0],'pointerup',40,330);cards[0].click();assert.equal(w.document.querySelectorAll('#basketItems button').length,1);assert.match(w.document.querySelector('#basketItems button').textContent,/×1/);
 pointer(cards[1],'pointerdown',10,10);pointer(cards[1],'pointermove',400,200);pointer(cards[1],'pointerup',400,200);assert.equal(w.document.querySelectorAll('#basketItems button').length,1);
 cards[2].click();assert.equal(w.document.querySelectorAll('#basketItems button').length,2);assert.equal(w.document.querySelector('.drag-ghost'),null);
 assert.equal(w.document.getElementById('customerBubble').hidden,true,'correct picks do not upset customer');
 cards[7].click();assert.equal(w.document.getElementById('customerBubble').hidden,false);assert.match(w.document.getElementById('customerBubble').textContent,/หมดอายุ|ของสด/);
 assert.equal(w.document.getElementById('score').textContent,'0','picking feedback does not apply server submission penalties');
 assert.equal(cards[0].querySelector('image').getAttribute('href'),'art/products-cute.png');
 assert.notEqual(cards[0].querySelector('svg').getAttribute('viewBox'),cards[7].querySelector('svg').getAttribute('viewBox'));

});
