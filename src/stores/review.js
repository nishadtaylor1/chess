import { defineStore } from 'pinia'
import { ref } from 'vue'
import { Chess } from 'chess.js'
import { evalToWhiteCp, classifyMoveQuality } from './engine.js'

export const useReviewStore = defineStore('review', () => {
  const reviewingHistory = ref(false)
  const reviewEvals      = ref([])    // { type, wVal } for each position
  const reviewQualities  = ref([])    // quality for each move (1-indexed)
  const reviewGameTag    = ref(0)     // increment to cancel stale analysis

  // Review badge for current viewed move (persistent until next navigation)
  const reviewBadge = ref(null) // { sq, quality } | null

  // Non-reactive review worker
  let reviewW             = null
  let reviewWorkerBest    = { type: 'cp', value: 0 }
  let reviewWorkerResolve = null

  function _getReviewWorker() {
    if (reviewW) return reviewW
    reviewW = new Worker('/js/stockfish.js')
    reviewW.onmessage = e => {
      const line = typeof e.data === 'string' ? e.data : String(e.data)
      if (line.startsWith('info') && line.includes(' score ')) {
        const m = line.match(/\bscore (cp|mate) (-?\d+)/)
        if (m) reviewWorkerBest = { type: m[1], value: parseInt(m[2]) }
      }
      if (line.startsWith('bestmove') && reviewWorkerResolve) {
        const cb = reviewWorkerResolve; reviewWorkerResolve = null
        cb({ ...reviewWorkerBest })
      }
    }
    reviewW.postMessage('uci')
    reviewW.postMessage('isready')
    return reviewW
  }

  function _evalPositionForReview(fen, turn) {
    const w = _getReviewWorker()
    reviewWorkerBest = { type: 'cp', value: 0 }
    return new Promise(resolve => {
      reviewWorkerResolve = score => {
        const wVal = turn === 'w' ? score.value : -score.value
        resolve({ type: score.type, wVal })
      }
      w.postMessage('stop')
      w.postMessage(`position fen ${fen}`)
      w.postMessage('go depth 12')
    })
  }

  async function analyzeGame(pgn) {
    const myTag = reviewGameTag.value
    const tmp = new Chess()
    try { tmp.loadPgn(pgn) } catch (_) { return }
    const hist = tmp.history({ verbose: true })

    // Build positions array
    const positions = []
    const t = new Chess()
    positions.push({ fen: t.fen(), turn: t.turn() })
    for (const mv of hist) {
      t.move({ from: mv.from, to: mv.to, promotion: mv.promotion })
      positions.push({ fen: t.fen(), turn: t.turn() })
    }

    reviewEvals.value     = new Array(positions.length).fill(null)
    reviewQualities.value = new Array(positions.length).fill(null)

    for (let i = 0; i < positions.length; i++) {
      if (myTag !== reviewGameTag.value) return
      const evalResult = await _evalPositionForReview(positions[i].fen, positions[i].turn)
      if (myTag !== reviewGameTag.value) return
      reviewEvals.value[i] = evalResult

      if (i > 0 && reviewEvals.value[i - 1] !== null) {
        const moverColor = positions[i - 1].turn
        const prevCp = evalToWhiteCp(reviewEvals.value[i - 1])
        const nextCp = evalToWhiteCp(evalResult)
        const cpLoss = moverColor === 'w' ? (prevCp - nextCp) : (nextCp - prevCp)
        reviewQualities.value[i] = classifyMoveQuality(cpLoss)
      }
    }
  }

  function showBadgeForMove(moveIdx, gameHistory) {
    reviewBadge.value = null
    if (!reviewingHistory.value || moveIdx <= 0) return
    const quality = reviewQualities.value[moveIdx]
    if (!quality) return
    const move = gameHistory[moveIdx - 1]
    if (!move?.to) return
    reviewBadge.value = { sq: move.to, quality }
  }

  async function startReview(pgn, gameStore) {
    const { useEngineStore } = await import('./engine.js')
    const { useUiStore }     = await import('./ui.js')
    const engineStore = useEngineStore()
    const uiStore     = useUiStore()

    // Check if there's an active game to confirm leaving
    if (gameStore.history.length > 0 &&
        !gameStore.game.isGameOver() &&
        !reviewingHistory.value) {
      if (!window.confirm('Leave your current game to review this one?')) return
    }

    if (engineStore.cpuRunning) engineStore.stopCpuGame(uiStore)
    gameStore.gameId++
    reviewGameTag.value++
    engineStore.clearMoveQualityBadge()

    const game = gameStore._game
    game.reset()
    gameStore.gameVersion++
    try { game.loadPgn(pgn); gameStore.gameVersion++ } catch (_) {
      uiStore.showToast('Could not load game.', 2000); return
    }

    reviewingHistory.value    = true
    reviewBadge.value         = null
    reviewEvals.value         = []
    reviewQualities.value     = []
    gameStore.viewIdx   = 0
    gameStore.selected  = null
    gameStore.legalMoves = null
    gameStore.hintArrow = null
    uiStore.unlockSettings()
    engineStore.resetEvalBar()
    uiStore.clockStop()

    // Start background analysis
    analyzeGame(pgn)
  }

  function cancelAnalysis() {
    reviewGameTag.value++
    if (reviewW) {
      reviewW.postMessage('stop')
    }
  }

  function closeReview(gameStore) {
    cancelAnalysis()
    reviewEvals.value     = []
    reviewQualities.value = []
    reviewBadge.value     = null
    reviewingHistory.value = false
    gameStore.newGame()
  }

  return {
    reviewingHistory,
    reviewEvals,
    reviewQualities,
    reviewGameTag,
    reviewBadge,
    analyzeGame,
    showBadgeForMove,
    startReview,
    cancelAnalysis,
    closeReview,
  }
})
