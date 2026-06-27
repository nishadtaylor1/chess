require('dotenv').config();
const express   = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const session   = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { Chess } = require('chess.js');
const db        = require('./db');

const app        = express();
const httpServer = createServer(app);
const io         = new Server(httpServer);
const PORT       = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const sessionMiddleware = session({
  store: new PgSession({ pool: db, tableName: 'session' }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
});

app.use(sessionMiddleware);
io.use((socket, next) => sessionMiddleware(socket.request, {}, next));

app.use('/', require('./routes/auth'));
app.use('/', require('./routes/game'));

app.get('/', (req, res) => {
  if (req.session.userId) return res.redirect('/chess');
  res.redirect('/login');
});

// ── In-memory game rooms ────────────────────────────────────────────────────
// room: { id, white, black, chess, status:'waiting'|'playing'|'finished',
//         disconnectTimer, createdAt }
// player: { userId, username, socketId }
const rooms = new Map();

function makeRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function openRoomList() {
  return [...rooms.values()]
    .filter(r => r.status === 'waiting')
    .map(r => ({ id: r.id, creator: r.white.username, createdAt: r.createdAt }));
}

function broadcastLobby() {
  io.emit('lobby:list', openRoomList());
}

async function saveMultiplayerGame(room, result) {
  try {
    const pgn = room.chess.pgn();
    const rows = [
      [room.white.userId, pgn, result],
      [room.black.userId, pgn, result === '1-0' ? '0-1' : result === '0-1' ? '1-0' : result],
    ];
    for (const [uid, p, r] of rows) {
      await db.query(
        `INSERT INTO games (user_id, pgn, result, difficulty, ended_at) VALUES ($1,$2,$3,'multiplayer',NOW())`,
        [uid, p, r]
      );
    }
  } catch (e) { console.error('save multiplayer game:', e); }
}

function endRoom(room, result, reason, triggerSocketId) {
  if (room.status === 'finished') return;
  room.status = 'finished';
  if (room.disconnectTimer) { clearTimeout(room.disconnectTimer); room.disconnectTimer = null; }
  io.to(room.id).emit('game:end', { result, reason });
  if (room.white && room.black) saveMultiplayerGame(room, result);
}

// ── Socket.io ───────────────────────────────────────────────────────────────
io.on('connection', socket => {
  const sess = socket.request.session;
  if (!sess?.userId) { socket.disconnect(); return; }

  const userId   = sess.userId;
  const username = sess.username;

  // ── Lobby ──────────────────────────────────────────────────────────────
  socket.on('lobby:get', () => socket.emit('lobby:list', openRoomList()));

  socket.on('lobby:create', () => {
    // Remove stale waiting rooms owned by this user
    for (const [id, r] of rooms) {
      if (r.status === 'waiting' && r.white.userId === userId) rooms.delete(id);
    }
    const id = makeRoomId();
    rooms.set(id, {
      id,
      white:           { userId, username, socketId: socket.id },
      black:           null,
      chess:           new Chess(),
      status:          'waiting',
      disconnectTimer: null,
      createdAt:       new Date(),
    });
    socket.emit('lobby:created', { roomId: id });
    broadcastLobby();
  });

  // ── Game rejoin (used by chess page on load with ?room=ID) ─────────────
  // Handles three cases:
  //   1. Creator reconnects while status='waiting' → send waiting state back
  //   2. New joiner arrives → start game
  //   3. Reconnect during/after game
  socket.on('game:rejoin', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return socket.emit('game:error', 'Room not found. It may have expired.');

    const isWhite = room.white?.userId === userId;
    const isBlack = room.black?.userId === userId;

    if (!isWhite && !isBlack) {
      // Brand-new joiner
      if (room.status !== 'waiting') return socket.emit('game:error', 'This game already started.');
      if (room.white.userId === userId) return socket.emit('game:error', 'That is your own game.');

      room.black = { userId, username, socketId: socket.id };
      room.status = 'playing';
      socket.join(roomId);

      io.to(room.white.socketId).emit('game:color', 'w');
      socket.emit('game:color', 'b');
      io.to(roomId).emit('game:start', {
        roomId,
        white: room.white.username,
        black: room.black.username,
        fen:   room.chess.fen(),
      });
      broadcastLobby();
    } else {
      // Reconnecting player — update socketId, cancel any forfeit timer
      if (isWhite) room.white.socketId = socket.id;
      else         room.black.socketId = socket.id;

      if (room.disconnectTimer) { clearTimeout(room.disconnectTimer); room.disconnectTimer = null; }

      socket.join(roomId);
      socket.emit('game:color', isWhite ? 'w' : 'b');
      socket.emit('game:state', {
        roomId,
        white:  room.white.username,
        black:  room.black?.username || null,
        fen:    room.chess.fen(),
        pgn:    room.chess.pgn(),
        status: room.status,
      });
    }
  });

  // ── In-game moves ───────────────────────────────────────────────────────
  socket.on('game:move', ({ roomId, from, to, promotion }) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'playing') return;

    const turn    = room.chess.turn();
    const isWhite = room.white.userId === userId;
    const isBlack = room.black?.userId === userId;
    if ((turn === 'w' && !isWhite) || (turn === 'b' && !isBlack)) return;

    const move = room.chess.move({ from, to, promotion: promotion || 'q' });
    if (!move) return socket.emit('game:illegal');

    io.to(roomId).emit('game:move', {
      from, to, san: move.san,
      fen: room.chess.fen(),
      pgn: room.chess.pgn(),
    });

    if (room.chess.isGameOver()) {
      const result = room.chess.isCheckmate()
        ? (turn === 'w' ? '1-0' : '0-1')
        : '1/2-1/2';
      const reason = room.chess.isCheckmate() ? 'checkmate'
                   : room.chess.isStalemate() ? 'stalemate' : 'draw';
      endRoom(room, result, reason);
    }
  });

  socket.on('game:resign', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'playing') return;
    const isWhite = room.white.userId === userId;
    endRoom(room, isWhite ? '0-1' : '1-0', 'resignation');
  });

  socket.on('game:draw_offer', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'playing') return;
    const isWhite  = room.white.userId === userId;
    const opponent = isWhite ? room.black?.socketId : room.white.socketId;
    if (opponent) io.to(opponent).emit('game:draw_offered', { from: username });
  });

  socket.on('game:draw_accept', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'playing') return;
    endRoom(room, '1/2-1/2', 'agreement');
  });

  socket.on('game:draw_decline', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'playing') return;
    const isWhite  = room.white.userId === userId;
    const opponent = isWhite ? room.black?.socketId : room.white.socketId;
    if (opponent) io.to(opponent).emit('game:draw_declined');
  });

  // ── Disconnect ──────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    for (const [, room] of rooms) {
      const goneWhite = room.white?.socketId === socket.id;
      const goneBlack = room.black?.socketId === socket.id;
      if (!goneWhite && !goneBlack) continue;

      if (room.status === 'waiting' && goneWhite) {
        rooms.delete(room.id);
        broadcastLobby();
      } else if (room.status === 'playing') {
        // Give 20 seconds to reconnect before forfeiting
        const opponent = goneWhite ? room.black?.socketId : room.white.socketId;
        if (opponent) io.to(opponent).emit('game:opponent_disconnected', { username });
        room.disconnectTimer = setTimeout(() => {
          if (room.status !== 'playing') return;
          endRoom(room, goneWhite ? '0-1' : '1-0', 'disconnect');
        }, 20000);
      }
      break;
    }
  });
});

httpServer.listen(PORT, () => console.log(`Chess app running at http://localhost:${PORT}`));
