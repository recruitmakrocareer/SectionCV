const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const levels = require('../levels.js');
const root = resolve(__dirname, '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const script = readFileSync(resolve(root, 'app.js'), 'utf8');
const levelScript = readFileSync(resolve(root, 'levels.js'), 'utf8');
const flush = () => new Promise(setImmediate);

async function game(t, { configure = () => {}, load = true } = {}) {
  const errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', (error) => errors.push(error));
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console });
  const { window } = dom;
  let now = 0;
  let sequence = 0;
  const intervals = new Map();
  const timeouts = new Map();
  window.performance.now = () => now;
  window.setInterval = (fn) => { const id = ++sequence; intervals.set(id, fn); return id; };
  window.clearInterval = (id) => intervals.delete(id);
  window.setTimeout = (fn, delay) => { const id = ++sequence; timeouts.set(id, { fn, due: now + delay }); return id; };
  window.clearTimeout = (id) => timeouts.delete(id);
  const prototype = window.HTMLImageElement.prototype;
  const source = Object.getOwnPropertyDescriptor(prototype, 'src');
  Object.defineProperty(prototype, 'src', {
    get() { return source.get.call(this); },
    set(value) { this.readyInTest = false; source.set.call(this, value); }
  });
  Object.defineProperty(prototype, 'complete', { get() { return !!this.readyInTest; } });
  Object.defineProperty(prototype, 'naturalWidth', { get() { return this.readyInTest ? (this.width || 1536) : 0; } });
  Object.defineProperty(prototype, 'naturalHeight', { get() { return this.readyInTest ? (this.height || 1024) : 0; } });
  configure(window);
  window.eval(levelScript);
  window.eval(script);
  const $ = (selector) => window.document.querySelector(selector);
  const g = {
    window, $, intervals,
    click: (selector) => $(selector).click(),
    hit: (id, side = 'different') => $(`[data-scene="${side}"] [data-id="${id}"]`).click(),
    win(index) { levels[index].differences.forEach((point, i) => g.hit(point.id, i % 2 ? 'original' : 'different')); },
    async nextLevel() { g.advance(2000); await g.loadImages(); },
    async loadImages(fail = '') {
      for (const image of window.document.querySelectorAll('.pictures img')) {
        image.readyInTest = image.id !== fail;
        image.dispatchEvent(new window.Event(image.id === fail ? 'error' : 'load'));
      }
      await flush();
    },
    advance(milliseconds, tick = true) {
      now += milliseconds;
      if (tick) [...intervals.values()].forEach((fn) => fn());
      for (const [id, timeout] of timeouts) {
        if (timeout.due <= now) { timeouts.delete(id); timeout.fn(); }
      }
    }
  };
  t.after(() => { window.close(); assert.deepEqual(errors, []); });
  if (load) await g.loadImages();
  return g;
}

const first = () => levels[0].differences[0].id;

test('cannot start before the photos load and recovers from a failed image request', async (t) => {
  const g = await game(t, { load: false });
  assert.equal(g.$('#startButton').disabled, true);
  g.click('#startButton');
  g.advance(180_000);
  assert.equal(g.$('#timer').textContent, '01:30');
  await g.loadImages('differenceImage');
  assert.equal(g.$('.pictures').dataset.state, 'error');
  assert.equal(g.$('#startButton').disabled, false);
  g.click('#startButton');
  assert.equal(g.$('.pictures').dataset.state, 'loading');
  await g.loadImages();
  assert.equal(g.$('.pictures').dataset.state, 'ready');
  assert.equal(g.intervals.size, 0);
  g.click('#startButton');
  assert.equal(g.intervals.size, 1);
});

test('waits for Start and counts the same answer in either photograph only once', async (t) => {
  const g = await game(t);
  g.advance(60_000);
  assert.equal(g.$('#timer').textContent, '01:30');
  g.hit(first());
  assert.equal(g.$('#foundCount').textContent, '0');
  g.click('#startButton');
  g.hit(first(), 'original');
  g.hit(first());
  assert.equal(g.$('#foundCount').textContent, '1');
  assert.equal(g.window.document.querySelectorAll(`[data-id="${first()}"].found`).length, 2);
  g.$('#playScene').dispatchEvent(new g.window.MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }));
  assert.ok(g.$('.miss'));
  assert.equal(g.$('#foundCount').textContent, '1');
  g.advance(700);
  assert.equal(g.$('.miss'), null);
});

test('completes all three levels in order, totals 15 answers, then starts a fresh campaign', async (t) => {
  const g = await game(t);
  g.click('#startButton');
  for (let index = 0; index < levels.length; index++) {
    assert.equal(g.$('#levelTitle').textContent, levels[index].title);
    g.advance(20_000);
    g.win(index);
    assert.equal(g.$('#foundCount').textContent, '5');
    assert.equal(g.$('#progressText').textContent, '100%');
    assert.equal(g.$('#gameProgress').getAttribute('aria-valuenow'), '5');
    assert.equal(g.$('#resultModal').hidden, index < 2);
    assert.equal(g.intervals.size, 0);
    assert.equal(g.window.document.querySelectorAll('#levelTracker .completed').length, index + 1);
    if (index < 2) {
      assert.equal(g.$('#stageTransition').hidden, false);
      g.click('#playAgain'); // A stray click cannot skip the automatic transition.
      assert.equal(g.intervals.size, 0);
      await g.nextLevel();
      assert.equal(g.$('#foundCount').textContent, '0');
      assert.equal(g.$('#hintCount').textContent, '2');
      assert.equal(g.$('#resultModal').hidden, true);
      assert.equal(g.intervals.size, 1);
    }
  }
  assert.match(g.$('#resultTitle').textContent, /15/);
  assert.match(g.$('#resultMessage').textContent, /01:00/);
  g.click('#playAgain');
  await g.loadImages();
  assert.equal(g.$('#levelTitle').textContent, levels[0].title);
  assert.equal(g.$('#timer').textContent, '01:30');
  assert.equal(g.$('#foundCount').textContent, '0');
  assert.equal(g.window.document.querySelectorAll('#levelTracker .completed').length, 0);
  assert.equal(g.intervals.size, 1);
});

test('expiry keeps partial finds and advances to the next stage automatically', async (t) => {
  const g = await game(t);
  g.click('#startButton'); g.win(0); await g.nextLevel();
  g.hit(levels[1].differences[0].id);
  g.advance(90_000);
  assert.equal(g.$('#stageTransitionTitle').textContent, 'หมดเวลา!');
  assert.equal(g.window.document.querySelectorAll('.revealed').length, 8);
  await g.nextLevel();
  assert.equal(g.$('#levelTitle').textContent, levels[2].title);
  assert.equal(g.$('#timer').textContent, '01:30');
  assert.equal(g.$('#foundCount').textContent, '0');
  assert.equal(g.window.document.querySelectorAll('#levelTracker .completed').length, 2);
  g.advance(90_000);
  assert.equal(g.$('#resultModal').hidden, false);
  assert.equal(g.$('#resultFound').textContent, '6 / 15');
  assert.match(g.$('#resultStages').textContent, /หมดเวลา/);
});

test('hints are distinct, exclude found answers and reset when the next scene loads', async (t) => {
  const g = await game(t);
  g.click('#startButton'); g.hit(first()); g.click('#hintButton'); g.click('#hintButton');
  const hintIds = new Set([...g.window.document.querySelectorAll('.hint')].map((spot) => spot.dataset.id));
  assert.equal(hintIds.size, 2);
  assert.equal(hintIds.has(first()), false);
  assert.equal(g.$('#foundCount').textContent, '1');
  assert.equal(g.$('#hintCount').textContent, '0');
  assert.equal(g.$('#hintButton').disabled, true);
  g.win(0); await g.nextLevel();
  assert.equal(g.$('#hintCount').textContent, '2');
  assert.equal(g.$('.hint'), null);
  assert.equal(g.$('.found'), null);
  assert.equal(g.window.document.querySelectorAll('.hotspot').length, 10);
  assert.equal(g.$(`[data-id="${first()}"]`), null);
  assert.equal(g.$('.hotspot').getAttribute('aria-label'), 'จุดแตกต่างที่ 1');
});

test('the visible countdown keeps running while the tab is in the background', async (t) => {
  const g = await game(t);
  g.click('#startButton'); g.advance(12_400); g.click('#startButton');
  assert.equal(g.$('#timer').textContent, '01:17');
  assert.equal(g.$('#timerTenths').textContent, '.6');
  assert.equal(g.$('#startButton').disabled, true);
  Object.defineProperty(g.window.document, 'hidden', { configurable: true, value: true });
  g.window.document.dispatchEvent(new g.window.Event('visibilitychange'));
  g.advance(68400);
  assert.equal(g.$('.pictures').dataset.state, 'playing');
  assert.equal(g.$('#timer').textContent, '00:09');
  assert.equal(g.$('#countdownHud').dataset.urgency, 'critical');
  assert.match(g.$('#countdownBar').style.transform, /scaleX\(0\.1/);
  assert.equal(g.intervals.size, 1);
});

test('automatic stage changes continue in a hidden tab without a pause advantage', async (t) => {
  const g = await game(t);
  g.click('#startButton'); g.win(0);
  Object.defineProperty(g.window.document, 'hidden', { configurable: true, value: true });
  await g.nextLevel(); g.advance(10000);
  assert.equal(g.$('.pictures').dataset.state, 'playing');
  assert.equal(g.$('#timer').textContent, '01:20');
  assert.equal(g.intervals.size, 1);
});

test('a late last answer cannot win after the deadline even if timer callbacks are delayed', async (t) => {
  const g = await game(t);
  g.click('#startButton');
  levels[0].differences.slice(0, 4).forEach((point) => g.hit(point.id));
  g.advance(90_001, false);
  g.hit(levels[0].differences[4].id);
  assert.equal(g.$('#foundCount').textContent, '4');
  assert.equal(g.$('#timer').textContent, '00:00');
  assert.equal(g.$('#stageTransitionTitle').textContent, 'หมดเวลา!');
  assert.equal(g.window.document.querySelectorAll('.revealed').length, 2);
  await g.nextLevel();
  assert.equal(g.$('#totalFoundLabel').textContent, 'รวม 4 / 15 จุด');
});

test('restarting a round clears transient feedback without a late result appearing', async (t) => {
  const g = await game(t);
  g.click('#startButton'); g.hit(first()); g.click('#hintButton'); g.click('#playScene'); g.click('#restartButton');
  await g.loadImages();
  assert.equal(g.$('.pictures').dataset.state, 'ready');
  assert.equal(g.$('.miss'), null);
  assert.equal(g.$('.found'), null);
  assert.equal(g.$('.hint'), null);
  g.advance(240_000);
  assert.equal(g.$('#resultModal').hidden, true);
  assert.equal(g.$('#timer').textContent, '01:30');
  assert.equal(g.intervals.size, 0);
});

test('result dialog traps Tab, closes with Escape and returns focus to the game', async (t) => {
  const g = await game(t);
  g.click('#startButton');
  for (let i = 0; i < 3; i++) { g.win(i); if (i < 2) await g.nextLevel(); }
  g.$('#refreshResultBoard').focus();
  g.$('#refreshResultBoard').dispatchEvent(new g.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
  assert.equal(g.window.document.activeElement, g.$('#closeResult'));
  g.$('#closeResult').dispatchEvent(new g.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  assert.equal(g.window.document.activeElement, g.$('#refreshResultBoard'));
  g.$('#playAgain').dispatchEvent(new g.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(g.$('#resultModal').hidden, true);
  assert.equal(g.window.document.activeElement, g.$('#startButton'));
});

test('sound uses real audio tones when enabled, while mute prevents further tones', async (t) => {
  let tones = 0;
  const g = await game(t, { configure(window) {
    window.AudioContext = class {
      state = 'suspended'; currentTime = 0; destination = {};
      async resume() { this.state = 'running'; }
      async suspend() { this.state = 'suspended'; }
      createOscillator() { return { frequency: { setValueAtTime() {} }, connect() {}, disconnect() {}, start() { tones++; }, stop() {} }; }
      createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    };
  } });
  g.click('#soundToggle'); await flush();
  assert.equal(g.$('#soundToggle').getAttribute('aria-pressed'), 'true');
  assert.ok(tones > 0);
  const previewTones = tones;
  g.click('#startButton'); g.hit(first());
  assert.ok(tones > previewTones);
  g.click('#soundToggle'); await flush();
  const mutedTones = tones;
  g.hit(levels[0].differences[1].id);
  assert.equal(tones, mutedTones);
});

test('unsupported audio does not prevent completing a level', async (t) => {
  const g = await game(t);
  g.click('#soundToggle'); await flush();
  assert.equal(g.$('#soundToggle').getAttribute('aria-pressed'), 'false');
  assert.equal(g.$('#soundToggle').disabled, false);
  g.click('#startButton'); g.win(0);
  assert.equal(g.$('#foundCount').textContent, '5');
});

test('each level uses two local photographs and exactly five bounded edit regions', async (t) => {
  assert.equal(levels.length, 3);
  const g = await game(t);
  assert.equal(g.window.document.querySelector('svg.scene'), null);
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    assert.equal(level.differences.length, 5);
    assert.equal(new Set(level.differences.map((point) => point.id)).size, 5);
    assert.notEqual(level.original, level.edited);
    for (const path of [level.original, level.edited]) {
      assert.ok(existsSync(resolve(root, path)), path);
      assert.match(path, /^assets\/.+\.webp$/);
      const bytes = readFileSync(resolve(root, path));
      assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
      assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    }
    assert.equal(g.$('#originalImage').getAttribute('src'), level.original);
    assert.equal(g.$('#comparisonImage').getAttribute('src'), level.original);
    assert.equal(g.$('#differenceImage').getAttribute('src'), level.edited);
    assert.equal((g.$('#differenceImage').style.maskImage.match(/radial-gradient/g) || []).length, 5);
    level.differences.forEach((point) => {
      assert.ok(point.x - point.width / 2 >= 0 && point.x + point.width / 2 <= 100);
      assert.ok(point.y - point.height / 2 >= 0 && point.y + point.height / 2 <= 100);
    });
    if (i === 0) g.click('#startButton');
    g.win(i);
    if (i < 2) await g.nextLevel();
  }
});

test('touch targets remain separate at their answer centers across mobile and desktop image sizes', () => {
  for (const level of levels) {
    for (const width of [290, 340, 390, 540]) {
      const height = width * level.height / level.width;
      const boxes = level.differences.map((point) => ({
        id: point.id, x: point.x / 100 * width, y: point.y / 100 * height,
        size: Math.max(44, (point.targetSize || Math.max(6, point.width * 0.7)) / 100 * width)
      }));
      for (const target of boxes) {
        const hits = boxes.filter((box) => Math.abs(target.x - box.x) <= box.size / 2 && Math.abs(target.y - box.y) <= box.size / 2);
        assert.deepEqual(hits.map((box) => box.id), [target.id], `${level.id}/${target.id} at ${width}px`);
      }
    }
  }
});

test('entrypoint assets and internal links resolve under a GitHub project path', async (t) => {
  const g = await game(t);
  for (const element of g.window.document.querySelectorAll('script[src], link[href], a[href]')) {
    const ref = element.getAttribute('src') || element.getAttribute('href');
    if (ref.startsWith('https://') || ref === '#' || ref.startsWith('auth/')) continue;
    if (ref.startsWith('#')) assert.ok(g.window.document.getElementById(ref.slice(1)), ref);
    else {
      assert.ok(!ref.startsWith('/'), ref);
      assert.ok(existsSync(resolve(root, ref.split('?')[0])), ref);
    }
  }
});

test('the start popup is visible before play, waits for images, then releases the game', async (t) => {
  const g = await game(t, { load: false });
  assert.equal(g.$('#startModal').hidden, false);
  assert.equal(g.$('#startButton').hidden, true);
  assert.equal(g.$('#popupStartButton').disabled, true);
  g.advance(30000);
  await g.loadImages();
  assert.equal(g.$('#popupStartButton').disabled, false);
  assert.equal(g.window.document.activeElement, g.$('#popupStartButton'));
  g.click('#popupStartButton');
  assert.equal(g.$('#startModal').hidden, true);
  assert.equal(g.$('main').inert, false);
  assert.equal(g.$('.pictures').dataset.state, 'playing');
});

test('wrong taps add five seconds to total score without granting extra playing time', async (t) => {
  const g = await game(t);
  g.click('#popupStartButton');
  g.advance(10000);
  g.click('#playScene'); g.click('#playScene');
  assert.equal(g.$('#timer').textContent, '01:20');
  assert.equal(g.$('#scoreTime').textContent, '00:20.00');
  assert.match(g.$('#penaltySummary').textContent, /2 ครั้ง · \+10/);
  assert.ok(g.$('.tap-feedback.wrong'));
  g.win(0); g.click('#playScene'); // Transition taps do not incur a penalty.
  await g.nextLevel();
  g.advance(20000); g.win(1); await g.nextLevel();
  g.advance(30000); g.win(2);
  assert.match(g.$('#resultMessage').textContent, /01:00.00.*10/);
  assert.equal(g.$('#resultTime').textContent, '01:10.00');
  assert.equal(g.$('#scoreTime').textContent, '01:10.00');
});

test('finishing a ranked game keeps its result until acknowledged and preserves the server time on render', async (t) => {
  let confirm;
  const g = await game(t, { configure(w) {
    w.MAKRO_ACCOUNT = { state: { lineReady: true }, canPlay: () => true,
      startRun: async () => true, event: async () => null,
      saveResult: () => new Promise((resolve) => { confirm = resolve; }) };
  } });
  g.click('#popupStartButton'); await flush();
  for (let i = 0; i < 3; i++) {
    g.advance(10000); g.win(i);
    if (i < 2) await g.nextLevel();
  }
  assert.equal(g.$('#playAgain').disabled, true);
  assert.equal(g.$('#restartButton').disabled, true);
  g.click('#playAgain');
  assert.equal(g.$('#levelLabel').textContent, 'ด่านที่ 3 / 3');
  confirm({ status: 'complete', scoreMs: 31500, rank: 12 }); await flush();
  assert.equal(g.$('#playAgain').disabled, false);
  assert.match(g.$('#saveScoreStatus').textContent, /บันทึกแล้ว.*00:31.50.*12/);
  g.window.dispatchEvent(new g.window.Event('account:change'));
  assert.equal(g.$('#scoreTime').textContent, '00:31.50');
});
