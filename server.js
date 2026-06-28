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

// Auto-migrate: add elo column if the table predates this feature
db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS elo INTEGER NOT NULL DEFAULT 1200`)
  .catch(err => console.error('DB migrate (elo):', err));

function calcEloChange(playerElo, opponentElo, score) {
  const K = playerElo < 1200 ? 32 : playerElo < 1800 ? 24 : 16;
  const expected = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
  return Math.round(K * (score - expected));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Serve Vite production build if it exists
const fs   = require('fs');
const path = require('path');
if (fs.existsSync(path.join(__dirname, 'dist'))) {
  app.use(express.static(path.join(__dirname, 'dist')));
}

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

// ── JSON API auth endpoints for Vue SPA ───────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password are required.' });
  const bcrypt = require('bcryptjs');
  try {
    const result = await db.query(
      'SELECT id, username, password_hash, elo FROM users WHERE username = $1',
      [username.trim()]
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'Invalid username or password.' });
    req.session.userId   = user.id;
    req.session.username = user.username;
    res.json({ ok: true, username: user.username, elo: user.elo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { username, email, password, skill_level } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'All fields are required.' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  const STARTING_ELO = { beginner: 600, casual: 900, intermediate: 1200, advanced: 1500, expert: 1800 };
  const elo = STARTING_ELO[skill_level] ?? 1200;
  const bcrypt = require('bcryptjs');
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = await db.query(
      'INSERT INTO users (username, email, password_hash, elo) VALUES ($1, $2, $3, $4) RETURNING id, username, elo',
      [username.trim(), email.trim().toLowerCase(), hash, elo]
    );
    req.session.userId   = result.rows[0].id;
    req.session.username = result.rows[0].username;
    res.json({ ok: true, username: result.rows[0].username, elo: result.rows[0].elo });
  } catch (err) {
    if (err.code === '23505') {
      const field = err.detail.includes('username') ? 'Username' : 'Email';
      return res.status(409).json({ error: `${field} is already taken.` });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ── SPA fallback: serve dist/index.html for unmatched GET routes ──────────────
// (only when dist exists; during dev, Vite handles this)
app.get('*', (req, res, next) => {
  // Skip API, socket.io, and legacy HTML routes
  if (req.path.startsWith('/api/') ||
      req.path.startsWith('/socket.io') ||
      req.path === '/logout') {
    return next();
  }
  const distIndex = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(distIndex)) {
    return res.sendFile(distIndex);
  }
  next();
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
    const wScore = result === '1-0' ? 1 : result === '1/2-1/2' ? 0.5 : 0;
    const bScore = 1 - wScore;

    const [wRow, bRow] = await Promise.all([
      db.query('SELECT elo FROM users WHERE id=$1', [room.white.userId]),
      db.query('SELECT elo FROM users WHERE id=$1', [room.black.userId]),
    ]);
    const wElo = wRow.rows[0]?.elo ?? 1200;
    const bElo = bRow.rows[0]?.elo ?? 1200;

    const wChange  = calcEloChange(wElo, bElo, wScore);
    const bChange  = calcEloChange(bElo, wElo, bScore);
    const newWElo  = Math.max(100, wElo + wChange);
    const newBElo  = Math.max(100, bElo + bChange);

    const entries = [
      { uid: room.white.userId, r: result==='1-0'?'win':result==='0-1'?'loss':'draw', newElo: newWElo, sid: room.white.socketId, change: wChange },
      { uid: room.black.userId, r: result==='0-1'?'win':result==='1-0'?'loss':'draw', newElo: newBElo, sid: room.black?.socketId,  change: bChange },
    ];
    for (const { uid, r, newElo } of entries) {
      await db.query(
        `INSERT INTO games (user_id, pgn, result, difficulty, white_elo, black_elo, ended_at) VALUES ($1,$2,$3,'multiplayer',$4,$5,NOW())`,
        [uid, pgn, r, wElo, bElo]
      );
      await db.query('UPDATE users SET elo=$1 WHERE id=$2', [newElo, uid]);
    }
    // Notify each player of their new ELO
    for (const { sid, newElo, change } of entries) {
      if (sid) io.to(sid).emit('player:elo_update', { newElo, change });
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
      else         room.black.socketId  = socket.id;

      if (room.disconnectTimer) { clearTimeout(room.disconnectTimer); room.disconnectTimer = null; }
      if (room.status === 'waiting') broadcastLobby();
      if (room.status === 'playing') {
        // Tell the opponent the player reconnected
        const oppSid = isWhite ? room.black?.socketId : room.white.socketId;
        if (oppSid) io.to(oppSid).emit('game:opponent_reconnected', { username });
      }

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
        // Give 30s for creator to reconnect (e.g. navigating to the chess page)
        room.disconnectTimer = setTimeout(() => {
          if (room.status === 'waiting') { rooms.delete(room.id); broadcastLobby(); }
        }, 30000);
        broadcastLobby();
      } else if (room.status === 'playing') {
        const opponent = goneWhite ? room.black?.socketId : room.white.socketId;
        if (opponent) io.to(opponent).emit('game:opponent_disconnected', { username });
        room.disconnectTimer = setTimeout(() => {
          if (room.status !== 'playing') return;
          // Never forfeit before any moves — this window covers page-load reconnects
          if (room.chess.history().length === 0) return;
          endRoom(room, goneWhite ? '0-1' : '1-0', 'disconnect');
        }, 60000); // 60s grace — reconnect via game:rejoin cancels this
      }
      break;
    }
  });
});

httpServer.listen(PORT, () => console.log(`Chess app running at http://localhost:${PORT}`));
