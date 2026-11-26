// Stick V1 relay server (Cloudflare Worker + one Durable Object per room).
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
    const cors = { 'Access-Control-Allow-Origin': '*' };
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Stick V1 relay is running.', { headers: { 'content-type': 'text/plain', ...cors } });
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
