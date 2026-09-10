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
  mf = new Miniflare({ modules: true, script: bundle, compatibilityDate: '2026-07-30', d1Databases: ['DB'], bindings: { APP_ORIGIN: origin, LINE_CHANNEL_ID: '2011516015' } });
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
  const env = { DB, APP_ORIGIN: origin, LINE_CHANNEL_ID: '2011516015', LINE_CHANNEL_SECRET: 'test-only', ADMIN_LINE_USER_IDS: admin ? sub : '' };
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
  return { id, token, csrf, env, worker, request, raw, tick: (ms) => { clock += ms; }, now: () => clock };
}

test('bundled Worker runs in workerd with real D1 and never enables LINE without its secret', async () => {
  const response = await mf.dispatchFetch(origin + '/api/session');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { lineReady: false, csrf: '', user: null, penaltyMs: 5000 });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await mf.dispatchFetch(origin + '/auth/line/start')).status, 503);
  assert.equal((await mf.dispatchFetch(origin + '/api/admin/players')).status, 401);
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
    if (i < 2) { $('#playAgain').click(); await until(() => $('.pictures').dataset.state === 'playing'); }
  }
  await until(() => $('#saveScoreStatus').textContent.startsWith('บันทึกแล้ว'));
  assert.match($('#saveScoreStatus').textContent, /00:35.00/);
  assert.match($('#leaderboardRows').textContent, /ผู้เล่น Cloudflare/);
  assert.equal($('#leaderboardRows').textContent.includes('0812345678'), false);
  const retry = await f.request(finalPath, finalEvent);
  assert.equal(retry.status, 200); assert.equal(retry.body.scoreMs, 35000); assert.equal(retry.body.misses, 1);
  assert.deepEqual((await f.request(finalPath, finalEvent)).body, retry.body);
});

test('D1 public top ten keeps one best time per player and exports contacts only to admins', async (t) => {
  const admin = await fixture(t, { admin: true });
  for (let i = 0; i < 12; i++) {
    const f = await fixture(t);
    await DB.prepare('UPDATE users SET name=? WHERE id=?').bind(i === 0 ? '=formula test' : `ผู้เล่น ${i}`, f.id).run();
    for (const score of [10000 + i * 1000, 90000]) {
      await DB.prepare("INSERT INTO runs(id,user_id,status,phase,score_ms,misses,created_at,completed_at) VALUES(?,?,'complete','finished',?,0,?,?)")
        .bind(randomUUID(), f.id, score, f.now(), f.now()).run();
    }
  }
  const board = (await admin.request('/api/leaderboard')).body.entries;
  assert.equal(board.length, 10); assert.equal(board[0].scoreMs, 10000); assert.equal(board[9].scoreMs, 19000);
  assert.deepEqual(Object.keys(board[0]).sort(), ['misses', 'name', 'scoreMs']);
  const players = (await admin.request('/api/admin/players')).body.players;
  assert.equal(players.some((p) => p.phone === '0812345678'), true);
  const csv = await (await admin.raw('/api/admin/export')).text();
  assert.ok(csv.includes('"\'=formula test"')); assert.ok(csv.includes('0812345678'));
});

test('D1 data survives Worker and local runtime restarts', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'makro-d1-persist-'));
  const options = { modules: true, script: bundle, compatibilityDate: '2026-07-30', d1Databases: { DB: 'persistent-test' }, d1Persist: directory };
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
