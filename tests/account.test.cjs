const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { JSDOM } = require('jsdom');
const root = resolve(__dirname, '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const script = readFileSync(resolve(root, 'account.js'), 'utf8');

async function account(t, handler) {
  const dom = new JSDOM(html, { url: 'https://game.test/', runScripts: 'outside-only' });
  dom.window.AbortSignal = AbortSignal;
  dom.window.fetch = handler;
  dom.window.eval(script);
  await dom.window.MAKRO_ACCOUNT.ready;
  t.after(() => dom.window.close());
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
    if (path === 'api/leaderboard') return Response.json({ entries: [{ name: '<img src=x onerror=alert(1)>', scoreMs: 12340, misses: 1 }] });
    throw new Error('unexpected request');
  });
  assert.equal(g.api.canPlay(), false);
  await assert.rejects(g.api.startRun(), /บันทึกชื่อ/);
  assert.equal(g.$('#leaderboardRows img'), null);
  assert.match(g.$('#leaderboardRows').textContent, /<img/);
  assert.equal(g.$('#playerForm').hidden, false);
});

test('a lost final response is retried with the same event id and never reported saved early', async (t) => {
  const attempts = [];
  let firstResponse = true;
  const g = await account(t, async (path, init) => {
    if (path === 'api/session') return Response.json({ lineReady: true, csrf: 'csrf', user: { name: 'Test', phone: '0812345678', lineName: 'Test', profileComplete: true } });
    if (path === 'api/leaderboard') return Response.json({ entries: [] });
    if (path === 'api/runs') return Response.json({ id: 'test-run' });
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
