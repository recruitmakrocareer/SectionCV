'use strict';
const levels = require('../levels.js');
const PENALTY_MS = 5000;
const LEVEL_MS = 120000;
const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };

// Shared by the local Node server and the Cloudflare Worker. Time always comes
// from the server, never from the event payload. Mutates a database snapshot.
function advanceRun(run, event, timestamp) {
  if (run.status !== 'active') fail('รอบนี้สิ้นสุดแล้ว กรุณาเริ่มเกมใหม่', 409);
  if (event.seq !== run.last_seq + 1) fail('รายการเล่นมาไม่ครบ กรุณาลองส่งอีกครั้ง', 409);
  if (timestamp - run.created_at > 3600000 || event.seq > 3000) fail('รอบเกมหมดอายุ กรุณาเริ่มใหม่', 409);
  const current = run.current_ms + (run.phase === 'playing' ? Math.max(0, timestamp - run.segment_at) : 0);
  const found = new Set(JSON.parse(run.found));
  let timedOut = run.phase === 'playing' && current >= LEVEL_MS;
  if (timedOut || event.type === 'timeout') {
    if (!timedOut && current < LEVEL_MS - 1500) fail('เวลาของรอบนี้ยังไม่หมด', 409);
    run.status = 'failed'; run.phase = 'finished'; run.current_ms = LEVEL_MS;
  } else if (event.type === 'begin') {
    if (run.phase === 'intermission') {
      if (event.level !== run.level + 1 || run.level >= levels.length - 1) fail('ต้องเล่นตามลำดับด่าน', 409);
      run.level += 1; run.current_ms = 0; run.found = '[]'; run.hints = 0;
    } else if (run.phase !== 'ready' || event.level !== run.level) fail('เริ่มด่านนี้ไม่ได้', 409);
    run.phase = 'playing'; run.segment_at = timestamp;
  } else if (event.type === 'resume') {
    if (run.phase !== 'paused') fail('เกมไม่ได้หยุดพัก', 409);
    run.phase = 'playing'; run.segment_at = timestamp;
  } else if (event.type === 'pause') {
    if (run.phase !== 'playing') fail('เกมยังไม่ได้เริ่ม', 409);
    run.current_ms = current; run.phase = 'paused'; run.segment_at = null;
  } else if (event.type === 'hit' || event.type === 'miss') {
    if (run.phase !== 'playing') fail('เกมยังไม่ได้เริ่ม', 409);
    if (event.type === 'miss') run.misses += 1;
    else {
      if (!levels[run.level].differences.some((d) => d.id === event.answer)) fail('คำตอบไม่ได้อยู่ในด่านนี้');
      found.add(event.answer); run.found = JSON.stringify([...found]);
      if (found.size === 5) {
        run.elapsed_ms += current; run.current_ms = 0; run.segment_at = null;
        run.phase = 'intermission';
        if (run.level === levels.length - 1) {
          run.status = 'complete'; run.phase = 'finished'; run.completed_at = timestamp;
          run.score_ms = run.elapsed_ms + run.misses * PENALTY_MS;
        }
      }
    }
  } else fail('รายการเล่นไม่ถูกต้อง');
  run.last_seq = event.seq;
  return run;
}
module.exports = { advanceRun, PENALTY_MS, LEVEL_MS, fail };
