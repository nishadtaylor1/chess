# Chess

A full-featured browser-based chess application with user accounts, ELO ratings, a Stockfish AI opponent, real-time multiplayer, and move quality analysis.

## Features

### Gameplay
- **ELO-based AI difficulty** — 25 levels from 500 (Beginner) to Max (Stockfish full strength). Sub-1300 levels use random move injection to simulate genuine beginner play rather than a weakened engine.
- **Three play modes**
  - *Casual* — take-backs allowed, no clock required
  - *Challenge* — no take-backs, clock required
  - *Analysis* — freely navigate history, play moves for either side, branch from any past position
- **CPU vs CPU** — watch two Stockfish instances play each other at independently chosen ELO levels
- **Real-time multiplayer** — play against a friend via a shareable room code; Socket.io with reconnection grace period

### Board
- **Drag & drop + click-to-move** — both interaction styles work; legal move dots shown on hover/select
- **Right-click annotations** — draw arrows and circles on the board (green, yellow/Shift, red/Ctrl)
- **Board flip** — automatically flips when playing as Black in multiplayer
- **Stockfish evaluation bar** — real-time advantage indicator (depth 14) updating after every half-move

### Move Quality
- **Live move badges** — after each move a badge appears on the destination square: Best ★, Excellent !, Good ✓, Inaccuracy ?!, Mistake ?, Blunder ??
- **Centipawn loss classification** — computed by comparing Stockfish eval before and after the move

### Game Review
- **Clickable game history** — sidebar shows recent games; click any row to load it for replay
- **Background batch analysis** — replaying a past game silently runs Stockfish (depth 12) across every position
- **Annotated move list** — quality symbols appear inline next to each move (e.g. `e4 ★`, `Nc6 ??`) as analysis completes
- **Review board badges** — the quality badge for the current move shows on the board while navigating with ← →

### ELO & Stats
- **ELO rating system** — wins/losses vs AI adjust your rating using the standard K-factor formula (K=32/24/16 by rating band)
- **Win celebration** — full-screen confetti explosion on win; animated count-up from old ELO to new ELO
- **ELO delta toast** — non-win results show a `+N ELO` / `-N ELO` notification

### Opening Trainer
- **Opening library** — 50+ openings grouped by family (Open Games, Semi-Open, Closed, Indian Defenses, etc.)
- **Book move arrows** — while following a selected opening, a green arrow shows the next theory move
- **Auto-detection** — in Casual and Analysis modes, the current position is identified against the ECO database and shown in the panel

### Other
- **Chess clock** — Bullet (1+0, 2+1), Blitz (3+0, 3+2, 5+0, 5+3), Rapid (10+0, 15+10, 30+0), Classical (60+0), Unlimited
- **Hint system** — request a best-move arrow (Stockfish depth 15); disabled in Challenge mode
- **Take-back** — undo the last half-move (Casual) or any move (Analysis)
- **PGN export** — copy the full game PGN to clipboard
- **User accounts** — register, log in, and persist game history to PostgreSQL

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend framework | [Vue 3](https://vuejs.org/) — Composition API, `<script setup>` throughout |
| State management | [Pinia](https://pinia.vuejs.org/) |
| Client-side routing | [Vue Router 4](https://router.vuejs.org/) |
| Build tool | [Vite](https://vitejs.dev/) |
| Chess logic | [chess.js](https://github.com/jhlywa/chess.js) |
| Chess engine | [Stockfish](https://stockfishchess.org/) (WASM, runs in browser Web Workers) |
| Real-time | [Socket.io](https://socket.io/) |
| Backend | Node.js + Express |
| Database | PostgreSQL (sessions + game history) |
| Auth | bcrypt, express-session, connect-pg-simple |

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL

### Setup

1. Clone and install:

   ```bash
   git clone https://github.com/nishadtaylor1/chess.git
   cd chess
   npm install
   ```

2. Create `.env`:

   ```
   DATABASE_URL=postgresql://localhost:5432/chess_app
   SESSION_SECRET=your-secret-here
   ```

3. Create the database schema:

   ```sql
   CREATE DATABASE chess_app;

   CREATE TABLE users (
     id SERIAL PRIMARY KEY,
     username TEXT UNIQUE NOT NULL,
     email TEXT UNIQUE NOT NULL,
     password_hash TEXT NOT NULL,
     elo INTEGER NOT NULL DEFAULT 1200,
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

   CREATE TABLE session (
     sid TEXT PRIMARY KEY,
     sess JSON NOT NULL,
     expire TIMESTAMPTZ NOT NULL
   );
   ```

4. **Development** — runs Express on :3000 and Vite dev server on :5173 (with API proxy):

   ```bash
   nvm use   # requires Node 18 (.nvmrc is set)
   npm run dev
   ```

   Open `http://localhost:5173`

5. **Production** — build the frontend, then start the server:

   ```bash
   npm run build   # outputs to dist/
   npm start       # Express serves dist/ + handles API + Socket.io
   ```

   Open `http://localhost:3000`

---

## Project Structure

```
chess/
├── src/                        # Vue 3 frontend (built by Vite)
│   ├── main.js
│   ├── App.vue
│   ├── style.css               # Global dark-theme CSS
│   ├── router/
│   │   └── index.js            # Vue Router — auth guard on /chess, /lobby
│   ├── stores/
│   │   ├── game.js             # Chess game state, move logic, history, navigation
│   │   ├── engine.js           # Stockfish workers, AI, eval bar, move quality badges
│   │   ├── ui.js               # Mode/play-mode, clock, toast, win modal
│   │   └── review.js           # Review mode, background batch analysis
│   ├── composables/
│   │   ├── useAnnotations.js   # Right-click arrows and circles
│   │   └── useMultiplayer.js   # Socket.io client
│   ├── data/
│   │   └── openings.js         # ECO opening book (50+ openings)
│   ├── components/
│   │   ├── NavBar.vue
│   │   ├── Toast.vue
│   │   ├── WinModal.vue        # Confetti + animated ELO count-up
│   │   ├── board/
│   │   │   ├── ChessBoard.vue  # 8×8 grid, drag & drop, badges, keyboard nav
│   │   │   ├── EvalBar.vue
│   │   │   └── AnnotationLayer.vue
│   │   └── panel/
│   │       ├── GamePanel.vue   # Right-side panel — mode tabs, settings, actions
│   │       ├── MoveList.vue    # PGN move list with quality symbols + nav buttons
│   │       ├── GameHistory.vue # Recent games list (clickable to review)
│   │       └── EloSlider.vue
│   └── views/
│       ├── ChessView.vue       # Main game page
│       ├── LobbyView.vue       # Multiplayer room browser
│       ├── LoginView.vue
│       └── RegisterView.vue
├── public/
│   ├── img/pieces/             # SVG chess piece images
│   └── js/                     # stockfish.js + stockfish.wasm (Web Worker files)
├── routes/
│   ├── auth.js                 # POST /login, /register, /logout
│   └── game.js                 # GET|POST /api/games, GET /api/me
├── middleware/
│   └── auth.js                 # requireAuth session guard
├── db.js                       # PostgreSQL connection pool
├── server.js                   # Express + Socket.io + SPA fallback
├── vite.config.js
└── index.html                  # Vite entry point
```
