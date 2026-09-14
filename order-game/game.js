(() => {
'use strict';
const $=id=>document.getElementById(id);
const products=[['🍎','แอปเปิล','500 กรัม'],['🍎','แอปเปิล','1 กก.'],['🥛','นม','1 ลิตร'],['🥛','นม','1 ลิตร · หมดอายุ'],['🥕','แครอต','500 กรัม'],['🥕','แครอต','1 กก.'],['🐟','ปลา','1 กก.'],['🐟','ปลา','1 กก. · หมดอายุ']];
let csrf='',run=null,picks=Array(8).fill(0),busy=false,deadline=0,timer=null,pending=null,page=1,boardDay='',sound=false,audio;
async function api(path,data){const r=await fetch('../api/orders/'+path,{method:data===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(12000)});let value;try{value=await r.json();}catch{throw Error('โหลดข้อมูลไม่สำเร็จ');}if(!r.ok)throw Error(value.error||'เชื่อมต่อไม่สำเร็จ');return value;}
function tone(ok){if(!sound)return;try{audio??=new(window.AudioContext||window.webkitAudioContext)();audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.connect(g);g.connect(audio.destination);o.frequency.value=ok?720:190;g.gain.setValueAtTime(.07,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.12);o.start();o.stop(audio.currentTime+.13);}catch{}}
$('sound').onclick=()=>{sound=!sound;$('sound').textContent='เสียง: '+(sound?'เปิด':'ปิด');$('sound').setAttribute('aria-pressed',String(sound));if(sound)tone(true);};
function animate(node,cls){node.classList.remove(cls);void node.offsetWidth;node.classList.add(cls);}
function render(){
 $('score').textContent=run.score;$('combo').textContent='×'+run.combo;$('orderNumber').textContent='#'+(run.orders+1);
 $('orderItems').replaceChildren();run.order.forEach((n,i)=>{if(!n)return;const item=document.createElement('div');item.className='order-item'+(picks[i]===n?' done':'');item.textContent=products[i].join(' ')+' ×'+n;$('orderItems').append(item);});
 $('basketItems').replaceChildren();picks.forEach((n,i)=>{if(!n)return;const b=document.createElement('button');b.textContent=products[i][0]+' '+products[i][1]+' '+products[i][2]+' ×'+n+' −';b.disabled=busy||run.complete||!!pending;b.onclick=()=>{if(busy||run.complete||Date.now()>=deadline)return;picks[i]--;render();};$('basketItems').append(b);});
 $('send').disabled=busy||run.complete||!picks.some(Boolean);$('send').textContent=pending?'ลองส่งออเดอร์เดิมอีกครั้ง':busy?'กำลังตรวจออเดอร์…':'ส่งออเดอร์ →';
 document.querySelectorAll('.product').forEach(b=>b.disabled=busy||run.complete||!!pending);
}
let drag=null,lastDrag=0,lastDragButton=null;
function pick(i,b){if(!run||busy||pending||run.complete||Date.now()>=deadline||picks[i]>=9)return;picks[i]++;tone(true);animate(b,'hit');render();}
function clearDrag(){if(drag?.ghost)drag.ghost.remove();$('dropBasket').classList.remove('drop-ready');drag=null;}
products.forEach(([emoji,name,variant],i)=>{
 const b=document.createElement('button');b.className='product'+([3,7].includes(i)?' expired':'');
 const icon=document.createElement('span');icon.className='emoji';icon.textContent=emoji;const label=document.createElement('span');label.textContent=name;const detail=document.createElement('small');detail.textContent=variant;b.append(icon,label,detail);b.setAttribute('aria-label','หยิบ'+name+' '+variant);
 b.onclick=()=>{if(b!==lastDragButton||Date.now()-lastDrag>400)pick(i,b);};
 b.onpointerdown=e=>{if(b.disabled||!run||run.complete||e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,i,b};b.setPointerCapture?.(e.pointerId);};
 b.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;if(!drag.ghost&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>8){const ghost=document.createElement('div');ghost.className='drag-ghost';ghost.textContent=emoji+' '+name+' '+variant;document.body.append(ghost);drag.ghost=ghost;$('dropBasket').classList.add('drop-ready');}if(drag.ghost){e.preventDefault();drag.ghost.style.left=e.clientX+'px';drag.ghost.style.top=e.clientY+'px';}};
 b.onpointerup=e=>{if(!drag||drag.id!==e.pointerId)return;if(drag.ghost){lastDrag=Date.now();lastDragButton=b;const r=$('dropBasket').getBoundingClientRect();if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom)pick(i,b);}clearDrag();};
 b.onpointercancel=clearDrag;$('shelf').append(b);
});
async function load(){
 $('start').disabled=true;$('retryLogin').hidden=true;
 try{const r=await fetch('../api/session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error();const s=await r.json();if(!s.user){$('identity').textContent='เชื่อมต่อ LINE ที่หน้าแรกก่อนเล่น';$('login').hidden=false;$('start').textContent='กรุณาเชื่อมต่อ LINE';return;}csrf=s.csrf;$('identity').textContent='ผู้เล่น: '+(s.user.name||s.user.lineName);$('start').disabled=false;$('start').textContent='เริ่มจัดออเดอร์ · 90 วินาที';await board();}catch{$('identity').textContent='โหลดบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง';$('retryLogin').hidden=false;}
}
$('retryLogin').onclick=load;
async function start(){
 if(busy)return;busy=true;$('start').disabled=true;$('again').disabled=true;
 try{run=await api('start',{rulesVersion:2});deadline=Date.now()+run.remaining;boardDay=run.day;picks.fill(0);pending=null;$('newRound').hidden=true;$('welcome').hidden=true;$('play').hidden=false;document.body.classList.add('playing');$('result').close();$('feedback').textContent='หยิบสินค้าให้ตรงกับรายการด้านบน';busy=false;render();clearInterval(timer);timer=setInterval(tick,100);tick();window.scrollTo(0,0);}catch(e){$('identity').textContent=e.message;busy=false;$('start').disabled=false;$('again').disabled=false;}
}
$('start').onclick=start;$('again').onclick=start;$('newRound').onclick=start;
function tick(){if(!run||run.complete)return;const ms=Math.max(0,deadline-Date.now()),s=Math.ceil(ms/1000);$('time').textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');$('timebar').style.width=(ms/90000*100)+'%';document.querySelector('.hud').classList.toggle('urgent',ms<=15000);if(ms===0){clearInterval(timer);if(!busy)finish();}}
async function submit(){
 if(!run||busy||run.complete)return;if(Date.now()>=deadline){finish();return;}busy=true;
 pending??={id:run.id,seq:run.seq+1,picks:[...picks]};render();
 try{const previous=run;run=await api('submit',pending);deadline=Math.min(deadline,Date.now()+run.remaining);const expired=pending.picks[3]>0||pending.picks[7]>0;pending=null;picks.fill(0);const ok=run.orders>previous.orders;$('feedback').textContent=run.complete?'หมดเวลาแล้ว':ok?'ถูกต้อง! +'+(run.score-previous.score)+' คะแนน 🎉':expired?'หมดอายุ! −100 คะแนน · −8 วินาที · คอมโบหาย':'ผิดรายการ/น้ำหนัก! −60 คะแนน · −5 วินาที · คอมโบหาย';tone(ok);animate(document.querySelector('.basket'),ok?'hit':'miss');}
 catch(e){$('feedback').textContent=e.message+' · กดส่งอีกครั้งเพื่อยืนยันรายการเดิม';}
 finally{busy=false;render();if(Date.now()>=deadline||run.complete)finish();}
}
$('send').onclick=submit;
function result(){
 $('resultScore').textContent=run.score;$('resultStats').replaceChildren();const attempts=run.orders+run.errors;
 [['ออเดอร์สำเร็จ',run.orders],['ความแม่นยำ',attempts?Math.round(run.orders/attempts*100)+'%':'0%'],['ส่งผิด',run.errors],['คอมโบสูงสุด',run.best]].forEach(([label,n])=>{const el=document.createElement('div'),b=document.createElement('b');b.textContent=n;el.append(b,document.createTextNode(label));$('resultStats').append(el);});
 if(!$('result').open)$('result').showModal();
}
async function finish(){
 if(busy)return;busy=true;clearInterval(timer);$('again').disabled=true;$('retryFinish').hidden=true;$('saveStatus').textContent='กำลังยืนยันและบันทึกคะแนน…';result();render();
 try{run=await api('finish',{id:run.id});pending=null;result();$('saveStatus').textContent='บันทึกคะแนนแล้ว';$('again').disabled=false;$('newRound').hidden=false;page=1;await board();}
 catch(e){$('saveStatus').textContent=e.message+' · ยังไม่ยืนยันว่าบันทึกแล้ว';$('retryFinish').hidden=false;}
 finally{busy=false;render();}
}
$('retryFinish').onclick=finish;
async function board(){
 try{const b=await api('board?page='+page+(boardDay?'&day='+boardDay:''));$('boardDate').textContent=b.day+' · '+b.total+' ผู้เล่น';$('page').textContent=b.page;$('prev').disabled=b.page<=1;$('next').disabled=b.page*10>=b.total;$('boardRows').replaceChildren();
 for(const row of b.entries){const el=document.createElement('div');el.className='rank-row'+(row.isMe?' mine':'');for(const value of [row.rank,row.name,row.score+' คะแนน']){const span=document.createElement('span');span.textContent=value;el.append(span);}$('boardRows').append(el);}
 if(!b.entries.length)$('boardRows').textContent='ยังไม่มีคะแนนในวันนี้ มาเป็นคนแรกกัน!';
 const text=b.me?'อันดับดีที่สุดของคุณ: '+b.me.rank+' / '+b.total+' คน · '+b.me.score+' คะแนน':'เล่นให้จบ 1 รอบ เพื่อบันทึกอันดับของคุณ';$('myRank').textContent=text;
 if(run?.complete)$('saveStatus').textContent='บันทึกคะแนนแล้ว · '+text;
 }catch{$('myRank').textContent='โหลดอันดับไม่สำเร็จ กดโหลดอันดับใหม่ได้';}
}
$('prev').onclick=()=>{page=Math.max(1,page-1);board();};$('next').onclick=()=>{page++;board();};$('refreshBoard').onclick=board;
$('viewBoard').onclick=()=>{$('result').close();document.body.classList.remove('playing');document.querySelector('.leaderboard').scrollIntoView({behavior:'smooth'});};
$('result').addEventListener('cancel',e=>{if(!run?.complete)e.preventDefault();else document.body.classList.remove('playing');});
document.addEventListener('visibilitychange',()=>{if(run&&!run.complete)tick();});load();
})();
