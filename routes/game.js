const express = require('express');
const db      = require('../db');
const { requireAuth } = require('../middleware/auth');
const router  = express.Router();

function calcEloChange(playerElo, opponentElo, score) {
  const K = playerElo < 1200 ? 32 : playerElo < 1800 ? 24 : 16;
  const expected = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
  return Math.round(K * (score - expected));
}

const RESULT_SCORE = { win: 1, draw: 0.5, loss: 0, resign: 0, flag: 0 };

router.get('/',        requireAuth, (req, res) => res.redirect('/chess'));
router.get('/chess',   requireAuth, (req, res) => res.sendFile('chess.html', { root: 'public' }));
router.get('/lobby',   requireAuth, (req, res) => res.sendFile('lobby.html', { root: 'public' }));

router.get('/api/me', requireAuth, async (req, res) => {
  try {
    const r = await db.query('SELECT elo FROM users WHERE id=$1', [req.session.userId]);
    res.json({ username: req.session.username, elo: r.rows[0]?.elo ?? 1200 });
  } catch (_) {
    res.json({ username: req.session.username, elo: 1200 });
  }
});

router.post('/api/games', requireAuth, async (req, res) => {
  const { pgn, result, white_elo, black_elo, mode } = req.body;
  try {
    await db.query(
      `INSERT INTO games (user_id, pgn, result, difficulty, white_elo, black_elo, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [req.session.userId, pgn, result, mode || 'vs-computer', white_elo || null, black_elo || null]
    );

    // Apply ELO change for vs-computer games
    let eloChange = 0, newElo = null;
    if (mode === 'vs-computer' && black_elo != null) {
      const userRow = await db.query('SELECT elo FROM users WHERE id=$1', [req.session.userId]);
      const playerElo = userRow.rows[0]?.elo ?? 1200;
      const aiElo     = black_elo === 9999 ? 3200 : (Number(black_elo) || 1500);
      const score     = RESULT_SCORE[result] ?? 0;
      eloChange = calcEloChange(playerElo, aiElo, score);
      newElo    = Math.max(100, playerElo + eloChange);
      await db.query('UPDATE users SET elo=$1 WHERE id=$2', [newElo, req.session.userId]);
    }

    res.json({ ok: true, eloChange, newElo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save game.' });
  }
});

router.get('/api/games', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, result, difficulty, white_elo, black_elo, pgn, started_at, ended_at
       FROM games WHERE user_id = $1
       ORDER BY started_at DESC LIMIT 20`,
      [req.session.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load games.' });
  }
});

module.exports = router;
