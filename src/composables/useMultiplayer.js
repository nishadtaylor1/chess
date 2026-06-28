import { ref } from 'vue'
import { io } from 'socket.io-client'

export function useMultiplayer() {
  const mpSocket      = ref(null)
  const mpRoomId      = ref(null)
  const mpColor       = ref(null) // 'w' | 'b'
  const mpOpponent    = ref('')
  const mpStatus      = ref('Connecting…')
  const mpDrawBtnVisible   = ref(false)
  const mpResignBtnVisible = ref(false)
  const mpWaiting     = ref(false) // showing overlay
  const mpDrawPending = ref(false) // draw offered by opponent

  function initMultiplayer(roomId, { gameStore, uiStore, engineStore }) {
    mpRoomId.value = roomId
    mpWaiting.value = true
    mpStatus.value  = 'Connecting…'

    const socket = io()
    mpSocket.value = socket

    socket.on('connect', () => {
      socket.emit('game:rejoin', { roomId })
    })

    socket.on('game:color', color => {
      mpColor.value = color
    })

    socket.on('game:state', ({ white, black, fen, pgn, status }) => {
      if (status === 'waiting') {
        mpStatus.value  = 'Waiting for opponent…'
        mpWaiting.value = true
      } else if (status === 'playing') {
        // gameStore._game is markRaw so accessible directly
        gameStore._game.reset()
        gameStore.gameVersion++
        if (pgn) {
          try { gameStore._game.loadPgn(pgn); gameStore.gameVersion++ } catch (_) {}
        }
        gameStore.viewIdx = gameStore._game.history().length
        _beginGame(white, black, gameStore, uiStore, engineStore)
      } else {
        mpStatus.value  = 'This game has ended.'
        mpWaiting.value = false
      }
    })

    socket.on('game:start', ({ white, black }) => {
      gameStore._game.reset()
      gameStore.gameVersion++
      gameStore.viewIdx = 0
      _beginGame(white, black, gameStore, uiStore, engineStore)
    })

    socket.on('game:move', ({ from, to, promotion }) => {
      gameStore.doMove(from, to, promotion || 'q')
      engineStore.scheduleEval(gameStore._game.fen(), gameStore._game.turn())
    })

    socket.on('game:illegal', () => {
      uiStore.showToast('Illegal move.', 1800)
    })

    socket.on('player:elo_update', ({ newElo, change }) => {
      gameStore.applyEloUpdate(change, newElo)
    })

    socket.on('game:end', ({ result, reason }) => {
      uiStore.clockStop()
      mpDrawBtnVisible.value   = false
      mpResignBtnVisible.value = false
      const won  = (result === '1-0' && mpColor.value === 'w') ||
                   (result === '0-1' && mpColor.value === 'b')
      const drew = result === '1/2-1/2'
      if (won) uiStore.pendingMpWin = true
      const labels = {
        checkmate:    'checkmate',
        stalemate:    'stalemate',
        resignation:  'resignation',
        agreement:    'draw by agreement',
        disconnect:   'opponent disconnected',
      }
      const reasonStr = labels[reason] || reason
      mpStatus.value = drew
        ? `🤝 Draw — ${reasonStr}`
        : won
          ? `🏆 You win! (${reasonStr})`
          : `💀 You lose — ${reasonStr}`
      mpRoomId.value = null
      gameStore.loadHistory()
    })

    socket.on('game:opponent_disconnected', () => {
      uiStore.showToast('Opponent disconnected. They have 60 seconds to reconnect…', 5000)
    })

    socket.on('game:opponent_reconnected', ({ username }) => {
      uiStore.showToast(`${username} reconnected.`, 2500)
    })

    socket.on('game:draw_offered', ({ from }) => {
      uiStore.showToast(`${from} offers a draw.`, 8000)
      mpDrawPending.value = true
    })

    socket.on('game:draw_declined', () => {
      uiStore.showToast('Draw offer declined.', 2500)
    })

    socket.on('game:error', msg => {
      mpStatus.value  = msg
      mpWaiting.value = false
      uiStore.showToast(msg, 4000)
    })

    socket.on('disconnect', () => {
      if (mpRoomId.value) uiStore.showToast('Connection lost — trying to reconnect…', 4000)
    })
  }

  function _beginGame(white, black, gameStore, uiStore, engineStore) {
    mpOpponent.value = mpColor.value === 'w' ? black : white
    mpWaiting.value  = false
    mpDrawBtnVisible.value   = true
    mpResignBtnVisible.value = true
    mpDrawPending.value = false
    mpStatus.value = `Playing vs ${mpOpponent.value}`
    gameStore.gameId++
    gameStore.selected  = null
    gameStore.legalMoves = null
    uiStore.clockInit()
    engineStore.resetEvalBar()
  }

  function mpResign() {
    if (!mpRoomId.value || !mpSocket.value) return
    mpSocket.value.emit('game:resign', { roomId: mpRoomId.value })
  }

  function mpOfferDraw() {
    if (!mpRoomId.value || !mpSocket.value) return
    mpSocket.value.emit('game:draw_offer', { roomId: mpRoomId.value })
  }

  function mpAcceptDraw() {
    if (!mpRoomId.value || !mpSocket.value) return
    mpSocket.value.emit('game:draw_accept', { roomId: mpRoomId.value })
    mpDrawPending.value = false
  }

  function mpDeclineDraw() {
    if (!mpRoomId.value || !mpSocket.value) return
    mpSocket.value.emit('game:draw_decline', { roomId: mpRoomId.value })
    mpDrawPending.value = false
  }

  function mpEmitMove({ from, to, promotion }) {
    if (!mpSocket.value || !mpRoomId.value) return
    mpSocket.value.emit('game:move', { roomId: mpRoomId.value, from, to, promotion })
  }

  function disconnect() {
    if (mpSocket.value) mpSocket.value.disconnect()
    mpSocket.value = null
    mpRoomId.value = null
    mpColor.value  = null
  }

  function copyLink() {
    const url = `${location.origin}/chess?room=${mpRoomId.value}`
    navigator.clipboard.writeText(url).then(() => {}).catch(() => {})
    return url
  }

  return {
    mpSocket,
    mpRoomId,
    mpColor,
    mpOpponent,
    mpStatus,
    mpDrawBtnVisible,
    mpResignBtnVisible,
    mpWaiting,
    mpDrawPending,
    initMultiplayer,
    mpResign,
    mpOfferDraw,
    mpAcceptDraw,
    mpDeclineDraw,
    mpEmitMove,
    disconnect,
    copyLink,
  }
}
