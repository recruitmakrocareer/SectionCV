const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, mkdtempSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { createHash } = require('node:crypto');
const { JSDOM } = require('jsdom');
const { createApp } = require('../server/index.cjs');
const levels = require('../levels.js');
const root = resolve(__dirname, '..');

test('the real client registers a player, plays three stages and shows the server-saved ranking', async (t) => {
  let clock = 1800000000000;
  const dataDir = mkdtempSync(join(tmpdir(), 'makro-flow-'));
  const app = createApp({ dataDir, now: () => clock, env: { APP_ORIGIN: 'http://game.test', LINE_CHANNEL_ID: 'test', LINE_CHANNEL_SECRET: 'test-only' } });
  // A fixture represents the session issued after the separately tested LINE flow.
  app.db.prepare('INSERT INTO users(id,line_sub,line_name,created_at) VALUES(?,?,?,?)').run('fixture-player', 'U' + 'c'.repeat(32), 'LINE fixture', clock);
  app.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(createHash('sha256').update('fixture-cookie').digest('hex'), 'fixture-player', 'fixture-csrf', clock + 86400000);
  await new Promise((done) => app.server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const dom = new JSDOM(readFileSync(join(root, 'index.html'), 'utf8'), { runScripts: 'outside-only', url: 'http://game.test', pretendToBeVisual: true });
  const w = dom.window;
  w.AbortSignal = AbortSignal;
  w.fetch = (path, options = {}) => fetch(base + '/' + path, { ...options, headers: { ...options.headers, Cookie: 'mk_session=fixture-cookie', Origin: 'http://game.test' } });
  w.performance.now = () => clock;
  w.setInterval = () => 1; w.clearInterval = () => {};
  Object.defineProperty(w.HTMLImageElement.prototype, 'naturalWidth', { get() { return 1536; } });
  Object.defineProperty(w.HTMLImageElement.prototype, 'naturalHeight', { get() { return 1024; } });
  Object.defineProperty(w.HTMLImageElement.prototype, 'complete', { get() { return true; } });
  t.after(async () => { w.close(); await app.close(); rmSync(dataDir, { recursive: true, force: true }); });
  const $ = (s) => w.document.querySelector(s);
  const until = async (condition) => {
    const deadline = Date.now() + 3000;
    while (!condition()) { if (Date.now() > deadline) throw new Error('Client did not reach the expected state'); await new Promise((done) => setTimeout(done, 10)); }
  };
  for (const file of ['levels.js', 'account.js', 'app.js']) w.eval(readFileSync(join(root, file), 'utf8'));
  await w.MAKRO_ACCOUNT.ready;
  assert.equal($('#popupStartButton').disabled, true);
  $('#playerName').value = 'ผู้เล่นครบกระบวนการ'; $('#playerPhone').value = '0812345678'; $('#playerConsent').checked = true;
  $('#playerForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => w.MAKRO_ACCOUNT.state.user.profileComplete);
  $('#popupStartButton').click();
  await until(() => $('.pictures').dataset.state === 'playing');
  for (let i = 0; i < 3; i++) {
    clock += 10000;
    if (i === 0) $('#playScene').click();
    for (const point of levels[i].differences) $(`#playScene [data-id="${point.id}"]`).click();
    assert.equal($('#resultModal').hidden, false);
    if (i < 2) { $('#playAgain').click(); await until(() => $('.pictures').dataset.state === 'playing'); }
  }
  await until(() => $('#saveScoreStatus').textContent.startsWith('บันทึกแล้ว'));
  assert.match($('#saveScoreStatus').textContent, /00:35.00/);
  assert.match($('#leaderboardRows').textContent, /ผู้เล่นครบกระบวนการ/);
  assert.equal($('#leaderboardRows').textContent.includes('0812345678'), false);
  const record = app.db.prepare("SELECT score_ms,misses FROM runs WHERE status='complete'").get();
  assert.equal(record.score_ms, 35000); assert.equal(record.misses, 1);
});
