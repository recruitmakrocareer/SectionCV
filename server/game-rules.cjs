'use strict';
const levels = require('../levels.js');
const PENALTY_MS = 5000;
const LEVEL_MS = 120000;
const SPRINT_MS = 90000;
const RULES_VERSION = 2;
const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };

// Shared by the local Node server and the Cloudflare Worker. Time always comes
// from the server, never from the event payload. Mutates a database snapshot.
function advanceLegacyRun(run, event, timestamp) {
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
function newProgress(version) {
  return version === RULES_VERSION ? JSON.stringify({ rulesVersion: RULES_VERSION, totalFound: 0, found: [], stages: [] }) : '[]';
}

function sprintProgress(run) {
  const progress = JSON.parse(run.found);
  return progress.rulesVersion === RULES_VERSION ? progress : null;
}

function advanceRun(run, event, timestamp) {
  const progress = sprintProgress(run);
  if (!progress) return advanceLegacyRun(run, event, timestamp);
  if (event.seq !== run.last_seq + 1) fail('รายการเล่นมาไม่ครบ กรุณาลองส่งอีกครั้ง', 409);
  if (timestamp - run.created_at > 3600000 || event.seq > 3000) fail('รอบเกมหมดอายุ กรุณาเริ่มใหม่', 409);
  if (!Number.isInteger(event.level) || event.level < 0 || event.level >= levels.length) fail('ด่านไม่ถูกต้อง');
  if (!['begin', 'hit', 'miss', 'timeout'].includes(event.type)) fail('รอบนี้นับเวลาต่อเนื่อง ไม่มีการหยุดพัก', 409);
  // A tap already in flight when the server closes an expired stage is
  // acknowledged without awarding points or blocking the following stage.
  if (['active', 'complete'].includes(run.status) && event.type !== 'begin' && progress.stages[event.level]?.timedOut) {
    run.last_seq = event.seq;
    return run;
  }
  if (run.status !== 'active') fail('รอบนี้สิ้นสุดแล้ว กรุณาเริ่มเกมใหม่', 409);
  const current = run.current_ms + (run.phase === 'playing' ? Math.max(0, timestamp - run.segment_at) : 0);
  const closeStage = (timedOut) => {
    const elapsed = timedOut ? SPRINT_MS : Math.min(current, SPRINT_MS);
    const previousMisses = progress.stages.reduce((sum, stage) => sum + stage.misses, 0);
    progress.stages.push({ level: run.level, foundCount: progress.found.length, elapsedMs: elapsed,
      misses: run.misses - previousMisses, timedOut });
    run.elapsed_ms += elapsed;
    run.current_ms = 0; run.segment_at = null; run.phase = 'intermission';
    if (run.level === levels.length - 1) {
      run.status = 'complete'; run.phase = 'finished'; run.completed_at = timestamp;
      run.score_ms = run.elapsed_ms + run.misses * PENALTY_MS;
    }
  };
  if (event.type === 'begin') {
    if (run.phase === 'intermission' && event.level === run.level + 1) {
      run.level = event.level; progress.found = []; run.hints = 0;
    } else if (run.phase !== 'ready' || event.level !== run.level) fail('ต้องเล่นตามลำดับด่าน', 409);
    run.phase = 'playing'; run.segment_at = timestamp;
  } else {
    if (run.phase !== 'playing' || event.level !== run.level) fail('ด่านนี้ไม่ได้กำลังเล่น', 409);
    if (current >= SPRINT_MS || event.type === 'timeout') {
      if (current < SPRINT_MS - 1000) fail('เวลาของด่านนี้ยังไม่หมด', 409);
      closeStage(true);
    } else if (event.type === 'miss') run.misses += 1;
    else {
      if (!levels[run.level].differences.some((d) => d.id === event.answer)) fail('คำตอบไม่ได้อยู่ในด่านนี้');
      if (!progress.found.includes(event.answer)) { progress.found.push(event.answer); progress.totalFound += 1; }
      if (progress.found.length === 5) closeStage(false);
    }
  }
  run.found = JSON.stringify(progress);
  run.last_seq = event.seq;
  return run;
}

function runResult(run, timestamp) {
  const progress = sprintProgress(run);
  const result = { status: run.status, level: run.level, phase: run.phase, scoreMs: run.score_ms, misses: run.misses, rank: null };
  if (progress) Object.assign(result, { rulesVersion: RULES_VERSION, foundCount: progress.totalFound, stages: progress.stages,
    remainingMs: run.phase === 'playing' ? Math.max(0, SPRINT_MS - run.current_ms - Math.max(0, timestamp - run.segment_at)) : 0 });
  return result;
}

module.exports = { advanceRun, runResult, newProgress, sprintProgress, PENALTY_MS, LEVEL_MS, SPRINT_MS, RULES_VERSION, fail };
