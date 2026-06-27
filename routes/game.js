const express = require('express');
const db      = require('../db');
const { requireAuth } = require('../middleware/auth');
const router  = express.Router();

router.get('/',        requireAuth, (req, res) => res.sendFile('chess.html', { root: 'public' }));
router.get('/api/me',  requireAuth, (req, res) => res.json({ username: req.session.username }));

router.post('/api/games', requireAuth, async (req, res) => {
  const { pgn, result, white_elo, black_elo, mode } = req.body;
  try {
    await db.query(
      `INSERT INTO games (user_id, pgn, result, difficulty, white_elo, black_elo, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [req.session.userId, pgn, result, mode || 'vs-computer', white_elo || null, black_elo || null]
    );
    res.json({ ok: true });
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
