// Separate storage and scoring keep the existing games' rankings unchanged.
export const schema = `CREATE TABLE IF NOT EXISTS order_runs_v3 (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, day TEXT NOT NULL,
 started INTEGER NOT NULL, deadline INTEGER NOT NULL, updated INTEGER NOT NULL,
 order_started INTEGER NOT NULL, speed_total INTEGER NOT NULL DEFAULT 0,
 score INTEGER NOT NULL DEFAULT 0, errors INTEGER NOT NULL DEFAULT 0,
 orders INTEGER NOT NULL DEFAULT 0, combo INTEGER NOT NULL DEFAULT 0,
 best INTEGER NOT NULL DEFAULT 0, seq INTEGER NOT NULL DEFAULT 0,
 complete INTEGER NOT NULL DEFAULT 0, payload TEXT NOT NULL DEFAULT ''
)`;
const bad=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export const dayOf=ms=>new Date(ms+7*3600000).toISOString().slice(0,10);
export function orderFor(day,index){
 let seed=2166136261;for(const c of `${day}:${index}:makro-v2`)seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;
 const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 // Each three completed orders adds one step; quantities never drop.
 const stage=Math.min(11,Math.floor(index/3));
 const count=1+Math.floor(stage/3),quantity=1+stage%3;
 const amounts=Array(8).fill(0);
 let available=[0,1,2,4,5,6];for(let n=0;n<count;n++){const i=next()%available.length;amounts[available.splice(i,1)[0]]=n===0?quantity:3;}return amounts;
}
// Store tap progress with the last event in one row so retries and sequence
// updates are atomic, including when the final tap advances the order.
const tapState=r=>{try{const p=JSON.parse(r.payload);return !Array.isArray(p)&&p?.mode==='tap'?p:null;}catch{return null;}};
const view=(r,now)=>({picks:tapState(r)?.picks||Array(8).fill(0),accepted:tapState(r)?.accepted,id:r.id,day:r.day,deadline:r.deadline,remaining:Math.max(0,r.deadline-now),speedTotal:r.speed_total,orderElapsed:Math.max(0,now-r.order_started),score:r.score,errors:r.errors,orders:r.orders,combo:r.combo,best:r.best,seq:r.seq,complete:!!r.complete,order:orderFor(r.day,r.orders)});
export async function orderAPI(db,user,path,data,now){
 const q=(s,...v)=>db.prepare(s).bind(...v);
 // Idempotent bootstrap allows the existing dashboard deployment command to work.
 if(path==='/api/orders/start'||path==='/api/orders/board'){
  await db.batch([db.prepare(schema),db.prepare('CREATE INDEX IF NOT EXISTS idx_order_v3_day ON order_runs_v3(day,complete,user_id)')]);
 }
 if(path==='/api/orders/board'){
  const day=data?.day||dayOf(now);if(!/^\d{4}-\d{2}-\d{2}$/.test(day))bad('วันที่ไม่ถูกต้อง');
  const page=Math.max(1,Math.min(10000,Number(data?.page)||1));
  const cte=`WITH best AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY user_id ORDER BY score DESC,errors ASC,deadline ASC,id ASC) AS pick FROM order_runs_v3 WHERE day=? AND complete=1), ranked AS (SELECT *,ROW_NUMBER() OVER(ORDER BY score DESC,errors ASC,deadline ASC,id ASC) AS rank FROM best WHERE pick=1)`;
  const [rows,me,total]=await db.batch([
   q(`${cte} SELECT rank,COALESCE(NULLIF(u.name,''),u.line_name) AS name,score,errors,orders,r.user_id=? AS isMe FROM ranked r JOIN users u ON u.id=r.user_id ORDER BY rank LIMIT 10 OFFSET ?`,day,user.id,(Math.floor(page)-1)*10),
   q(`${cte} SELECT rank,score,errors,orders FROM ranked WHERE user_id=?`,day,user.id),
   q('SELECT COUNT(DISTINCT user_id) AS total FROM order_runs_v3 WHERE day=? AND complete=1',day)
  ]);return {day,page:Math.floor(page),entries:rows.results,me:me.results[0]||null,total:total.results[0].total};
 }
 if(path==='/api/orders/start'){
  if(data.rulesVersion!==3)bad('กติกาเปลี่ยนแล้ว กรุณาปิดและเปิดเกมใหม่',409);
  const round=data.round;if(!round)bad('กรุณาเข้าห้องรอเพื่อเริ่มพร้อมผู้เล่นคนอื่น',409);
  // One deterministic run per player per round: retries and reloads resume it,
  // and the lobby can find every score in the round from the id prefix.
  const id=`round:${round.id}:${user.id}`;
  const existing=await q('SELECT * FROM order_runs_v3 WHERE id=? AND user_id=?',id,user.id).first();if(existing)return view(existing,now);
  await q('UPDATE order_runs_v3 SET complete=1 WHERE user_id=? AND complete=0',user.id).run();
  // The partial unique index serializes concurrent start requests.
  await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_order_v3_active ON order_runs_v3(user_id) WHERE complete=0').run();
  await q('INSERT OR IGNORE INTO order_runs_v3(id,user_id,day,started,deadline,updated,order_started) VALUES(?,?,?,?,?,?,?)',id,user.id,dayOf(round.startAt),round.startAt,round.endAt,round.startAt,round.startAt).run();
  return view(await q('SELECT * FROM order_runs_v3 WHERE id=? AND user_id=?',id,user.id).first(),now);
 }
 const r=await q('SELECT * FROM order_runs_v3 WHERE id=? AND user_id=?',typeof data.id==='string'?data.id:'',user.id).first();if(!r)bad('ไม่พบรอบเกม',404);
 if(path==='/api/orders/finish'){
  if(now<r.deadline)bad('ยังไม่หมดเวลา',409);
  await q('UPDATE order_runs_v3 SET complete=1 WHERE id=?',r.id).run();return view({...r,complete:1},now);
 }
 if(path==='/api/orders/tap'){
  const products=data.products??[data.product];
  if(!Array.isArray(products)||products.length<1||products.length>12||products.some(i=>!Number.isInteger(i)||i<0||i>7)||!Number.isSafeInteger(data.seq))bad('ข้อมูลสินค้าไม่ถูกต้อง');
  const previous=tapState(r),signature=JSON.stringify(products);
  const matches=row=>{const state=tapState(row);return state&&JSON.stringify(state.products??[state.product])===signature;};
  if(data.seq===r.seq&&matches(r))return view(r,now);
  if(data.seq!==r.seq+1)bad('ข้อมูลเปลี่ยน กรุณาโหลดเกมใหม่',409);
  if(now<r.started)bad('ยังไม่ถึงเวลาเริ่ม',409);
  if(r.complete||now>=r.deadline){await q('UPDATE order_runs_v3 SET complete=1 WHERE id=?',r.id).run();return view({...r,complete:1},now);}
  const picks=[...(previous?.picks||Array(8).fill(0))],order=orderFor(r.day,r.orders);
  let score=r.score,errors=r.errors,combo=r.combo,end=r.deadline,speed=0,done=false,accepted=false;
  // Queued touches belong to this order only; never apply leftovers to a new order.
  for(const product of products){
   if(done||end<=now)break;
   accepted=picks[product]<order[product];
   if(accepted){picks[product]++;done=order.every((n,i)=>n===picks[i]);}
   else {const expired=[3,7].includes(product);errors++;combo=0;score=Math.max(0,score-(expired?100:60));end-=expired?8000:5000;}
   if(done){combo++;speed=Math.max(0,200-Math.floor(Math.max(0,now-r.order_started)/100));score+=100+Math.min(5,combo-1)*20+speed;}
  }
  const payload=JSON.stringify({mode:'tap',product:products[0],products,accepted,picks:done?Array(8).fill(0):picks});
  const updated=await q(`UPDATE order_runs_v3 SET score=?,errors=?,orders=?,combo=?,best=?,seq=?,payload=?,updated=?,deadline=?,complete=?,order_started=?,speed_total=? WHERE id=? AND seq=? AND complete=0 RETURNING *`,score,errors,r.orders+(done?1:0),combo,Math.max(r.best,combo),data.seq,payload,now,end,end<=now?1:0,done?now:r.order_started,r.speed_total+speed,r.id,r.seq).first();
  if(!updated){const current=await q('SELECT * FROM order_runs_v3 WHERE id=?',r.id).first();if(current.seq===data.seq&&matches(current))return view(current,now);bad('ข้อมูลเปลี่ยน กรุณาลองอีกครั้ง',409);}
  return view(updated,now);
 }
 if(path!=='/api/orders/submit')bad('ไม่พบรายการ',404);
 if(now<r.started)bad('ยังไม่ถึงเวลาเริ่ม',409);
 const picks=data.picks;
 if(!Array.isArray(picks)||picks.length!==8||picks.some(n=>!Number.isInteger(n)||n<0||n>9)||!Number.isSafeInteger(data.seq))bad('ข้อมูลออเดอร์ไม่ถูกต้อง');
 const payload=JSON.stringify(picks);
 if(data.seq===r.seq&&r.payload===payload)return view(r,now);
 if(data.seq!==r.seq+1)bad('ข้อมูลเปลี่ยน กรุณาลองส่งอีกครั้ง',409);
 if(r.complete||now>=r.deadline){await q('UPDATE order_runs_v3 SET complete=1 WHERE id=?',r.id).run();return view({...r,complete:1},now);}
 if(now-r.updated<400)bad('กรุณารอสักครู่แล้วส่งอีกครั้ง',429);
 const correct=orderFor(r.day,r.orders).every((n,i)=>n===picks[i]);
 const expired=picks[3]>0||picks[7]>0;
 const penalty=expired?100:60,timePenalty=correct?0:(expired?8000:5000);
 const nextDeadline=r.deadline-timePenalty;
 const speed=correct?Math.max(0,200-Math.floor(Math.max(0,now-r.order_started)/100)):0;
 const combo=correct?r.combo+1:0,score=correct?r.score+100+Math.min(5,combo-1)*20+speed:Math.max(0,r.score-penalty);
 const updated=await q(`UPDATE order_runs_v3 SET score=?,errors=?,orders=?,combo=?,best=?,seq=?,payload=?,updated=?,deadline=?,complete=?,order_started=?,speed_total=? WHERE id=? AND seq=? AND complete=0 RETURNING *`,score,r.errors+(correct?0:1),r.orders+(correct?1:0),combo,Math.max(r.best,combo),data.seq,payload,now,nextDeadline,nextDeadline<=now?1:0,correct?now:r.order_started,r.speed_total+speed,r.id,r.seq).first();
 if(!updated){const current=await q('SELECT * FROM order_runs_v3 WHERE id=?',r.id).first();if(current.seq===data.seq&&current.payload===payload)return view(current,now);bad('ข้อมูลเปลี่ยน กรุณาลองอีกครั้ง',409);}
 return view(updated,now);
}
