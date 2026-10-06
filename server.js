// Execute: node server.js  |  Abra: http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = __dirname;
const rooms = new Map();
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.mp3': 'audio/mpeg' };
const send = (res, status, data = '', headers = {}) => { res.writeHead(status, { 'Cache-Control': 'no-store', ...headers }); res.end(typeof data === 'string' ? data : JSON.stringify(data)); };
const json = (res, status, data) => send(res, status, data, { 'Content-Type': 'application/json; charset=utf-8' });
const token = () => crypto.randomBytes(16).toString('hex');
function code() { let value; do value = crypto.randomBytes(3).toString('hex').toUpperCase(); while (rooms.has(value)); return value; }
function cards() { const deck = []; let id = 0; for (let a = 0; a < 7; a++) for (let b = a; b < 7; b++) deck.push({ id: `o${id++}`, l1: a, l2: b }); for (let i = deck.length - 1; i; i--) { const j = crypto.randomInt(i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; } return deck; }
const fits = (card, game) => !game.ends || [game.ends.left, game.ends.right].some(v => card.l1 === v || card.l2 === v);
function start(room) { const deck = cards(), hands = [deck.slice(0, 7), deck.slice(7, 14)]; let opening = null; hands.forEach((hand, player) => hand.forEach((card, index) => { if (card.l1 === card.l2 && (!opening || card.l1 > opening.card.l1)) opening = { player, index, card }; })); if (!opening) opening = { player: 0, index: 0, card: hands[0][0] }; hands[opening.player].splice(opening.index, 1); room.game = { hands, stock: deck.slice(14), board: [opening.card], ends: { left: opening.card.l1, right: opening.card.l2 }, turn: opening.player ? 0 : 1, finished: null, passes: 0 }; room.state = 'playing'; }
function view(room, player) { const g = room.game; return { code: room.code, state: room.state, host: player === 0, players: room.players.filter(Boolean).length, you: player, game: g && { hand: g.hands[player], opponentCount: g.hands[player ? 0 : 1].length, stockCount: g.stock.length, board: g.board, ends: g.ends, turn: g.turn, finished: g.finished } }; }
function findRoom(codeValue, value) { const room = rooms.get(String(codeValue).toUpperCase()); if (!room) throw Error('Sala não encontrada.'); const player = room.players.findIndex(p => p && p.token === value); if (player < 0) throw Error('Convite inválido.'); return { room, player }; }
function read(req) { return new Promise((resolve, reject) => { let raw = ''; req.on('data', part => { raw += part; if (raw.length > 8192) req.destroy(); }); req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(Error('Dados inválidos.')); } }); }); }
function play(room, player, cardId, side) { const g = room.game; if (!g || g.finished !== null || g.turn !== player) throw Error('Não é a sua vez.'); const hand = g.hands[player], index = hand.findIndex(c => c.id === cardId); if (index < 0) throw Error('Peça indisponível.'); let card = hand[index]; side = side === 'esquerda' ? 'left' : side === 'direita' ? 'right' : side; if (side !== 'left' && side !== 'right') throw Error('Escolha uma ponta.'); const end = side === 'left' ? g.ends.left : g.ends.right; if (card.l1 !== end && card.l2 !== end) throw Error('A peça não encaixa nessa ponta.'); if (side === 'left') { if (card.l2 !== end) card = { ...card, l1: card.l2, l2: card.l1 }; g.board.unshift(card); g.ends.left = card.l1; } else { if (card.l1 !== end) card = { ...card, l1: card.l2, l2: card.l1 }; g.board.push(card); g.ends.right = card.l2; } hand.splice(index, 1); g.passes = 0; if (!hand.length) g.finished = player; else g.turn = player ? 0 : 1; }

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/rooms' && req.method === 'POST') { const room = { code: code(), players: [{ token: token() }], state: 'waiting' }; rooms.set(room.code, room); return json(res, 201, { code: room.code, token: room.players[0].token }); }
    const join = url.pathname.match(/^\/api\/rooms\/([a-z0-9]{6})\/join$/i);
    if (join && req.method === 'POST') { const room = rooms.get(join[1].toUpperCase()); if (!room || room.state !== 'waiting' || room.players[1]) throw Error('Esta sala não está disponível.'); room.players[1] = { token: token() }; return json(res, 200, { code: room.code, token: room.players[1].token }); }
    const state = url.pathname.match(/^\/api\/rooms\/([a-z0-9]{6})$/i);
    if (state && req.method === 'GET') { const { room, player } = findRoom(state[1], url.searchParams.get('token')); return json(res, 200, view(room, player)); }
    const action = url.pathname.match(/^\/api\/rooms\/([a-z0-9]{6})\/action$/i);
    if (action && req.method === 'POST') { const data = await read(req), { room, player } = findRoom(action[1], data.token); if (data.type === 'start') { if (player || !room.players[1]) throw Error('Aguardando o outro jogador.'); start(room); } else if (data.type === 'play') play(room, player, data.cardId, data.side); else { const g = room.game; if (!g || g.turn !== player || g.finished !== null) throw Error('Não é a sua vez.'); if (data.type === 'draw') { if (!g.stock.length || g.hands[player].some(c => fits(c, g))) throw Error('Não é possível comprar agora.'); g.hands[player].push(g.stock.splice(crypto.randomInt(g.stock.length), 1)[0]); } else if (data.type === 'pass') { if (g.stock.length || g.hands[player].some(c => fits(c, g))) throw Error('Não é possível passar agora.'); g.passes++; if (g.passes === 2) { const points = g.hands.map(hand => hand.reduce((sum, c) => sum + c.l1 + c.l2, 0)); g.finished = points[0] === points[1] ? 'draw' : points[0] < points[1] ? 0 : 1; } else g.turn = player ? 0 : 1; } else throw Error('Ação inválida.'); } return json(res, 200, view(room, player)); }
  } catch (error) { return json(res, 400, { error: error.message || 'Não foi possível concluir a ação.' }); }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Método não permitido');
  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname), target = path.resolve(root, `.${requested}`); if (!target.startsWith(`${root}${path.sep}`)) return send(res, 403, 'Proibido'); fs.readFile(target, (error, data) => error ? send(res, 404, 'Não encontrado') : send(res, 200, req.method === 'HEAD' ? '' : data, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' }));
}).listen(3000, () => console.log('Dominó Real em http://localhost:3000'));
