const express  = require('express');
const bcrypt   = require('bcryptjs');
const db       = require('../db');
const router   = express.Router();

const STARTING_ELO = { beginner: 600, casual: 900, intermediate: 1200, advanced: 1500, expert: 1800 };

router.get('/register', (req, res) => res.sendFile('register.html', { root: 'public' }));
router.get('/login',    (req, res) => res.sendFile('login.html',    { root: 'public' }));

router.post('/register', async (req, res) => {
  const { username, email, password, skill_level } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'All fields are required.' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const elo = STARTING_ELO[skill_level] ?? 1200;

  try {
    const hash = await bcrypt.hash(password, 12);
    const result = await db.query(
      'INSERT INTO users (username, email, password_hash, elo) VALUES ($1, $2, $3, $4) RETURNING id, username, elo',
      [username.trim(), email.trim().toLowerCase(), hash, elo]
    );
    req.session.userId   = result.rows[0].id;
    req.session.username = result.rows[0].username;
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23505') {
      const field = err.detail.includes('username') ? 'Username' : 'Email';
      return res.status(409).json({ error: `${field} is already taken.` });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password are required.' });

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
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
