const test = require('node:test');
const assert = require('node:assert/strict');

async function room() {
  const { LobbyRoom, READY_MS, COUNTDOWN_MS, ROUND_MS, GRACE_MS } = await import('../worker/lobby-room.mjs');
  const sockets = [];
  const clock = { now: 1000 };
  const ctx = {
    blockConcurrencyWhile: (fn) => fn(),
    getWebSockets: () => sockets,
    storage: { get: async () => undefined, put: async () => {}, setAlarm: async (at) => { clock.alarm = at; }, deleteAlarm: async () => { clock.alarm = null; } }
  };
  const db = {
    prepare: () => ({ bind: () => ({}) }),
    batch: async () => [{}, { results: [{ name: 'A', score: 300, errors: 0, orders: 3, userId: 'a' }] }]
  };
  const lobby = new LobbyRoom(ctx, { DB: db }, () => clock.now);
  await new Promise((resolve) => setImmediate(resolve));
  const join = (userId) => {
    let attachment = { userId, name: userId, ready: false };
    const ws = { readyState: 1, messages: [], deserializeAttachment: () => attachment,
      serializeAttachment: (value) => { attachment = value; }, send: (text) => ws.messages.push(JSON.parse(text)) };
    sockets.push(ws);
    return ws;
  };
  const ready = (ws, value = true) => lobby.webSocketMessage(ws, JSON.stringify({ type: 'ready', ready: value }));
  const last = (ws) => ws.messages.at(-1);
  return { lobby, join, ready, last, clock, sockets, READY_MS, COUNTDOWN_MS, ROUND_MS, GRACE_MS };
}

test('the round starts for everyone only once all players are ready', async () => {
  const { join, ready, last, clock, COUNTDOWN_MS, ROUND_MS } = await room();
  const a = join('a'), b = join('b');
  await ready(a);
  assert.equal(last(a).phase, 'waiting');
  await ready(b);
  assert.equal(last(a).phase, 'round');
  assert.equal(last(a).startAt, clock.now + COUNTDOWN_MS);
  assert.equal(last(a).endAt, last(b).endAt);
  assert.equal(last(a).endAt - last(a).startAt, ROUND_MS);
  assert.equal(last(b).you.inRound, true);
});

test('after 60 seconds the round leaves out players who are not ready', async () => {
  const { lobby, join, ready, last, clock, READY_MS } = await room();
  const a = join('a'), b = join('b');
  await ready(a);
  assert.equal(clock.alarm, clock.now + READY_MS);
  clock.now += READY_MS;
  await lobby.alarm();
  assert.equal(last(a).phase, 'round');
  assert.equal(last(a).you.inRound, true);
  assert.equal(last(b).you.inRound, false);
});

test('a lone player does not start instantly, so others have time to join', async () => {
  const { join, ready, last } = await room();
  const a = join('a');
  await ready(a);
  assert.equal(last(a).phase, 'waiting');
  assert.ok(last(a).readyDeadline);
});

test('cancelling the last ready player stops the ready timer', async () => {
  const { join, ready, last, clock } = await room();
  const a = join('a');
  join('b');
  await ready(a);
  await ready(a, false);
  assert.equal(last(a).readyDeadline, null);
  assert.equal(clock.alarm, null);
});

test('a ready player leaving can complete the all-ready check', async () => {
  const { lobby, join, ready, last, sockets } = await room();
  const a = join('a'), b = join('b'), c = join('c');
  await ready(a); await ready(b);
  sockets.splice(sockets.indexOf(c), 1);
  await lobby.webSocketClose(c);
  assert.equal(last(a).phase, 'round');
});

test('the round ends with a Top 5 and everyone must ready up again', async () => {
  const { lobby, join, ready, last, clock, COUNTDOWN_MS, ROUND_MS, GRACE_MS } = await room();
  const a = join('a'), b = join('b');
  await ready(a); await ready(b);
  clock.now += COUNTDOWN_MS + ROUND_MS + GRACE_MS;
  await lobby.alarm();
  assert.equal(last(a).phase, 'waiting');
  assert.equal(last(a).you.ready, false);
  assert.deepEqual(last(a).lastRound.top[0], { name: 'A', score: 300, errors: 0, orders: 3, rank: 1, isMe: true });
  assert.equal(last(b).lastRound.top[0].isMe, false);
  assert.equal('userId' in last(b).lastRound.top[0], false);
});

test('only admitted players can open a run while the round is live', async () => {
  const { lobby, join, ready, last } = await room();
  const a = join('a'), b = join('b');
  await ready(a); await ready(b);
  const id = last(a).roundId;
  assert.equal((await lobby.fetch(new Request(`https://lobby/round?id=${id}&user=a`))).status, 200);
  assert.equal((await lobby.fetch(new Request(`https://lobby/round?id=${id}&user=z`))).status, 403);
  assert.equal((await lobby.fetch(new Request('https://lobby/round?id=other&user=a'))).status, 403);
});
