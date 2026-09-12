import rules from '../server/game-rules.cjs';
import statistics from '../server/statistics.cjs';

const { advanceRun, runResult, newProgress, sprintProgress, PENALTY_MS, SPRINT_MS, fail } = rules;
const { boardSQL, rankSQL, summarySQL, historySQL, board90SQL, rank90SQL, me90SQL, totals90SQL, summary90SQL, boardPage, board90View } = statistics;
const SESSION_MS = 7 * 86400000;
const encoder = new TextEncoder();
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const digest = async (text) => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
const hash = async (text) => [...await digest(text)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const equal = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
};

function readCookies(request) {
  const result = {};
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) { try { result[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch {} }
  }
  return result;
}

async function readBody(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) fail('ต้องส่งข้อมูลแบบ JSON', 415);
  const reader = request.body?.getReader();
  if (!reader) fail('ข้อมูลไม่ถูกต้อง');
  const chunks = []; let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 8192) { await reader.cancel(); fail('ข้อมูลมีขนาดใหญ่เกินไป', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('ข้อมูลไม่ถูกต้อง');
    return value;
  } catch { fail('ข้อมูลไม่ถูกต้อง'); }
}

function securityHeaders(response, secure) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' https://static.line-scdn.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://api.line.me https://access.line.me https://liff.line.me; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
  if (secure) headers.set('Strict-Transport-Security', 'max-age=31536000');
  return new Response(response.body, { status: response.status, headers });
}

// Test dependencies are injected by the test runner only. No HTTP endpoint,
// header or deployed environment variable can create a test identity or clock.
export function createWorker({ now = Date.now, lineFetch = fetch } = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers });
      const redirect = (location, cookies = []) => {
        const headers = new Headers({ Location: location });
        for (const cookie of cookies) headers.append('Set-Cookie', cookie);
        return new Response(null, { status: 303, headers });
      };
      const handle = async () => {
        // Assets are normally served directly by Cloudflare without a Worker
        // invocation. Only API/auth paths are configured as Worker-first.
        if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/auth/')) {
          return env.ASSETS ? env.ASSETS.fetch(request) : json({ error: 'ไม่พบหน้าที่ต้องการ' }, 404);
        }
        let origin = null;
        let originInvalid = false;
        if (env.APP_ORIGIN) {
          try {
            const configured = new URL(env.APP_ORIGIN);
            if (configured.origin !== env.APP_ORIGIN || configured.protocol !== 'https:') throw new Error();
            origin = configured.origin;
          } catch { originInvalid = true; }
        }
        const lineReady = !!(origin && env.DB && env.LINE_CHANNEL_ID && env.LINE_CHANNEL_SECRET);
        if (request.method === 'GET' && url.pathname === '/api/setup-status') {
          // Report only fixed setting names, never values, identities or tokens.
          // This remains usable before D1 or LINE is configured and does no I/O.
          const configured = {
            APP_ORIGIN: !!origin, DB: !!env.DB,
            LINE_CHANNEL_ID: !!env.LINE_CHANNEL_ID, LINE_CHANNEL_SECRET: !!env.LINE_CHANNEL_SECRET
          };
          return json({ lineReady, missing: Object.keys(configured).filter((name) => !configured[name]) });
        }
        if (originInvalid) fail('กรุณาตั้งค่า URL ของระบบให้ถูกต้อง', 503);
        if (!env.DB) {
          if (request.method === 'GET' && url.pathname === '/api/session') return json({ lineReady: false, csrf: '', user: null, penaltyMs: PENALTY_MS });
          fail('ระบบบันทึกข้อมูลยังไม่เปิดใช้งาน', 503);
        }
        // Force the first read to the primary and keep all reads/writes in this
        // request sequentially consistent, even if D1 read replication is enabled.
        const db = env.DB.withSession('first-primary');
        const stmt = (sql, ...values) => db.prepare(sql).bind(...values);
        const admins = new Set((env.ADMIN_LINE_USER_IDS || '').split(',').map((id) => id.trim()).filter(Boolean));
        const cookie = (name, value, age) => `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${age}; HttpOnly; SameSite=Lax; Secure`;
        const userView = (user) => ({ name: user.name || '', phone: user.phone || '', lineName: user.line_name,
          profileComplete: !!(user.name && user.phone && user.consent_at), admin: admins.has(user.line_sub) });
        const session = async (required = true) => {
          const token = readCookies(request).mk_session;
          const user = token && await stmt(`SELECT s.csrf,s.token_hash,u.* FROM sessions s JOIN users u ON u.id=s.user_id
            WHERE s.token_hash=? AND s.expires_at>?`, await hash(token), now()).first();
          if (!user && required) fail('กรุณาเข้าสู่ระบบด้วย LINE', 401);
          return user || null;
        };
        const linePost = async (path, values) => {
          const response = await lineFetch(`https://api.line.me${path}`, { method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(values),
            signal: AbortSignal.timeout(10000) });
          if (!response.ok) fail('LINE ยืนยันตัวตนไม่สำเร็จ', 401);
          return response.json();
        };

        if (request.method === 'GET' && url.pathname === '/auth/line/start') {
          if (!lineReady) fail('ระบบ LINE Login ยังไม่เปิดใช้งาน', 503);
          // Always return to the configured production origin. Do not trust Host
          // or forwarded headers, or issue a login cookie on a preview origin.
          if (url.origin !== origin) return redirect(`${origin}/auth/line/start${url.searchParams.get('manual') === '1' ? '?manual=1' : ''}`);
          const state = random(), binding = random(), nonce = random(), verifier = random();
          await db.batch([
            stmt('DELETE FROM oauth_states WHERE expires_at<=?', now()),
            stmt('INSERT INTO oauth_states VALUES(?,?,?,?,?)', await hash(state), await hash(binding), nonce, verifier, now() + 300000)
          ]);
          const authorize = new URL('https://access.line.me/oauth2/v2.1/authorize');
          authorize.search = new URLSearchParams({ response_type: 'code', client_id: env.LINE_CHANNEL_ID,
            redirect_uri: `${origin}/auth/line/callback`, state, nonce, scope: 'openid profile', ui_locales: 'th',
            code_challenge: base64url(await digest(verifier)), code_challenge_method: 'S256' }).toString();
          if (url.searchParams.get('manual') === '1') authorize.searchParams.set('disable_auto_login', 'true');
          return redirect(authorize.href, [cookie('mk_oauth', binding, 300)]);
        }
        if (request.method === 'GET' && url.pathname === '/auth/line/callback') {
          try {
            if (!lineReady || url.origin !== origin) fail('LINE ไม่พร้อม', 503);
            const binding = readCookies(request).mk_oauth;
            const state = url.searchParams.get('state');
            if (!binding || !state) fail('คำขอเข้าสู่ระบบหมดอายุ', 401);
            // Atomic consume: two simultaneous callbacks cannot both exchange
            // the same OAuth code or reuse a browser-bound state.
            const saved = await stmt(`DELETE FROM oauth_states WHERE state_hash=? AND binding_hash=? AND expires_at>?
              RETURNING nonce,verifier`, await hash(state), await hash(binding), now()).first();
            if (!saved) fail('คำขอเข้าสู่ระบบหมดอายุ', 401);
            const code = url.searchParams.get('code');
            if (url.searchParams.has('error') || !code) fail('ยกเลิกการเข้าสู่ระบบ', 401);
            const tokens = await linePost('/oauth2/v2.1/token', { grant_type: 'authorization_code', code,
              redirect_uri: `${origin}/auth/line/callback`, client_id: env.LINE_CHANNEL_ID,
              client_secret: env.LINE_CHANNEL_SECRET, code_verifier: saved.verifier });
            if (typeof tokens.id_token !== 'string') fail('LINE ไม่ได้ส่งข้อมูลยืนยัน', 401);
            const identity = await linePost('/oauth2/v2.1/verify', { id_token: tokens.id_token, client_id: env.LINE_CHANNEL_ID, nonce: saved.nonce });
            if (identity.iss !== 'https://access.line.me' || String(identity.aud) !== env.LINE_CHANNEL_ID || identity.nonce !== saved.nonce ||
              !Number.isFinite(identity.exp) || identity.exp * 1000 <= now() || typeof identity.sub !== 'string' || !/^U[0-9a-f]{32}$/i.test(identity.sub)) fail('ข้อมูลยืนยัน LINE ไม่ถูกต้อง', 401);
            const token = random(), csrf = random();
            await db.batch([
              stmt(`INSERT INTO users(id,line_sub,line_name,created_at) VALUES(?,?,?,?)
                ON CONFLICT(line_sub) DO UPDATE SET line_name=excluded.line_name`, crypto.randomUUID(), identity.sub, String(identity.name || 'ผู้เล่น LINE').slice(0, 100), now()),
              stmt('DELETE FROM sessions WHERE expires_at<=?', now()),
              stmt('INSERT INTO sessions SELECT ?,id,?,? FROM users WHERE line_sub=?', await hash(token), csrf, now() + SESSION_MS, identity.sub)
            ]);
            return redirect('/', [cookie('mk_session', token, SESSION_MS / 1000), cookie('mk_oauth', '', 0)]);
          } catch { return redirect('/?login_error=1', [cookie('mk_oauth', '', 0)]); }
        }
        if (url.pathname === '/api/liff/config' && request.method === 'GET') {
          if (!lineReady || !env.LIFF_ID) fail('LIFF ยังไม่เปิดใช้งาน', 503);
          if (url.origin !== origin) fail('กรุณาเปิดลิงก์เกมหลัก', 403);
          const csrf = random();
          return json({ csrf }, 200, { 'Set-Cookie': cookie('mk_liff', csrf, 300) });
        }
        if (url.pathname === '/api/liff/session' && request.method === 'POST') {
          if (!lineReady || !env.LIFF_ID) fail('LIFF ยังไม่เปิดใช้งาน', 503);
          const binding = readCookies(request).mk_liff;
          if (url.origin !== origin || request.headers.get('Origin') !== origin || !binding ||
            !equal(binding, request.headers.get('X-CSRF-Token'))) fail('กรุณาเปิดเกมใหม่จาก LINE', 403);
          const data = await readBody(request);
          if (typeof data.idToken !== 'string' || data.idToken.length > 6000 || !data.idToken) fail('ไม่พบข้อมูลยืนยัน LINE', 401);
          const identity = await linePost('/oauth2/v2.1/verify', { id_token: data.idToken, client_id: env.LINE_CHANNEL_ID });
          if (identity.iss !== 'https://access.line.me' || String(identity.aud) !== env.LINE_CHANNEL_ID ||
            !Number.isFinite(identity.exp) || identity.exp * 1000 <= now() || typeof identity.sub !== 'string' ||
            !/^U[0-9a-f]{32}$/i.test(identity.sub)) fail('ข้อมูลยืนยัน LINE ไม่ถูกต้อง', 401);
          const token = random(), csrf = random();
          const result = await db.batch([
            stmt(`INSERT INTO users(id,line_sub,line_name,created_at) VALUES(?,?,?,?)
              ON CONFLICT(line_sub) DO UPDATE SET line_name=excluded.line_name`, crypto.randomUUID(), identity.sub, String(identity.name || 'ผู้เล่น LINE').slice(0,100), now()),
            stmt('DELETE FROM sessions WHERE expires_at<=?', now()),
            stmt('INSERT INTO sessions SELECT ?,id,?,? FROM users WHERE line_sub=?', await hash(token), csrf, now() + SESSION_MS, identity.sub),
            stmt('SELECT * FROM users WHERE line_sub=?', identity.sub)
          ]);
          const headers = new Headers();
          headers.append('Set-Cookie', cookie('mk_session', token, SESSION_MS / 1000));
          headers.append('Set-Cookie', cookie('mk_liff', '', 0));
          return json({ user: userView(result[3].results[0]), csrf }, 200, headers);
        }
        if (request.method === 'GET' && url.pathname === '/api/session') {
          const user = await session(false);
          return json({ lineReady, csrf: user?.csrf || '', user: user ? userView(user) : null, penaltyMs: PENALTY_MS, ...(lineReady && env.LIFF_ID ? { liffId: env.LIFF_ID } : {}) });
        }
        if (request.method === 'GET' && url.pathname === '/api/leaderboard') {
          if (url.searchParams.get('rulesVersion') === '2') {
            const user = await session(false), page = boardPage(url);
            const [rows, totals, me] = await db.batch([
              stmt(`${board90SQL} LIMIT 10 OFFSET ?`, (page - 1) * 10), stmt(totals90SQL), stmt(me90SQL, user?.id || '')
            ]);
            return json(board90View(rows.results, totals.results[0], me.results[0], user?.id, page));
          }
          const { results } = await stmt(`${boardSQL} LIMIT 10`).all();
          return json({ entries: results.map((row) => ({ name: row.name, scoreMs: row.score_ms, misses: row.misses })) });
        }
        if (request.method === 'GET' && url.pathname === '/api/me/stats') {
          const user = await session();
          if (url.searchParams.get('rulesVersion') === '2') {
            const [summary, me, history] = await db.batch([
              stmt(summary90SQL, user.id), stmt(me90SQL, user.id), stmt(historySQL, user.id)
            ]);
            return json({ ...summary.results[0], bestScoreMs: me.results[0]?.scoreMs ?? null,
              bestFoundCount: me.results[0]?.foundCount ?? null, rank: me.results[0]?.rank ?? null, recentRuns: history.results });
          }
          const [summary, rank, history] = await db.batch([
            stmt(summarySQL, user.id), stmt(rankSQL, user.id), stmt(historySQL, user.id)
          ]);
          return json({ ...summary.results[0], rank: rank.results[0]?.rank ?? null, recentRuns: history.results });
        }
        if (request.method === 'GET' && ['/api/admin/players', '/api/admin/export'].includes(url.pathname)) {
          const user = await session();
          if (!admins.has(user.line_sub)) fail('สำหรับผู้ดูแลกิจกรรมเท่านั้น', 403);
          const { results: rows } = await stmt(`SELECT u.name,u.phone,u.line_name AS lineName,u.line_sub AS lineUserId,
            u.consent_at AS consentAt,u.created_at AS createdAt,COUNT(r.id) AS attempts,
            MIN(CASE WHEN r.status='complete' THEN r.score_ms END) AS bestScoreMs
            FROM users u LEFT JOIN runs r ON r.user_id=u.id WHERE u.consent_at IS NOT NULL
            GROUP BY u.id ORDER BY u.created_at DESC LIMIT 10000`).all();
          if (url.pathname === '/api/admin/players') return json({ players: rows });
          const cell = (value) => '"' + String(value ?? '').replace(/^[=+@\-\t\r]/, (s) => "'" + s).replaceAll('"', '""') + '"';
          const keys = ['name', 'phone', 'lineName', 'lineUserId', 'consentAt', 'attempts', 'bestScoreMs'];
          const csv = '\ufeff' + [keys, ...rows.map((row) => keys.map((key) => row[key]))].map((row) => row.map(cell).join(',')).join('\r\n');
          return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="makro-players.csv"' } });
        }
        if (request.method === 'POST' && url.pathname.startsWith('/api/')) {
          const user = await session();
          if (!origin || url.origin !== origin || request.headers.get('Origin') !== origin || !equal(request.headers.get('X-CSRF-Token'), user.csrf)) fail('คำขอไม่ถูกต้อง กรุณาโหลดหน้าใหม่', 403);
          const data = await readBody(request);
          if (url.pathname === '/api/logout') {
            await stmt('DELETE FROM sessions WHERE token_hash=?', user.token_hash).run();
            return json({ ok: true }, 200, { 'Set-Cookie': cookie('mk_session', '', 0) });
          }
          if (url.pathname === '/api/profile') {
            const name = typeof data.name === 'string' ? data.name.trim().replace(/\s+/g, ' ') : '';
            let phone = typeof data.phone === 'string' ? data.phone.replace(/[\s()-]/g, '') : '';
            if (phone.startsWith('+66')) phone = '0' + phone.slice(3);
            if (name.length < 2 || name.length > 80 || /[\p{Cc}\p{Cf}]/u.test(name)) fail('กรุณาระบุชื่อ 2–80 ตัวอักษร');
            if (!/^0[1-9]\d{7,8}$/.test(phone)) fail('กรุณาระบุเบอร์ติดต่อในประเทศไทยให้ถูกต้อง');
            if (data.consent !== true) fail('กรุณายืนยันการจัดเก็บข้อมูลก่อนเริ่มเกม');
            const updated = await stmt('UPDATE users SET name=?,phone=?,consent_at=? WHERE id=? RETURNING *', name, phone, now(), user.id).first();
            return json({ user: userView(updated) });
          }
          if (url.pathname === '/api/runs') {
            if (!userView(user).profileComplete) fail('กรุณาบันทึกชื่อ เบอร์ติดต่อ และการยินยอมก่อนเริ่มเกม', 403);
            if (data.rulesVersion !== undefined && data.rulesVersion !== 2) fail('กรุณาโหลดเกมเวอร์ชันล่าสุด', 409);
            const id = crypto.randomUUID(), timestamp = now();
            const belowLimit = '(SELECT COUNT(*) FROM runs WHERE user_id=? AND created_at>?)<10';
            const result = await db.batch([
              stmt(`UPDATE runs SET status='abandoned' WHERE user_id=? AND status='active' AND ${belowLimit}`, user.id, user.id, timestamp - 60000),
              stmt(`INSERT INTO runs(id,user_id,created_at,found) SELECT ?,?,?,? WHERE ${belowLimit}`, id, user.id, timestamp, newProgress(data.rulesVersion), user.id, timestamp - 60000)
            ]);
            if (result[1].meta.changes !== 1) fail('เริ่มเกมบ่อยเกินไป กรุณารอสักครู่', 429);
            return json({ id, penaltyMs: PENALTY_MS, rulesVersion: data.rulesVersion || 1, levelMs: data.rulesVersion === 2 ? SPRINT_MS : 120000 }, 201);
          }
          const match = url.pathname.match(/^\/api\/runs\/([\w-]{36})\/events$/);
          if (match) return json(await applyEvent(db, user, match[1], data, now()));
        }
        return json({ error: 'ไม่พบหน้าที่ต้องการ' }, 404);
      };
      try { return securityHeaders(await handle(), url.protocol === 'https:'); }
      catch (error) {
        // No tokens, contacts, SQL or LINE response bodies in logs/errors.
        return securityHeaders(json({ error: error.status ? error.message : 'ระบบบันทึกข้อมูลขัดข้อง กรุณาลองอีกครั้ง' }, error.status || 500), url.protocol === 'https:');
      }
    }
  };
}

async function applyEvent(db, user, id, event, timestamp) {
  if (typeof event.eventId !== 'string' || !/^[\w-]{16,80}$/.test(event.eventId) || !Number.isSafeInteger(event.seq) || event.seq < 1) fail('รหัสรายการไม่ถูกต้อง');
  const stmt = (sql, ...values) => db.prepare(sql).bind(...values);
  const payloadHash = await hash(JSON.stringify(event));
  const snapshot = await db.batch([
    stmt('SELECT * FROM runs WHERE id=? AND user_id=?', id, user.id),
    stmt('SELECT payload_hash,response FROM events WHERE run_id=? AND event_id=?', id, event.eventId)
  ]);
  const run = snapshot[0].results[0];
  if (!run) fail('ไม่พบรอบเกม', 404);
  const replay = (previous) => {
    if (previous.payload_hash !== payloadHash) fail('รหัสรายการถูกใช้กับข้อมูลอื่นแล้ว', 409);
    return JSON.parse(previous.response);
  };
  if (snapshot[1].results[0]) return replay(snapshot[1].results[0]);
  const previousSeq = run.last_seq;
  const previousStatus = run.status;
  advanceRun(run, event, timestamp);
  const response = runResult(run, timestamp);
  const ranking = sprintProgress(run) ? rank90SQL : rankSQL;
  const revision = crypto.randomUUID();
  // Optimistic compare-and-swap plus event insertion form ONE D1 transaction.
  // The private revision token guards INSERT even when UPDATE loses a race to
  // another event or a newly started game. No read/await gap inside the batch.
  const responseSQL = run.status === 'complete' ? `json_set(?, '$.rank', (${ranking}))` : '?';
  const responseValues = run.status === 'complete' ? [JSON.stringify(response), user.id] : [JSON.stringify(response)];
  const result = await db.batch([
    stmt(`UPDATE runs SET status=?,level=?,phase=?,found=?,elapsed_ms=?,current_ms=?,misses=?,hints=?,segment_at=?,last_seq=?,completed_at=?,score_ms=?,revision_token=?
      WHERE id=? AND user_id=? AND status=? AND last_seq=?`, run.status, run.level, run.phase, run.found, run.elapsed_ms, run.current_ms,
      run.misses, run.hints, run.segment_at, run.last_seq, run.completed_at, run.score_ms, revision, id, user.id, previousStatus, previousSeq),
    stmt(`INSERT INTO events(run_id,event_id,seq,payload_hash,response)
      SELECT ?,?,?,?,${responseSQL} FROM runs WHERE id=? AND revision_token=?`, id, event.eventId, event.seq, payloadHash, ...responseValues, id, revision),
    stmt('SELECT payload_hash,response FROM events WHERE run_id=? AND event_id=?', id, event.eventId)
  ]);
  const saved = result[2].results[0];
  if (saved) return replay(saved);
  fail('รายการเล่นเปลี่ยนไปแล้ว กรุณาลองส่งอีกครั้ง', 409);
}

export default createWorker();
