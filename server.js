// Tâm Tĩnh - máy chủ chùa online (HTTP tĩnh + WebSocket), chia phòng theo từng danh lam
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const STATS_FILE = path.join(process.env.DATA_DIR || __dirname, 'stats.json');

// Mỗi "server" là một ngôi chùa/đền với người chơi, chat và công đức riêng
const ROOM_IDS = ['baidinh', 'tamchuc', 'hoang7', 'hoang10', 'toathien'];
// Thiền đường: im lặng, tách thành nhiều bản sao (instance) khi đông
const SILENT = { toathien: 30 };
const MAX_INST = 20; // số người tối đa mỗi bản sao
const rooms = {};
let saved = {};
try { saved = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')); } catch (e) {}
for (const id of ROOM_IDS) rooms[id] = { players: new Map(), stats: { nien: 0, tung: 0, cung: 0, sit: 0, visitors: 0, ...(saved[id] || {}) } };
let dirty = false;
setInterval(() => {
  if (!dirty) return; dirty = false;
  const out = {}; for (const id of ROOM_IDS) out[id] = rooms[id].stats;
  fs.writeFile(STATS_FILE, JSON.stringify(out), () => {});
}, 10000);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/api/rooms') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(Object.fromEntries(ROOM_IDS.map(id => [id, rooms[id].players.size]))));
  }
  if (p === '/api/instances') {
    const cnt = Array(MAX_INST).fill(0); rooms.toathien.players.forEach(q => { if (q.inst <= MAX_INST) cnt[q.inst - 1]++; });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ cap: SILENT.toathien, counts: cnt }));
  }
  if (p === '/') p = '/index.html';
  const file = path.join(PUBLIC, path.normalize(p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Không tìm thấy'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, maxPayload: 4096 });
let nextId = 1;
const clean = (s, n) => String(s || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, n);
const clamp = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));
const send = (ws, o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
const SKINS = ['tieu', 'thay', 'phattu'];
const pub = p => ({ id: p.id, inst: p.inst, name: p.name, skin: p.skin, color: p.color, x: p.x, y: p.y, status: p.status });
// gửi cho mọi người trong cùng phòng
const broadcast = (room, o, except, inst) => {
  const m = JSON.stringify(o);
  wss.clients.forEach(c => { if (c !== except && c.readyState === 1 && c.room === room && (inst === undefined || c.inst === inst)) c.send(m); });
};

const OFFERS = { hoa: 'dâng hoa', huong: 'thắp nén hương', den: 'dâng đèn', qua: 'dâng mâm quả', gao: 'cúng dường gạo' };

wss.on('connection', ws => {
  ws.last = 0;
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const now = Date.now();
    if (m.t === 'join') {
      if (ws.pid || !ROOM_IDS.includes(m.room)) return;
      const R = rooms[m.room];
      const name = clean(m.name, 24);
      // chọn bản sao: phòng thường luôn là 1; thiền đường lấp đầy bản sao đầu còn chỗ
      let inst = 1;
      if (SILENT[m.room]) { const cnt = {}; R.players.forEach(q => { cnt[q.inst] = (cnt[q.inst] || 0) + 1; }); const want = parseInt(m.inst, 10);
      if (want >= 1 && want <= MAX_INST && (cnt[want] || 0) < SILENT[m.room]) inst = want;
      else while ((cnt[inst] || 0) >= SILENT[m.room]) inst++; }
      if (name.length < 2) return send(ws, { t: 'error', msg: 'Pháp danh cần ít nhất 2 ký tự.' });
      if ([...R.players.values()].some(p => p.inst === inst && p.name.toLowerCase() === name.toLowerCase()))
        return send(ws, { t: 'error', msg: 'Pháp danh này đang có người dùng ở đây, xin chọn pháp danh khác.' });
      const p = { id: nextId++, name, skin: SKINS.includes(m.skin) ? m.skin : 'phattu', color: /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#c9822b', x: 400 + Math.random() * 200, y: 420 + Math.random() * 100, status: '', inst };
      ws.pid = p.id; ws.room = m.room; ws.inst = inst; R.players.set(p.id, p); R.stats.visitors++; dirty = true;
      send(ws, { t: 'init', id: p.id, room: m.room, inst, players: [...R.players.values()].filter(q => q.inst === inst).map(pub), stats: R.stats });
      broadcast(ws.room, { t: 'join', p: pub(p) }, ws, inst);
      if (!SILENT[m.room]) broadcast(ws.room, { t: 'sys', msg: `${p.name} vừa vào. A Di Đà Phật.` }, ws, inst);
      return;
    }
    const R = rooms[ws.room]; const p = R && R.players.get(ws.pid); if (!p) return;
    const all = o => broadcast(ws.room, o, undefined, ws.inst);
    const silent = !!SILENT[ws.room];
    if (m.t === 'move') {
      p.x = clamp(m.x, 40, 960); p.y = clamp(m.y, 330, 570);
      broadcast(ws.room, { t: 'move', id: p.id, x: p.x, y: p.y }, ws, ws.inst);
    } else if (m.t === 'chat') {
      if (silent) return;
      if (now - (ws.lastChat || 0) < 700) return; ws.lastChat = now;
      const text = clean(m.text, 200); if (!text) return;
      all({ t: 'chat', id: p.id, name: p.name, text });
    } else if (m.t === 'status') {
      p.status = ['niem', 'tung', 'sit', 'bow', ''].includes(m.s) ? m.s : '';
      broadcast(ws.room, { t: 'status', id: p.id, s: p.status, k: clean(m.k, 40) }, ws, ws.inst);
    } else if (m.t === 'nien') {
      R.stats.nien += clamp(m.n, 1, 20) | 0; dirty = true;
      all({ t: 'stats', stats: R.stats });
    } else if (m.t === 'tung') {
      const k = clean(m.k, 40); if (!k) return;
      R.stats.tung++; dirty = true;
      all({ t: 'sys', msg: `${p.name} vừa hoàn thành một thời: ${k}. Công đức vô lượng.` });
      all({ t: 'stats', stats: R.stats });
    } else if (m.t === 'sit') {
      if (now - (ws.lastSit || 0) < 50000) return; ws.lastSit = now;
      R.stats.sit++; dirty = true;
    } else if (m.t === 'bell') {
      if (!silent || now - (ws.lastBell || 0) < 4000) return; ws.lastBell = now;
      all({ t: 'bell', id: p.id });
    } else if (m.t === 'offer') {
      if (silent) return;
      if (!OFFERS[m.item] || now - (ws.lastOffer || 0) < 500) return; ws.lastOffer = now;
      R.stats.cung++; dirty = true;
      all({ t: 'offer', id: p.id, name: p.name, item: m.item, text: OFFERS[m.item] });
      all({ t: 'stats', stats: R.stats });
    }
  });
  ws.on('close', () => {
    const R = rooms[ws.room]; const p = R && R.players.get(ws.pid); if (!p) return;
    R.players.delete(p.id);
    broadcast(ws.room, { t: 'leave', id: p.id }, undefined, p.inst);
    if (!SILENT[ws.room]) broadcast(ws.room, { t: 'sys', msg: `${p.name} đã rời đi.` }, undefined, p.inst);
  });
});

server.listen(PORT, () => console.log(`Tâm Tĩnh mở cửa tại http://localhost:${PORT}`));
