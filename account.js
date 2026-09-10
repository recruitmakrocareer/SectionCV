(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const state = { online: false, lineReady: false, user: null, csrf: '', loading: true, saving: false };
  let runId = null;
  let sequence = 0;
  let queue = [];
  let flushing = null;
  let lastResult = null;
  let statsGeneration = 0;
  const time = (ms) => {
    const value = Math.max(0, Math.round(ms / 10));
    return `${String(Math.floor(value / 6000)).padStart(2, '0')}:${String(Math.floor(value / 100) % 60).padStart(2, '0')}.${String(value % 100).padStart(2, '0')}`;
  };
  async function request(path, body) {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: body === undefined ? { Accept: 'application/json' } : { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrf },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12000)
    });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('ระบบบันทึกข้อมูลยังไม่พร้อม');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'เชื่อมต่อไม่สำเร็จ กรุณาลองอีกครั้ง');
    return data;
  }
  function render() {
    const registered = !!state.user?.profileComplete;
    $('#loginPanel').hidden = !!state.user;
    $('#lineLogin').hidden = !state.lineReady;
    $('#loginStatus').textContent = state.loading ? 'กำลังตรวจการเข้าสู่ระบบ…' : state.lineReady
      ? 'เข้าสู่ระบบด้วย LINE แล้วกรอกข้อมูลเพื่อร่วมจัดอันดับ'
      : 'เปิดให้ฝึกซ้อมได้ ระบบ LINE และการบันทึกอันดับยังไม่เปิดใช้งาน';
    $('#playerForm').hidden = !state.user;
    $('#logoutButton').hidden = !state.user;
    $('#adminLink').hidden = !state.user?.admin;
    $('#startViewStats').hidden = !state.user;
    $('#savePlayer').disabled = state.saving;
    $('#playerBadge').textContent = registered ? `ผู้เล่น: ${state.user.name}` : 'ฝึกซ้อม · ไม่บันทึกอันดับ';
    if (state.user) $('#lineIdentity').textContent = `เชื่อมต่อ LINE แล้ว: ${state.user.lineName}`;
    $('#startModeNote').textContent = state.lineReady
      ? registered ? 'บันทึกสถิติเมื่อเล่นครบ 3 ด่าน · เวลาน้อยที่สุดเป็นอันดับ 1' : 'กรุณาเข้าสู่ระบบและบันทึกชื่อกับเบอร์ติดต่อก่อนเริ่มเกม'
      : 'โหมดฝึกซ้อม ไม่ส่งข้อมูลส่วนตัวและไม่บันทึกอันดับ';
    window.dispatchEvent(new CustomEvent('account:change'));
  }
  async function refreshLeaderboard() {
    const status = $('#leaderboardStatus');
    if (!state.online) { status.textContent = 'ระบบบันทึกอันดับยังไม่เปิดใช้งาน'; return; }
    $('#refreshLeaderboard').disabled = true;
    try {
      const data = await request('api/leaderboard');
      $('#leaderboardRows').replaceChildren();
      data.entries.forEach((entry, index) => {
        const row = document.createElement('tr');
        [index + 1, entry.name, time(entry.scoreMs), `${entry.misses} ครั้ง`].forEach((value) => {
          const cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell);
        });
        $('#leaderboardRows').appendChild(row);
      });
      $('#leaderboardTable').hidden = !data.entries.length;
      status.textContent = data.entries.length ? 'อันดับจากผู้เล่นที่ผ่านครบ 3 ด่าน' : 'ยังไม่มีสถิติที่เล่นครบ 3 ด่าน';
    } catch { status.textContent = 'โหลดอันดับไม่สำเร็จ กดอัปเดตอันดับเพื่อลองอีกครั้ง'; }
    finally { $('#refreshLeaderboard').disabled = false; }
  }
  async function refreshPersonalStats() {
    const generation = ++statsGeneration;
    const status = $('#personalStatsStatus');
    const button = $('#refreshPersonalStats');
    if (!state.online || !state.user) {
      status.textContent = 'เข้าสู่ระบบด้วย LINE เพื่อดูประวัติการเล่นของคุณ';
      $('#personalSummary').hidden = true;
      $('#personalHistoryTable').hidden = true;
      button.disabled = true;
      return;
    }
    button.disabled = true;
    status.textContent = 'กำลังโหลดสถิติของคุณ…';
    try {
      const data = await request('api/me/stats');
      if (generation !== statsGeneration) return;
      $('#personalBest').textContent = data.bestScoreMs === null ? '—' : time(data.bestScoreMs);
      $('#personalRank').textContent = data.rank === null ? '—' : `#${data.rank}`;
      $('#personalCompleted').textContent = `${data.completedRuns} ครั้ง`;
      $('#personalSummary').hidden = false;
      $('#personalHistoryRows').replaceChildren();
      const dateFormat = new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
      for (const run of data.recentRuns) {
        const row = document.createElement('tr');
        const outcome = run.status === 'complete' ? 'ครบ 3 ด่าน · บันทึกแล้ว'
          : run.status === 'failed' ? `หมดเวลาในด่านที่ ${run.level + 1}`
          : run.status === 'abandoned' ? 'เริ่มรอบใหม่ก่อนเล่นครบ'
          : `ยังเล่นไม่ครบ · ด่านที่ ${run.level + 1}`;
        [dateFormat.format(run.createdAt), outcome, run.scoreMs === null ? '—' : time(run.scoreMs), `${run.misses} ครั้ง`].forEach((value) => {
          const cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell);
        });
        $('#personalHistoryRows').appendChild(row);
      }
      $('#personalHistoryTable').hidden = !data.recentRuns.length;
      status.textContent = data.completedRuns
        ? 'สถิติที่บันทึกไว้ของคุณ · ดูได้แม้ไม่ติด 10 อันดับแรก'
        : data.recentRuns.length ? 'ยังไม่มีรอบที่เล่นครบ 3 ด่าน ดูผลแต่ละรอบได้ด้านล่าง'
        : 'ยังไม่มีประวัติการเล่นที่บันทึกในบัญชี LINE นี้';
    } catch {
      if (generation === statsGeneration) status.textContent = 'โหลดสถิติไม่สำเร็จ กดอัปเดตสถิติเพื่อลองอีกครั้ง';
    } finally {
      if (generation === statsGeneration) button.disabled = false;
    }
  }
  const ready = (async () => {
    try {
      if (!/^https?:$/.test(location.protocol)) throw new Error('local file');
      const data = await request('api/session');
      Object.assign(state, data, { online: true });
      if (state.user) {
        $('#playerName').value = state.user.name || state.user.lineName || '';
        $('#playerPhone').value = state.user.phone || '';
        $('#playerConsent').checked = !!state.user.profileComplete;
      }
      const authError = new URLSearchParams(location.search).get('login_error');
      if (authError) $('#profileStatus').textContent = 'เข้าสู่ระบบ LINE ไม่สำเร็จ กรุณาลองอีกครั้ง';
    } catch { state.online = false; }
    state.loading = false; render();
    // Session readiness and gameplay must not wait for optional result reads.
    void refreshLeaderboard();
    void refreshPersonalStats();
  })();
  $('#playerForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (state.saving || !$('#playerForm').reportValidity()) return;
    state.saving = true; render();
    try {
      const data = await request('api/profile', { name: $('#playerName').value, phone: $('#playerPhone').value, consent: $('#playerConsent').checked });
      state.user = data.user; $('#profileStatus').textContent = 'บันทึกข้อมูลแล้ว พร้อมเริ่มเกม';
    } catch (error) { $('#profileStatus').textContent = error.message; }
    finally { state.saving = false; render(); }
  });
  $('#logoutButton').addEventListener('click', async () => {
    try { await request('api/logout', {}); location.reload(); }
    catch (error) { $('#profileStatus').textContent = error.message; }
  });
  $('#refreshLeaderboard').addEventListener('click', refreshLeaderboard);
  $('#refreshPersonalStats').addEventListener('click', refreshPersonalStats);
  async function flush() {
    if (flushing) return flushing;
    flushing = (async () => {
      while (queue.length) {
        lastResult = await request(`api/runs/${encodeURIComponent(runId)}/events`, queue[0]);
        queue.shift();
      }
      return lastResult;
    })();
    try { return await flushing; } finally { flushing = null; }
  }
  const account = {
    state, ready, time, refreshLeaderboard, refreshPersonalStats,
    canPlay: () => !state.loading && !state.saving && (!state.lineReady || !!state.user?.profileComplete),
    async startRun() {
      await ready;
      if (!state.online || !state.lineReady) { runId = null; return false; }
      if (!state.user?.profileComplete) throw new Error('กรุณาบันทึกชื่อและเบอร์ติดต่อก่อน');
      // Keep an unacknowledged result until the server confirms it.
      if (queue.length) await flush();
      const run = await request('api/runs', {});
      runId = run.id; sequence = 0; queue = []; lastResult = null;
      return true;
    },
    event(type, data = {}) {
      if (!runId) return Promise.resolve(null);
      if (['begin', 'resume'].includes(type) && queue.some((item) => item.type === type && item.level === data.level)) return flush();
      queue.push({ eventId: crypto.randomUUID(), seq: ++sequence, type, ...data });
      return flush();
    },
    async saveResult() {
      if (!runId) return null;
      const result = await flush();
      if (result?.status !== 'complete') throw new Error('ยังบันทึกครบ 3 ด่านไม่สำเร็จ กรุณาลองอีกครั้ง');
      // The event acknowledgement already confirms persistence. Show it now,
      // even when either results panel has a slow or failed request.
      void refreshLeaderboard();
      void refreshPersonalStats();
      return result;
    },
    clearRun() { runId = null; queue = []; sequence = 0; lastResult = null; }
  };
  window.MAKRO_ACCOUNT = account;
})();
