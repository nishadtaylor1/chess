import { defineStore } from 'pinia'
import { ref, computed, markRaw } from 'vue'
import { Chess } from 'chess.js'
import { ECO_BOOK, buildFenMap } from '../data/openings.js'
import { getStep } from './engine.js'

// Build the FEN -> opening map once at module load
let FEN_MAP = null
function getFenMap() {
  if (!FEN_MAP) FEN_MAP = buildFenMap(Chess, ECO_BOOK)
  return FEN_MAP
}

export const useGameStore = defineStore('game', () => {
  // The live chess game — non-reactive internals, tracked via gameVersion
  // markRaw prevents Vue from deeply proxying the Chess instance
  const _game       = markRaw(new Chess())
  const gameVersion = ref(0)  // bump after every mutation to _game

  const gameId      = ref(0)
  const viewIdx     = ref(0)
  const selected    = ref(null)
  const legalMoves  = ref(null)
  const hintArrow   = ref(null)

  const playerElo   = ref(1200)
  const historyRows = ref([])

  // Opening trainer
  const selectedOpeningIdx = ref(-1)
  let   openingPositions   = []

  // ── Computed getters ───────────────────────────────────────────────────────

  const history = computed(() => {
    void gameVersion.value
    return _game.history({ verbose: true })
  })

  const atLivePos = computed(() => viewIdx.value >= history.value.length)

  const viewGame = computed(() => {
    void gameVersion.value
    if (atLivePos.value) return _game
    const tmp = new Chess()
    const h   = history.value
    for (let i = 0; i < viewIdx.value; i++) tmp.move(h[i])
    return tmp
  })

  const lastMove = computed(() => {
    const h = history.value
    return (viewIdx.value > 0 && h.length > 0) ? h[viewIdx.value - 1] : null
  })

  const detectedOpening = computed(() => {
    void gameVersion.value
    const vg  = viewGame.value
    const key = vg.fen().split(' ').slice(0, 4).join(' ')
    return getFenMap().get(key) || null
  })

  const selectedOpening = computed(() =>
    selectedOpeningIdx.value >= 0 ? ECO_BOOK[selectedOpeningIdx.value] : null
  )

  const openingIdx = computed(() => {
    const op = selectedOpening.value
    if (!op || !openingPositions.length) return -1
    const h = history.value.length
    if (h >= openingPositions.length) return -1
    const cur = _game.fen().split(' ').slice(0, 4).join(' ')
    const exp = openingPositions[h].split(' ').slice(0, 4).join(' ')
    return cur === exp ? h : -1
  })

  // ── Opening helpers ────────────────────────────────────────────────────────

  function getBookMove() {
    const idx = openingIdx.value
    if (idx < 0 || !selectedOpening.value) return null
    return selectedOpening.value.moves[idx] || null
  }

  function getOpeningHintArrow() {
    const h = history.value.length
    if (h % 2 !== 0) return null
    const bookSan = getBookMove()
    if (!bookSan) return null
    const tmp = new Chess(_game.fen())
    const m   = tmp.move(bookSan)
    return m ? { from: m.from, to: m.to } : null
  }

  function setOpening(idx) {
    selectedOpeningIdx.value = idx
    openingPositions = []
    const op = idx >= 0 ? ECO_BOOK[idx] : null
    if (op) {
      const tmp = new Chess()
      openingPositions.push(tmp.fen())
      for (const san of op.moves) {
        if (!tmp.move(san)) break
        openingPositions.push(tmp.fen())
      }
    }
  }

  // ── Move actions ───────────────────────────────────────────────────────────

  // Apply move to live game — used by AI, CPU vs CPU, MP echo
  function doMove(from, to, promo = 'q') {
    const p       = _game.get(from)
    const isPromo = p?.type === 'p' && (to[1] === '8' || to[1] === '1')
    const move    = _game.move({ from, to, promotion: isPromo ? promo : undefined })
    if (!move) return null
    gameVersion.value++
    hintArrow.value   = null
    viewIdx.value     = _game.history().length
    selected.value    = null
    legalMoves.value  = null
    return move
  }

  // Human move: handles mode-specific logic (analysis branching, triggering AI, etc.)
  async function handleMove(from, to, promo = 'q', mpEmitMove = null) {
    // Multiplayer: just send to server; server echoes back via game:move
    if (mpEmitMove) {
      mpEmitMove({ from, to, promotion: promo })
      return
    }

    const [{ useEngineStore }, { useUiStore }] = await Promise.all([
      import('./engine.js'),
      import('./ui.js'),
    ])
    const engineStore = useEngineStore()
    const uiStore     = useUiStore()

    // Analysis mode: branch from the current view position
    if (!atLivePos.value && uiStore.playMode === 'analysis') {
      const h = history.value.slice(0, viewIdx.value)
      gameId.value++
      _game.reset()
      h.forEach(m => _game.move(m))
      gameVersion.value++
    }

    // Lock settings on first move in vs-computer
    if (_game.history().length === 0 && uiStore.currentMode === 'vs-computer') {
      uiStore.lockSettings()
    }

    const moverColor = _game.turn()
    const move = doMove(from, to, promo)
    if (!move) return

    // Queue move quality check for eval completion
    if (uiStore.playMode !== 'challenge' || uiStore.currentMode !== 'vs-computer') {
      engineStore.setPendingQualityCheck(move.to, moverColor)
    }

    engineStore.scheduleEval(_game.fen(), _game.turn())

    if (uiStore.currentMode === 'vs-computer' && uiStore.playMode !== 'analysis') {
      if (_game.isGameOver()) {
        uiStore.clockStop()
        await saveGame('vs-computer', null, getStep(engineStore.eloSliderIdx).elo)
      } else {
        uiStore.clockSwitch(_game.turn())
        if (_game.turn() === 'b') {
          // Build context ref for engine (avoids circular import at module level)
          const gameCtx = _buildGameCtx()
          engineStore.triggerAI(gameCtx, uiStore)
        }
      }
    }
  }

  // Build a plain context object for the engine store (no circular import at module level)
  function _buildGameCtx() {
    return {
      _game,
      gameVersion,
      gameId,
      hintArrow,
      doMove,
      getBookMove,
      saveGame,
      history,
      viewIdx,
    }
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  function goToMove(idx) {
    hintArrow.value  = null
    viewIdx.value    = Math.max(0, Math.min(idx, history.value.length))
    selected.value   = null
    legalMoves.value = null
  }

  function goToStart()   { goToMove(0) }
  function goBack()      { goToMove(viewIdx.value - 1) }
  function goForward()   { goToMove(viewIdx.value + 1) }

  async function goToEnd() {
    goToMove(history.value.length)
    const [{ useEngineStore }, { useUiStore }] = await Promise.all([
      import('./engine.js'),
      import('./ui.js'),
    ])
    const engineStore = useEngineStore()
    const uiStore     = useUiStore()
    if (uiStore.currentMode === 'vs-computer' && uiStore.playMode !== 'analysis' &&
        !_game.isGameOver() && _game.turn() === 'b' && !engineStore.aiThinking) {
      engineStore.triggerAI(_buildGameCtx(), uiStore)
    }
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  async function saveGame(mode, wElo, bElo, resultOverride = null) {
    const result = resultOverride || (_game.isCheckmate()
      ? (_game.turn() === 'w' ? 'loss' : 'win')
      : 'draw')
    const oldElo = playerElo.value
    try {
      const data = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pgn:       _game.pgn(),
          result,
          mode,
          white_elo: wElo === 'Max' ? 9999 : (Number(wElo) || null),
          black_elo: bElo === 'Max' ? 9999 : (Number(bElo) || null),
        }),
      }).then(r => r.json())

      if (mode === 'vs-computer' && data.eloChange != null && data.newElo != null) {
        playerElo.value = data.newElo
        const { useUiStore } = await import('./ui.js')
        const uiStore = useUiStore()
        if (result === 'win') {
          uiStore.showWinModal(oldElo, data.newElo, data.eloChange)
        } else {
          const sign = data.eloChange >= 0 ? '+' : ''
          uiStore.showToast(`${sign}${data.eloChange} ELO  (now ${data.newElo})`, 4000)
        }
      }
    } catch (_) {}
    await loadHistory()
  }

  async function loadHistory() {
    try {
      const rows = await fetch('/api/games').then(r => r.json())
      historyRows.value = Array.isArray(rows) ? rows : []
    } catch (_) {
      historyRows.value = []
    }
  }

  // ── New game ───────────────────────────────────────────────────────────────

  async function newGame() {
    const [{ useEngineStore }, { useUiStore }, { useReviewStore }] = await Promise.all([
      import('./engine.js'),
      import('./ui.js'),
      import('./review.js'),
    ])
    const engineStore = useEngineStore()
    const uiStore     = useUiStore()
    const reviewStore = useReviewStore()

    if (engineStore.cpuRunning) engineStore.stopCpuGame(uiStore)

    gameId.value++
    _game.reset()
    gameVersion.value++
    viewIdx.value     = 0
    selected.value    = null
    legalMoves.value  = null
    hintArrow.value   = null

    engineStore.clearMoveQualityBadge()
    reviewStore.cancelAnalysis()
    reviewStore.reviewingHistory = false
    reviewStore.reviewBadge      = null
    reviewStore.reviewEvals      = []
    reviewStore.reviewQualities  = []

    uiStore.unlockSettings()
    uiStore.clockInit(() => {
      // onFlag: called when a clock runs out
      const step = getStep(engineStore.eloSliderIdx)
      const flagColor = uiStore.clockActive
      uiStore.showToast(
        flagColor === 'w' ? '⏱ Time! Black wins on flag!' : '⏱ Time! White wins on flag!',
        4000
      )
      saveGame('vs-computer', null, step.elo, flagColor === 'w' ? 'loss' : 'win')
    })

    if (uiStore.currentMode === 'vs-computer') {
      engineStore.initAiWorker()
    }

    engineStore.resetEvalBar()
  }

  // ── Take-back ──────────────────────────────────────────────────────────────

  async function takeBack() {
    const [{ useEngineStore }, { useUiStore }] = await Promise.all([
      import('./engine.js'),
      import('./ui.js'),
    ])
    const engineStore = useEngineStore()
    const uiStore     = useUiStore()

    if (uiStore.playMode !== 'casual' && uiStore.playMode !== 'analysis') return
    const h = _game.history()
    if (h.length === 0) return

    gameId.value++
    engineStore.aiThinking = false
    uiStore.thinkingBarActive = false

    if (uiStore.playMode === 'casual') {
      if (_game.turn() === 'w' && h.length >= 2) { _game.undo(); _game.undo() }
      else if (_game.turn() === 'b')              { _game.undo() }
    } else {
      _game.undo()
    }
    gameVersion.value++
    uiStore.clockStop()
    viewIdx.value    = _game.history().length
    selected.value   = null
    legalMoves.value = null
    engineStore.clearMoveQualityBadge()
  }

  // ── PGN copy ───────────────────────────────────────────────────────────────

  async function copyPgn() {
    const pgn = _game.pgn()
    try {
      await navigator.clipboard.writeText(pgn)
      return true
    } catch (_) {
      prompt('Copy this PGN:', pgn)
      return false
    }
  }

  // ── ELO update from multiplayer ────────────────────────────────────────────

  async function applyEloUpdate(eloChange, newElo) {
    if (newElo == null || eloChange == null) return
    const oldElo = playerElo.value
    playerElo.value = newElo
    const { useUiStore } = await import('./ui.js')
    const uiStore = useUiStore()
    if (uiStore.pendingMpWin) {
      uiStore.pendingMpWin = false
      uiStore.showWinModal(oldElo, newElo, eloChange)
    } else {
      const sign = eloChange >= 0 ? '+' : ''
      uiStore.showToast(`${sign}${eloChange} ELO  (now ${newElo})`, 4000)
    }
  }

  // Expose game state as reactive methods for component consumption
  // Components use these inside computed() to track gameVersion correctly
  const game = {
    isGameOver:  () => { void gameVersion.value; return _game.isGameOver() },
    isCheckmate: () => { void gameVersion.value; return _game.isCheckmate() },
    isStalemate: () => { void gameVersion.value; return _game.isStalemate() },
    isDraw:      () => { void gameVersion.value; return _game.isDraw() },
    isCheck:     () => { void gameVersion.value; return _game.isCheck() },
    turn:        () => { void gameVersion.value; return _game.turn() },
    fen:         () => { void gameVersion.value; return _game.fen() },
    pgn:         () => { void gameVersion.value; return _game.pgn() },
    get:         (sq) => { void gameVersion.value; return _game.get(sq) },
    history:     (opts) => { void gameVersion.value; return _game.history(opts) },
    moves:       (opts) => { void gameVersion.value; return _game.moves(opts) },
  }

  return {
    game,
    _game,
    gameVersion,
    gameId,
    viewIdx,
    selected,
    legalMoves,
    hintArrow,
    playerElo,
    historyRows,
    selectedOpeningIdx,
    // Computed
    history,
    atLivePos,
    viewGame,
    lastMove,
    detectedOpening,
    selectedOpening,
    openingIdx,
    // Actions
    getBookMove,
    getOpeningHintArrow,
    setOpening,
    doMove,
    handleMove,
    _buildGameCtx,
    goToMove,
    goToStart,
    goBack,
    goForward,
    goToEnd,
    saveGame,
    loadHistory,
    newGame,
    takeBack,
    copyPgn,
    applyEloUpdate,
  }
})
