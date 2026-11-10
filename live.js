(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const POLL_MS = 2000;
  const STORE = 'mk_admin_key';
  let key = '';
  let data = null;
  let offset = 0;
  let pollTimer = null;
  let clockTimer = null;
  let inFlight = false;
  let starting = false;
  let mutation = 0;
  try { key = sessionStorage.getItem(STORE) || ''; } catch {}

  const remember = (value) => { try { value ? sessionStorage.setItem(STORE, value) : sessionStorage.removeItem(STORE); } catch {} };
  const clockText = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  const cell = (text, className) => {
    const td = document.createElement('td');
    if (className) td.className = className;
    td.textContent = text;
    return td;
  };

  function showLogin(message) {
    clearInterval(pollTimer); clearInterval(clockTimer); pollTimer = clockTimer = null;
    $('board').hidden = true; $('logout').hidden = true; $('login').hidden = false;
    $('loginError').textContent = message || '';
    $('password').value = '';
    $('password').focus();
  }

  function start() {
    $('login').hidden = true; $('board').hidden = false; $('logout').hidden = false;
    poll();
    clearInterval(pollTimer); pollTimer = setInterval(poll, POLL_MS);
    clearInterval(clockTimer); clockTimer = setInterval(renderClock, 250);
  }

  async function poll() {
    if (inFlight) return;
    inFlight = true;
    const version = mutation;
    try {
      const response = await fetch('api/admin/live', { headers: { 'X-Admin-Key': key }, cache: 'no-store', credentials: 'same-origin' });
      let value = {};
      try { value = await response.json(); } catch {}
      if (response.status === 401 || response.status === 503) {
        remember('');
        showLogin(value.error || 'เข้าสู่ระบบไม่สำเร็จ');
        return;
      }
      if (!response.ok) throw new Error(value.error || 'โหลดไม่สำเร็จ');
      if (version !== mutation) return;
      offset = value.serverNow - Date.now();
      data = value;
      render();
      $('conn').textContent = '';
    } catch {
      $('startGame').disabled = true;
      $('conn').textContent = 'การเชื่อมต่อสะดุด กำลังลองใหม่…';
    } finally {
      inFlight = false;
    }
  }

  function renderClock() {
    if (!data) return;
    const now = Date.now() + offset;
    let phase, note = '', clock = '';
    if (data.live && now < data.round.startAt) {
      phase = 'กำลังนับถอยหลัง';
      note = `ผู้เล่นในรอบนี้ ${data.round.count} คน`;
      clock = String(Math.max(0, Math.ceil((data.round.startAt - now) / 1000)));
    } else if (data.live && now < data.round.endAt) {
      phase = 'กำลังแข่งอยู่';
      note = `ผู้เล่นในรอบนี้ ${data.round.count} คน · คะแนนอัปเดตทุก 2 วินาที`;
      clock = clockText(data.round.endAt - now);
    } else if (data.live) {
      phase = 'หมดเวลา · กำลังสรุปผล';
      clock = '00:00';
    } else if (data.roundId) {
      phase = 'จบรอบแล้ว · ผลรอบล่าสุด';
      note = 'รอผู้เล่นทุกคนกดเตรียมพร้อมสำหรับรอบถัดไป';
    } else {
      phase = 'ยังไม่มีรอบที่แข่ง';
      note = 'รอผู้เล่นอย่างน้อย 2 คน และกดเตรียมพร้อมครบทุกคน';
    }
    if (data.canStart && !data.live) { phase = 'ผู้เล่นพร้อมครบแล้ว'; note = 'กดเริ่มเกมเพื่อเริ่มนับถอยหลังพร้อมกัน'; }
    $('phase').textContent = phase;
    $('phaseNote').textContent = note;
    $('clock').textContent = clock;
  }

  function render() {
    renderClock();
    $('startGame').hidden = !data.canStart || data.live;
    $('startGame').disabled = starting || !data.canStart || data.live;
    const rows = data.scores || [];
    const leader = rows[0];
    $('leader').hidden = !leader;
    if (leader) {
      $('leaderName').textContent = leader.name;
      $('leaderScore').textContent = `${leader.score} คะแนน`;
    }
    const body = $('rows');
    body.replaceChildren();
    for (const row of rows) {
      const tr = document.createElement('tr');
      if (row.rank === 1) tr.className = 'first';
      const status = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = row.finished ? 'badge done' : 'badge';
      badge.textContent = row.finished ? 'จบแล้ว' : 'กำลังเล่น';
      status.append(badge);
      tr.append(cell(String(row.rank), 'rank'), cell(row.name, 'name'), cell(String(row.score), 'num score'),
        cell(String(row.orders), 'num'), cell(String(row.errors), 'num'), cell(`×${row.combo}`, 'num'), status);
      body.append(tr);
    }
    $('empty').hidden = rows.length > 0;
    $('empty').textContent = data.live ? 'ผู้เล่นกำลังเข้ารอบ…' : 'ยังไม่มีคะแนน รอรอบแรกเริ่ม';
    $('waitingTitle').textContent = `ห้องรอ · ${data.count} คน · พร้อม ${data.readyCount} คน`;
    const waiting = $('waiting');
    waiting.replaceChildren();
    for (const player of data.players || []) {
      const li = document.createElement('li');
      if (player.ready) li.className = 'ready';
      li.textContent = player.ready ? `✓ ${player.name}` : player.name;
      waiting.append(li);
    }
    $('updated').textContent = `อัปเดตล่าสุด ${new Date().toLocaleTimeString('th-TH')}`;
  }

  $('startGame').addEventListener('click', async () => {
    if (starting || !data?.canStart || data.live) return;
    starting = true;
    mutation++;
    $('startGame').disabled = true;
    $('startStatus').textContent = 'กำลังเริ่มเกม…';
    try {
      const response = await fetch('api/admin/start', { method: 'POST', headers: { 'X-Admin-Key': key }, credentials: 'same-origin', cache: 'no-store' });
      const value = await response.json();
      if (response.status === 401 || response.status === 503) { remember(''); showLogin(value.error); return; }
      if (!response.ok) throw new Error(value.error || 'เริ่มเกมไม่สำเร็จ');
      data.canStart = false;
      $('startGame').hidden = true;
      $('startStatus').textContent = 'เริ่มนับถอยหลังแล้ว';
    } catch (error) { $('startStatus').textContent = error.message; }
    finally { starting = false; await poll(); }
  });

  $('login').addEventListener('submit', (event) => {
    event.preventDefault();
    key = $('password').value;
    if (!key) return;
    remember(key);
    $('loginError').textContent = '';
    start();
  });
  $('logout').addEventListener('click', () => { key = ''; data = null; remember(''); showLogin(''); });

  if (key) start(); else showLogin('');
})();
