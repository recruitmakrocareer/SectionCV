const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, mkdtempSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const { Miniflare } = require('miniflare');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
const levels = require('../levels.js');
const root = resolve(__dirname, '..');
const origin = 'https://game.test';
const hash = (s) => createHash('sha256').update(s).digest('hex');
const schema = readFileSync(join(root, 'migrations/0001_players.sql'), 'utf8').replace(/^--.*$/gm, '');
let mf, DB, createWorker, bundle;

before(async () => {
  ({ createWorker } = await import('../worker/index.mjs'));
  bundle = (await build({ entryPoints: [join(root, 'worker/index.mjs')], bundle: true, write: false, format: 'esm', platform: 'browser' })).outputFiles[0].text;
  mf = new Miniflare({ cf: false, modules: true, script: bundle, compatibilityDate: '2026-07-30', d1Databases: ['DB'], durableObjects: { LOBBY: 'LobbyRoom' }, bindings: { APP_ORIGIN: origin, LINE_CHANNEL_ID: '2011516015', ADMIN_PASSWORD: 'live-board-test' } });
  DB = await mf.getD1Database('DB');
  await DB.batch(schema.split(';').map((s) => s.trim()).filter(Boolean).map((s) => DB.prepare(s)));
});
after(async () => { await mf?.dispose(); });

async function fixture(t, { profile = true, admin = false, lineFetch } = {}) {
  let clock = 1800000000000;
  const id = randomUUID(), token = randomUUID(), csrf = randomUUID();
  const sub = 'U' + randomUUID().replaceAll('-', '');
  await DB.prepare('INSERT INTO users(id,line_sub,line_name,name,phone,consent_at,created_at) VALUES(?,?,?,?,?,?,?)')
    .bind(id, sub, 'LINE fixture', profile ? 'ผู้เล่นทดสอบ' : null, profile ? '0812345678' : null, profile ? clock : null, clock).run();
  await DB.prepare('INSERT INTO sessions VALUES(?,?,?,?)').bind(hash(token), id, csrf, clock + 86400000).run();
  // Stands in for the lobby: admits this player to one round starting on first use.
  const roundId = randomUUID();
  let round = null;
  const lobbyStub = { fetch: async (url) => {
    if (new URL(url).searchParams.get('id') !== roundId) return Response.json({}, { status: 403 });
    round ??= { id: roundId, startAt: clock, endAt: clock + 90000 };
    return Response.json(round);
  } };
  const env = { DB, APP_ORIGIN: origin, LINE_CHANNEL_ID: '2011516015', LINE_CHANNEL_SECRET: 'test-only', ADMIN_LINE_USER_IDS: admin ? sub : '',
    LOBBY: { idFromName: () => 'room', get: () => lobbyStub } };
  const worker = createWorker({ now: () => clock, lineFetch });
  const raw = (path, data, overrides = {}) => worker.fetch(new Request(origin + path, {
    method: data === undefined ? 'GET' : 'POST', body: data === undefined ? undefined : JSON.stringify(data),
    headers: { Cookie: `mk_session=${token}`, Origin: origin, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json', ...overrides }
  }), env);
  const request = async (...args) => { const response = await raw(...args); return { status: response.status, body: await response.json() }; };
  t.after(async () => {
    await DB.batch([
      DB.prepare('DELETE FROM events WHERE run_id IN (SELECT id FROM runs WHERE user_id=?)').bind(id),
      DB.prepare('DELETE FROM runs WHERE user_id=?').bind(id),
      DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id),
      DB.prepare('DELETE FROM users WHERE id=?').bind(id)
    ]);
  });
  return { id, token, csrf, roundId, env, worker, request, raw, tick: (ms) => { clock += ms; }, now: () => clock };
}

test('bundled Worker runs in workerd with real D1 and never enables LINE without its secret', async () => {
  const response = await mf.dispatchFetch(origin + '/api/session');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { lineReady: false, csrf: '', user: null, penaltyMs: 5000 });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await mf.dispatchFetch(origin + '/auth/line/start')).status, 503);
  assert.equal((await mf.dispatchFetch(origin + '/api/admin/players')).status, 401);
  assert.equal((await mf.dispatchFetch(origin + '/api/me/stats')).status, 401);
});

test('setup status identifies absent configuration without exposing values or accessing D1 or LINE', async () => {
  const deployed = await mf.dispatchFetch(origin + '/api/setup-status');
  assert.equal(deployed.status, 200);
  assert.equal(deployed.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await deployed.json(), { lineReady: false, missing: ['LINE_CHANNEL_SECRET'] });

  const worker = createWorker({ lineFetch: () => assert.fail('Setup status must not contact LINE') });
  const env = {
    DB: { withSession: () => assert.fail('Setup status must not access player data') },
    APP_ORIGIN: origin, LINE_CHANNEL_ID: '2011516015',
    LINE_CHANNEL_SECRET: 'private-line-secret', ADMIN_LINE_USER_IDS: 'private-admin-identity'
  };
  const inspect = (bindings) => worker.fetch(new Request(origin + '/api/setup-status', {
    headers: { Cookie: 'mk_session=private-session-token' }
  }), bindings);
  for (const missing of ['APP_ORIGIN', 'DB', 'LINE_CHANNEL_ID', 'LINE_CHANNEL_SECRET']) {
    const response = await inspect({ ...env, [missing]: undefined });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { lineReady: false, missing: [missing] });
  }
  assert.deepEqual(await (await inspect(env)).json(), { lineReady: true, missing: [] });
  assert.deepEqual(await (await inspect({})).json(), {
    lineReady: false, missing: ['APP_ORIGIN', 'DB', 'LINE_CHANNEL_ID', 'LINE_CHANNEL_SECRET']
  });
  const invalidOrigin = { ...env, APP_ORIGIN: 'http://invalid.test/' };
  assert.deepEqual(await (await inspect(invalidOrigin)).json(), { lineReady: false, missing: ['APP_ORIGIN'] });
  assert.equal((await worker.fetch(new Request(origin + '/api/session'), invalidOrigin)).status, 503);
});

test('D1 OAuth consumes a browser-bound state atomically and verifies the LINE identity', async () => {
  const clock = 1800000000000, sub = 'U' + 'a'.repeat(32);
  let authorize, exchanges = 0;
  const lineFetch = async (url, options) => {
    const params = new URLSearchParams(options.body);
    if (url.endsWith('/token')) {
      exchanges++;
      assert.equal(params.get('redirect_uri'), origin + '/auth/line/callback');
      assert.equal(createHash('sha256').update(params.get('code_verifier')).digest('base64url'), authorize.searchParams.get('code_challenge'));
      return Response.json({ id_token: 'verified-by-mock' });
    }
    assert.equal(params.get('nonce'), authorize.searchParams.get('nonce'));
    return Response.json({ iss: 'https://access.line.me', aud: '2011516015', nonce: params.get('nonce'), exp: clock / 1000 + 3600, sub, name: 'LINE ทดสอบ' });
  };
  const worker = createWorker({ now: () => clock, lineFetch });
  const env = { DB, APP_ORIGIN: origin, LINE_CHANNEL_ID: '2011516015', LINE_CHANNEL_SECRET: 'test-only' };
  const start = await worker.fetch(new Request(origin + '/auth/line/start', { headers: { 'X-Forwarded-Host': 'evil.test' } }), env);
  authorize = new URL(start.headers.get('Location'));
  const cookie = start.headers.getSetCookie()[0].split(';')[0];
  assert.match(start.headers.getSetCookie()[0], /HttpOnly; SameSite=Lax; Secure/);
  assert.equal(authorize.searchParams.get('redirect_uri'), origin + '/auth/line/callback');
  const url = origin + '/auth/line/callback?code=test-code&state=' + authorize.searchParams.get('state');
  assert.equal((await worker.fetch(new Request(url), env)).headers.get('Location'), '/?login_error=1');
  const callbacks = await Promise.all([1, 2].map(() => worker.fetch(new Request(url, { headers: { Cookie: cookie } }), env)));
  assert.equal(exchanges, 1);
  assert.equal(callbacks.filter((r) => r.headers.get('Location') === '/').length, 1);
  const success = callbacks.find((r) => r.headers.get('Location') === '/');
  const sessionCookie = success.headers.getSetCookie().find((s) => s.startsWith('mk_session=')).split(';')[0];
  const session = await (await worker.fetch(new Request(origin + '/api/session', { headers: { Cookie: sessionCookie } }), env)).json();
  assert.equal(session.user.lineName, 'LINE ทดสอบ');
  assert.equal(session.user.profileComplete, false);
  assert.equal(session.user.admin, false);
  assert.equal((await worker.fetch(new Request(url, { headers: { Cookie: cookie } }), env)).headers.get('Location'), '/?login_error=1');
  const preview = await worker.fetch(new Request('https://preview.test/auth/line/start'), env);
  assert.equal(preview.headers.get('Location'), origin + '/auth/line/start');
  assert.equal(preview.headers.has('Set-Cookie'), false);
});

test('D1 rejects an ID token for another channel and an invalid configured origin', async () => {
  let nonce;
  const worker = createWorker({ lineFetch: async (url) => url.endsWith('/token') ? Response.json({ id_token: 'test' }) : Response.json({
    iss: 'https://access.line.me', aud: 'other-channel', nonce, exp: Date.now() / 1000 + 300, sub: 'U' + 'b'.repeat(32)
  }) });
  const env = { DB, APP_ORIGIN: origin, LINE_CHANNEL_ID: '2011516015', LINE_CHANNEL_SECRET: 'test-only' };
  const start = await worker.fetch(new Request(origin + '/auth/line/start'), env);
  const auth = new URL(start.headers.get('Location')); nonce = auth.searchParams.get('nonce');
  const response = await worker.fetch(new Request(origin + '/auth/line/callback?code=test&state=' + auth.searchParams.get('state'), {
    headers: { Cookie: start.headers.getSetCookie()[0].split(';')[0] }
  }), env);
  assert.equal(response.headers.get('Location'), '/?login_error=1');
  assert.equal(response.headers.getSetCookie().some((s) => s.startsWith('mk_session=')), false);
  assert.equal((await worker.fetch(new Request(origin + '/api/session'), { ...env, APP_ORIGIN: 'http://evil.test/' })).status, 503);
});

test('D1 requires contact consent, same-origin CSRF and an explicit administrator', async (t) => {
  const f = await fixture(t, { profile: false });
  assert.equal((await f.request('/api/runs', {})).status, 403);
  const data = { name: 'ผู้เล่นใหม่', phone: '+66 81 234 5678', consent: true };
  assert.equal((await f.request('/api/profile', data, { 'X-CSRF-Token': 'wrong' })).status, 403);
  assert.equal((await f.request('/api/profile', data, { Origin: 'https://evil.test' })).status, 403);
  assert.equal((await f.request('/api/profile', { ...data, consent: false })).status, 400);
  assert.equal((await f.request('/api/profile', { ...data, phone: 'wrong' })).status, 400);
  const saved = await f.request('/api/profile', data);
  assert.equal(saved.body.user.phone, '0812345678'); assert.equal(saved.body.user.profileComplete, true);
  assert.equal((await f.request('/api/admin/players')).status, 403);
  assert.equal((await f.request('/api/profile', { ...data, name: 'x'.repeat(9000) })).status, 413);
  assert.equal((await f.request('/api/logout', {})).status, 200);
  assert.equal((await f.request('/api/runs', {})).status, 401);
});

test('D1 concurrent retries, conflicting events and new-game races never double count or save stale events', async (t) => {
  const f = await fixture(t);
  const run = (await f.request('/api/runs', {})).body.id;
  const path = `/api/runs/${run}/events`;
  assert.equal((await f.request(path, { eventId: randomUUID(), seq: 1, type: 'begin', level: 0 })).status, 200);
  const miss = { eventId: randomUUID(), seq: 2, type: 'miss' };
  const duplicates = await Promise.all(Array.from({ length: 6 }, () => f.request(path, miss)));
  for (const r of duplicates) { assert.equal(r.status, 200); assert.equal(r.body.misses, 1); }
  const conflicting = await Promise.all([1, 2].map(() => f.request(path, { eventId: randomUUID(), seq: 3, type: 'miss' })));
  assert.deepEqual(conflicting.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await DB.prepare('SELECT misses FROM runs WHERE id=?').bind(run).first()).misses, 2);
  assert.equal((await f.request(path, { ...miss, type: 'pause' })).status, 409);
  const other = await fixture(t);
  assert.equal((await other.request(path, miss)).status, 404);
  // Force a restart after the stale request's read, before its conditional
  // transaction. This would insert a spurious event without the revision guard.
  let intercepted = false;
  const originalDB = f.env.DB;
  f.env.DB = { withSession: (...args) => {
    const db = originalDB.withSession(...args);
    return { prepare: db.prepare.bind(db), batch: async (statements) => {
      if (statements.length === 3 && !intercepted) {
        intercepted = true;
        await DB.prepare("UPDATE runs SET status='abandoned' WHERE id=?").bind(run).run();
      }
      return db.batch(statements);
    } };
  } };
  const staleId = randomUUID();
  assert.equal((await f.request(path, { eventId: staleId, seq: 4, type: 'miss' })).status, 409);
  assert.equal(await DB.prepare('SELECT * FROM events WHERE event_id=?').bind(staleId).first(), null);
  assert.equal((await DB.prepare('SELECT misses FROM runs WHERE id=?').bind(run).first()).misses, 2);
});

test('D1 limits concurrent new games atomically to ten per minute and one active game', async (t) => {
  const f = await fixture(t);
  const responses = await Promise.all(Array.from({ length: 12 }, () => f.request('/api/runs', {})));
  assert.equal(responses.filter((r) => r.status === 201).length, 10);
  assert.equal(responses.filter((r) => r.status === 429).length, 2);
  assert.equal((await DB.prepare("SELECT COUNT(*) n FROM runs WHERE user_id=? AND status='active'").bind(f.id).first()).n, 1);
});

test('real game client registers and completes all three stages against D1, including penalty and stable final retry', async (t) => {
  const f = await fixture(t, { profile: false });
  const dom = new JSDOM(readFileSync(join(root, 'index.html'), 'utf8'), { runScripts: 'outside-only', url: origin, pretendToBeVisual: true });
  const w = dom.window; t.after(() => w.close());
  let finalEvent, finalPath;
  w.AbortSignal = AbortSignal;
  w.fetch = async (path, options = {}) => {
    const data = options.body ? JSON.parse(options.body) : undefined;
    if (data?.type === 'hit' && data.answer === levels[2].differences.at(-1).id) { finalEvent = data; finalPath = '/' + path; }
    return f.raw('/' + path, data);
  };
  w.performance.now = f.now;
  w.setInterval = () => 1; w.clearInterval = () => {};
  Object.defineProperty(w.HTMLImageElement.prototype, 'naturalWidth', { get: () => 1536 });
  Object.defineProperty(w.HTMLImageElement.prototype, 'naturalHeight', { get: () => 1024 });
  Object.defineProperty(w.HTMLImageElement.prototype, 'complete', { get: () => true });
  const $ = (s) => w.document.querySelector(s);
  const until = async (condition) => {
    const deadline = Date.now() + 10000;
    while (!condition()) { if (Date.now() > deadline) throw new Error('Client did not reach expected state'); await new Promise((done) => setTimeout(done, 10)); }
  };
  for (const file of ['levels.js', 'account.js', 'app.js']) w.eval(readFileSync(join(root, file), 'utf8'));
  await w.MAKRO_ACCOUNT.ready;
  assert.equal($('#popupStartButton').disabled, true);
  $('#playerName').value = 'ผู้เล่น Cloudflare'; $('#playerPhone').value = '0812345678'; $('#playerConsent').checked = true;
  $('#playerForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => w.MAKRO_ACCOUNT.state.user.profileComplete);
  $('#popupStartButton').click();
  await until(() => $('.pictures').dataset.state === 'playing');
  for (let i = 0; i < 3; i++) {
    f.tick(10000);
    if (i === 0) $('#playScene').click();
    for (const answer of levels[i].differences) $(`#playScene [data-id="${answer.id}"]`).click();
    if (i < 2) { assert.equal($('.pictures').dataset.state, 'transition'); await until(() => $('.pictures').dataset.state === 'playing'); }
  }
  await until(() => $('#saveScoreStatus').textContent.startsWith('บันทึกแล้ว'));
  assert.match($('#saveScoreStatus').textContent, /00:35.00/);
  await until(() => $('#leaderboardRows').textContent.includes('ผู้เล่น Cloudflare') && $('#personalCompleted').textContent === '1 ครั้ง');
  assert.match($('#leaderboardRows').textContent, /ผู้เล่น Cloudflare/);
  assert.equal($('#leaderboardRows').textContent.includes('0812345678'), false);
  assert.equal($('#personalBest').textContent, '00:35.00');
  assert.equal($('#resultFound').textContent, '15 / 15');
  await until(() => $('#resultRank').textContent === '#1');
  assert.match($('#resultBoardRows .is-me').textContent, /ผู้เล่น Cloudflare \(คุณ\)/);
  assert.equal($('#resultViewStats').hidden, false);
  $('#resultViewStats').click();
  assert.equal($('#resultModal').hidden, true);
  assert.equal($('#startModal').hidden, true);
  assert.equal($('main').inert, false);
  assert.equal(w.document.activeElement.id, 'personalStats');
  await w.MAKRO_ACCOUNT.refreshPersonalStats();
  const retry = await f.request(finalPath, finalEvent);
  assert.equal(retry.status, 200); assert.equal(retry.body.scoreMs, 35000); assert.equal(retry.body.misses, 1);
  assert.deepEqual((await f.request(finalPath, finalEvent)).body, retry.body);
  // A new page has no in-memory run or result; it restores history from D1.
  const fresh = new JSDOM(readFileSync(join(root, 'index.html'), 'utf8'), { runScripts: 'outside-only', url: origin });
  t.after(() => fresh.window.close());
  fresh.window.AbortSignal = AbortSignal;
  fresh.window.fetch = (path) => f.raw('/' + path);
  fresh.window.eval(readFileSync(join(root, 'account.js'), 'utf8'));
  await fresh.window.MAKRO_ACCOUNT.ready;
  await until(() => fresh.window.document.querySelector('#personalCompleted').textContent === '1 ครั้ง');
  assert.equal(fresh.window.document.querySelector('#personalBest').textContent, '00:35.00');
  assert.match(fresh.window.document.querySelector('#personalHistoryRows').textContent, /บันทึกแล้ว.*00:35.00/);
});

test('D1 public top ten keeps one best time per player and exports contacts only to admins', async (t) => {
  const admin = await fixture(t, { admin: true });
  let lastPlayer;
  for (let i = 0; i < 12; i++) {
    const f = await fixture(t);
    lastPlayer = f;
    await DB.prepare('UPDATE users SET name=? WHERE id=?').bind(i === 0 ? '=formula test' : `ผู้เล่น ${i}`, f.id).run();
    for (const score of [10000 + i * 1000, 90000]) {
      await DB.prepare("INSERT INTO runs(id,user_id,status,phase,score_ms,misses,created_at,completed_at) VALUES(?,?,'complete','finished',?,0,?,?)")
        .bind(randomUUID(), f.id, score, f.now(), f.now()).run();
    }
  }
  const board = (await admin.request('/api/leaderboard')).body.entries;
  assert.equal(board.length, 10); assert.equal(board[0].scoreMs, 10000); assert.equal(board[9].scoreMs, 19000);
  assert.deepEqual(Object.keys(board[0]).sort(), ['misses', 'name', 'scoreMs']);
  const personalResponse = await lastPlayer.raw('/api/me/stats');
  assert.equal(personalResponse.headers.get('Cache-Control'), 'no-store');
  const personal = await personalResponse.json();
  assert.equal(personal.rank, 12);
  assert.equal(personal.bestScoreMs, 21000);
  assert.equal(personal.completedRuns, 2);
  assert.equal(personal.recentRuns.length, 2);
  assert.deepEqual(Object.keys(personal.recentRuns[0]).sort(), ['completedAt', 'createdAt', 'foundCount', 'level', 'misses', 'rulesVersion', 'scoreMs', 'status']);
  assert.deepEqual((await admin.request('/api/me/stats?user_id=' + lastPlayer.id)).body,
    { completedRuns: 0, bestScoreMs: null, rank: null, recentRuns: [] });
  assert.equal((await lastPlayer.request('/api/me/stats', undefined, { Cookie: '' })).status, 401);
  const players = (await admin.request('/api/admin/players')).body.players;
  assert.equal(players.some((p) => p.phone === '0812345678'), true);
  const csv = await (await admin.raw('/api/admin/export')).text();
  assert.ok(csv.includes('"\'=formula test"')); assert.ok(csv.includes('0812345678'));
});

test('D1 data survives Worker and local runtime restarts', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'makro-d1-persist-'));
  const options = { cf: false, modules: true, script: bundle, compatibilityDate: '2026-07-30', d1Databases: { DB: 'persistent-test' }, d1Persist: directory };
  let runtime;
  try {
    runtime = new Miniflare(options);
    let db = await runtime.getD1Database('DB');
    await db.batch(schema.split(';').map((s) => s.trim()).filter(Boolean).map((s) => db.prepare(s)));
    await db.prepare('INSERT INTO users(id,line_sub,line_name,created_at) VALUES(?,?,?,?)').bind('persisted', 'U' + 'f'.repeat(32), 'ข้อมูลคงอยู่', Date.now()).run();
    await runtime.dispose(); runtime = new Miniflare(options); db = await runtime.getD1Database('DB');
    assert.equal((await db.prepare('SELECT line_name FROM users WHERE id=?').bind('persisted').first()).line_name, 'ข้อมูลคงอยู่');
  } finally { await runtime?.dispose(); rmSync(directory, { recursive: true, force: true }); }
});

test('90-second D1 rounds keep partial finds, reject pausing and acknowledge taps that arrive after expiry', async (t) => {
  const f = await fixture(t);
  const created = await f.request('/api/runs', { rulesVersion: 2 });
  assert.equal(created.status, 201); assert.equal(created.body.levelMs, 90000);
  const path = `/api/runs/${created.body.id}/events`;
  let seq = 0;
  const send = async (type, level, data = {}) => {
    const event = { eventId: randomUUID(), seq: ++seq, type, level, ...data };
    const response = await f.request(path, event); assert.equal(response.status, 200, JSON.stringify(response.body));
    return { event, result: response.body };
  };
  await send('begin', 0); f.tick(10000);
  await send('hit', 0, { answer: levels[0].differences[0].id });
  await send('hit', 0, { answer: levels[0].differences[1].id });
  await send('miss', 0);
  for (const type of ['pause', 'timeout']) {
    assert.equal((await f.request(path, { eventId: randomUUID(), seq: seq + 1, type, level: 0 })).status, 409);
  }
  f.tick(80000);
  const expired = await send('hit', 0, { answer: levels[0].differences[2].id, scoreMs: 1 });
  assert.equal(expired.result.phase, 'intermission'); assert.equal(expired.result.foundCount, 2);
  await send('timeout', 0);
  await send('begin', 1); f.tick(30000);
  for (const answer of levels[1].differences) await send('hit', 1, { answer: answer.id });
  await send('begin', 2); f.tick(90000);
  const final = await send('timeout', 2);
  assert.equal(final.result.status, 'complete'); assert.equal(final.result.foundCount, 7);
  assert.equal(final.result.scoreMs, 215000); assert.equal(final.result.rank, 1);
  assert.deepEqual(final.result.stages.map((s) => s.foundCount), [2, 5, 0]);
  const late = await send('hit', 2, { answer: levels[2].differences[0].id });
  assert.equal(late.result.foundCount, 7); assert.equal(late.result.scoreMs, 215000);
  assert.deepEqual((await f.request(path, final.event)).body, final.result);
  const personal = (await f.request('/api/me/stats?rulesVersion=2')).body;
  assert.equal(personal.completedRuns, 1); assert.equal(personal.bestFoundCount, 7);
  assert.equal(personal.recentRuns[0].rulesVersion, 2);
  assert.deepEqual((await f.request('/api/leaderboard')).body.entries, []);
});

test('90-second rankings prioritize finds, paginate all players and keep the viewer rank on every page', async (t) => {
  let viewer;
  for (let i = 0; i < 12; i++) {
    const f = await fixture(t); viewer = f;
    await DB.prepare('UPDATE users SET name=? WHERE id=?').bind(`Sprint ${i}`, f.id).run();
    for (const [found, score] of [[15 - i, 200000 + i], [14 - i, 1000]]) {
      await DB.prepare("INSERT INTO runs(id,user_id,status,phase,found,score_ms,misses,created_at,completed_at) VALUES(?,?,'complete','finished',?,?,0,?,?)")
        .bind(randomUUID(), f.id, JSON.stringify({ rulesVersion: 2, totalFound: found, found: [], stages: [] }), score, f.now(), f.now()).run();
    }
  }
  const one = (await viewer.request('/api/leaderboard?rulesVersion=2')).body;
  assert.equal(one.entries.length, 10); assert.equal(one.totalPlayers, 12); assert.equal(one.totalRuns, 24);
  assert.equal(one.entries[0].foundCount, 15); assert.equal(one.entries[0].scoreMs, 200000);
  assert.equal(one.me.rank, 12); assert.equal(one.me.foundCount, 4);
  assert.equal(one.entries.some((r) => r.isMe), false);
  const two = (await viewer.request('/api/leaderboard?rulesVersion=2&page=2')).body;
  assert.equal(two.entries.length, 2); assert.equal(two.entries[1].rank, 12); assert.equal(two.entries[1].isMe, true);
  assert.equal(two.me.rank, 12);
  const own = (await viewer.request('/api/me/stats?rulesVersion=2')).body;
  assert.equal(own.bestFoundCount, 4); assert.equal(own.bestScoreMs, 200011);
  const anonymous = (await viewer.request('/api/leaderboard?rulesVersion=2&page=2', undefined, { Cookie: '' })).body;
  assert.equal(anonymous.me, null); assert.equal(anonymous.entries.some((r) => r.isMe), false);
  assert.deepEqual(Object.keys(anonymous.entries[0]).sort(), ['foundCount', 'isMe', 'misses', 'name', 'rank', 'scoreMs']);
});


test('manual LINE login disables only auto login while retaining OAuth state, nonce and PKCE', async (t) => {
  const f = await fixture(t);
  const normal = await f.raw('/auth/line/start');
  const fallback = await f.raw('/auth/line/start?manual=1');
  const a = new URL(normal.headers.get('Location'));
  const b = new URL(fallback.headers.get('Location'));
  assert.equal(fallback.status, 303);
  assert.equal(a.searchParams.has('disable_auto_login'), false);
  assert.equal(b.searchParams.get('disable_auto_login'), 'true');
  assert.equal(b.origin, 'https://access.line.me');
  assert.equal(b.searchParams.get('redirect_uri'), origin + '/auth/line/callback');
  assert.equal(b.searchParams.get('code_challenge_method'), 'S256');
  for (const key of ['state','nonce','code_challenge']) {
    assert.ok(b.searchParams.get(key));
    assert.notEqual(a.searchParams.get(key), b.searchParams.get(key));
  }
  assert.match(fallback.headers.get('Set-Cookie'), /mk_oauth=.*HttpOnly.*SameSite=Lax.*Secure/);
});

test('LIFF verifies tokens server-side, preserves registered contacts and rejects cross-site or wrong-channel login', async (t) => {
  let identity, calls = 0;
  const f = await fixture(t, { lineFetch: async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.line.me/oauth2/v2.1/verify');
    assert.equal(init.body.get('id_token'), 'fixture-id-token');
    assert.equal(init.body.get('client_id'), '2011516015');
    return Response.json(identity);
  } });
  f.env.LIFF_ID = '2011516015-Fixture';
  const user = await DB.prepare('SELECT * FROM users WHERE id=?').bind(f.id).first();
  identity = { iss:'https://access.line.me', aud:'2011516015', exp:f.now()/1000+300, sub:user.line_sub, name:'Verified LINE name' };
  const config = await f.raw('/api/liff/config');
  const csrf = (await config.json()).csrf;
  const headers = { Cookie:config.headers.get('Set-Cookie').split(';')[0], 'X-CSRF-Token':csrf };
  assert.equal((await f.raw('/api/liff/session',{idToken:'fixture-id-token'}, {...headers, Origin:'https://other.test'})).status,403);
  assert.equal(calls,0);
  const response = await f.raw('/api/liff/session',{idToken:'fixture-id-token',name:'Forged name'},headers);
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.user.name,user.name);
  assert.equal(data.user.phone,user.phone);
  assert.equal(data.user.lineName,'Verified LINE name');
  assert.equal(data.user.profileComplete,true);
  assert.equal(JSON.stringify(data).includes('fixture-id-token'),false);
  assert.match(response.headers.get('Set-Cookie'),/mk_session=.*HttpOnly/);
  identity.aud='wrong-channel';
  assert.equal((await f.raw('/api/liff/session',{idToken:'fixture-id-token'},headers)).status,401);
  identity.aud='2011516015'; identity.exp=0;
  assert.equal((await f.raw('/api/liff/session',{idToken:'fixture-id-token'},headers)).status,401);
  delete f.env.LIFF_ID;
  assert.equal((await f.raw('/api/liff/config')).status,503);
});

test('order rush verifies orders, preserves retry scores, enforces deadlines and ranks daily without exposing contacts', async t => {
 const {orderFor}=await import('../worker/order-game.mjs');
 const f=await fixture(t); const other=await fixture(t);
 assert.equal((await f.request('/api/orders/start',{rulesVersion:3})).status,409,'a ranked run cannot start outside the lobby');
 assert.equal((await f.request('/api/orders/start',{rulesVersion:3,roundId:other.roundId})).status,409,'a player cannot enter a round they were not admitted to');
 const start=await f.request('/api/orders/start',{rulesVersion:3,roundId:f.roundId});assert.equal(start.status,200);let run=start.body;
 assert.equal(run.remaining,90000);assert.equal((await f.request('/api/orders/start',{rulesVersion:3,roundId:f.roundId})).body.id,run.id);
 assert.equal((await other.request('/api/orders/submit',{id:run.id,seq:1,picks:run.order})).status,404);
 assert.equal((await f.request('/api/orders/submit',{id:run.id,seq:1,picks:run.order},{Origin:'https://evil.test'})).status,403);
 f.tick(1000);const event={id:run.id,seq:1,picks:run.order,score:999999};
 const [a,b]=await Promise.all([f.request('/api/orders/submit',event),f.request('/api/orders/submit',event)]);
 assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(a.body.score,290);assert.equal(b.body.score,290);
 f.tick(1000);run=(await f.request('/api/orders/submit',{id:run.id,seq:2,picks:orderFor(run.day,1)})).body;assert.equal(run.score,600);assert.equal(run.best,2);
 f.tick(1000);run=(await f.request('/api/orders/submit',{id:run.id,seq:3,picks:Array(8).fill(0)})).body;assert.equal(run.score,540);assert.equal(run.errors,1);assert.equal(run.combo,0);assert.equal(run.orders,2);assert.equal(run.remaining,82000);assert.equal(run.order[3],0);assert.equal(run.order[7],0);
 assert.equal((await f.request('/api/orders/finish',{id:run.id})).status,409);
 f.tick(90000);const done=await f.request('/api/orders/finish',{id:run.id});assert.equal(done.body.complete,true);
 const late=await f.request('/api/orders/submit',{id:run.id,seq:4,picks:run.order});assert.equal(late.body.score,540);
 const board=(await f.request('/api/orders/board')).body;assert.equal(board.me.rank,1);assert.equal(board.me.score,540);assert.equal(board.entries[0].isMe,1);assert.ok(!JSON.stringify(board).includes('0812345678'));assert.equal(board.entries[0].user_id,undefined);
 await DB.prepare('DELETE FROM order_runs_v3 WHERE user_id IN (?,?)').bind(f.id,other.id).run();
});

test('order rush client plays through D1, retries a lost submit and displays confirmed results',async t=>{
 const f=await fixture(t);const {orderFor,dayOf}=await import('../worker/order-game.mjs');
 const dom=new JSDOM(readFileSync(join(root,'order-game/index.html'),'utf8'),{url:origin+'/order-game/',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
 w.AbortSignal=AbortSignal;w.Date.now=f.now;let onTick;w.setInterval=fn=>{onTick=fn;return 1;};w.clearInterval=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.scrollTo=()=>{};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 let lose=true;w.fetch=async(url,options={})=>{const p=new URL(url,origin+'/order-game/').pathname+new URL(url,origin+'/order-game/').search;const response=await f.raw(p,options.body?JSON.parse(options.body):undefined);if(p.endsWith('/tap')&&lose){lose=false;throw Error('lost response');}return response;};
 const wait=async check=>{for(let i=0;i<150;i++){if(check())return;await new Promise(r=>setTimeout(r,20));}assert.fail('client state timed out');};
 const realFetch=w.fetch;let inflight=0;w.fetch=(...args)=>{inflight++;return realFetch(...args).finally(()=>setTimeout(()=>{inflight--;},20));};
 let socket;w.WebSocket=class{constructor(url){socket=this;this.url=String(url);this.readyState=1;this.sent=[];}send(text){this.sent.push(JSON.parse(text));}};
 const state=extra=>socket.onmessage({data:JSON.stringify({type:'state',serverNow:f.now(),phase:'waiting',readyDeadline:null,count:2,readyCount:0,players:[{name:'ผู้เล่นทดสอบ',ready:false,me:true},{name:'เพื่อน',ready:false,me:false}],roundId:null,startAt:null,endAt:null,you:{ready:false,inRound:false},lastRound:null,...extra})});
 w.eval(readFileSync(join(root,'order-game/game.js'),'utf8'));await wait(()=>socket?.onmessage);assert.equal(socket.url,'wss://game.test/api/lobby/ws');state();await wait(()=>!w.document.getElementById('start').disabled);
 assert.equal(w.document.querySelectorAll('#lobbyPlayers li').length,2);w.document.getElementById('start').click();assert.deepEqual(socket.sent,[{type:'ready',ready:true}]);assert.equal(w.document.getElementById('play').hidden,true,'readying up alone must not start the game');
 state({phase:'round',roundId:f.roundId,startAt:f.now(),endAt:f.now()+90000,you:{ready:true,inRound:true}});await wait(()=>!w.document.getElementById('play').hidden);
 const tap=async index=>{f.tick(1000);w.document.querySelector(`[data-product="${index}"]`).click();await wait(()=>inflight===0);};
 const order=orderFor(dayOf(f.now()),0);await tap(order.findIndex(Boolean));
 await wait(()=>w.document.getElementById('feedback').textContent.includes('ลองยืนยัน'));
 assert.equal(w.document.getElementById('retryTap').hidden,false);w.document.getElementById('retryTap').click();await wait(()=>w.document.getElementById('score').textContent==='290');
 const second=orderFor(dayOf(f.now()),1);await tap(second.findIndex(Boolean));await wait(()=>w.document.getElementById('score').textContent==='600');
 assert.equal(w.document.getElementById('comboBurst').hidden,false);assert.match(w.document.getElementById('comboBurst').textContent,/COMBO ×2/);
 f.tick(90000);onTick();await wait(()=>w.document.getElementById('saveStatus').textContent.includes('อันดับดีที่สุด'));
 assert.equal(w.document.getElementById('result').open,true);assert.equal(w.document.getElementById('resultScore').textContent,'600');assert.equal(w.document.querySelectorAll('.rank-row.mine').length,1);assert.equal(w.document.getElementById('again').disabled,false);
 assert.match(w.document.getElementById('roundTopStatus').textContent,/รอผู้เล่นคนอื่น/);
 state({lastRound:{roundId:f.roundId,failed:false,top:[{rank:1,name:'<b>ผู้ชนะ</b>',score:600,errors:0,orders:2,isMe:true}]}});
 assert.equal(w.document.querySelector('#roundTopRows li.mine span').textContent,'<b>ผู้ชนะ</b>','player names render as text');assert.equal(w.document.getElementById('roundTopStatus').textContent,'');
 w.document.getElementById('again').click();assert.equal(w.document.getElementById('welcome').hidden,false);assert.equal(w.document.getElementById('play').hidden,true);assert.equal(w.document.getElementById('start').textContent,'กดเตรียมพร้อม');
 await wait(()=>inflight===0);
 await DB.prepare('DELETE FROM order_runs_v3 WHERE user_id=?').bind(f.id).run();
});

test('lobby runs in workerd: admin starts an all-ready shared round and only its players can join', async t => {
 const a=await fixture(t),b=await fixture(t),outsider=await fixture(t);
 const connect=async f=>{
  const response=await mf.dispatchFetch(origin+'/api/lobby/ws',{headers:{Upgrade:'websocket',Origin:origin,Cookie:`mk_session=${f.token}`}});
  assert.equal(response.status,101);const ws=response.webSocket;const states=[];ws.addEventListener('message',e=>states.push(JSON.parse(e.data)));ws.accept();return {ws,states};
 };
 const until=async(client,check)=>{for(let i=0;i<200;i++){const hit=client.states.findLast(check);if(hit)return hit;await new Promise(r=>setTimeout(r,20));}assert.fail('lobby state timed out');};
 const start=(f,roundId)=>mf.dispatchFetch(origin+'/api/orders/start',{method:'POST',headers:{Cookie:`mk_session=${f.token}`,Origin:origin,'X-CSRF-Token':f.csrf,'Content-Type':'application/json'},body:JSON.stringify({rulesVersion:3,roundId})});
 assert.equal((await mf.dispatchFetch(origin+'/api/lobby/ws',{headers:{Upgrade:'websocket',Origin:'https://evil.test',Cookie:`mk_session=${a.token}`}})).status,403,'a cross-site page cannot open a player socket');
 assert.equal((await mf.dispatchFetch(origin+'/api/lobby/ws',{headers:{Upgrade:'websocket',Origin:origin}})).status,401);
 await DB.prepare('UPDATE users SET name=? WHERE id=?').bind('Waiting outsider',outsider.id).run();
 const first=await connect(a),second=await connect(b),third=await connect(outsider);
 await until(first,s=>s.count===3);assert.ok(!JSON.stringify(first.states).includes('0812345678'),'contact numbers never reach the lobby');
 first.ws.send(JSON.stringify({type:'ready',ready:true}));await until(second,s=>s.readyCount===1);assert.equal(second.states.at(-1).phase,'waiting');
 const adminStart=(key='live-board-test',requestOrigin=origin)=>mf.dispatchFetch(origin+'/api/admin/start',{method:'POST',headers:{Origin:requestOrigin,'X-Admin-Key':key}});
 assert.equal((await adminStart('wrong')).status,401);
 assert.equal((await adminStart('live-board-test','https://evil.test')).status,403);
 assert.equal((await adminStart()).status,409,'cannot start with an unready player');
 second.ws.send(JSON.stringify({type:'ready',ready:true}));
 await until(first,s=>s.readyCount===2);assert.equal(first.states.at(-1).phase,'waiting');
 const readyStatus=await (await mf.dispatchFetch(origin+'/api/admin/live',{headers:{'X-Admin-Key':'live-board-test'}})).json();assert.equal(readyStatus.canStart,false);
 const remove=(playerId,key='live-board-test',requestOrigin=origin)=>mf.dispatchFetch(origin+'/api/admin/remove-player',{method:'POST',headers:{Origin:requestOrigin,'X-Admin-Key':key,'Content-Type':'application/json'},body:JSON.stringify({playerId})});
 const unready=readyStatus.players.find(p=>p.name==='Waiting outsider'),readyPlayer=readyStatus.players.find(p=>p.ready);
 assert.equal((await remove(unready.id,'wrong')).status,401);assert.equal((await remove(unready.id,'live-board-test','https://evil.test')).status,403);
 assert.equal((await remove(readyPlayer.id)).status,409);assert.equal((await remove('bad-id')).status,400);
 assert.equal((await remove(unready.id)).status,200);await until(first,s=>s.count===2&&s.readyCount===2);
 await until(third,s=>s.removed===true);third.ws.close();
 const afterRemoval=await (await mf.dispatchFetch(origin+'/api/admin/live',{headers:{'X-Admin-Key':'live-board-test'}})).json();assert.equal(afterRemoval.canStart,true);

 const starts=await Promise.all([adminStart(),adminStart()]);assert.deepEqual(starts.map(r=>r.status).sort(),[200,409]);assert.equal((await adminStart()).status,409);
 const roundA=await until(first,s=>s.phase==='round'),roundB=await until(second,s=>s.phase==='round');
 assert.equal(roundA.roundId,roundB.roundId);assert.equal(roundA.startAt,roundB.startAt);assert.equal(roundA.you.inRound,true);
 const run=await start(a,roundA.roundId);assert.equal(run.status,200);const body=await run.json();assert.ok(body.id.startsWith(`round:${roundA.roundId}:`));assert.equal(body.deadline,roundA.endAt);
 assert.equal((await start(outsider,roundA.roundId)).status,409);
 const live=key=>mf.dispatchFetch(origin+'/api/admin/live',{headers:key===undefined?{}:{'X-Admin-Key':key}});
 assert.equal((await live()).status,401);assert.equal((await live('wrong')).status,401);
 const board=await (await live('live-board-test')).json();
 assert.equal(board.live,true);assert.equal(board.roundId,roundA.roundId);assert.equal(board.round.count,2);assert.equal(board.scores.length,1);
 assert.deepEqual(board.scores[0],{name:'ผู้เล่นทดสอบ',score:0,orders:0,errors:0,combo:0,best:0,finished:false,rank:1});
 assert.ok(!JSON.stringify(board).includes('0812345678'),'contact numbers never reach the live board');assert.ok(!JSON.stringify(board).includes(a.id),'user ids never reach the live board');
 first.ws.close();second.ws.close();
 await DB.prepare('DELETE FROM order_runs_v3 WHERE user_id IN (?,?)').bind(a.id,b.id).run();
});


test('expired products deduct time and points only once, never appear in orders, and weight variants are distinct',async t=>{
 const {orderFor}=await import('../worker/order-game.mjs');const f=await fixture(t);let r=(await f.request('/api/orders/start',{rulesVersion:3,roundId:f.roundId})).body;
 for(let i=0;i<50;i++){const o=orderFor(r.day,i);assert.equal(o[3],0);assert.equal(o[7],0);}
 f.tick(1000);r=(await f.request('/api/orders/submit',{id:r.id,seq:1,picks:r.order})).body;assert.equal(r.score,290);
 f.tick(1000);const p=Array(8).fill(0);p[3]=1;const bad={id:r.id,seq:2,picks:p};r=(await f.request('/api/orders/submit',bad)).body;assert.equal(r.score,190);assert.equal(r.remaining,80000);assert.equal(r.errors,1);assert.equal(r.combo,0);
 const retry=(await f.request('/api/orders/submit',bad)).body;assert.equal(retry.deadline,r.deadline);assert.equal(retry.errors,1);
 const swapped=[...r.order];const pair=[[0,1],[4,5]].find(([a,b])=>swapped[a]!==swapped[b]);if(pair){const[a,b]=pair;[swapped[a],swapped[b]]=[swapped[b],swapped[a]];f.tick(1000);const wrong=(await f.request('/api/orders/submit',{id:r.id,seq:3,picks:swapped})).body;assert.equal(wrong.orders,r.orders);assert.equal(wrong.errors,2);assert.equal(wrong.deadline,r.deadline-5000);}
 await DB.prepare('DELETE FROM order_runs_v3 WHERE user_id=?').bind(f.id).run();
});

test('equal completed orders earn different speed scores, and errors cannot restart the bonus clock',async t=>{
 const fast=await fixture(t),slow=await fixture(t);const a=(await fast.request('/api/orders/start',{rulesVersion:3,roundId:fast.roundId})).body,b=(await slow.request('/api/orders/start',{rulesVersion:3,roundId:slow.roundId})).body;
 fast.tick(5000);slow.tick(10000);
 const f=(await fast.request('/api/orders/submit',{id:a.id,seq:1,picks:a.order})).body;
 const s=(await slow.request('/api/orders/submit',{id:b.id,seq:1,picks:b.order})).body;
 assert.equal(f.orders,s.orders);assert.equal(f.score,250);assert.equal(s.score,200);assert.equal(f.speedTotal,150);assert.equal(s.speedTotal,100);
 fast.tick(3000);await fast.request('/api/orders/submit',{id:a.id,seq:2,picks:Array(8).fill(0)});fast.tick(2000);
 const next=(await fast.request('/api/orders/submit',{id:a.id,seq:3,picks:f.order})).body;assert.equal(next.speedTotal,300);
 await DB.prepare('DELETE FROM order_runs_v3 WHERE user_id IN (?,?)').bind(fast.id,slow.id).run();
});

test('guests join with a display name instead of LINE and can enter the lobby round', async t => {
 const f=await fixture(t);
 const guest=(body,headers={})=>f.worker.fetch(new Request(origin+'/api/guest',{method:'POST',body:JSON.stringify(body),headers:{Origin:origin,'Content-Type':'application/json',...headers}}),f.env);
 assert.equal((await guest({name:'มะม่วง'},{Origin:'https://evil.test'})).status,403,'another site cannot create a player');
 assert.equal((await guest({name:'x'})).status,400);
 assert.equal((await guest({name:'a\u202eb'})).status,400);
 const made=await guest({name:'  น้อง   มะม่วง '});assert.equal(made.status,201);
 const {user,csrf}=await made.json();assert.equal(user.name,'น้อง มะม่วง');assert.equal(user.phone,'');assert.equal(user.admin,false);
 const token=/mk_session=([^;]+)/.exec(made.headers.get('Set-Cookie'))[1];
 assert.match(made.headers.get('Set-Cookie'),/HttpOnly/);
 const as=(path,data)=>f.worker.fetch(new Request(origin+path,{method:data===undefined?'GET':'POST',body:data===undefined?undefined:JSON.stringify(data),headers:{Cookie:`mk_session=${token}`,Origin:origin,'X-CSRF-Token':csrf,'Content-Type':'application/json'}}),f.env);
 const me=await (await as('/api/session')).json();assert.equal(me.user.name,'น้อง มะม่วง');assert.equal(me.csrf,csrf);
 const again=await (await as('/api/guest',{name:'ชื่ออื่น'})).json();assert.equal(again.user.name,'น้อง มะม่วง','an existing session is reused, not duplicated');
 const run=await as('/api/orders/start',{rulesVersion:3,roundId:f.roundId});assert.equal(run.status,200);
 const admin=await (await f.worker.fetch(new Request(origin+'/api/admin/players',{headers:{Cookie:`mk_session=${token}`}}),f.env));assert.equal(admin.status,403);
 const row=await DB.prepare("SELECT id FROM users WHERE line_sub LIKE 'guest:%' AND name=?").bind('น้อง มะม่วง').first();
 await DB.batch([DB.prepare('DELETE FROM order_runs_v3 WHERE user_id=?').bind(row.id),DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(row.id),DB.prepare('DELETE FROM users WHERE id=?').bind(row.id)]);
});

test('order rush shows a name form when not signed in and continues into the lobby', async t => {
 const dom=new JSDOM(readFileSync(join(root,'order-game/index.html'),'utf8'),{url:origin+'/order-game/',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
 w.AbortSignal=AbortSignal;w.scrollTo=()=>{};let signedIn=false,sentName=null,socket=null;
 w.WebSocket=class{constructor(){socket=this;this.readyState=1;}send(){}};
 w.fetch=async(url,options={})=>{
  if(url.includes('api/guest')){sentName=JSON.parse(options.body).name;signedIn=true;return Response.json({user:{name:sentName},csrf:'c'},{status:201});}
  if(url.includes('api/session'))return Response.json(signedIn?{user:{name:sentName},csrf:'c'}:{user:null,csrf:''});
  return Response.json({entries:[],total:0,page:1,day:'2026-11-10'});
 };
 const wait=async check=>{for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}assert.fail('client state timed out');};
 w.eval(readFileSync(join(root,'order-game/game.js'),'utf8'));
 await wait(()=>!w.document.getElementById('guestForm').hidden);
 assert.equal(w.document.getElementById('start').hidden,true);assert.equal(socket,null,'no lobby connection before a player exists');
 w.document.getElementById('guestName').value='ผู้เล่นใหม่';w.document.getElementById('guestForm').dispatchEvent(new w.Event('submit',{cancelable:true}));
 await wait(()=>socket!==null);
 assert.equal(sentName,'ผู้เล่นใหม่');assert.equal(w.document.getElementById('guestForm').hidden,true);assert.equal(w.document.getElementById('start').hidden,false);
 assert.match(w.document.getElementById('identity').textContent,/ผู้เล่นใหม่/);
 await wait(()=>w.document.getElementById('myRank').textContent!=='');
});
test('live board needs the admin password secret and renders scores as text', async t => {
 const f=await fixture(t);
 const res=await f.worker.fetch(new Request(origin+'/api/admin/live',{headers:{'X-Admin-Key':'anything'}}),f.env);
 assert.equal(res.status,503,'no password configured means no access at all');
 const dom=new JSDOM(readFileSync(join(root,'live.html'),'utf8'),{url:origin+'/live.html',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
 const now=Date.now();let sentKey=null,status=401;
 w.fetch=async(url,options)=>{sentKey=options.headers['X-Admin-Key'];if(status!==200)return Response.json({error:'รหัสผ่านไม่ถูกต้อง'},{status});
  return Response.json({serverNow:now,live:true,roundId:'r',phase:'round',readyDeadline:null,count:3,readyCount:0,players:[{name:'คนรอ',ready:false}],round:{id:'r',startAt:now-10000,endAt:now+80000,count:2},lastRound:null,
   scores:[{rank:1,name:'<img src=x onerror=alert(1)>',score:540,orders:3,errors:1,combo:2,best:2,finished:false},{rank:2,name:'สอง',score:100,orders:1,errors:0,combo:1,best:1,finished:true}]});};
 const wait=async check=>{for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}assert.fail('live board timed out');};
 w.eval(readFileSync(join(root,'live.js'),'utf8'));
 assert.equal(w.document.getElementById('board').hidden,true);
 w.document.getElementById('password').value='bad';w.document.getElementById('login').dispatchEvent(new w.Event('submit',{cancelable:true}));
 await wait(()=>w.document.getElementById('loginError').textContent!=='');assert.equal(sentKey,'bad');assert.equal(w.document.getElementById('board').hidden,true);
 status=200;w.document.getElementById('password').value='good';w.document.getElementById('login').dispatchEvent(new w.Event('submit',{cancelable:true}));
 await wait(()=>w.document.querySelectorAll('#rows tr').length===2);
 assert.equal(sentKey,'good');assert.equal(w.document.querySelector('#rows img'),null,'player names are never parsed as HTML');
 assert.equal(w.document.getElementById('leaderName').textContent,'<img src=x onerror=alert(1)>');assert.equal(w.document.getElementById('leaderScore').textContent,'540 คะแนน');
 assert.equal(w.document.getElementById('phase').textContent,'กำลังแข่งอยู่');assert.match(w.document.getElementById('clock').textContent,/^01:(19|20)$/);
 assert.match(w.document.querySelectorAll('#rows tr')[1].textContent,/จบแล้ว/);assert.match(w.document.getElementById('waitingTitle').textContent,/3 คน/);
 w.document.getElementById('logout').click();assert.equal(w.document.getElementById('board').hidden,true);assert.equal(w.sessionStorage.getItem('mk_admin_key'),null);
});
test('direct taps are authoritative, idempotent, preserve partial progress and finish orders automatically',async t=>{
 const f=await fixture(t),other=await fixture(t);let r=(await f.request('/api/orders/start',{rulesVersion:3,roundId:f.roundId})).body;
 const send=product=>f.request('/api/orders/tap',{id:r.id,seq:r.seq+1,product,score:999999});
 assert.equal((await other.request('/api/orders/tap',{id:r.id,seq:1,product:0})).status,404);
 assert.equal((await send(8)).status,400);
 for(let n=0;n<3;n++){
  f.tick(1000);const event={id:r.id,seq:r.seq+1,product:r.order.findIndex(Boolean)};
  const [a,b]=await Promise.all([f.request('/api/orders/tap',event),f.request('/api/orders/tap',event)]);
  assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(a.body.orders,n+1);assert.equal(b.body.score,a.body.score);r=a.body;
 }
 const product=r.order.findIndex(Boolean);assert.equal(r.order[product],2);
 f.tick(1000);r=(await send(product)).body;assert.equal(r.orders,3);assert.equal(r.picks[product],1);assert.equal(r.accepted,true);
 const resumed=(await f.request('/api/orders/start',{rulesVersion:3,roundId:f.roundId})).body;assert.deepEqual(resumed.picks,r.picks);
 const score=r.score,deadline=r.deadline;f.tick(100);r=(await send(7)).body;
 assert.equal(r.accepted,false);assert.equal(r.score,score-100);assert.equal(r.deadline,deadline-8000);assert.equal(r.picks[product],1);assert.equal(r.combo,0);
 f.tick(100);r=(await send(product)).body;assert.equal(r.orders,4);assert.deepEqual(r.picks,Array(8).fill(0));
 f.tick(90000);const late=(await send(r.order.findIndex(Boolean))).body;assert.equal(late.complete,true);assert.equal(late.score,r.score);assert.equal(late.orders,4);
});

test('batched rapid taps validate each touch and replay atomically without crossing orders',async t=>{
 const f=await fixture(t);let r=(await f.request('/api/orders/start',{rulesVersion:3,roundId:f.roundId})).body;
 for(let n=0;n<3;n++){f.tick(1000);r=(await f.request('/api/orders/tap',{id:r.id,seq:r.seq+1,product:r.order.findIndex(Boolean)})).body;}
 const product=r.order.findIndex(Boolean),score=r.score;
 f.tick(1000);const event={id:r.id,seq:r.seq+1,products:[7,product,product,7]};
 const responses=await Promise.all([f.request('/api/orders/tap',event),f.request('/api/orders/tap',event)]);
 assert.ok(responses.every(x=>x.status===200));assert.deepEqual(responses[0].body,responses[1].body);r=responses[0].body;
 assert.equal(r.orders,4);assert.equal(r.errors,1,'extra touches after completion never enter the next order');assert.equal(r.combo,1);assert.ok(r.score<score+300);assert.deepEqual(r.picks,Array(8).fill(0));
 assert.equal((await f.request('/api/orders/tap',{...event,products:[product,7,product]})).status,409,'a different batch cannot replay the same sequence');
 assert.equal((await f.request('/api/orders/tap',{id:r.id,seq:r.seq+1,products:Array(13).fill(product)})).status,400);
});
