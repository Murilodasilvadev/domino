import { getStore } from '@netlify/blobs';

const store = getStore('domino-rooms', { consistency: 'strong' });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const id = () => crypto.randomUUID().replaceAll('-', '');
const newCode = () => crypto.randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase();
const cards = () => { const deck = []; let id = 0; for (let a = 0; a < 7; a++) for (let b = a; b < 7; b++) deck.push({ id: `o${id++}`, l1: a, l2: b }); for (let i = deck.length - 1; i; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; } return deck; };
const fits = (card, game) => [game.ends.left, game.ends.right].some(value => card.l1 === value || card.l2 === value);
async function load(code) { const room = await store.get(`room:${code}`, { type: 'json', consistency: 'strong' }); if (!room) throw Error('Sala não encontrada.'); return room; }
const save = room => store.setJSON(`room:${room.code}`, room);
function findPlayer(room, token) { const player = room.players.findIndex(item => item && item.token === token); if (player < 0) throw Error('Convite inválido.'); return player; }
function view(room, player) { const game = room.game; return { code: room.code, state: room.state, host: player === 0, players: room.players.filter(Boolean).length, you: player, game: game && { hand: game.hands[player], opponentCount: game.hands[player ? 0 : 1].length, stockCount: game.stock.length, board: game.board, ends: game.ends, turn: game.turn, finished: game.finished } }; }
function start(room) { const deck = cards(), hands = [deck.slice(0, 7), deck.slice(7, 14)]; let open; hands.forEach((hand, player) => hand.forEach((card, index) => { if (card.l1 === card.l2 && (!open || card.l1 > open.card.l1)) open = { player, index, card }; })); if (!open) open = { player: 0, index: 0, card: hands[0][0] }; hands[open.player].splice(open.index, 1); room.game = { hands, stock: deck.slice(14), board: [open.card], ends: { left: open.card.l1, right: open.card.l2 }, turn: open.player ? 0 : 1, finished: null, passes: 0 }; room.state = 'playing'; }
function play(room, player, cardId, side) { const game = room.game; if (!game || game.finished !== null || game.turn !== player) throw Error('Não é a sua vez.'); const hand = game.hands[player], index = hand.findIndex(card => card.id === cardId); if (index < 0) throw Error('Peça indisponível.'); let card = hand[index]; if (!['left', 'right'].includes(side)) throw Error('Escolha uma ponta.'); const end = side === 'left' ? game.ends.left : game.ends.right; if (card.l1 !== end && card.l2 !== end) throw Error('A peça não encaixa nessa ponta.'); if (side === 'left') { if (card.l2 !== end) card = { ...card, l1: card.l2, l2: card.l1 }; game.board.unshift(card); game.ends.left = card.l1; } else { if (card.l1 !== end) card = { ...card, l1: card.l2, l2: card.l1 }; game.board.push(card); game.ends.right = card.l2; } hand.splice(index, 1); game.passes = 0; if (!hand.length) game.finished = player; else game.turn = player ? 0 : 1; }

export default async request => {
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/.netlify\/functions\/rooms\/?/, '').replace(/^\/api\//, '');
    if (path === 'rooms' && request.method === 'POST') {
      const room = { code: newCode(), players: [{ token: id() }], state: 'waiting', createdAt: Date.now() };
      await save(room); return json({ code: room.code, token: room.players[0].token }, 201);
    }
    const join = path.match(/^rooms\/([A-Z0-9]{6})\/join$/i);
    if (join && request.method === 'POST') { const room = await load(join[1].toUpperCase()); if (room.state !== 'waiting' || room.players[1]) throw Error('Esta sala não está disponível.'); room.players[1] = { token: id() }; await save(room); return json({ code: room.code, token: room.players[1].token }); }
    const roomPath = path.match(/^rooms\/([A-Z0-9]{6})$/i);
    if (roomPath && request.method === 'GET') { const room = await load(roomPath[1].toUpperCase()); return json(view(room, findPlayer(room, url.searchParams.get('token')))); }
    const action = path.match(/^rooms\/([A-Z0-9]{6})\/action$/i);
    if (action && request.method === 'POST') {
      const data = await request.json(), room = await load(action[1].toUpperCase()), player = findPlayer(room, data.token), game = room.game;
      if (data.type === 'start') { if (player || !room.players[1]) throw Error('Aguardando o outro jogador.'); start(room); }
      else if (data.type === 'play') play(room, player, data.cardId, data.side);
      else if (!game || game.turn !== player || game.finished !== null) throw Error('Não é a sua vez.');
      else if (data.type === 'draw') { if (!game.stock.length || game.hands[player].some(card => fits(card, game))) throw Error('Não é possível comprar agora.'); game.hands[player].push(game.stock.splice(Math.floor(Math.random() * game.stock.length), 1)[0]); }
      else if (data.type === 'pass') { if (game.stock.length || game.hands[player].some(card => fits(card, game))) throw Error('Não é possível passar agora.'); game.passes++; if (game.passes === 2) { const points = game.hands.map(hand => hand.reduce((sum, card) => sum + card.l1 + card.l2, 0)); game.finished = points[0] === points[1] ? 'draw' : points[0] < points[1] ? 0 : 1; } else game.turn = player ? 0 : 1; }
      else throw Error('Ação inválida.');
      await save(room); return json(view(room, player));
    }
    return json({ error: 'Rota não encontrada.' }, 404);
  } catch (error) { return json({ error: error.message || 'Não foi possível concluir a ação.' }, 400); }
};
