# Chess

A full-featured browser-based chess application with user accounts, an ELO-based AI opponent powered by Stockfish, and a chess.com-inspired interface.

## Features

- **ELO-based AI difficulty** — 25 levels from 500 (Beginner) to Max (Stockfish full strength). Sub-1300 levels use random move injection to simulate genuine beginner play rather than just a weakened engine.
- **Three play modes**
  - *Casual* — take-backs allowed, clock optional
  - *Challenge* — no take-backs, clock required
  - *Analysis* — freely navigate history, play moves for either side, branch from any past position
- **Drag & drop + click-to-move** — move pieces either way, with legal move highlighting
- **Time controls** — Bullet (1+0, 2+1), Blitz (3+2, 5+0, 5+3), Rapid (10+0, 15+10, 30+0), and untimed
- **CPU vs CPU** — watch two Stockfish instances play each other at chosen ELO levels
- **Stockfish evaluation bar** — real-time advantage indicator showing who is winning and by how much
- **Move history & navigation** — clickable PGN move list with |◀ ◀ ▶ ▶| controls to step through the game
- **PGN export** — copy the full game PGN to clipboard
- **User accounts** — register, log in, and save game history to PostgreSQL

## Tech Stack

- **Backend:** Node.js, Express
- **Database:** PostgreSQL (session storage + game history)
- **Auth:** bcrypt password hashing, express-session
- **Chess engine:** [Stockfish](https://stockfishchess.org/) (WASM build, runs in browser Web Workers)
- **Chess logic:** [chess.js](https://github.com/jhlywa/chess.js)

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL

### Setup

1. Clone the repo and install dependencies:

   ```bash
   git clone https://github.com/nishadtaylor1/chess.git
   cd chess
   npm install
   ```

2. Create a `.env` file in the project root:

   ```
   DATABASE_URL=postgresql://localhost:5432/chess_app
   SESSION_SECRET=your-secret-here
   ```

3. Create the database and tables:

   ```sql
   CREATE DATABASE chess_app;

   CREATE TABLE users (
     id SERIAL PRIMARY KEY,
     username TEXT UNIQUE NOT NULL,
     email TEXT UNIQUE NOT NULL,
     password_hash TEXT NOT NULL,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );

   CREATE TABLE games (
     id SERIAL PRIMARY KEY,
     user_id INTEGER REFERENCES users(id),
     pgn TEXT,
     result TEXT,
     difficulty TEXT,
     white_elo INTEGER,
     black_elo INTEGER,
     started_at TIMESTAMPTZ DEFAULT NOW(),
     ended_at TIMESTAMPTZ
   );
   ```

4. Start the server:

   ```bash
   npm start
   ```

5. Visit `http://localhost:3000`

## Project Structure

```
chess/
├── public/
│   ├── chess.html          # Main game UI (single-page app)
│   ├── login.html
│   ├── register.html
│   ├── css/
│   ├── img/pieces/         # SVG chess pieces
│   └── js/                 # chess.js + Stockfish WASM
├── routes/
│   ├── auth.js             # Login / register endpoints
│   └── game.js             # Game save / load API
├── middleware/
│   └── auth.js             # Session auth guard
├── db.js                   # PostgreSQL connection pool
└── server.js               # Express app entry point
```
