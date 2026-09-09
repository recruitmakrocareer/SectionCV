const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { createApp } = require('../server/index.cjs');
const levels = require('../levels.js');
const origin = 'http://game.test';
const lineUser = 'U' + 'a'.repeat(32);

async function setup(t) {
  const dataDir = mkdtempSync(join(tmpdir(), 'makro-server-'));
  let clock = 1800000000000;
  let nonce;
  let identity = lineUser;
  let challenge;
  const app = createApp({ dataDir, now: () => clock,
    env: { APP_ORIGIN: origin, LINE_CHANNEL_ID: '12345', LINE_CHANNEL_SECRET: 'test-only-secret', ADMIN_LINE_USER_IDS: lineUser },
    lineFetch: async (url, options) => {
      assert.equal(new URL(url).origin, 'https://api.line.me');
      if (url.endsWith('/token')) {
        assert.equal(options.body.get('client_secret'), 'test-only-secret');
        const verifier = options.body.get('code_verifier');
        assert.equal(createHash('sha256').update(verifier).digest('base64url'), challenge);
        return Response.json({ id_token: 'verified-by-mocked-line-only' });
      }
      assert.equal(options.body.get('nonce'), nonce);
      assert.equal(options.body.get('client_id'), '12345');
      return Response.json({ iss: 'https://access.line.me', aud: '12345', sub: identity, nonce, name: 'Test LINE', exp: Math.floor(clock / 1000) + 3600 });
    }
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const request = (path, init = {}) => fetch(base + path, { redirect: 'manual', ...init });
  async function login(sub = lineUser) {
    identity = sub;
    const start = await request('/auth/line/start');
    const url = new URL(start.headers.get('location'));
    assert.equal(url.origin, 'https://access.line.me');
    assert.equal(url.searchParams.get('scope'), 'openid profile');
    assert.equal(url.searchParams.has('client_secret'), false);
    nonce = url.searchParams.get('nonce'); challenge = url.searchParams.get('code_challenge');
    const cookie = start.headers.getSetCookie()[0].split(';')[0];
    const callbackPath = `/auth/line/callback?state=${url.searchParams.get('state')}&code=test-code`;
    const callback = await request(callbackPath, { headers: { Cookie: cookie } });
    assert.equal(callback.headers.get('location'), '/');
    const sessionCookie = callback.headers.getSetCookie()[0].split(';')[0];
    const sessionResponse = await request('/api/session', { headers: { Cookie: sessionCookie } });
    const data = await sessionResponse.json();
    return { cookie: sessionCookie, csrf: data.csrf, callbackPath, oauthCookie: cookie };
  }
  const post = (path, user, data, extra = {}) => request(path, {
    method: 'POST', headers: { Cookie: user.cookie, Origin: origin, 'X-CSRF-Token': user.csrf, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(data)
  });
  const register = (user, name = 'ผู้เล่นทดสอบ') => post('/api/profile', user, { name, phone: '+66 81 234 5678', consent: true });
  async function runFor(user) {
    const response = await post('/api/runs', user, {}); assert.equal(response.status, 201);
    const { id } = await response.json(); let seq = 0;
    return { id, next: (type, data = {}) => ({ eventId: randomUUID(), seq: ++seq, type, ...data }),
      send: (event) => post(`/api/runs/${id}/events`, user, event) };
  }
  t.after(async () => { await app.close(); rmSync(dataDir, { recursive: true, force: true }); });
  return { app, request, login, post, register, runFor, advance: (ms) => { clock += ms; } };
}

test('LINE OAuth binds state to a cookie, verifies PKCE and consumes the callback once', async (t) => {
  const g = await setup(t);
  const forged = await g.request('/auth/line/callback?state=forged&code=forged');
  assert.equal(forged.headers.get('location'), '/?login_error=1');
  const user = await g.login();
  assert.ok(user.csrf);
  const replay = await g.request(user.callbackPath, { headers: { Cookie: user.oauthCookie } });
  assert.equal(replay.headers.get('location'), '/?login_error=1');
  assert.equal(g.app.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 1);
});

test('requires verified LINE, valid contact details, consent and CSRF before a ranked run', async (t) => {
  const g = await setup(t);
  assert.equal((await g.request('/api/runs', { method: 'POST' })).status, 401);
  const user = await g.login();
  assert.equal((await g.post('/api/runs', user, {})).status, 403);
  assert.equal((await g.post('/api/profile', user, { name: 'Test', phone: '123', consent: true })).status, 400);
  assert.equal((await g.post('/api/profile', user, { name: 'Test', phone: '0812345678', consent: false })).status, 400);
  assert.equal((await g.post('/api/profile', user, {}, { Origin: 'https://other.test' })).status, 403);
  assert.equal((await g.post('/api/profile', user, {}, { 'X-CSRF-Token': 'wrong' })).status, 403);
  const profile = await g.register(user); assert.equal(profile.status, 200);
  assert.equal((await profile.json()).user.phone, '0812345678');
  assert.equal((await g.post('/api/runs', user, {})).status, 201);
});

test('server measures all three stages, excludes pauses, adds penalties and safely replays a lost response', async (t) => {
  const g = await setup(t); const user = await g.login(); await g.register(user);
  const run = await g.runFor(user);
  const send = async (type, data) => { const response = await run.send(run.next(type, data)); assert.equal(response.status, 200); return response.json(); };
  await send('begin', { level: 0 });
  g.advance(10000);
  await send('pause'); g.advance(90000); await send('resume');
  const miss = run.next('miss');
  assert.equal((await run.send(miss)).status, 200);
  assert.equal((await run.send(miss)).status, 200); // response was lost; must not add a second penalty
  let final;
  for (let level = 0; level < 3; level++) {
    if (level) { await send('begin', { level }); g.advance(10000); }
    for (const point of levels[level].differences) final = await send('hit', { answer: point.id, scoreMs: -999999 });
  }
  assert.equal(final.status, 'complete');
  assert.equal(final.scoreMs, 35000); assert.equal(final.misses, 1); assert.equal(final.rank, 1);
  const board = await (await g.request('/api/leaderboard')).json();
  assert.deepEqual(board.entries, [{ name: 'ผู้เล่นทดสอบ', scoreMs: 35000, misses: 1 }]);
  assert.equal(JSON.stringify(board).includes('0812345678'), false);
  assert.equal(JSON.stringify(board).includes(lineUser), false);
});

test('rejects skipped stages, mismatched retry payloads, out-of-order events and another player’s run', async (t) => {
  const g = await setup(t); const user = await g.login(); await g.register(user); const run = await g.runFor(user);
  const begin = run.next('begin', { level: 2 });
  assert.equal((await run.send(begin)).status, 409);
  begin.level = 0; assert.equal((await run.send(begin)).status, 200);
  assert.equal((await run.send({ ...begin, level: 2 })).status, 409);
  assert.equal((await run.send({ eventId: randomUUID(), seq: 10, type: 'miss' })).status, 409);
  const other = await g.login('U' + 'b'.repeat(32)); await g.register(other);
  const result = await g.post(`/api/runs/${run.id}/events`, other, { eventId: randomUUID(), seq: 2, type: 'miss' });
  assert.equal(result.status, 404);
});

test('an expired stage never enters the leaderboard, even when the last hit claims a fast score', async (t) => {
  const g = await setup(t); const user = await g.login(); await g.register(user); const run = await g.runFor(user);
  await run.send(run.next('begin', { level: 0 }));
  g.advance(120001);
  const result = await (await run.send(run.next('hit', { answer: levels[0].differences[0].id, scoreMs: 1 }))).json();
  assert.equal(result.status, 'failed');
  assert.deepEqual((await (await g.request('/api/leaderboard')).json()).entries, []);
});

test('top ten uses one best score per person; contact export requires an explicit administrator', async (t) => {
  const g = await setup(t); const admin = await g.login(); await g.register(admin);
  const other = await g.login('U' + 'b'.repeat(32)); await g.register(other, '=Dangerous spreadsheet formula');
  for (let i = 0; i < 12; i++) {
    const id = randomUUID();
    g.app.db.prepare('INSERT INTO users(id,line_sub,line_name,name,phone,consent_at,created_at) VALUES(?,?,?,?,?,?,?)').run(id, `fixture-${i}`, 'fixture', `Player ${i}`, '0810000000', 1, 1);
    for (const score of [50000 + i * 1000, 10000 + i * 1000]) {
      g.app.db.prepare("INSERT INTO runs(id,user_id,status,created_at,completed_at,score_ms) VALUES(?,?,'complete',?,?,?)").run(randomUUID(), id, 1, i + 1, score);
    }
  }
  const board = await (await g.request('/api/leaderboard')).json();
  assert.equal(board.entries.length, 10); assert.equal(new Set(board.entries.map((r) => r.name)).size, 10);
  assert.equal(board.entries[0].scoreMs, 10000); assert.equal(board.entries[9].scoreMs, 19000);
  assert.equal((await g.request('/api/admin/players')).status, 401);
  assert.equal((await g.request('/api/admin/export', { headers: { Cookie: other.cookie } })).status, 403);
  const exported = await g.request('/api/admin/export', { headers: { Cookie: admin.cookie } });
  assert.equal(exported.status, 200); assert.match(await exported.text(), /"'=Dangerous/);
  assert.equal((await g.request('/.env')).status, 404);
  assert.equal((await g.request('/data/makro.sqlite')).status, 404);
  assert.equal((await g.request('/server/index.cjs')).status, 404);
});

test('production OAuth uses the configured deployment origin and ignores forwarded hosts', async (t) => {
  const renderOrigin = 'https://deployment.example.test';
  for (const appOrigin of [undefined, 'https://custom.example.test']) {
    const dataDir = mkdtempSync(join(tmpdir(), 'makro-render-'));
    const app = createApp({ dataDir, env: {
      NODE_ENV: 'production', RENDER: 'true', RENDER_EXTERNAL_URL: renderOrigin,
      APP_ORIGIN: appOrigin, LINE_CHANNEL_ID: '12345', LINE_CHANNEL_SECRET: 'test-only-secret'
    } });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${app.server.address().port}/auth/line/start`, {
        redirect: 'manual', headers: { 'X-Forwarded-Host': 'attacker.example', 'X-Forwarded-Proto': 'http' }
      });
      assert.equal(response.status, 303);
      const redirect = new URL(response.headers.get('location'));
      assert.equal(redirect.searchParams.get('redirect_uri'), `${appOrigin || renderOrigin}/auth/line/callback`);
      assert.equal(redirect.searchParams.has('client_secret'), false);
      const cookie = response.headers.getSetCookie()[0];
      assert.match(cookie, /; Secure(?:;|$)/);
      assert.match(cookie, /; HttpOnly(?:;|$)/);
      assert.match(cookie, /; SameSite=Lax(?:;|$)/);
    } finally {
      await app.close(); rmSync(dataDir, { recursive: true, force: true });
    }
  }
  for (const badEnv of [
    { RENDER: 'false', RENDER_EXTERNAL_URL: renderOrigin },
    { RENDER: 'true', RENDER_EXTERNAL_URL: 'http://insecure.example.test' },
    { RENDER: 'true', RENDER_EXTERNAL_URL: `${renderOrigin}/unexpected/path` }
  ]) {
    assert.throws(() => createApp({ env: { NODE_ENV: 'production', ...badEnv } }), /APP_ORIGIN/);
  }
});
