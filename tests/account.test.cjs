const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { JSDOM } = require('jsdom');
const root = resolve(__dirname, '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const script = readFileSync(resolve(root, 'account.js'), 'utf8');
const emptyBoard = { entries: [], page: 1, totalPages: 1, totalPlayers: 0, totalRuns: 0, averageFound: 0, me: null };

async function account(t, handler, userAgent) {
  const dom = new JSDOM(html, { url: 'https://game.test/', runScripts: 'outside-only' });
  dom.window.AbortSignal = AbortSignal;
  dom.window.fetch = handler;
  if (userAgent) Object.defineProperty(dom.window.navigator, "userAgent", {value:userAgent});
  dom.window.eval(script);
  await dom.window.MAKRO_ACCOUNT.ready;
  t.after(async () => { await new Promise(setImmediate); dom.window.close(); });
  return { api: dom.window.MAKRO_ACCOUNT, window: dom.window, $: (s) => dom.window.document.querySelector(s) };
}

test('static hosting clearly offers practice without faking LINE or saved rankings', async (t) => {
  const g = await account(t, async () => new Response('<h1>404</h1>', { status: 404, headers: { 'Content-Type': 'text/html' } }));
  assert.equal(g.api.canPlay(), true);
  assert.equal(await g.api.startRun(), false);
  assert.equal(g.$('#lineLogin').hidden, true);
  assert.match(g.$('#startModeNote').textContent, /ไม่บันทึกอันดับ/);
  assert.equal(await g.api.saveResult(), null);
  assert.equal(g.$('#leaderboardTable').hidden, true);
});

test('configured LINE gates ranked play on a saved profile and renders names as text', async (t) => {
  const user = { name: '', phone: '', lineName: 'LINE test', profileComplete: false };
  const g = await account(t, async (path) => {
    if (path === 'api/session') return Response.json({ lineReady: true, user, csrf: 'token' });
    if (path.startsWith('api/leaderboard')) return Response.json({ ...emptyBoard, totalPlayers: 1, entries: [{ rank: 1, name: '<img src=x onerror=alert(1)>', foundCount: 15, scoreMs: 12340, misses: 1 }] });
    throw new Error('unexpected request');
  });
  assert.equal(g.api.canPlay(), false);
  await assert.rejects(g.api.startRun(), /บันทึกชื่อ/);
  await g.api.refreshLeaderboard();
  assert.equal(g.$('#leaderboardRows img'), null);
  assert.match(g.$('#leaderboardRows').textContent, /<img/);
  assert.equal(g.$('#playerForm').hidden, false);
});

test('a lost final response is retried with the same event id and never reported saved early', async (t) => {
  const attempts = [];
  let firstResponse = true;
  const g = await account(t, async (path, init) => {
    if (path === 'api/session') return Response.json({ lineReady: true, csrf: 'csrf', user: { name: 'Test', phone: '0812345678', lineName: 'Test', profileComplete: true } });
    if (path.startsWith('api/leaderboard')) return Response.json(emptyBoard);
    if (path === 'api/runs') return Response.json({ id: 'test-run', rulesVersion: 2 });
    if (path.includes('/events')) {
      assert.equal(init.headers['X-CSRF-Token'], 'csrf');
      attempts.push(JSON.parse(init.body));
      if (firstResponse) { firstResponse = false; throw new Error('lost response'); }
      return Response.json({ status: 'complete', scoreMs: 65000, rank: 1 });
    }
    throw new Error('unexpected request');
  });
  assert.equal(await g.api.startRun(), true);
  await assert.rejects(g.api.event('hit', { answer: 'last' }), /lost response/);
  assert.equal((await g.api.saveResult()).scoreMs, 65000);
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts[0], attempts[1]);
  assert.equal(g.window.localStorage.length, 0);
});

test('slow result reads never block session readiness, game creation or confirmation of a saved score', async (t) => {
  const dom = new JSDOM(html, { url: 'https://game.test/', runScripts: 'outside-only' });
  const w = dom.window;
  t.after(() => w.close());
  w.AbortSignal = AbortSignal;
  w.fetch = async (path) => {
    if (path === 'api/session') return Response.json({ lineReady: true, csrf: 'fixture', user: { name: 'Fixture', profileComplete: true } });
    if (path.startsWith('api/leaderboard') || path.startsWith('api/me/stats')) return new Promise(() => {});
    if (path === 'api/runs') return Response.json({ id: 'fixture-run', rulesVersion: 2 });
    return Response.json({ status: 'complete', scoreMs: 65000, rank: 12 });
  };
  w.eval(script);
  const api = w.MAKRO_ACCOUNT;
  let ready = false;
  api.ready.then(() => { ready = true; });
  await new Promise(setImmediate);
  assert.equal(ready, true, 'a pending leaderboard must not hold the start button');
  assert.equal(await api.startRun(), true);
  await api.event('hit', { answer: 'last' });
  let saved;
  api.saveResult().then((result) => { saved = result; });
  await new Promise(setImmediate);
  assert.equal(saved?.scoreMs, 65000, 'confirmation must not wait for leaderboard/history reads');
});

test('personal history loads for returning players outside the top ten and retries a read failure', async (t) => {
  let fail = false;
  const g = await account(t, async (path) => {
    if (path === 'api/session') return Response.json({ lineReady: true, user: { name: 'Returning player', profileComplete: true } });
    if (path.startsWith('api/leaderboard')) return Response.json(emptyBoard);
    if (fail) throw new Error('temporary connection failure');
    return Response.json({ completedRuns: 2, bestScoreMs: 65000, bestFoundCount: 12, rank: 12, recentRuns: [
      { status: 'active', level: 1, scoreMs: null, misses: 1, createdAt: 1800000002000 },
      { status: 'failed', level: 2, scoreMs: null, misses: 2, createdAt: 1800000001000 },
      { status: 'complete', level: 2, scoreMs: 65000, misses: 3, foundCount: 12, rulesVersion: 2, createdAt: 1800000000000 }
    ] });
  });
  await g.api.refreshPersonalStats();
  assert.equal(g.$('#personalBest').textContent, '01:05.00');
  assert.equal(g.$('#personalBestFound').textContent, '12 / 15 จุด');
  assert.equal(g.$('#personalRank').textContent, '#12');
  assert.equal(g.$('#personalCompleted').textContent, '2 ครั้ง');
  assert.equal(g.$('#personalHistoryRows').children.length, 3);
  assert.match(g.$('#personalHistoryRows').textContent, /ยังเล่นไม่ครบ.*หมดเวลา.*บันทึกแล้ว/);
  assert.equal(g.$('#startViewStats').hidden, false);
  fail = true;
  await g.api.refreshPersonalStats();
  assert.match(g.$('#personalStatsStatus').textContent, /โหลดสถิติไม่สำเร็จ/);
  assert.equal(g.$('#refreshPersonalStats').disabled, false);
  fail = false;
  await g.api.refreshPersonalStats();
  assert.match(g.$('#personalStatsStatus').textContent, /สถิติที่บันทึกไว้/);
});

test('the result popup shows the current player rank outside page one and highlights their row on page two', async (t) => {
  const me = { rank: 12, name: 'Current player', foundCount: 9, scoreMs: 120000 };
  const g = await account(t, async (path) => {
    if (path === 'api/session') return Response.json({ lineReady: true, user: { profileComplete: true } });
    if (!path.startsWith('api/leaderboard')) throw new Error('not needed');
    const page = Number(new URL(path, 'https://game.test/').searchParams.get('page'));
    return Response.json({ ...emptyBoard, page, totalPages: 2, totalPlayers: 12, totalRuns: 20, averageFound: 11, me,
      entries: [{ rank: page === 2 ? 12 : 1, name: page === 2 ? me.name : 'Another player', foundCount: page === 2 ? 9 : 15,
        scoreMs: 120000, misses: 1, isMe: page === 2 }] });
  });
  await g.api.refreshLeaderboard(1);
  assert.equal(g.$('#resultRank').textContent, '#12');
  assert.match(g.$('#resultRankNote').textContent, /12 คน/);
  assert.equal(g.$('#resultBoardRows .is-me'), null);
  await g.api.refreshLeaderboard(2);
  assert.match(g.$('#resultBoardRows .is-me').textContent, /Current player \(คุณ\)/);
  assert.equal(g.$('[data-board-next]').disabled, true);
  assert.equal(g.$('[data-board-prev]').disabled, false);
});


test('LINE in-app login opens the OAuth start in an external browser before creating login cookies', async (t) => {
  const g = await account(t, async () => Response.json({lineReady:true,user:null,csrf:''}), 'Mozilla/5.0 Android Line/15.0.0');
  const link = new URL(g.$('#lineLogin').href);
  assert.equal(link.origin, 'https://game.test');
  assert.equal(link.pathname, '/auth/line/start');
  assert.equal(link.searchParams.get('openExternalBrowser'), '1');
  assert.equal(link.searchParams.get('manual'), '1');
  assert.equal(link.searchParams.has('state'), false);
});
