// One shared Order Rush room. A single Durable Object serializes every ready
// click and owns the round clock, so all players receive the same start time.
export const COUNTDOWN_MS = 5000;
export const ROUND_MS = 90000;
export const GRACE_MS = 3000;
const MAX_LISTED = 100;
const OPEN = 1;
const emptyState = () => ({ phase: 'waiting', readyDeadline: null, round: null, lastRound: null });

export class LobbyRoom {
  constructor(ctx, env, now = Date.now) {
    this.ctx = ctx;
    this.env = env;
    this.now = now;
    this.state = emptyState();
    ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get('state')) || emptyState();
    });
  }

  // Sockets survive hibernation; their player data lives in the attachment.
  sockets(excluded) {
    return this.ctx.getWebSockets().filter((ws) => ws !== excluded && ws.readyState === OPEN);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/round') {
      const round = this.state.round;
      const allowed = this.state.phase === 'round' && round?.id === url.searchParams.get('id') &&
        round.players.includes(url.searchParams.get('user')) && this.now() < round.endAt;
      return allowed ? Response.json({ id: round.id, startAt: round.startAt, endAt: round.endAt }) : Response.json({ error: 'not-in-round' }, { status: 403 });
    }
    if (url.pathname === '/status') {
      // Read-only room snapshot for the admin live board. No user ids leave here.
      const players = this.sockets().map((ws) => ws.deserializeAttachment());
      const { phase, round, readyDeadline, lastRound } = this.state;
      return Response.json({
        phase, readyDeadline, count: players.length, readyCount: players.filter((player) => player.ready).length,
        players: players.slice(0, MAX_LISTED).map((player) => ({ name: player.name, ready: player.ready })),
        round: round && { id: round.id, startAt: round.startAt, endAt: round.endAt, count: round.players.length },
        lastRound: lastRound && { roundId: lastRound.roundId, failed: lastRound.failed,
          top: lastRound.top.map(({ userId, ...row }, index) => ({ ...row, rank: index + 1 })) }
      });
    }
    if (url.pathname !== '/ws' || request.headers.get('Upgrade') !== 'websocket') return new Response('Not found', { status: 404 });
    const userId = request.headers.get('X-Lobby-User');
    const name = decodeURIComponent(request.headers.get('X-Lobby-Name') || '');
    // One live screen per player; otherwise a second tab counts as a person.
    for (const old of this.ctx.getWebSockets(userId)) old.close(4000, 'replaced');
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [userId]);
    server.serializeAttachment({ userId, name, ready: false });
    await this.evaluate();
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > 200) return;
    let data;
    try { data = JSON.parse(message); } catch { return; }
    if (data?.type !== 'ready' || this.state.phase !== 'waiting') return;
    ws.serializeAttachment({ ...ws.deserializeAttachment(), ready: data.ready === true });
    await this.evaluate();
    this.broadcast();
  }

  async webSocketClose(ws) { await this.left(ws); }
  async webSocketError(ws) { await this.left(ws); }

  async left(ws) {
    await this.evaluate(ws);
    this.broadcast(ws);
  }

  async evaluate(excluded) {
    if (this.state.phase !== 'waiting') return;
    const players = this.sockets(excluded).map((ws) => ws.deserializeAttachment());
    const ready = players.filter((player) => player.ready);
    if (players.length >= 2 && ready.length === players.length) return this.startRound(ready);
    // Clear timers persisted by older deployments; waiting never starts a subset.
    await this.ctx.storage.deleteAlarm();
    if (this.state.readyDeadline !== null) {
      this.state.readyDeadline = null;
      await this.save();
    }
  }

  async startRound(ready) {
    const startAt = this.now() + COUNTDOWN_MS;
    const endAt = startAt + ROUND_MS;
    this.state.phase = 'round';
    this.state.readyDeadline = null;
    this.state.round = { id: crypto.randomUUID(), startAt, endAt, players: ready.map((player) => player.userId) };
    await this.ctx.storage.setAlarm(endAt + GRACE_MS);
    await this.save();
  }

  async alarm() {
    const now = this.now();
    if (this.state.phase === 'waiting') {
      await this.evaluate();
    } else if (this.state.phase === 'round' && now >= this.state.round.endAt + GRACE_MS) {
      await this.finishRound();
    }
    this.broadcast();
  }

  async finishRound() {
    const { id } = this.state.round;
    const prefix = `round:${id}:%`;
    let top = [];
    let failed = false;
    try {
      // Scores stop changing at each run's deadline, so a player who closed the
      // game still gets their final score and a place on the daily board.
      const [, rows] = await this.env.DB.batch([
        this.env.DB.prepare('UPDATE order_runs_v3 SET complete=1 WHERE id LIKE ? AND complete=0').bind(prefix),
        this.env.DB.prepare(`SELECT COALESCE(NULLIF(u.name,''),u.line_name) AS name,r.score,r.errors,r.orders,r.user_id AS userId
          FROM order_runs_v3 r JOIN users u ON u.id=r.user_id WHERE r.id LIKE ?
          ORDER BY r.score DESC,r.errors ASC,r.deadline ASC,r.id ASC LIMIT 5`).bind(prefix)
      ]);
      top = rows.results;
    } catch { failed = true; }
    for (const ws of this.sockets()) ws.serializeAttachment({ ...ws.deserializeAttachment(), ready: false });
    this.state = { ...emptyState(), lastRound: { roundId: id, top, failed } };
    await this.save();
  }

  save() { return this.ctx.storage.put('state', this.state); }

  view(player, players, now) {
    const { phase, round, readyDeadline, lastRound } = this.state;
    return {
      type: 'state', serverNow: now, phase, readyDeadline,
      count: players.length, readyCount: players.filter((entry) => entry.ready).length,
      players: players.slice(0, MAX_LISTED).map((entry) => ({ name: entry.name, ready: entry.ready, me: entry.userId === player.userId })),
      roundId: round?.id ?? null, startAt: round?.startAt ?? null, endAt: round?.endAt ?? null,
      you: { ready: player.ready, inRound: !!round?.players.includes(player.userId) },
      lastRound: lastRound && { roundId: lastRound.roundId, failed: lastRound.failed,
        top: lastRound.top.map(({ userId, ...row }, index) => ({ ...row, rank: index + 1, isMe: userId === player.userId })) }
    };
  }

  broadcast(excluded) {
    const sockets = this.sockets(excluded);
    const players = sockets.map((ws) => ws.deserializeAttachment());
    const now = this.now();
    sockets.forEach((ws, index) => {
      try { ws.send(JSON.stringify(this.view(players[index], players, now))); } catch {}
    });
  }
}
