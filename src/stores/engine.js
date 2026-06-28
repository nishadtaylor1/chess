import { defineStore } from 'pinia'
import { ref } from 'vue'

export const STEPS = [
  { elo: 500,  label: 'Beginner',      rc: .85, skill: 0,  depth: 1,  mt: 60,   le: null, delay: 800  },
  { elo: 600,  label: 'Beginner',      rc: .70, skill: 0,  depth: 1,  mt: 80,   le: null, delay: 800  },
  { elo: 700,  label: 'Beginner',      rc: .55, skill: 1,  depth: 1,  mt: 100,  le: null, delay: 850  },
  { elo: 800,  label: 'Novice',        rc: .40, skill: 1,  depth: 2,  mt: 150,  le: null, delay: 900  },
  { elo: 900,  label: 'Novice',        rc: .26, skill: 2,  depth: 2,  mt: 200,  le: null, delay: 950  },
  { elo: 1000, label: 'Casual',        rc: .15, skill: 3,  depth: 3,  mt: null, le: null, delay: 1000 },
  { elo: 1100, label: 'Casual',        rc: .08, skill: 4,  depth: 4,  mt: null, le: null, delay: 1050 },
  { elo: 1200, label: 'Casual',        rc: .03, skill: 5,  depth: 5,  mt: null, le: null, delay: 1100 },
  { elo: 1300, label: 'Club Player',   rc: 0,   skill: 6,  depth: 6,  mt: null, le: 1320, delay: 1150 },
  { elo: 1400, label: 'Club Player',   rc: 0,   skill: 9,  depth: 7,  mt: null, le: 1400, delay: 1200 },
  { elo: 1500, label: 'Club Player',   rc: 0,   skill: 10, depth: 8,  mt: null, le: 1500, delay: 1250 },
  { elo: 1600, label: 'Intermediate',  rc: 0,   skill: 11, depth: 9,  mt: null, le: 1600, delay: 1300 },
  { elo: 1700, label: 'Intermediate',  rc: 0,   skill: 12, depth: 10, mt: null, le: 1700, delay: 1350 },
  { elo: 1800, label: 'Advanced',      rc: 0,   skill: 13, depth: 11, mt: null, le: 1800, delay: 1400 },
  { elo: 1900, label: 'Advanced',      rc: 0,   skill: 14, depth: 12, mt: null, le: 1900, delay: 1500 },
  { elo: 2000, label: 'Expert',        rc: 0,   skill: 15, depth: 13, mt: null, le: 2000, delay: 1600 },
  { elo: 2100, label: 'Expert',        rc: 0,   skill: 16, depth: 14, mt: null, le: 2100, delay: 1700 },
  { elo: 2200, label: 'Master',        rc: 0,   skill: 17, depth: 15, mt: null, le: 2200, delay: 1800 },
  { elo: 2300, label: 'Master',        rc: 0,   skill: 18, depth: 16, mt: null, le: 2300, delay: 1900 },
  { elo: 2400, label: 'Grandmaster',   rc: 0,   skill: 19, depth: 17, mt: null, le: 2400, delay: 2000 },
  { elo: 2500, label: 'Grandmaster',   rc: 0,   skill: 20, depth: 18, mt: null, le: 2500, delay: 2100 },
  { elo: 2600, label: 'Super-GM',      rc: 0,   skill: 20, depth: 20, mt: null, le: 2600, delay: 2200 },
  { elo: 2700, label: 'Super-GM',      rc: 0,   skill: 20, depth: 22, mt: null, le: 2700, delay: 2300 },
  { elo: 2800, label: 'Super-GM',      rc: 0,   skill: 20, depth: 25, mt: null, le: 2800, delay: 2400 },
  { elo: 'Max',label: 'Stockfish Max', rc: 0,   skill: 20, depth: 30, mt: null, le: null, delay: 2500 },
]

const HINT_STEP = { le: null, skill: 20, depth: 15, mt: null, rc: 0 }

export function getStep(idx) {
  return STEPS[Math.min(idx | 0, STEPS.length - 1)]
}

export function fmtElo(s) {
  return s.elo === 'Max' ? 'Max' : String(s.elo)
}

// ── Stockfish worker helpers ─────────────────────────────────────────────────

function mkWorker() {
  const w = { worker: new Worker('/js/stockfish.js'), ready: false, resolve: null }
  w.worker.onmessage = e => {
    const line = typeof e.data === 'string' ? e.data : String(e.data)
    if (line === 'readyok') w.ready = true
    if (line.startsWith('bestmove') && w.resolve) {
      const mv = line.split(' ')[1]
      const cb = w.resolve; w.resolve = null
      cb(!mv || mv === '(none)' ? null : mv)
    }
  }
  w.worker.onerror = () => { if (w.resolve) { w.resolve(null); w.resolve = null } }
  w.worker.postMessage('uci')
  w.worker.postMessage('isready')
  return w
}

function waitReady(w) {
  return new Promise(r => {
    if (w.ready) return r()
    const id = setInterval(() => { if (w.ready) { clearInterval(id); r() } }, 30)
  })
}

function applyStrength(w, step) {
  if (step.le) {
    w.worker.postMessage('setoption name UCI_LimitStrength value true')
    w.worker.postMessage(`setoption name UCI_Elo value ${step.le}`)
  } else {
    w.worker.postMessage('setoption name UCI_LimitStrength value false')
  }
  w.worker.postMessage(`setoption name Skill Level value ${step.skill}`)
}

function sfMove(w, fen, step) {
  return waitReady(w).then(() => {
    applyStrength(w, step)
    return new Promise(resolve => {
      w.resolve = resolve
      w.worker.postMessage('ucinewgame')
      w.worker.postMessage(`position fen ${fen}`)
      w.worker.postMessage(step.mt ? `go movetime ${step.mt}` : `go depth ${step.depth}`)
    })
  })
}

async function getAiMove(w, fen, step) {
  if (step.rc > 0 && Math.random() < step.rc) {
    const { Chess } = await import('chess.js')
    const tmp = new Chess(fen)
    const mvs = tmp.moves({ verbose: true })
    if (!mvs.length) return null
    const m = mvs[Math.floor(Math.random() * mvs.length)]
    return m.from + m.to + (m.promotion ? 'q' : '')
  }
  return sfMove(w, fen, step)
}

// ── Eval / quality helpers ───────────────────────────────────────────────────

export function evalToPercent(type, val) {
  if (type === 'mate') return val > 0 ? 99 : (val < 0 ? 1 : 50)
  return Math.max(1, Math.min(99, 50 + 50 * Math.tanh(val / 400)))
}

export function evalToWhiteCp(state) {
  if (state.type === 'mate') return state.wVal > 0 ? 10000 : -10000
  return state.wVal
}

export function classifyMoveQuality(cpLoss) {
  if (cpLoss <= 5)   return { label: 'Best',       symbol: '★',  bg: '#1bada6', fg: '#fff' }
  if (cpLoss <= 15)  return { label: 'Excellent',  symbol: '!',  bg: '#96bc4b', fg: '#fff' }
  if (cpLoss <= 30)  return { label: 'Good',       symbol: '✓',  bg: '#a8c777', fg: '#fff' }
  if (cpLoss <= 60)  return { label: 'Inaccuracy', symbol: '?!', bg: '#f0c15d', fg: '#333' }
  if (cpLoss <= 120) return { label: 'Mistake',    symbol: '?',  bg: '#e06c27', fg: '#fff' }
  return                    { label: 'Blunder',    symbol: '??', bg: '#cc3333', fg: '#fff' }
}

// ── Pinia store ──────────────────────────────────────────────────────────────

export const useEngineStore = defineStore('engine', () => {
  // Non-reactive workers (plain JS, not Vue-proxied)
  let sfW  = null
  let sfB  = null
  let evalW = null

  // Eval bar (reactive)
  const evalBarState = ref({
    type: 'cp', wVal: 0, pct: 50, label: '=', labelClass: 'even',
  })

  // Eval worker state (non-reactive internals)
  let evalReady = false
  let evalQueue = null
  let evalBest  = { type: 'cp', value: 0 }
  let evalTurn  = 'w'

  // Move quality (reactive for board display)
  const moveQualityBadge = ref(null) // { sq, quality } | null
  let   moveQualityTimer = null

  // Previous eval stored for quality comparison
  let prevEvalState      = { type: 'cp', wVal: 0 }
  let pendingQualityCheck = null // { toSq, moverColor, prev }

  // ELO slider indices (reactive — components bind to these)
  const eloSliderIdx  = ref(10)
  const wEloSliderIdx = ref(10)
  const bEloSliderIdx = ref(10)

  // AI state
  const aiThinking  = ref(false)
  const hintLoading = ref(false)

  // CPU vs CPU
  const cpuRunning = ref(false)
  const cpuPaused  = ref(false)
  const cpuSpeed   = ref(900)
  let   cpuTid     = null
  let   cpuGameId  = 0

  // ── Eval bar ────────────────────────────────────────────────────────────────

  function _renderEvalBar(type, wVal) {
    const pct = evalToPercent(type, wVal)
    let txt, cls
    if (type === 'mate') {
      txt = wVal > 0 ? `M${wVal}` : (wVal < 0 ? `M${Math.abs(wVal)}` : '=')
      cls = wVal > 0 ? 'wup' : (wVal < 0 ? 'bup' : 'even')
    } else {
      const p = wVal / 100
      txt = Math.abs(p) < 0.05 ? '=' : Math.min(9.9, Math.abs(p)).toFixed(1)
      cls = wVal > 20 ? 'wup' : (wVal < -20 ? 'bup' : 'even')
    }
    evalBarState.value = { type, wVal, pct, label: txt, labelClass: cls }
  }

  function _showMoveQuality(toSq, moverColor, prev, next) {
    const prevCp = evalToWhiteCp(prev)
    const nextCp = evalToWhiteCp(next)
    const cpLoss  = moverColor === 'w' ? (prevCp - nextCp) : (nextCp - prevCp)
    const quality = classifyMoveQuality(cpLoss)
    if (moveQualityTimer) { clearTimeout(moveQualityTimer); moveQualityTimer = null }
    moveQualityBadge.value = { sq: toSq, quality }
    moveQualityTimer = setTimeout(() => {
      moveQualityBadge.value = null
      moveQualityTimer       = null
    }, 3500)
  }

  function initEvalWorker() {
    if (evalW) { evalW.terminate(); evalW = null }
    evalReady = false; evalQueue = null
    evalBest  = { type: 'cp', value: 0 }
    evalW = new Worker('/js/stockfish.js')
    evalW.onmessage = e => {
      const line = typeof e.data === 'string' ? e.data : String(e.data)
      if (line === 'readyok') {
        evalReady = true
        if (evalQueue) { _doEvalRequest(evalQueue); evalQueue = null }
      }
      if (line.startsWith('info') && line.includes(' score ')) {
        const m = line.match(/\bscore (cp|mate) (-?\d+)/)
        if (m) evalBest = { type: m[1], value: parseInt(m[2]) }
      }
      if (line.startsWith('bestmove')) {
        const wVal         = evalTurn === 'w' ? evalBest.value : -evalBest.value
        const newEvalState = { type: evalBest.type, wVal }
        _renderEvalBar(evalBest.type, wVal)
        if (pendingQualityCheck) {
          const pqc = pendingQualityCheck
          pendingQualityCheck = null
          _showMoveQuality(pqc.toSq, pqc.moverColor, pqc.prev, newEvalState)
        }
        prevEvalState = newEvalState
      }
    }
    evalW.onerror = e => console.error('Eval worker error:', e)
    evalW.postMessage('uci')
    evalW.postMessage('isready')
  }

  function _doEvalRequest({ fen, turn }) {
    evalTurn = turn
    evalW.postMessage('stop')
    evalW.postMessage(`position fen ${fen}`)
    evalW.postMessage('go depth 14')
  }

  function scheduleEval(fen, turn) {
    evalBest = { type: 'cp', value: 0 }
    evalTurn = turn
    if (!evalReady || !evalW) { evalQueue = { fen, turn }; return }
    _doEvalRequest({ fen, turn })
  }

  function resetEvalBar() {
    if (evalW) evalW.postMessage('stop')
    evalBarState.value = { type: 'cp', wVal: 0, pct: 50, label: '=', labelClass: 'even' }
  }

  function setPendingQualityCheck(toSq, moverColor) {
    pendingQualityCheck = { toSq, moverColor, prev: { ...prevEvalState } }
  }

  function clearMoveQualityBadge() {
    if (moveQualityTimer) { clearTimeout(moveQualityTimer); moveQualityTimer = null }
    moveQualityBadge.value  = null
    pendingQualityCheck     = null
    prevEvalState           = { type: 'cp', wVal: 0 }
  }

  // ── AI workers ──────────────────────────────────────────────────────────────

  function initAiWorker() {
    if (sfW) sfW.worker.terminate()
    sfW = mkWorker()
  }

  // gameCtx: { _game, gameVersion, gameId, hintArrow, doMove, getBookMove }
  async function triggerAI(gameCtx, uiStore) {
    if (aiThinking.value) return
    const { _game, gameVersion, gameId, doMove, getBookMove, hintArrow } = gameCtx
    const myId = gameVersion.value

    // Opening book move?
    const bookSan = getBookMove()
    if (bookSan) {
      aiThinking.value          = true
      uiStore.thinkingBarActive = true
      await new Promise(r => setTimeout(r, 350 + Math.random() * 300))
      aiThinking.value          = false
      uiStore.thinkingBarActive = false
      if (myId !== gameVersion.value || _game.isGameOver()) return
      const { Chess } = await import('chess.js')
      const tmp = new Chess(_game.fen())
      const m   = tmp.move(bookSan)
      if (m) { doMove(m.from, m.to, m.promotion || 'q'); return }
    }

    if (!sfW) sfW = mkWorker()
    aiThinking.value          = true
    uiStore.thinkingBarActive = true

    const step = getStep(eloSliderIdx.value)
    const fen  = _game.fen()
    const tc   = uiStore.tc  // Pinia auto-unwraps computed refs — gives TCS object directly

    // Minimum thinking delay based on time control
    let minDelay = step.delay
    const tcMin = typeof tc === 'object' ? tc.min : 0
    if (tcMin > 0 && tcMin <= 2)  minDelay = Math.min(step.delay, 350)
    else if (tcMin > 0 && tcMin <= 5) minDelay = Math.min(step.delay, 600)

    let best = null
    try {
      const [mv] = await Promise.all([
        getAiMove(sfW, fen, step),
        new Promise(r => setTimeout(r, minDelay)),
      ])
      best = mv
    } catch (e) {
      console.error('AI error:', e)
    }

    aiThinking.value          = false
    uiStore.thinkingBarActive = false

    if (myId !== gameVersion.value || _game.isGameOver()) return
    if (!best) return
    doMove(best.slice(0, 2), best.slice(2, 4), best[4] || 'q')
  }

  // ── Hint ────────────────────────────────────────────────────────────────────

  async function requestHint(gameStore) {
    if (hintLoading.value || aiThinking.value) return
    if (!sfW) sfW = mkWorker()
    const vg = gameStore.viewGame   // Pinia auto-unwraps store refs
    if (vg.isGameOver()) return
    hintLoading.value = true
    const best = await sfMove(sfW, vg.fen(), HINT_STEP)
    hintLoading.value = false
    if (!best) return
    gameStore.hintArrow = { from: best.slice(0, 2), to: best.slice(2, 4) }
  }

  // ── CPU vs CPU ────────────────────────────────────────────────────────────────

  // gameCtx: { _game, gameVersion, doMove, saveGame, history }
  async function startCpuGame(gameCtx, uiStore) {
    if (sfW) sfW.worker.terminate()
    if (sfB) sfB.worker.terminate()
    sfW = mkWorker(); sfB = mkWorker()
    cpuGameId++
    cpuRunning.value = true
    cpuPaused.value  = false
    uiStore.statusCCText        = ''
    uiStore.thinkingBarCCActive = false

    // Reset the game
    const { _game, gameVersion } = gameCtx
    _game.reset(); gameVersion.value++

    await Promise.all([waitReady(sfW), waitReady(sfB)])
    if (!cpuRunning.value) return
    _scheduleCpuMove(gameCtx, uiStore)
  }

  function stopCpuGame(uiStore) {
    cpuRunning.value = false
    cpuGameId++
    if (cpuTid) { clearTimeout(cpuTid); cpuTid = null }
    if (uiStore) {
      uiStore.thinkingBarCCActive = false
      uiStore.statusCCText        = ''
    }
  }

  function togglePause(gameCtx, uiStore) {
    cpuPaused.value = !cpuPaused.value
    if (!cpuPaused.value) _scheduleCpuMove(gameCtx, uiStore)
  }

  function setSpeed(ms) {
    cpuSpeed.value = ms
  }

  function _scheduleCpuMove(gameCtx, uiStore) {
    if (!cpuRunning.value || cpuPaused.value) return
    cpuTid = setTimeout(() => _runCpuMove(gameCtx, uiStore), cpuSpeed.value)
  }

  async function _runCpuMove(gameCtx, uiStore) {
    const { _game, gameVersion, doMove, saveGame } = gameCtx
    if (!cpuRunning.value || cpuPaused.value || _game.isGameOver()) return

    const myId    = cpuGameId
    const isWhite = _game.turn() === 'w'
    const worker  = isWhite ? sfW : sfB
    const step    = getStep(isWhite ? wEloSliderIdx.value : bEloSliderIdx.value)

    uiStore.statusCCText        = (isWhite ? '⬜ White' : '⬛ Black') + ' is thinking…'
    uiStore.thinkingBarCCActive = true

    let best = null
    try { best = await sfMove(worker, _game.fen(), step) }
    catch (e) { console.error('CPU vs CPU error:', e) }

    uiStore.thinkingBarCCActive = false
    if (myId !== cpuGameId || !cpuRunning.value) return

    if (!best) { stopCpuGame(uiStore); return }

    const move = doMove(best.slice(0, 2), best.slice(2, 4), best[4] || 'q')
    if (!move) { console.error('Illegal move from CPU engine:', best); stopCpuGame(uiStore); return }

    scheduleEval(_game.fen(), _game.turn())

    if (_game.isGameOver()) {
      uiStore.statusCCText = _game.isCheckmate()
        ? (_game.turn() === 'w' ? '💀 Black wins!' : '🏆 White wins!')
        : '🤝 Draw'
      const wElo = getStep(wEloSliderIdx.value).elo
      const bElo = getStep(bEloSliderIdx.value).elo
      await saveGame('cpu-vs-cpu', wElo, bElo)
      stopCpuGame(uiStore)
      return
    }

    uiStore.statusCCText = _game.turn() === 'w' ? '⬜ White to move' : '⬛ Black to move'
    _scheduleCpuMove(gameCtx, uiStore)
  }

  return {
    evalBarState,
    moveQualityBadge,
    eloSliderIdx,
    wEloSliderIdx,
    bEloSliderIdx,
    aiThinking,
    hintLoading,
    cpuRunning,
    cpuPaused,
    cpuSpeed,
    initEvalWorker,
    scheduleEval,
    resetEvalBar,
    setPendingQualityCheck,
    clearMoveQualityBadge,
    initAiWorker,
    triggerAI,
    requestHint,
    startCpuGame,
    stopCpuGame,
    togglePause,
    setSpeed,
  }
})
