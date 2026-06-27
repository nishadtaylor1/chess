require('dotenv').config();
const express    = require('express');
const session    = require('express-session');
const PgSession  = require('connect-pg-simple')(session);
const db         = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
  store: new PgSession({ pool: db, tableName: 'session' }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, // 7 days
}));

app.use('/', require('./routes/auth'));
app.use('/', require('./routes/game'));

app.get('/', (req, res) => {
  if (req.session.userId) return res.redirect('/chess');
  res.redirect('/login');
});

app.listen(PORT, () => console.log(`Chess app running at http://localhost:${PORT}`));
