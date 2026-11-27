// Stick v1 relay server (Cloudflare Worker + one Durable Object per room).
//
// Protocol (JSON text frames), matching wsRoom() in src/game.js:
//   client -> server  { t: 'join', room, id }     first message; id is chosen by the client so reconnects keep it
//   client -> server  { t: 'p', data }            the client's whole "presence" object (sent on change + heartbeat)
//   server -> client  { t: 'welcome', id, peers: [{ id, data }] }
//   server -> client  { t: 'p', id, data }        another player's presence
//   server -> client  { t: 'left', id }           another player disconnected
//   server -> client  { t: 'full' }               the room already has two players
//   client -> server  { t: 'ping' } every 2 s  ->  server -> client { t: 'pong' }   (lets the client spot a dead link)
// Rooms hold at most two players. Nothing is stored; a room disappears when both players leave.

const MAX_PLAYERS = 2;
const MAX_FRAME = 64 * 1024;
const cleanRoom = r => String(r || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
const cleanId = i => String(i || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
    if (url.pathname.startsWith('/wallet')) {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      return walletRoute(request, env, cors, url.pathname);
    }
    if (url.pathname === '/leaderboard' || url.pathname === '/stats/played') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      return statsRoute(request, env, cors, url.pathname);
    }
    if (url.pathname === '/ai/move') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      if (request.method !== 'POST') return json({ error: 'method' }, 405, cors);
      return aiMove(request, env, cors);
    }
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Stick v1 relay is running.', { headers: { 'content-type': 'text/plain', ...cors } });
    }
    const room = cleanRoom(url.searchParams.get('room'));
    if (!room) return new Response('Missing ?room=', { status: 400, headers: cors });
    const stub = env.ROOMS.get(env.ROOMS.idFromName(room));
    return stub.fetch(request);
  }
};

export class Room {
  constructor(state) {
    this.state = state;
    this.presence = new Map(); // id -> latest presence object (kept in memory; clients resend it every 250 ms)
  }

  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // Hibernation API: the object can sleep between messages without dropping sockets.
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ id: null });
    return new Response(null, { status: 101, webSocket: client });
  }

  sockets() { return this.state.getWebSockets(); }
  idOf(ws) { const a = ws.deserializeAttachment(); return a && a.id; }
  send(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch (e) {} }
  others(ws) { return this.sockets().filter(s => s !== ws && this.idOf(s)); }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > MAX_FRAME) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    const myId = this.idOf(ws);

    if (m.t === 'join') {
      const id = cleanId(m.id) || crypto.randomUUID().slice(0, 12);
      // a reconnect from the same player replaces its old socket
      for (const s of this.sockets()) if (s !== ws && this.idOf(s) === id) { try { s.close(4000, 'replaced'); } catch (e) {} }
      const playerIds = new Set(this.sockets().filter(s => s !== ws).map(s => this.idOf(s)).filter(x => x && x !== id));
      if (playerIds.size >= MAX_PLAYERS) { this.send(ws, { t: 'full' }); try { ws.close(4001, 'full'); } catch (e) {} return; }
      ws.serializeAttachment({ id });
      const peers = [...playerIds].map(pid => ({ id: pid, data: this.presence.get(pid) || {} }));
      this.send(ws, { t: 'welcome', id, peers });
      return;
    }
    if (m.t === 'ping') { this.send(ws, { t: 'pong' }); return; }
    if (!myId) return; // must join first

    if (m.t === 'p') {
      const data = m.data && typeof m.data === 'object' ? m.data : {};
      this.presence.set(myId, data);
      const out = JSON.stringify({ t: 'p', id: myId, data });
      for (const s of this.others(ws)) { try { s.send(out); } catch (e) {} }
    }
  }

  async webSocketClose(ws, code, reason) { try { ws.close(code === 1005 ? 1000 : code, reason); } catch (e) {} this.gone(ws); }
  async webSocketError(ws) { this.gone(ws); }

  gone(ws) {
    const id = this.idOf(ws);
    if (!id) return;
    // only announce a departure if that player has no other live socket (a reconnect may already have replaced it)
    const still = this.sockets().some(s => s !== ws && this.idOf(s) === id);
    if (still) return;
    this.presence.delete(id);
    for (const s of this.others(ws)) this.send(s, { t: 'left', id });
  }
}


/* ---------- AI move builder (Gemini) ----------
   POST /ai/move  { element, prompt, ult, base? }  with  Authorization: Bearer <Firebase ID token>
   The Gemini key never leaves the Worker. Each signed-in player gets a daily allowance. */
const json = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...headers } });
const DAILY_LIMIT = 40;
const MODELS_DEFAULT = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-latest', 'gemini-2.5-flash'];

let jwksCache = { at: 0, keys: [] };
async function googleKeys() {
  if (Date.now() - jwksCache.at < 3600e3 && jwksCache.keys.length) return jwksCache.keys;
  const r = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  const j = await r.json(); jwksCache = { at: Date.now(), keys: j.keys || [] }; return jwksCache.keys;
}
const b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
async function verifyFirebaseToken(token, projectId) {
  const parts = String(token || '').split('.'); if (parts.length !== 3) throw new Error('token');
  const head = JSON.parse(new TextDecoder().decode(b64u(parts[0]))), body = JSON.parse(new TextDecoder().decode(b64u(parts[1])));
  if (head.alg !== 'RS256') throw new Error('alg');
  const jwk = (await googleKeys()).find(k => k.kid === head.kid); if (!jwk) throw new Error('kid');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  const now = Math.floor(Date.now() / 1000);
  if (!ok || body.aud !== projectId || body.iss !== 'https://securetoken.google.com/' + projectId || !body.sub || body.exp < now || body.iat > now + 300) throw new Error('claims');
  return body.sub;
}

const TYPES = { projectile: 'thrown/shot at the target; count fires several', beam: 'instant line after a short wind-up; size = thickness', burst: 'instant blast around the caster; size = radius', zone: 'lingering area near the target; duration = seconds, speed makes it drift', dash: 'quick move; speed = distance; hits if damage > 0', shield: 'bubble that blocks projectiles/beams; duration = seconds', rain: 'drops fall from the sky around the target; count adds drops', strike: 'marked circle at the target that blasts after a delay; higher speed = shorter delay', wave: 'travels along the ground; size = height; jumping dodges it', trap: 'hidden rune that explodes when the enemy steps on it', summon: 'floating helper that shoots on its own; speed = fire rate' };
const EFFECTS = { blind: 'target cannot cast and their screen goes dark; lasts 0.3+0.45*strength s, plus 0.5 s per point of duration', pull: 'yanks the target toward the caster', push: 'knocks the target away', slow: 'target moves at half speed', reflect: 'shields only: bounces projectiles and beams back', homing: 'projectiles steer toward the target', curve: 'projectiles weave and slip around shields', pierce: 'projectiles keep going after a hit' };
function buildPrompt({ element, prompt, ult, base }) {
  return `You design one ${ult ? 'ULTIMATE' : 'regular'} move for a 2D stick-figure fighting game. The fighter's element is "${element}".
Turn the player's idea into game data. Use only these building blocks.

Move types: ${Object.entries(TYPES).map(([k, v]) => `${k} (${v})`).join('; ')}.
Effects (max 2, strength 1-5): ${Object.entries(EFFECTS).map(([k, v]) => `${k} (${v})`).join('; ')}.
Stats are integers: damage 0-10, speed 1-10, size 1-10, count 1-6, duration 0-5. cooldown 1-10 seconds. mana_overcharge 0-40. visual.shape: orb | spear | blade | star (spear/blade suit swords and knives).
Cost rule: build = typeBase + damage*2 + speed + size + (count-1)*3 + duration + effectCosts - max(0, cooldown-3) - 3*floor(overcharge/10).
typeBase: projectile 2, dash 2, beam 3, burst 3, wave 3, trap 3, zone 4, shield 4, rain 4, strike 4, summon 6. Effect cost per strength: push 1, pull 2, slow 2, homing 2, curve 2, pierce 2, blind 3, reflect 4.
${ult ? 'An ultimate must have build <= 40 (cooldown and overcharge are ignored).' : 'A regular move must have build <= 30 and mana (= 5 + build*0.6 + overcharge) <= 60. Raise cooldown to pay for strong moves.'}
Keep the player's numbers when they give them (e.g. "5 swords" means count 5), and balance the rest to fit the budget.
${base ? `Current move (modify it as asked, keep what they didn't mention): ${JSON.stringify(base)}\nChange requested: ` : 'Idea: '}"""${String(prompt).slice(0, 400)}"""

Reply with JSON only: {"name": string <= 26 chars, "type": string, "stats": {"damage","speed","size","count","duration"}, "effects": [{"type","strength"}], "cooldown": int, "mana_overcharge": int, "visual": {"shape": string}, "flavor": one vivid sentence <= 120 chars, "note": short note on anything you couldn't do exactly}`;
}
async function callGemini(env, text) {
  const models = (env.GEMINI_MODEL ? [env.GEMINI_MODEL] : []).concat(MODELS_DEFAULT);
  let last = 'no model';
  for (const model of models) {
    const r = await fetch(`${env.GEMINI_BASE || 'https://generativelanguage.googleapis.com'}/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.8 } })
    });
    if (r.status === 404 || r.status === 400) { last = model + ' ' + r.status; continue; }
    if (r.status === 429) throw Object.assign(new Error('busy'), { code: 'rate_limited' });
    if (!r.ok) { last = model + ' ' + r.status; continue; }
    const j = await r.json();
    const out = (((j.candidates || [])[0] || {}).content || {}).parts;
    const txt = out && out.map(p => p.text || '').join('');
    if (!txt) { last = 'empty'; continue; }
    const m = txt.match(/\{[\s\S]*\}/); if (!m) { last = 'not json'; continue; }
    return JSON.parse(m[0]);
  }
  throw Object.assign(new Error(last), { code: 'ai_failed' });
}
async function aiMove(request, env, cors) {
  if (!env.GEMINI_API_KEY) return json({ error: 'no_ai', message: 'The AI move builder is not set up on this server.' }, 503, cors);
  let uid;
  const tok = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  // DEV_FAKE_AUTH only exists in a local server/.dev.vars file for testing; it is never set in production
  try { uid = env.DEV_FAKE_AUTH === '1' && tok.startsWith('dev:') ? tok.slice(4) : await verifyFirebaseToken(tok, env.FIREBASE_PROJECT_ID); }
  catch (e) { return json({ error: 'auth', message: 'Sign in to build moves with AI.' }, 401, cors); }
  let body; try { body = await request.json(); } catch (e) { return json({ error: 'bad_request' }, 400, cors); }
  const element = String(body.element || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 12);
  const prompt = String(body.prompt || '').trim();
  if (!element || prompt.length < 3) return json({ error: 'bad_request', message: 'Describe the move first.' }, 400, cors);
  const quota = env.QUOTA.get(env.QUOTA.idFromName(uid));
  const q = await (await quota.fetch('https://quota/use?limit=' + DAILY_LIMIT)).json();
  if (!q.ok) return json({ error: 'quota', message: `You've used today's ${DAILY_LIMIT} AI moves. Try again tomorrow.` }, 429, cors);
  try {
    const move = await callGemini(env, buildPrompt({ element, prompt, ult: !!body.ult, base: body.base && typeof body.base === 'object' ? body.base : null }));
    return json({ move, left: q.left }, 200, cors);
  } catch (e) {
    return json({ error: e.code || 'ai_failed', message: e.code === 'rate_limited' ? 'The AI is busy right now. Wait a moment and try again.' : 'The AI could not build that move. Try rewording it.' }, e.code === 'rate_limited' ? 429 : 502, cors);
  }
}

// One tiny Durable Object per player counts AI requests per UTC day.
export class Quota {
  constructor(state) { this.state = state; }
  async fetch(request) {
    const limit = Number(new URL(request.url).searchParams.get('limit')) || DAILY_LIMIT;
    const day = new Date().toISOString().slice(0, 10);
    const rec = (await this.state.storage.get('q')) || { day, n: 0 };
    if (rec.day !== day) { rec.day = day; rec.n = 0; }
    if (rec.n >= limit) return json({ ok: false, left: 0 });
    rec.n++; await this.state.storage.put('q', rec);
    return json({ ok: true, left: limit - rec.n });
  }
}


/* ---------- doolers: the in-game currency ----------
   Balances live here on the server (one Durable Object per player), never in the browser, so nobody can edit their own.
     GET  /wallet                          -> { balance }
     POST /wallet/bot    { level, hits }   -> win against the bot: your final score in doolers ("hits" carries the score)
     POST /wallet/spend  { reason, ref }   -> pay 100 to keep an AI-built move
     POST /wallet/report { match, role, winner, hits: { host, guest } }  -> online result. When both games agree,
                                              the winner gets (their score - the loser's score): half from the loser,
                                              half from the game (the game covers any odd one, so no fractions)
   New players start with 100. Earnings have daily caps and bot wins are rate-limited to stop farming. */
const DOOLERS = { coupon: 500, welcome: 100, move: 100, maxHits: 300, bot: { easy: 1, normal: 1, hard: 1 }, botCapPerDay: 800, matchCapPerDay: 1500, botMinGapMs: 50000 };
async function authUid(request, env) {
  const tok = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (env.DEV_FAKE_AUTH === '1' && tok.startsWith('dev:')) return tok.slice(4);
  return verifyFirebaseToken(tok, env.FIREBASE_PROJECT_ID);
}
const wallet = (env, uid) => env.WALLET.get(env.WALLET.idFromName(uid));
const callDO = async (stub, path, body) => (await stub.fetch('https://do' + path, { method: 'POST', body: JSON.stringify(body || {}) })).json();
async function walletRoute(request, env, cors, path) {
  let uid; try { uid = await authUid(request, env); } catch (e) { return json({ error: 'auth', message: 'Sign in to use doolers.' }, 401, cors); }
  let body = {}; if (request.method === 'POST') { try { body = await request.json(); } catch (e) {} }
  const w = wallet(env, uid);
  if (path === '/wallet') return json(await callDO(w, '/get', {}), 200, cors);
  if (path === '/wallet/bot') {
    const r = await callDO(w, '/bot', { level: String(body.level || ''), hits: Math.max(0, Math.min(DOOLERS.maxHits, Math.floor(Number(body.hits) || 0))) });
    if (r.gained > 0) await boardWon(env, uid, r.gained);
    return json(r, 200, cors);
  }
  if (path === '/wallet/spend') return json(await callDO(w, '/spend', { amount: DOOLERS.move, reason: String(body.reason || 'move').slice(0, 40), ref: String(body.ref || '').slice(0, 40) }), 200, cors);
  if (path === '/wallet/coupon') {
    // tester code: kept as a secret on the server (TESTER_CODE), never in the page
    const want = String(env.TESTER_CODE || ''), got = String(body.code || '').trim();
    if (!want) return json({ ok: false, error: 'off', message: 'Tester codes are not set up on this server.' }, 200, cors);
    let diff = want.length ^ got.length; for (let i = 0; i < Math.max(want.length, got.length); i++) diff |= (want.charCodeAt(i) || 0) ^ (got.charCodeAt(i) || 0);
    if (diff) return json({ ok: false, error: 'bad_code', message: 'That code isn’t right.' }, 200, cors);
    return json(await callDO(w, '/coupon', { amount: DOOLERS.coupon }), 200, cors);
  }
  if (path === '/wallet/report') {
    const match = String(body.match || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60), role = body.role === 'host' ? 'host' : body.role === 'guest' ? 'guest' : '';
    const winner = ['host', 'guest', 'draw'].includes(body.winner) ? body.winner : '';
    const hv = v => Math.max(0, Math.min(DOOLERS.maxHits, Math.floor(Number(v) || 0)));
    const hits = { host: hv(body.hits && body.hits.host), guest: hv(body.hits && body.hits.guest) };
    if (!match || !role || !winner) return json({ error: 'bad_request' }, 400, cors);
    const m = env.MATCH.get(env.MATCH.idFromName(match));
    return json(await callDO(m, '/report', { uid, role, winner, hits }), 200, cors);
  }
  return json({ error: 'not_found' }, 404, cors);
}

export class Wallet {
  constructor(state) { this.state = state; }
  async load() {
    let w = await this.state.storage.get('w');
    if (!w) { w = { balance: DOOLERS.welcome, day: '', bot: 0, match: 0, lastBot: 0, log: [{ t: Date.now(), d: DOOLERS.welcome, r: 'welcome' }] }; await this.state.storage.put('w', w); }
    const day = new Date().toISOString().slice(0, 10); if (w.day !== day) { w.day = day; w.bot = 0; w.match = 0; }
    return w;
  }
  async save(w) { w.log = (w.log || []).slice(-30); await this.state.storage.put('w', w); }
  async fetch(request) {
    const path = new URL(request.url).pathname; let b = {}; try { b = await request.json(); } catch (e) {}
    const w = await this.load();
    if (path === '/get') return json({ balance: w.balance });
    if (path === '/wonsum') return json({ won: (w.log || []).filter(e => e.d > 0 && /^(bot |won online)/.test(e.r || '')).reduce((a, e) => a + e.d, 0) });
    if (path === '/bot') {
      if (!DOOLERS.bot[b.level]) return json({ ok: false, balance: w.balance, error: 'level' });
      const amt = Math.max(0, Math.floor(Number(b.hits) || 0)); if (!amt) return json({ ok: false, gained: 0, balance: w.balance });
      if (Date.now() - w.lastBot < DOOLERS.botMinGapMs) return json({ ok: false, balance: w.balance, error: 'too_soon' });
      const give = Math.max(0, Math.min(amt, DOOLERS.botCapPerDay - w.bot));
      w.lastBot = Date.now(); w.bot += give; w.balance += give; w.log.push({ t: Date.now(), d: give, r: 'bot ' + b.level }); await this.save(w);
      return json({ ok: give > 0, gained: give, balance: w.balance, capped: give < amt });
    }
    if (path === '/spend') {
      const amt = Number(b.amount) || 0; if (w.balance < amt) return json({ ok: false, balance: w.balance, error: 'not_enough' });
      w.balance -= amt; w.log.push({ t: Date.now(), d: -amt, r: b.reason + ' ' + b.ref }); await this.save(w);
      return json({ ok: true, balance: w.balance });
    }
    if (path === '/coupon') { // a few seconds apart so a stuck button can't fire it twice
      if (Date.now() - (w.lastCoupon || 0) < 3000) return json({ ok: false, balance: w.balance, error: 'too_soon', message: 'Give it a second and try again.' });
      const amt = Number(b.amount) || 0; w.lastCoupon = Date.now(); w.balance += amt; w.log.push({ t: Date.now(), d: amt, r: 'tester code' }); await this.save(w);
      return json({ ok: true, gained: amt, balance: w.balance });
    }
    if (path === '/credit') { // from a settled online match
      const give = Math.max(0, Math.min(Number(b.amount) || 0, DOOLERS.matchCapPerDay - w.match));
      w.match += give; w.balance += give; w.log.push({ t: Date.now(), d: give, r: b.reason }); await this.save(w); return json({ ok: true, gained: give, balance: w.balance });
    }
    if (path === '/debit') { // the loser pays what they can, never going below zero
      const take = Math.max(0, Math.min(Number(b.amount) || 0, w.balance));
      w.balance -= take; w.log.push({ t: Date.now(), d: -take, r: b.reason }); await this.save(w); return json({ ok: true, taken: take, balance: w.balance });
    }
    return json({ error: 'not_found' }, 404);
  }
}

// One object per online match. Both players report who won; when they agree, money moves once.
// If only the winner reports (the loser closed the game), after 90 s the winner still gets the game's 25.
export class Match {
  constructor(state, env) { this.state = state; this.env = env; }
  async fetch(request) {
    const b = await request.json().catch(() => ({}));
    const m = (await this.state.storage.get('m')) || { reports: {}, settled: null };
    const pub = st => st && { winner: st.winner, won: st.won, lost: st.lost };
    if (m.settled) return json({ ok: true, settled: pub(m.settled), mine: this.mine(m.settled, b.uid) });
    const other = m.reports[b.role === 'host' ? 'guest' : 'host'];
    if (other && other.uid === b.uid) return json({ ok: false, error: 'same_player' });
    m.reports[b.role] = { uid: b.uid, winner: b.winner, hits: b.hits || { host: 0, guest: 0 }, t: Date.now() };
    await this.state.storage.put('m', m);
    const h = m.reports.host, g = m.reports.guest;
    const same = h && g && h.winner === g.winner && h.hits.host === g.hits.host && h.hits.guest === g.hits.guest;
    if (h && g) { await this.settle(m, same ? h.winner : 'disputed'); return json({ ok: true, settled: pub(m.settled), mine: this.mine(m.settled, b.uid) }); }
    await this.state.storage.setAlarm(Date.now() + 90000);
    return json({ ok: true, pending: true });
  }
  mine(st, uid) { if (!st) return 0; return st.winnerUid === uid ? st.won : st.loserUid === uid ? -st.lost : 0; }
  async settle(m, winnerRole) {
    const st = { winner: winnerRole, won: 0, lost: 0, winnerUid: null, loserUid: null };
    if (winnerRole === 'host' || winnerRole === 'guest') {
      const win = m.reports[winnerRole], lose = m.reports[winnerRole === 'host' ? 'guest' : 'host'];
      st.winnerUid = win && win.uid; st.loserUid = lose && lose.uid;
      // the winner earns the score difference: half from the loser (rounded down), the rest from the game
      const hits = win.hits, other = winnerRole === 'host' ? 'guest' : 'host', diff = Math.max(0, hits[winnerRole] - hits[other]);
      const loserShare = Math.floor(diff / 2), gameShare = diff - loserShare;
      let fromLoser = 0;
      if (lose && lose.winner === winnerRole && loserShare > 0) { const r = await callDO(wallet(this.env, lose.uid), '/debit', { amount: loserShare, reason: 'lost online' }); fromLoser = r.taken || 0; }
      const r2 = diff > 0 ? await callDO(wallet(this.env, win.uid), '/credit', { amount: gameShare + fromLoser, reason: 'won online' }) : { gained: 0 };
      st.won = r2.gained || 0; st.lost = fromLoser;
      if (st.won > 0) await boardWon(this.env, win.uid, st.won);
    }
    m.settled = st; await this.state.storage.put('m', m);
  }
  async alarm() {
    const m = (await this.state.storage.get('m')) || { reports: {} }; if (m.settled) return;
    const rs = Object.values(m.reports); const one = rs.length === 1 ? rs[0] : null;
    // only the winner showed up: give the game's share, take nothing from the absent player
    if (one && (one.winner === 'host' || one.winner === 'guest') && m.reports[one.winner] && m.reports[one.winner].uid === one.uid) {
      const other = one.winner === 'host' ? 'guest' : 'host', diff = Math.max(0, one.hits[one.winner] - one.hits[other]);
      const r = diff > 0 ? await callDO(wallet(this.env, one.uid), '/credit', { amount: diff - Math.floor(diff / 2), reason: 'won online (opponent left)' }) : { gained: 0 };
      m.settled = { winner: one.winner, won: r.gained || 0, lost: 0, winnerUid: one.uid, loserUid: null };
      if (r.gained > 0) await boardWon(this.env, one.uid, r.gained);
    } else m.settled = { winner: 'none', won: 0, lost: 0 };
    await this.state.storage.put('m', m);
  }
}


/* ---------- leaderboard ----------
     GET  /leaderboard                -> { players: [{ name, won, top, games }] }  top 50 by doolers won
     POST /stats/played { element }   -> counts a finished match (bot or online) toward "most played"
   Only doolers won from beating the bot or a friend count. Tester codes, the welcome bonus and refunds never do.
   The username is read from the player's own Firestore profile with their sign-in token, so nobody can post as someone else. */
const ELEMENTS = ['light', 'wind', 'fire', 'water', 'earth', 'darkness', 'antimatter', 'steel', 'lightning', 'ice'];
const board = env => env.BOARD.get(env.BOARD.idFromName('global'));
async function boardWon(env, uid, amount) {
  try { if (!env.BOARD) return; const seed = (await callDO(wallet(env, uid), '/wonsum', {})).won || 0; await callDO(board(env), '/won', { uid, amount, seed }); } catch (e) {}
}
async function usernameFor(env, uid, tok) {
  try {
    const r = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(uid)}`, { headers: { authorization: 'Bearer ' + tok } });
    if (!r.ok) return '';
    const j = await r.json(); const v = j && j.fields && j.fields.username && j.fields.username.stringValue;
    return /^[a-z0-9_]{3,16}$/.test(v || '') ? v : '';
  } catch (e) { return ''; }
}
async function statsRoute(request, env, cors, path) {
  if (!env.BOARD) return json({ error: 'off', players: [] }, 200, cors);
  if (path === '/leaderboard') return json(await callDO(board(env), '/top', {}), 200, { ...cors, 'cache-control': 'max-age=15' });
  if (request.method !== 'POST') return json({ error: 'method' }, 405, cors);
  const tok = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  let uid; try { uid = await authUid(request, env); } catch (e) { return json({ error: 'auth' }, 401, cors); }
  let body = {}; try { body = await request.json(); } catch (e) {}
  const el = ELEMENTS.includes(body.element) ? body.element : '';
  if (!el) return json({ error: 'bad_request' }, 400, cors);
  const name = env.DEV_FAKE_AUTH === '1' && tok.startsWith('dev:') ? String(body.name || uid).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 16) : await usernameFor(env, uid, tok);
  // the first time we see a player, seed their total from wins already in their wallet history
  const seed = (await callDO(wallet(env, uid), '/wonsum', {})).won || 0;
  return json(await callDO(board(env), '/played', { uid, name, el, seed }), 200, cors);
}

// One object holds the whole leaderboard: per player { name, won, played: { element: count }, games }.
export class Board {
  constructor(state) { this.state = state; this.all = null; }
  async load() {
    if (this.all) return this.all;
    this.all = new Map(); const rows = await this.state.storage.list({ prefix: 'p:' });
    for (const [k, v] of rows) this.all.set(k.slice(2), v);
    return this.all;
  }
  async put(uid, rec) { this.all.set(uid, rec); await this.state.storage.put('p:' + uid, rec); }
  async fetch(request) {
    const path = new URL(request.url).pathname; let b = {}; try { b = await request.json(); } catch (e) {}
    const all = await this.load();
    if (path === '/won') {
      let rec = all.get(b.uid);
      // a new player starts from their wallet history, which already includes this win
      if (!rec) rec = { name: '', won: Math.max(0, Number(b.seed) || 0), played: {}, games: 0 };
      else rec.won += Math.max(0, Math.floor(Number(b.amount) || 0));
      await this.put(b.uid, rec); return json({ ok: true });
    }
    if (path === '/played') {
      let rec = all.get(b.uid);
      if (!rec) rec = { name: '', won: Math.max(0, Number(b.seed) || 0), played: {}, games: 0 };
      if (Date.now() - (rec.lastPlayed || 0) < 15000) { if (b.name) rec.name = b.name; await this.put(b.uid, rec); return json({ ok: false, error: 'too_soon' }); }
      rec.lastPlayed = Date.now(); rec.games++; rec.played[b.el] = (rec.played[b.el] || 0) + 1; if (b.name) rec.name = b.name;
      await this.put(b.uid, rec); return json({ ok: true });
    }
    if (path === '/top') {
      const players = [...all.values()].filter(r => r.name && (r.won > 0 || r.games > 0))
        .sort((a, c) => c.won - a.won || c.games - a.games).slice(0, 50)
        .map(r => { let top = '', n = 0; for (const [e, c] of Object.entries(r.played || {})) if (c > n) { n = c; top = e; } return { name: r.name, won: r.won, top, games: r.games }; });
      return json({ players });
    }
    return json({ error: 'not_found' }, 404);
  }
}
