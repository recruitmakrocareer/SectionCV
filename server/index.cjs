'use strict';
const http = require('node:http');
const { DatabaseSync } = require('node:sqlite');
const { randomBytes, randomUUID, createHash, timingSafeEqual } = require('node:crypto');
const { mkdirSync, readFileSync, chmodSync, existsSync } = require('node:fs');
const { resolve, extname } = require('node:path');
const levels = require('../levels.js');

const { advanceRun, runResult, newProgress, sprintProgress, PENALTY_MS, LEVEL_MS, SPRINT_MS, fail } = require('./game-rules.cjs');
const { boardSQL, rankSQL, summarySQL, historySQL, board90SQL, rank90SQL, me90SQL, totals90SQL, summary90SQL, boardPage, board90View } = require('./statistics.cjs');
const SESSION_MS = 7 * 86400000;
const random = () => randomBytes(32).toString('base64url');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function createApp(options = {}) {
  const env = options.env || process.env;
  const now = options.now || Date.now;
  const lineFetch = options.lineFetch || fetch;
  // Never infer OAuth redirects from Host or forwarded visitor headers.
  const origin = env.APP_ORIGIN || 'http://localhost:8000';
  const originURL = new URL(origin);
  if (originURL.origin !== origin || !['http:', 'https:'].includes(originURL.protocol)) throw new Error('APP_ORIGIN must be an origin without a path or trailing slash');
  if (env.NODE_ENV === 'production' && originURL.protocol !== 'https:') throw new Error('Production requires HTTPS APP_ORIGIN');
  const secure = originURL.protocol === 'https:';
  const lineReady = !!(env.LINE_CHANNEL_ID && env.LINE_CHANNEL_SECRET);
  const admins = new Set((env.ADMIN_LINE_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean));
  const dataDir = resolve(options.dataDir || env.DATA_DIR || resolve(__dirname, '../data'));
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const filename = resolve(dataDir, 'makro.sqlite');
  const db = new DatabaseSync(filename);
  chmodSync(filename, 0o600);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, line_sub TEXT NOT NULL UNIQUE, line_name TEXT NOT NULL,
      name TEXT, phone TEXT, consent_at INTEGER, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS oauth_states (
      state_hash TEXT PRIMARY KEY, binding_hash TEXT NOT NULL,
      nonce TEXT NOT NULL, verifier TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'active', level INTEGER NOT NULL DEFAULT 0,
      phase TEXT NOT NULL DEFAULT 'ready', found TEXT NOT NULL DEFAULT '[]',
      elapsed_ms INTEGER NOT NULL DEFAULT 0, current_ms INTEGER NOT NULL DEFAULT 0,
      misses INTEGER NOT NULL DEFAULT 0, hints INTEGER NOT NULL DEFAULT 0,
      segment_at INTEGER, last_seq INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, completed_at INTEGER, score_ms INTEGER
    );
    CREATE TABLE IF NOT EXISTS events (
      run_id TEXT NOT NULL REFERENCES runs(id), event_id TEXT NOT NULL,
      seq INTEGER NOT NULL, payload_hash TEXT NOT NULL, response TEXT NOT NULL,
      PRIMARY KEY (run_id, event_id), UNIQUE (run_id, seq)
    );
    CREATE INDEX IF NOT EXISTS idx_runs_user_created ON runs(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_runs_completed_score ON runs(score_ms, misses, completed_at) WHERE status='complete';
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_oauth_expiry ON oauth_states(expires_at);
  `);
  const root = resolve(__dirname, '..');
  const publicFiles = new Set(['index.html', 'app.js', 'account.js', 'levels.js', 'styles.css', 'admin.html', 'admin.js',
    'memory-game/index.html', 'docs/memory-game/index.html', ...levels.flatMap((l) => [l.original, l.edited])]);
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp' };
  const callback = `${origin}/auth/line/callback`;
  const cookie = (name, value, age) => `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${age}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
  function readCookies(req) {
    const cookies = {};
    for (const part of (req.headers.cookie || '').split(';')) {
      const i = part.indexOf('=');
      if (i > 0) { try { cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch {} }
    }
    return cookies;
  }
  function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
  function redirect(res, location, cookies = []) { res.writeHead(303, { Location: location, 'Set-Cookie': cookies }); res.end(); }
  function userView(user) {
    return { name: user.name || '', phone: user.phone || '', lineName: user.line_name,
      profileComplete: !!(user.name && user.phone && user.consent_at), admin: admins.has(user.line_sub) };
  }
  function session(req, required = true) {
    const token = readCookies(req).mk_session;
    const row = token && db.prepare(`SELECT s.csrf, s.token_hash, u.* FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.expires_at>?`).get(hash(token), now());
    if (!row && required) fail('กรุณาเข้าสู่ระบบด้วย LINE', 401);
    return row || null;
  }
  function authorizePost(req, user) {
    if (req.headers.origin !== origin || !equal(req.headers['x-csrf-token'], user.csrf)) fail('คำขอไม่ถูกต้อง กรุณาโหลดหน้าใหม่', 403);
    if (!req.headers['content-type']?.startsWith('application/json')) fail('ต้องส่งข้อมูลแบบ JSON', 415);
  }
  async function body(req) {
    let size = 0; const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 8192) fail('ข้อมูลมีขนาดใหญ่เกินไป', 413);
      chunks.push(chunk);
    }
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) fail('ข้อมูลไม่ถูกต้อง');
      return value;
    } catch { fail('ข้อมูลไม่ถูกต้อง'); }
  }
  function leaderboard() { return db.prepare(`${boardSQL} LIMIT 10`).all().map((r) => ({ name: r.name, scoreMs: r.score_ms, misses: r.misses })); }
  function rankFor(userId, sprint = false) {
    const row = db.prepare(sprint ? rank90SQL : rankSQL).get(userId);
    return row?.rank || null;
  }
  async function linePost(path, values) {
    const result = await lineFetch(`https://api.line.me${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(values), signal: AbortSignal.timeout(10000)
    });
    if (!result.ok) fail('LINE ยืนยันตัวตนไม่สำเร็จ', 401);
    return result.json();
  }
  function applyEvent(user, id, event) {
    if (typeof event.eventId !== 'string' || !/^[\w-]{16,80}$/.test(event.eventId) || !Number.isSafeInteger(event.seq) || event.seq < 1) fail('รหัสรายการไม่ถูกต้อง');
    const digest = hash(JSON.stringify(event));
    db.exec('BEGIN IMMEDIATE');
    try {
      const run = db.prepare('SELECT * FROM runs WHERE id=? AND user_id=?').get(id, user.id);
      if (!run) fail('ไม่พบรอบเกม', 404);
      const previous = db.prepare('SELECT * FROM events WHERE run_id=? AND event_id=?').get(id, event.eventId);
      if (previous) {
        if (previous.payload_hash !== digest) fail('รหัสรายการถูกใช้กับข้อมูลอื่นแล้ว', 409);
        db.exec('COMMIT'); return JSON.parse(previous.response);
      }
      advanceRun(run, event, now());
      db.prepare(`UPDATE runs SET status=?,level=?,phase=?,found=?,elapsed_ms=?,current_ms=?,misses=?,hints=?,segment_at=?,last_seq=?,completed_at=?,score_ms=? WHERE id=?`)
        .run(run.status, run.level, run.phase, run.found, run.elapsed_ms, run.current_ms, run.misses, run.hints, run.segment_at, run.last_seq, run.completed_at, run.score_ms, id);
      const response = runResult(run, now());
      response.rank = run.status === 'complete' ? rankFor(user.id, !!sprintProgress(run)) : null;
      db.prepare('INSERT INTO events(run_id,event_id,seq,payload_hash,response) VALUES(?,?,?,?,?)').run(id, event.eventId, event.seq, digest, JSON.stringify(response));
      db.exec('COMMIT'); return response;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
    if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const url = new URL(req.url, origin);
    try {
      if (req.method === 'GET' && url.pathname === '/auth/line/start') {
        if (!lineReady) return json(res, 503, { error: 'ระบบ LINE Login ยังไม่เปิดใช้งาน' });
        db.prepare('DELETE FROM oauth_states WHERE expires_at<=?').run(now());
        const state = random(); const binding = random(); const nonce = random(); const verifier = random();
        db.prepare('INSERT INTO oauth_states VALUES(?,?,?,?,?)').run(hash(state), hash(binding), nonce, verifier, now() + 300000);
        const authorize = new URL('https://access.line.me/oauth2/v2.1/authorize');
        authorize.search = new URLSearchParams({ response_type: 'code', client_id: env.LINE_CHANNEL_ID,
          redirect_uri: callback, state, nonce, scope: 'openid profile', ui_locales: 'th',
          code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
        if (url.searchParams.get('manual') === '1') authorize.searchParams.set('disable_auto_login', 'true');
        return redirect(res, authorize.href, [cookie('mk_oauth', binding, 300)]);
      }
      if (req.method === 'GET' && url.pathname === '/auth/line/callback') {
        try {
          if (!lineReady) fail('LINE ไม่พร้อม', 503);
          const state = url.searchParams.get('state') || '';
          const binding = readCookies(req).mk_oauth || '';
          const saved = db.prepare('SELECT * FROM oauth_states WHERE state_hash=? AND expires_at>?').get(hash(state), now());
          if (!saved || !binding || !equal(saved.binding_hash, hash(binding))) fail('คำขอเข้าสู่ระบบหมดอายุ', 401);
          // Consume once, before the external code exchange, to prevent replay.
          db.prepare('DELETE FROM oauth_states WHERE state_hash=?').run(hash(state));
          const code = url.searchParams.get('code');
          if (url.searchParams.has('error') || !code) fail('ยกเลิกการเข้าสู่ระบบ', 401);
          const tokens = await linePost('/oauth2/v2.1/token', { grant_type: 'authorization_code', code,
            redirect_uri: callback, client_id: env.LINE_CHANNEL_ID, client_secret: env.LINE_CHANNEL_SECRET, code_verifier: saved.verifier });
          if (typeof tokens.id_token !== 'string') fail('LINE ไม่ได้ส่งข้อมูลยืนยัน', 401);
          const identity = await linePost('/oauth2/v2.1/verify', { id_token: tokens.id_token, client_id: env.LINE_CHANNEL_ID, nonce: saved.nonce });
          if (identity.iss !== 'https://access.line.me' || String(identity.aud) !== env.LINE_CHANNEL_ID || identity.nonce !== saved.nonce || !Number.isFinite(identity.exp) || identity.exp * 1000 <= now() || typeof identity.sub !== 'string' || !/^U[0-9a-f]{32}$/i.test(identity.sub)) fail('ข้อมูลยืนยัน LINE ไม่ถูกต้อง', 401);
          const id = randomUUID();
          db.prepare(`INSERT INTO users(id,line_sub,line_name,created_at) VALUES(?,?,?,?)
            ON CONFLICT(line_sub) DO UPDATE SET line_name=excluded.line_name`).run(id, identity.sub, String(identity.name || 'ผู้เล่น LINE').slice(0, 100), now());
          const user = db.prepare('SELECT * FROM users WHERE line_sub=?').get(identity.sub);
          const token = random(); const csrf = random();
          db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now());
          db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash(token), user.id, csrf, now() + SESSION_MS);
          return redirect(res, '/', [cookie('mk_session', token, SESSION_MS / 1000), cookie('mk_oauth', '', 0)]);
        } catch { return redirect(res, '/?login_error=1', [cookie('mk_oauth', '', 0)]); }
      }
      if (req.method === 'GET' && url.pathname === '/api/session') {
        const user = session(req, false);
        return json(res, 200, { lineReady, csrf: user?.csrf || '', user: user ? userView(user) : null, penaltyMs: PENALTY_MS });
      }
      if (req.method === 'GET' && url.pathname === '/api/leaderboard') {
        if (url.searchParams.get('rulesVersion') === '2') {
          const user = session(req, false), page = boardPage(url);
          return json(res, 200, board90View(db.prepare(`${board90SQL} LIMIT 10 OFFSET ?`).all((page - 1) * 10),
            db.prepare(totals90SQL).get(), db.prepare(me90SQL).get(user?.id || ''), user?.id, page));
        }
        return json(res, 200, { entries: leaderboard() });
      }
      if (req.method === 'GET' && url.pathname === '/api/me/stats') {
        const user = session(req);
        if (url.searchParams.get('rulesVersion') === '2') {
          const me = db.prepare(me90SQL).get(user.id);
          return json(res, 200, { ...db.prepare(summary90SQL).get(user.id), bestScoreMs: me?.scoreMs ?? null,
            bestFoundCount: me?.foundCount ?? null, rank: me?.rank ?? null, recentRuns: db.prepare(historySQL).all(user.id) });
        }
        return json(res, 200, { ...db.prepare(summarySQL).get(user.id), rank: rankFor(user.id),
          recentRuns: db.prepare(historySQL).all(user.id) });
      }
      if (req.method === 'GET' && url.pathname.startsWith('/api/admin/')) {
        const user = session(req);
        if (!admins.has(user.line_sub)) fail('สำหรับผู้ดูแลกิจกรรมเท่านั้น', 403);
        const rows = db.prepare(`SELECT u.name, u.phone, u.line_name AS lineName, u.line_sub AS lineUserId, u.consent_at AS consentAt, u.created_at AS createdAt,
          COUNT(r.id) AS attempts, MIN(CASE WHEN r.status='complete' THEN r.score_ms END) AS bestScoreMs
          FROM users u LEFT JOIN runs r ON r.user_id=u.id WHERE u.consent_at IS NOT NULL GROUP BY u.id ORDER BY u.created_at DESC LIMIT 10000`).all();
        if (url.pathname === '/api/admin/players') return json(res, 200, { players: rows });
        if (url.pathname === '/api/admin/export') {
          const cell = (value) => '"' + String(value ?? '').replace(/^[=+@\-\t\r]/, (s) => "'" + s).replaceAll('"', '""') + '"';
          const keys = ['name', 'phone', 'lineName', 'lineUserId', 'consentAt', 'attempts', 'bestScoreMs'];
          const csv = '\ufeff' + [keys, ...rows.map((r) => keys.map((key) => r[key]))].map((r) => r.map(cell).join(',')).join('\r\n');
          res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="makro-players.csv"' }); return res.end(csv);
        }
      }
      if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
        const user = session(req); authorizePost(req, user); const data = await body(req);
        if (url.pathname === '/api/logout') {
          db.prepare('DELETE FROM sessions WHERE token_hash=?').run(user.token_hash);
          res.setHeader('Set-Cookie', cookie('mk_session', '', 0)); return json(res, 200, { ok: true });
        }
        if (url.pathname === '/api/profile') {
          const name = typeof data.name === 'string' ? data.name.trim().replace(/\s+/g, ' ') : '';
          let phone = typeof data.phone === 'string' ? data.phone.replace(/[\s()-]/g, '') : '';
          if (phone.startsWith('+66')) phone = '0' + phone.slice(3);
          if (name.length < 2 || name.length > 80 || /[\p{Cc}\p{Cf}]/u.test(name)) fail('กรุณาระบุชื่อ 2–80 ตัวอักษร');
          if (!/^0[1-9]\d{7,8}$/.test(phone)) fail('กรุณาระบุเบอร์ติดต่อในประเทศไทยให้ถูกต้อง');
          if (data.consent !== true) fail('กรุณายืนยันการจัดเก็บข้อมูลก่อนเริ่มเกม');
          db.prepare('UPDATE users SET name=?,phone=?,consent_at=? WHERE id=?').run(name, phone, now(), user.id);
          return json(res, 200, { user: userView(db.prepare('SELECT * FROM users WHERE id=?').get(user.id)) });
        }
        if (url.pathname === '/api/runs') {
          if (!userView(user).profileComplete) fail('กรุณาบันทึกชื่อ เบอร์ติดต่อ และการยินยอมก่อนเริ่มเกม', 403);
          if (data.rulesVersion !== undefined && data.rulesVersion !== 2) fail('กรุณาโหลดเกมเวอร์ชันล่าสุด', 409);
          if (db.prepare('SELECT COUNT(*) AS n FROM runs WHERE user_id=? AND created_at>?').get(user.id, now() - 60000).n >= 10) fail('เริ่มเกมบ่อยเกินไป กรุณารอสักครู่', 429);
          const id = randomUUID();
          db.exec('BEGIN IMMEDIATE');
          try {
            db.prepare("UPDATE runs SET status='abandoned' WHERE user_id=? AND status='active'").run(user.id);
            db.prepare('INSERT INTO runs(id,user_id,created_at,found) VALUES(?,?,?,?)').run(id, user.id, now(), newProgress(data.rulesVersion));
            db.exec('COMMIT');
          } catch (error) { db.exec('ROLLBACK'); throw error; }
          return json(res, 201, { id, penaltyMs: PENALTY_MS, rulesVersion: data.rulesVersion || 1, levelMs: data.rulesVersion === 2 ? SPRINT_MS : LEVEL_MS });
        }
        const match = url.pathname.match(/^\/api\/runs\/([\w-]{36})\/events$/);
        if (match) return json(res, 200, applyEvent(user, match[1], data));
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        let file = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
        if (file.endsWith('/')) file += 'index.html';
        if (publicFiles.has(file) && existsSync(resolve(root, file))) {
          const bytes = readFileSync(resolve(root, file));
          res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Content-Length': bytes.length });
          return res.end(req.method === 'HEAD' ? undefined : bytes);
        }
      }
      return json(res, 404, { error: 'ไม่พบหน้าที่ต้องการ' });
    } catch (error) { return json(res, error.status || 500, { error: error.status ? error.message : 'ระบบบันทึกข้อมูลขัดข้อง กรุณาลองอีกครั้ง' }); }
  });
  return { server, db, close: () => new Promise((resolveClose) => server.close(() => { db.close(); resolveClose(); })) };
}

if (require.main === module) {
  const app = createApp();
  const port = Number(process.env.PORT || 8000);
  app.server.listen(port, '0.0.0.0', () => console.log(`Makro game server listening on port ${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => app.close().then(() => process.exit(0)));
}
module.exports = { createApp, PENALTY_MS, LEVEL_MS };
