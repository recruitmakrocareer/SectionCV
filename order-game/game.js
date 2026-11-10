(() => {
'use strict';
const $=id=>document.getElementById(id);
const products=[['🍎','แอปเปิล','500 กรัม'],['🍎','แอปเปิล','1 กก.'],['🥛','นม','1 ลิตร'],['🥛','นม','1 ลิตร · หมดอายุ'],['🥕','แครอต','500 กรัม'],['🥕','แครอต','1 กก.'],['🐟','ปลา','1 กก.'],['🐟','ปลา','1 กก. · หมดอายุ']];
let artId=0;
function productArt(i,cls){
 const ns='http://www.w3.org/2000/svg',el=document.createElementNS(ns,'svg'),image=document.createElementNS(ns,'image'),clip=document.createElementNS(ns,'clipPath'),rect=document.createElementNS(ns,'rect'),defs=document.createElementNS(ns,'defs');
 const type=art[i],x=['milk','fish'].includes(type)?1:0,y=['carrot','fish'].includes(type)?1:0,id='product-crop-'+(++artId);
 el.setAttribute('class',cls);el.setAttribute('viewBox',x+' '+y+' 1 1');el.setAttribute('aria-hidden','true');
 // Clip the atlas cell itself: a tall/wide SVG viewport exposes neighbouring
 // cells in its letterbox area even when CSS overflow is hidden.
 clip.setAttribute('id',id);clip.setAttribute('clipPathUnits','userSpaceOnUse');
 for(const [name,value] of Object.entries({x,y,width:1,height:1}))rect.setAttribute(name,String(value));
 clip.append(rect);defs.append(clip);image.setAttribute('clip-path','url(#'+id+')');
 image.setAttribute('href','art/products-cute.png');image.setAttribute('width','2');image.setAttribute('height','2');el.append(defs,image);return el;
}
const art=['apple','apple','milk','milk','carrot','carrot','fish','fish'];
let warnedSecond=-1,customerTimer,customerUntil=0,complaintCount=0,orderClock=0,personalBest=0;
let socket=null,lobby=null,clockOffset=-Infinity,reconnectDelay=1000,lobbyNotice='',joinedRound=null,currentRound=null,beginTimer;
let csrf='',run=null,picks=Array(8).fill(0),busy=false,deadline=0,timer=null,pending=null,page=1,boardDay='',sound=false,audio;
async function api(path,data){const r=await fetch('../api/orders/'+path,{method:data===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(12000)});let value;try{value=await r.json();}catch{throw Error('โหลดข้อมูลไม่สำเร็จ');}if(!r.ok)throw Error(value.error||'เชื่อมต่อไม่สำเร็จ');return value;}
function tone(ok){if(!sound)return;try{audio??=new(window.AudioContext||window.webkitAudioContext)();audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.connect(g);g.connect(audio.destination);o.frequency.value=ok?720:190;g.gain.setValueAtTime(.07,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.12);o.start();o.stop(audio.currentTime+.13);}catch{}}
$('sound').onclick=()=>{sound=!sound;$('sound').textContent='เสียง: '+(sound?'เปิด':'ปิด');$('sound').setAttribute('aria-pressed',String(sound));if(sound)tone(true);};
function animate(node,cls){node.classList.remove(cls);void node.offsetWidth;node.classList.add(cls);}
function render(){
 $('score').textContent=run.score;$('combo').textContent='×'+run.combo;$('orderNumber').textContent='#'+(run.orders+1);
 const total=run.order.reduce((a,b)=>a+b,0),matched=picks.reduce((a,b)=>a+b,0);
 $('orderProgress').textContent='แตะถูก '+matched+'/'+total+' ชิ้น';
 $('orderItems').replaceChildren();run.order.forEach((n,i)=>{if(!n)return;const item=document.createElement('div'),label=document.createElement('span'),quantity=document.createElement('b');item.className='order-item'+(picks[i]===n?' done':'');label.textContent=products[i].join(' ');quantity.className='order-quantity';quantity.textContent=(picks[i]===n?'✓ ':'')+picks[i]+'/'+n;item.append(label,quantity);$('orderItems').append(item);});
 document.querySelectorAll('.product').forEach(b=>{const i=Number(b.dataset.product);b.disabled=busy||run.complete||!!pending;b.classList.toggle('selected',picks[i]>0);b.querySelector('.pick-badge').textContent=picks[i]?String(picks[i]):'';b.setAttribute('aria-label','แตะ'+products[i][1]+' '+products[i][2]+' · ถูกแล้ว '+picks[i]+' จาก '+run.order[i]+' ชิ้น');});
 $('retryTap').hidden=!pending||busy||run.complete;
}
function shuffleProducts(){
 const shelf=$('shelf'),before=[...shelf.children],cards=[...before];
 for(let attempt=0;attempt<30;attempt++){
  for(let i=cards.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]];}
  if(cards.every((card,i)=>card!==before[i]))break;
 }
 if(cards.some((card,i)=>card===before[i])){const offset=1+Math.floor(Math.random()*(cards.length-1));cards.splice(0,cards.length,...before.slice(offset),...before.slice(0,offset));}
 shelf.append(...cards);
}
function pick(i){if(!run||busy||pending||run.complete||Date.now()>=deadline)return;pending={id:run.id,seq:run.seq+1,product:i};submit();}
function customerComplaint(i){
 if(Date.now()<customerUntil)return;customerUntil=Date.now()+1200;
 const otherSize=products.findIndex((p,j)=>j!==i&&p[1]===products[i][1]&&run.order[j]>0);
 const lines=[3,7].includes(i)?[
  'ชิ้นนี้หมดอายุแล้ว ลองเลือกของสดแทนนะ',
  'เช็กวันหมดอายุอีกนิด แล้วหยิบชิ้นใหม่กัน!'
 ]:run.order[i]===0&&otherSize>=0?[
  'ขนาดยังไม่ตรงนะ ออเดอร์นี้ต้องการ '+products[otherSize][2],
  'ชื่อเหมือนกัน แต่ขนาดต่างกัน เช็กป้ายอีกนิด!'
 ]:run.order[i]===0?[
  'ชิ้นนี้ยังไม่ได้สั่งนะ ลองเลือกใหม่',
  'ลองดูรายการด้านบน แล้วเลือกใหม่อีกนิดนะ'
 ]:[
  'สินค้านี้ครบแล้ว ลองดูรายการที่เหลือนะ',
  'ใกล้ครบแล้ว! เช็กจำนวนตามออเดอร์อีกครั้งนะ'
 ];
 const bubble=$('customerBubble');bubble.textContent='💡 '+lines[complaintCount++%lines.length];bubble.hidden=false;clearTimeout(customerTimer);animate(bubble,'customer-pop');customerTimer=setTimeout(()=>bubble.hidden=true,3000);
}
let comboTimer;
function showCombo(combo,points,speed){
 const popup=$('comboBurst');clearTimeout(comboTimer);popup.replaceChildren();
 const label=document.createElement('strong');label.textContent='COMBO ×'+combo;
 const detail=document.createElement('span');detail.textContent='+'+points+' คะแนน · โบนัสเร็ว +'+speed;
 popup.append(label,detail);popup.hidden=false;animate(popup,'burst-active');
 comboTimer=setTimeout(()=>{popup.hidden=true;},1100);
}
products.forEach(([emoji,name,variant],i)=>{
 const b=document.createElement('button');b.className='product'+([3,7].includes(i)?' expired':'');b.dataset.product=String(i);
 const icon=productArt(i,'product-art'),label=document.createElement('span'),detail=document.createElement('small'),badge=document.createElement('span');label.textContent=name;label.className='product-name';detail.textContent=variant;badge.className='pick-badge';badge.setAttribute('aria-hidden','true');b.append(icon,label,detail,badge);b.setAttribute('aria-label','แตะ'+name+' '+variant);b.onclick=()=>pick(i);$('shelf').append(b);
});
async function load(){
 $('start').disabled=true;$('retryLogin').hidden=true;
 try{const r=await fetch('../api/session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error();const s=await r.json();if(!s.user){$('identity').textContent='ตั้งชื่อแล้วเข้าห้องรอได้เลย ไม่ต้องเชื่อมต่อ LINE';$('guestForm').hidden=false;$('start').hidden=true;$('guestName').focus({preventScroll:true});return;}$('guestForm').hidden=true;$('start').hidden=false;csrf=s.csrf;$('identity').textContent='ผู้เล่น: '+(s.user.name||s.user.lineName);$('start').textContent='กำลังเข้าห้องรอ…';$('lobbyTops').hidden=false;connectLobby();await board();}catch{$('identity').textContent='โหลดบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง';$('retryLogin').hidden=false;}
}
$('retryLogin').onclick=load;
$('guestForm').onsubmit=async e=>{
 e.preventDefault();const name=$('guestName').value.trim();if(name.length<2){$('guestStatus').textContent='กรุณาตั้งชื่ออย่างน้อย 2 ตัวอักษร';return;}
 $('guestJoin').disabled=true;$('guestStatus').textContent='กำลังเข้าห้องรอ…';
 try{const r=await fetch('../api/guest',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({name}),signal:AbortSignal.timeout(12000)});let v;try{v=await r.json();}catch{throw Error('เชื่อมต่อไม่สำเร็จ');}if(!r.ok)throw Error(v.error||'เชื่อมต่อไม่สำเร็จ');$('guestStatus').textContent='';await load();}
 catch(err){$('guestStatus').textContent=err.message+' กรุณาลองอีกครั้ง';}
 finally{$('guestJoin').disabled=false;}
};
// The server owns the clock. The largest offset seen has the least network
// delay in it, and never makes this screen run ahead of the server.
const serverNow=()=>Date.now()+clockOffset;
const fromServer=ms=>ms-clockOffset;
function connectLobby(){
 if(socket&&socket.readyState<=1)return;
 const url=new URL('../api/lobby/ws',location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:';
 clockOffset=-Infinity;socket=new WebSocket(url);
 socket.onopen=()=>{reconnectDelay=1000;};
 socket.onmessage=e=>{try{applyLobby(JSON.parse(e.data));}catch{}};
 socket.onclose=e=>{renderLobby();if(e.code===4000){lobbyNotice='เปิดเกมอยู่ในหน้าจออื่น กรุณาโหลดหน้านี้ใหม่หากต้องการเล่นที่นี่';renderLobbyClock();return;}lobbyNotice='การเชื่อมต่อสะดุด กำลังเข้าห้องรอใหม่…';renderLobbyClock();setTimeout(connectLobby,reconnectDelay);reconnectDelay=Math.min(15000,reconnectDelay*2);};
}
function applyLobby(state){
 clockOffset=Math.max(clockOffset,state.serverNow-Date.now());lobbyNotice='';
 const previousLast=lobby?.lastRound?.roundId;lobby=state;renderLobby();
 if(state.lastRound&&state.lastRound.roundId!==previousLast){renderRoundTop();board();}
 if(state.phase==='round'&&state.you.inRound&&joinedRound!==state.roundId)joinRound(state);
}
function renderTop(id,rows,empty){
 const list=$(id);list.replaceChildren();
 if(!rows.length){const li=document.createElement('li');li.className='empty';li.textContent=empty;list.append(li);return;}
 for(const row of rows){const li=document.createElement('li');if(row.isMe)li.className='mine';const name=document.createElement('span'),score=document.createElement('b');name.textContent=row.name;score.textContent=row.score+' คะแนน';li.append(name,score);list.append(li);}
}
function renderRoundTop(){
 const last=lobby?.lastRound;
 if(currentRound&&last?.roundId===currentRound){$('roundTopStatus').textContent=last.failed?'โหลดผลรอบนี้ไม่สำเร็จ ดูอันดับประจำวันได้ที่ห้องรอ':'';renderTop('roundTopRows',last.top,'ไม่มีคะแนนในรอบนี้');}
 else{$('roundTopStatus').textContent='รอผู้เล่นคนอื่นจบรอบ…';$('roundTopRows').replaceChildren();}
}
function renderLobby(){
 if(!lobby)return;
 const waiting=lobby.phase==='waiting',connected=socket?.readyState===1;
 $('lobby').hidden=false;$('lobbyCount').textContent='ในห้อง '+lobby.count+' คน · พร้อมแล้ว '+lobby.readyCount+' คน';
 $('lobbyPlayers').replaceChildren();
 for(const player of lobby.players){const li=document.createElement('li');li.className=player.ready?'ready':'';const name=document.createElement('span'),mark=document.createElement('b');name.textContent=player.name+(player.me?' (คุณ)':'');mark.textContent=player.ready?'✓ พร้อม':'รอกดพร้อม';li.append(name,mark);$('lobbyPlayers').append(li);}
 $('start').disabled=!waiting||!connected;$('start').textContent=!waiting?(lobby.you.inRound?'เตรียมตัว…':'รอรอบถัดไป'):lobby.you.ready?'ยกเลิกการพร้อม':'กดเตรียมพร้อม';
 $('lobbyLastWrap').hidden=!lobby.lastRound;if(lobby.lastRound)renderTop('lobbyLastRound',lobby.lastRound.top,lobby.lastRound.failed?'โหลดผลรอบล่าสุดไม่สำเร็จ':'ไม่มีคะแนนในรอบล่าสุด');
 renderLobbyClock();
}
function renderLobbyClock(){
 if(!lobby)return;
 let status,clock='';const seconds=at=>Math.max(0,Math.ceil((fromServer(at)-Date.now())/1000));
 if(lobbyNotice)status=lobbyNotice;
 else if(lobby.phase==='waiting'&&lobby.readyDeadline){status=lobby.you.ready?'รอผู้เล่นคนอื่นกดพร้อม':'กดเตรียมพร้อมก่อนหมดเวลา ไม่เช่นนั้นจะข้ามรอบนี้';clock=seconds(lobby.readyDeadline)+' วินาที';}
 else if(lobby.phase==='waiting')status='ทุกคนกดพร้อมแล้วเกมจะเริ่มพร้อมกัน';
 else if(Date.now()<fromServer(lobby.startAt)){status=lobby.you.inRound?'เกมกำลังจะเริ่ม!':'รอบนี้กำลังจะเริ่ม รอรอบถัดไปนะ';clock=String(seconds(lobby.startAt));}
 else{status=lobby.you.inRound?'รอผู้เล่นคนอื่นจบรอบ':'รอบนี้กำลังแข่งอยู่ รอรอบถัดไปนะ';clock='เหลือ '+seconds(lobby.endAt)+' วินาที';}
 if($('lobbyStatus').textContent!==status)$('lobbyStatus').textContent=status;$('lobbyClock').textContent=clock;
}
setInterval(renderLobbyClock,250);
$('start').onclick=()=>{if(socket?.readyState===1&&lobby?.phase==='waiting')socket.send(JSON.stringify({type:'ready',ready:!lobby.you.ready}));};
async function joinRound(state){
 joinedRound=state.roundId;
 for(let attempt=0;attempt<4;attempt++){
  try{
   const joined=await api('start',{rulesVersion:3,roundId:state.roundId});
   if(joined.complete||joined.remaining<=0)return;
   run=joined;currentRound=state.roundId;warnedSecond=-1;customerUntil=0;clearTimeout(customerTimer);$('customerBubble').hidden=true;boardDay=run.day;deadline=fromServer(run.deadline);picks=[...run.picks];pending=null;renderRoundTop();
   clearTimeout(beginTimer);beginTimer=setTimeout(()=>beginPlay(state),Math.max(0,fromServer(state.startAt)-Date.now()));return;
  }catch(e){$('identity').textContent=e.message;await new Promise(done=>setTimeout(done,1000+attempt*500));}
 }
 lobbyNotice='เข้ารอบนี้ไม่สำเร็จ กรุณารอรอบถัดไป';renderLobbyClock();
}
function beginPlay(state){
 orderClock=Math.max(fromServer(state.startAt),Date.now()-(run.orderElapsed||0));$('newRound').hidden=true;$('welcome').hidden=true;$('play').hidden=false;document.body.classList.add('playing');if($('result').open)$('result').close();$('feedback').textContent='แตะสินค้าให้ตรงออเดอร์ · แตะถูกแล้วสินค้าจะสลับที่';busy=false;shuffleProducts();render();clearInterval(timer);timer=setInterval(tick,100);tick();window.scrollTo(0,0);
}
function backToLobby(){
 if($('result').open)$('result').close();run=null;picks.fill(0);$('play').hidden=true;$('newRound').hidden=true;$('welcome').hidden=false;document.body.classList.remove('playing');renderLobby();window.scrollTo(0,0);
}
$('again').onclick=backToLobby;$('newRound').onclick=backToLobby;
function tick(){if(!run||run.complete)return;const ms=Math.max(0,deadline-Date.now()),s=Math.ceil(ms/1000);$('time').textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');$('timebar').style.width=(ms/90000*100)+'%';document.querySelector('.hud').classList.toggle('urgent',ms<=15000);$('speedLive').textContent='โบนัสเร็วตอนนี้ +'+Math.max(0,200-Math.floor((Date.now()-orderClock)/100));$('pressure').textContent=s<=10?'เหลือ '+s+' วินาที! แตะให้ทัน!':s<=30?'โค้งสุดท้าย! เร่งทำคอมโบกัน!':personalBest>run.score?'อีก '+(personalBest-run.score+1)+' คะแนน ทำลายสถิติตัวเอง!':'แตะให้ไว! ยิ่งเร็ว โบนัสยิ่งมาก';if(s!==warnedSecond){warnedSecond=s;if(s===30||s===15||s<=10&&s>0)tone(false);}if(ms===0){clearInterval(timer);if(!busy)finish();}}
async function submit(){
 if(!run||busy||run.complete||!pending)return;if(Date.now()>=deadline){finish();return;}busy=true;render();
 try{
  const previous=run,product=pending.product;run=await api('tap',pending);pending=null;picks=[...run.picks];deadline=fromServer(run.deadline);orderClock=Date.now()-(run.orderElapsed||0);
  if(run.accepted){shuffleProducts();$('feedback').textContent=run.orders>previous.orders?'ครบออเดอร์! +'+(run.score-previous.score)+' คะแนน 🎉':'ถูกต้อง! หาสินค้าชิ้นถัดไป';tone(true);if(run.orders>previous.orders){animate($('score'),'score-pop');if(run.combo>1)showCombo(run.combo,run.score-previous.score,(run.speedTotal||0)-(previous.speedTotal||0));}}
  else if(!run.complete){tone(false);customerComplaint(product);$('feedback').textContent=[3,7].includes(product)?'หมดอายุ! −100 คะแนน · −8 วินาที':'ไม่ตรงออเดอร์หรือครบแล้ว! −60 คะแนน · −5 วินาที';}
 }catch(e){$('feedback').textContent=e.message+' · แตะลองยืนยันอีกครั้ง';}
 finally{busy=false;render();if(Date.now()>=deadline||run.complete)finish();}
}
$('retryTap').onclick=submit;
function result(){
 clearTimeout(comboTimer);clearTimeout(customerTimer);$('comboBurst').hidden=true;$('customerBubble').hidden=true;
 $('resultScore').textContent=run.score;$('resultStats').replaceChildren();const attempts=run.orders+run.errors;
 [['โบนัสความเร็วรวม',run.speedTotal||0],['ออเดอร์สำเร็จ',run.orders],['ความแม่นยำ',attempts?Math.round(run.orders/attempts*100)+'%':'0%'],['แตะผิด',run.errors],['คอมโบสูงสุด',run.best]].forEach(([label,n])=>{const el=document.createElement('div'),b=document.createElement('b');b.textContent=n;el.append(b,document.createTextNode(label));$('resultStats').append(el);});
 renderRoundTop();if(!$('result').open)$('result').showModal();
}
async function finish(){
 if(busy)return;busy=true;clearInterval(timer);$('again').disabled=true;$('retryFinish').hidden=true;$('saveStatus').textContent='กำลังยืนยันและบันทึกคะแนน…';result();render();
 try{run=await api('finish',{id:run.id});pending=null;result();$('saveStatus').textContent='บันทึกคะแนนแล้ว';$('again').disabled=false;$('newRound').hidden=false;page=1;await board();}
 catch(e){$('saveStatus').textContent=e.message+' · ยังไม่ยืนยันว่าบันทึกแล้ว';$('retryFinish').hidden=false;}
 finally{busy=false;render();}
}
$('retryFinish').onclick=finish;
async function board(){
 try{const b=await api('board?page='+page+(boardDay?'&day='+boardDay:''));personalBest=b.me?.score||0;$('boardDate').textContent=b.day+' · '+b.total+' ผู้เล่น';$('page').textContent=b.page;$('prev').disabled=b.page<=1;$('next').disabled=b.page*10>=b.total;$('boardRows').replaceChildren();
 for(const row of b.entries){const el=document.createElement('div');el.className='rank-row'+(row.isMe?' mine':'');for(const value of [row.rank,row.name,row.score+' คะแนน']){const span=document.createElement('span');span.textContent=value;el.append(span);}$('boardRows').append(el);}
 if(!b.entries.length)$('boardRows').textContent='ยังไม่มีคะแนนในวันนี้ มาเป็นคนแรกกัน!';
 if(b.page===1)renderTop('lobbyBoard',b.entries.slice(0,5),'ยังไม่มีคะแนนในวันนี้');
 const text=b.me?'อันดับดีที่สุดของคุณ: '+b.me.rank+' / '+b.total+' คน · '+b.me.score+' คะแนน':'เล่นให้จบ 1 รอบ เพื่อบันทึกอันดับของคุณ';$('myRank').textContent=text;
 if(run?.complete)$('saveStatus').textContent='บันทึกคะแนนแล้ว · '+text;
 }catch{$('myRank').textContent='โหลดอันดับไม่สำเร็จ กดโหลดอันดับใหม่ได้';}
}
$('prev').onclick=()=>{page=Math.max(1,page-1);board();};$('next').onclick=()=>{page++;board();};$('refreshBoard').onclick=board;
$('viewBoard').onclick=()=>{$('result').close();document.body.classList.remove('playing');document.querySelector('.leaderboard').scrollIntoView({behavior:'smooth'});};
$('result').addEventListener('cancel',e=>{if(!run?.complete)e.preventDefault();else document.body.classList.remove('playing');});
document.addEventListener('visibilitychange',()=>{if(run&&!run.complete)tick();});load();
})();
