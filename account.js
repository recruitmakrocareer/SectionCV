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
  let boardGeneration = 0;
  let currentBoardPage = 1;
  let boardPages = 1;
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
      ? registered ? 'เล่นจบทั้ง 3 ภาพแล้วบันทึกผล · พบจุดมากกว่า อันดับดีกว่า' : 'กรุณาเข้าสู่ระบบและบันทึกชื่อกับเบอร์ติดต่อก่อนเริ่มเกม'
      : 'โหมดฝึกซ้อม ไม่ส่งข้อมูลส่วนตัวและไม่บันทึกอันดับ';
    window.dispatchEvent(new CustomEvent('account:change'));
  }
  async function refreshLeaderboard(page = currentBoardPage) {
    const generation = ++boardGeneration;
    const statuses = [$('#leaderboardStatus'), $('#resultBoardStatus')];
    if (!state.online) {
      statuses.forEach((el) => { el.textContent = 'โหมดฝึกซ้อม · ระบบอันดับยังไม่เปิดใช้งาน'; });
      $('#resultRankNote').textContent = 'เข้าสู่ระบบบนเว็บกิจกรรมเพื่อร่วมจัดอันดับ';
      return;
    }
    [$('#refreshLeaderboard'), $('#refreshResultBoard'), ...document.querySelectorAll('[data-board-prev], [data-board-next]')].forEach((button) => { button.disabled = true; });
    statuses.forEach((el) => { el.textContent = 'กำลังโหลดอันดับ…'; });
    try {
      const data = await request(`api/leaderboard?rulesVersion=2&page=${page}`);
      if (generation !== boardGeneration) return;
      currentBoardPage = data.page; boardPages = data.totalPages;
      for (const target of ['#leaderboardRows', '#resultBoardRows']) {
        $(target).replaceChildren();
        data.entries.forEach((entry) => {
          const row = document.createElement('tr');
          if (entry.isMe) { row.className = 'is-me'; row.setAttribute('aria-current', 'true'); }
          [entry.rank, `${entry.name}${entry.isMe ? ' (คุณ)' : ''}`, `${entry.foundCount} / 15`, time(entry.scoreMs), `${entry.misses} ครั้ง`].forEach((value) => {
            const cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell);
          });
          $(target).appendChild(row);
        });
      }
      $('#leaderboardTable').hidden = !data.entries.length;
      $('#resultBoardTable').hidden = !data.entries.length;
      statuses.forEach((el) => { el.textContent = data.entries.length ? 'กติกา 90 วินาที · ผลงานที่ดีที่สุดคนละ 1 อันดับ' : 'ยังไม่มีผลการเล่นในกติกา 90 วินาที'; });
      document.querySelectorAll('[data-total-players]').forEach((el) => { el.textContent = data.totalPlayers.toLocaleString('th-TH'); });
      document.querySelectorAll('[data-total-runs]').forEach((el) => { el.textContent = data.totalRuns.toLocaleString('th-TH'); });
      document.querySelectorAll('[data-average-found]').forEach((el) => { el.textContent = data.averageFound.toFixed(1); });
      document.querySelectorAll('[data-board-page]').forEach((el) => { el.textContent = `หน้า ${currentBoardPage} / ${boardPages}`; });
      document.querySelectorAll('[data-my-standing]').forEach((el) => { el.textContent = data.me
        ? `คุณอยู่ที่อันดับ ${data.me.rank} · ผลงานดีที่สุด ${data.me.foundCount} / 15 จุด · ${time(data.me.scoreMs)}` : ''; });
      $('#resultRank').textContent = data.me ? `#${data.me.rank}` : '—';
      $('#resultRankNote').textContent = data.me ? `จากผู้เล่น ${data.totalPlayers.toLocaleString('th-TH')} คน` : 'เล่นจบทั้ง 3 ภาพเพื่อร่วมจัดอันดับ';
    } catch {
      if (generation === boardGeneration) {
        statuses.forEach((el) => { el.textContent = 'โหลดอันดับไม่สำเร็จ กดอัปเดตอันดับเพื่อลองอีกครั้ง'; });
        $('#resultRankNote').textContent = 'ยังโหลดอันดับรวมไม่ได้ กดอัปเดตอันดับ';
      }
    } finally {
      if (generation === boardGeneration) {
        $('#refreshLeaderboard').disabled = false; $('#refreshResultBoard').disabled = false;
        document.querySelectorAll('[data-board-prev]').forEach((el) => { el.disabled = currentBoardPage <= 1; });
        document.querySelectorAll('[data-board-next]').forEach((el) => { el.disabled = currentBoardPage >= boardPages; });
      }
    }
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
      const data = await request('api/me/stats?rulesVersion=2');
      if (generation !== statsGeneration) return;
      $('#personalBest').textContent = data.bestScoreMs === null ? '—' : time(data.bestScoreMs);
      $('#personalBestFound').textContent = data.bestFoundCount === null ? '' : `${data.bestFoundCount} / 15 จุด`;
      $('#personalRank').textContent = data.rank === null ? '—' : `#${data.rank}`;
      $('#personalCompleted').textContent = `${data.completedRuns} ครั้ง`;
      $('#personalSummary').hidden = false;
      $('#personalHistoryRows').replaceChildren();
      const dateFormat = new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
      for (const run of data.recentRuns) {
        const row = document.createElement('tr');
        const outcome = run.status === 'complete' ? `จบ 3 ด่าน · ${run.foundCount} / 15 จุด · บันทึกแล้ว${run.rulesVersion === 1 ? ' (กติกาเดิม)' : ''}`
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
  $('#refreshLeaderboard').addEventListener('click', () => refreshLeaderboard());
  $('#refreshResultBoard').addEventListener('click', () => refreshLeaderboard());
  document.querySelectorAll('[data-board-prev]').forEach((el) => el.addEventListener('click', () => refreshLeaderboard(currentBoardPage - 1)));
  document.querySelectorAll('[data-board-next]').forEach((el) => el.addEventListener('click', () => refreshLeaderboard(currentBoardPage + 1)));
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
      const run = await request('api/runs', { rulesVersion: 2 });
      if (run.rulesVersion !== 2) throw new Error('เกมกำลังอัปเดตกติกา กรุณาโหลดหน้าใหม่แล้วเริ่มอีกครั้ง');
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
      void refreshLeaderboard(1);
      void refreshPersonalStats();
      return result;
    },
    clearRun() { runId = null; queue = []; sequence = 0; lastResult = null; }
  };
  window.MAKRO_ACCOUNT = account;
})();
