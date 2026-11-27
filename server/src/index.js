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
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
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

const TYPES = { projectile: 'thrown/shot at the target; count fires several', beam: 'instant line after a short wind-up; size = thickness', burst: 'instant blast around the caster; size = radius', zone: 'lingering area near the target; duration = seconds, speed makes it drift', dash: 'quick move; speed = distance; hits if damage > 0', shield: 'bubble that blocks projectiles/beams; duration = seconds', rain: 'drops fall from the sky around the target; count adds drops', strike: 'marked circle at the target that blasts after a delay; higher speed = shorter delay', orbit: 'things circle the caster, hitting anyone close and blocking projectiles', wave: 'travels along the ground; size = height; jumping dodges it', trap: 'hidden rune that explodes when the enemy steps on it', summon: 'floating helper that shoots on its own; speed = fire rate' };
const EFFECTS = { blind: 'target cannot cast and their screen goes dark; lasts 0.3+0.45*strength s, plus 0.5 s per point of duration', pull: 'yanks the target toward the caster', push: 'knocks the target away', slow: 'target moves at half speed', reflect: 'shields only: bounces projectiles and beams back', homing: 'projectiles steer toward the target', curve: 'projectiles weave and slip around shields', pierce: 'projectiles keep going after a hit' };
function buildPrompt({ element, prompt, ult, base }) {
  return `You design one ${ult ? 'ULTIMATE' : 'regular'} move for a 2D stick-figure fighting game. The fighter's element is "${element}".
Turn the player's idea into game data. Use only these building blocks.

Move types: ${Object.entries(TYPES).map(([k, v]) => `${k} (${v})`).join('; ')}.
Effects (max 2, strength 1-5): ${Object.entries(EFFECTS).map(([k, v]) => `${k} (${v})`).join('; ')}.
Stats are integers: damage 0-10, speed 1-10, size 1-10, count 1-6, duration 0-5. cooldown 1-10 seconds. mana_overcharge 0-40. visual.shape: orb | spear | blade | star (spear/blade suit swords and knives).
Cost rule: build = typeBase + damage*2 + speed + size + (count-1)*3 + duration + effectCosts - max(0, cooldown-3) - 3*floor(overcharge/10).
typeBase: projectile 2, dash 2, beam 3, burst 3, wave 3, trap 3, zone 4, shield 4, rain 4, strike 4, orbit 4, summon 6. Effect cost per strength: push 1, pull 2, slow 2, homing 2, curve 2, pierce 2, blind 3, reflect 4.
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
