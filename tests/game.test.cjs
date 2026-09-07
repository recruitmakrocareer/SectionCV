const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = resolve(__dirname, '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const script = readFileSync(resolve(root, 'app.js'), 'utf8');
const answerIds = ['fruit', 'shelf', 'price', 'shirt', 'cart'];

function game(t, configure = () => {}) {
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
  configure(window);
  window.eval(script);
  const $ = (selector) => window.document.querySelector(selector);
  t.after(() => { dom.window.close(); assert.deepEqual(errors, []); });
  return {
    window, $, intervals,
    click: (selector) => $(selector).click(),
    hit: (id, side = 'different') => $(`[data-scene="${side}"] [data-id="${id}"]`).click(),
    advance(milliseconds, tick = true) {
      now += milliseconds;
      if (tick) [...intervals.values()].forEach((fn) => fn());
      for (const [id, timeout] of timeouts) {
        if (timeout.due <= now) { timeouts.delete(id); timeout.fn(); }
      }
    }
  };
}

test('waits for Start and accepts touch-generated clicks on either picture once per answer', (t) => {
  const g = game(t);
  g.advance(60_000);
  assert.equal(g.$('#timer').textContent, '02:00');
  assert.equal(g.intervals.size, 0);
  g.hit('fruit');
  assert.equal(g.$('#foundCount').textContent, '0');
  g.click('#startButton');
  g.hit('fruit', 'original');
  g.hit('fruit');
  assert.equal(g.$('#foundCount').textContent, '1');
  assert.equal(g.window.document.querySelectorAll('[data-id="fruit"].found').length, 2);
  g.$('#playScene').dispatchEvent(new g.window.MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }));
  assert.equal(g.$('#foundCount').textContent, '1');
  assert.ok(g.$('.miss'));
  g.advance(700);
  assert.equal(g.$('.miss'), null);
});

test('winning shows the result, stops time and supports repeat rounds without stale labels', (t) => {
  const g = game(t);
  g.click('#startButton');
  g.advance(30_000);
  for (let round = 0; round < 3; round++) {
    answerIds.forEach((id, index) => g.hit(id, index % 2 ? 'original' : 'different'));
    assert.equal(g.$('#foundCount').textContent, '5');
    assert.equal(g.$('#progressText').textContent, '100%');
    assert.equal(g.$('#gameProgress').getAttribute('aria-valuenow'), '5');
    assert.equal(g.$('#resultModal').hidden, false);
    assert.equal(g.window.document.activeElement, g.$('#playAgain'));
    assert.equal(g.intervals.size, 0);
    g.click('#playAgain');
    assert.equal(g.$('#resultModal').hidden, true);
    assert.equal(g.$('#timer').textContent, '02:00');
    assert.equal(g.$('#foundCount').textContent, '0');
    assert.equal(g.$('#hintCount').textContent, '2');
    assert.equal(g.$('.found'), null);
    assert.equal(g.$('.hint'), null);
    assert.equal(g.$('[data-id="fruit"]').getAttribute('aria-label'), 'จุดแตกต่างที่ผลไม้');
    assert.equal(g.intervals.size, 1);
  }
});

test('two hints identify distinct unfinished answers and never increase the score', (t) => {
  const g = game(t);
  g.click('#startButton');
  g.hit('fruit');
  g.click('#hintButton');
  g.click('#hintButton');
  const ids = new Set([...g.window.document.querySelectorAll('.hint')].map((spot) => spot.dataset.id));
  assert.equal(ids.size, 2);
  assert.equal(ids.has('fruit'), false);
  assert.equal(g.$('#foundCount').textContent, '1');
  assert.equal(g.$('#hintCount').textContent, '0');
  assert.equal(g.$('#hintButton').disabled, true);
  g.click('#hintButton');
  assert.equal(g.$('#hintCount').textContent, '0');
});

test('pause and backgrounding preserve remaining time and require manual resume', (t) => {
  const g = game(t);
  g.click('#startButton');
  g.advance(12_400);
  g.click('#startButton');
  assert.equal(g.$('#timer').textContent, '01:48');
  g.advance(180_000);
  assert.equal(g.$('#timer').textContent, '01:48');
  g.hit('fruit');
  assert.equal(g.$('#foundCount').textContent, '0');
  g.click('#startButton');
  g.advance(600);
  assert.equal(g.$('#timer').textContent, '01:47');
  Object.defineProperty(g.window.document, 'hidden', { configurable: true, value: true });
  g.window.document.dispatchEvent(new g.window.Event('visibilitychange'));
  g.advance(240_000);
  assert.equal(g.$('.pictures').dataset.state, 'paused');
  assert.equal(g.$('#timer').textContent, '01:47');
  assert.equal(g.intervals.size, 0);
});

test('a delayed last click cannot win after the deadline, even without interval callbacks', (t) => {
  const g = game(t);
  g.click('#startButton');
  answerIds.slice(0, 4).forEach((id) => g.hit(id));
  g.advance(120_001, false);
  g.hit('cart');
  assert.equal(g.$('#foundCount').textContent, '4');
  assert.equal(g.$('#timer').textContent, '00:00');
  assert.equal(g.$('#resultTitle').textContent, 'หมดเวลาแล้ว!');
  assert.equal(g.$('#resultLabel').textContent, 'หมดเวลา');
  assert.equal(g.$('#resultModal').hidden, false);
  assert.equal(g.window.document.querySelectorAll('.revealed').length, 2);
  g.advance(180_000);
  assert.equal(g.$('#timer').textContent, '00:00');
  g.click('#closeResult');
  assert.equal(g.$('#resultModal').hidden, true);
  assert.equal(g.window.document.activeElement, g.$('#startButton'));
  g.click('#startButton');
  assert.equal(g.$('#timer').textContent, '02:00');
});

test('restart clears transient feedback and timers without a late result appearing', (t) => {
  const g = game(t);
  g.click('#startButton');
  g.hit('fruit');
  g.click('#hintButton');
  g.click('#playScene');
  g.click('#restartButton');
  assert.equal(g.$('.pictures').dataset.state, 'ready');
  assert.equal(g.$('.miss'), null);
  assert.equal(g.$('.found'), null);
  assert.equal(g.$('.hint'), null);
  g.advance(240_000);
  assert.equal(g.$('#resultModal').hidden, true);
  assert.equal(g.$('#timer').textContent, '02:00');
  assert.equal(g.intervals.size, 0);
});

test('result dialog traps Tab and closes with Escape, returning focus to the game', (t) => {
  const g = game(t);
  g.click('#startButton');
  g.advance(120_000);
  g.$('#playAgain').dispatchEvent(new g.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
  assert.equal(g.window.document.activeElement, g.$('#closeResult'));
  g.$('#closeResult').dispatchEvent(new g.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  assert.equal(g.window.document.activeElement, g.$('#playAgain'));
  g.$('#playAgain').dispatchEvent(new g.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(g.$('#resultModal').hidden, true);
  assert.equal(g.window.document.activeElement, g.$('#startButton'));
});

test('sound creates real audio tones when enabled, and muting stops new tones', async (t) => {
  let tones = 0;
  const g = game(t, (window) => {
    window.AudioContext = class {
      state = 'suspended'; currentTime = 0; destination = {};
      async resume() { this.state = 'running'; }
      async suspend() { this.state = 'suspended'; }
      createOscillator() { return { frequency: { setValueAtTime() {} }, connect() {}, disconnect() {}, start() { tones++; }, stop() {} }; }
      createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    };
  });
  g.click('#soundToggle');
  await new Promise(setImmediate);
  assert.equal(g.$('#soundToggle').getAttribute('aria-pressed'), 'true');
  assert.ok(tones > 0);
  const previewTones = tones;
  g.click('#startButton');
  g.hit('fruit');
  assert.ok(tones > previewTones);
  g.click('#soundToggle');
  await new Promise(setImmediate);
  assert.equal(g.$('#soundToggle').getAttribute('aria-pressed'), 'false');
  const mutedTones = tones;
  g.hit('shelf');
  assert.equal(tones, mutedTones);
});

test('unsupported audio does not prevent completing the game', async (t) => {
  const g = game(t);
  g.click('#soundToggle');
  await new Promise(setImmediate);
  assert.equal(g.$('#soundToggle').getAttribute('aria-pressed'), 'false');
  assert.equal(g.$('#soundToggle').disabled, false);
  g.click('#startButton');
  answerIds.forEach((id) => g.hit(id));
  assert.equal(g.$('#foundCount').textContent, '5');
});

test('the scenes contain exactly the five advertised differences, with no extra box seam', (t) => {
  const g = game(t);
  const original = g.$('[data-scene="original"] svg').cloneNode(true);
  const different = g.$('[data-scene="different"] svg').cloneNode(true);
  // Neutralize exactly the five intentional differences, then compare all artwork.
  different.querySelector('circle[cx="144"]').setAttribute('fill', '#dd4b3d');
  different.querySelector('rect[x="501"]').setAttribute('fill', '#cf1727');
  const price = [...different.querySelectorAll('text')].find((node) => node.textContent === '89.-');
  price.textContent = '99.-';
  original.querySelector('rect[x="427"]').remove();
  original.querySelector('rect[x="439"]').remove();
  const geometry = (svg) => [...svg.querySelectorAll('*')].filter((node) => !node.children.length).map((node) => ({
    tag: node.tagName,
    text: node.textContent,
    attrs: [...node.attributes].filter((attr) => !['class', 'id'].includes(attr.name)).map((attr) => [attr.name, attr.value.replace(/(wall|floor)[AB]/g, '$1')]).sort(([a], [b]) => a.localeCompare(b))
  }));
  assert.deepEqual(geometry(original), geometry(different));
});

test('answer centers remain tappable without another target covering them at phone and desktop widths', (t) => {
  const g = game(t);
  const centers = { fruit: [144, 188], shelf: [445.5, 162.5], price: [592, 122], shirt: [535.5, 292], cart: [451, 286] };
  const spots = [...g.$('#playScene').querySelectorAll('.hotspot')];
  for (const width of [290, 340, 390, 540]) {
    const height = width * 430 / 700;
    const bounds = spots.map((spot) => ({
      id: spot.dataset.id,
      x: parseFloat(spot.style.getPropertyValue('--x')) / 100 * width,
      y: parseFloat(spot.style.getPropertyValue('--y')) / 100 * height,
      size: Math.max(44, parseFloat(spot.style.getPropertyValue('--size')) / 100 * width)
    }));
    for (const [id, [x, y]] of Object.entries(centers)) {
      const hit = bounds.filter((box) => Math.abs(x / 700 * width - box.x) <= box.size / 2 && Math.abs(y / 430 * height - box.y) <= box.size / 2);
      assert.deepEqual(hit.map((box) => box.id), [id], `${id} at width ${width}`);
    }
  }
});

test('entrypoint assets and internal navigation links exist for direct files and project subpaths', (t) => {
  const g = game(t);
  for (const element of g.window.document.querySelectorAll('script[src], link[href], a[href]')) {
    const ref = element.getAttribute('src') || element.getAttribute('href');
    if (ref.startsWith('https://') || ref === '#') continue;
    if (ref.startsWith('#')) assert.ok(g.window.document.getElementById(ref.slice(1)), ref);
    else {
      assert.ok(!ref.startsWith('/'), `project Pages requires a relative asset: ${ref}`);
      assert.ok(existsSync(resolve(root, ref.split('?')[0])), ref);
    }
  }
});
