<script setup>
import { onMounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore }   from '../stores/game.js'
import { useEngineStore } from '../stores/engine.js'
import { useUiStore }     from '../stores/ui.js'
import { useReviewStore } from '../stores/review.js'
import { useMultiplayer } from '../composables/useMultiplayer.js'
import NavBar     from '../components/NavBar.vue'
import Toast      from '../components/Toast.vue'
import WinModal   from '../components/WinModal.vue'
import ChessBoard from '../components/board/ChessBoard.vue'
import GamePanel  from '../components/panel/GamePanel.vue'

const route       = useRoute()
const router      = useRouter()
const gameStore   = useGameStore()
const engineStore = useEngineStore()
const uiStore     = useUiStore()
const reviewStore = useReviewStore()

const mp = useMultiplayer()

// ── Player bar display ──
const whiteBarName = computed(() => {
  if (uiStore.currentMode === 'multiplayer') {
    return mp.mpColor.value === 'b' ? `⬜ ${mp.mpOpponent.value}` : '⬜ You'
  }
  return uiStore.currentMode === 'vs-computer' ? '⬜ You' : '⬜ White'
})
const blackBarName = computed(() => {
  if (uiStore.currentMode === 'multiplayer') {
    return mp.mpColor.value === 'b' ? '⬛ You' : `⬛ ${mp.mpOpponent.value}`
  }
  return uiStore.currentMode === 'vs-computer' ? '⬛ Computer' : '⬛ Black'
})

const showViewBanner = computed(() => !gameStore.atLivePos && !reviewStore.reviewingHistory)

// ── Captured pieces + material advantage ──
// Derived from verbose move history up to viewIdx — works correctly in review mode.
const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9 }
const PIECE_ORDER = ['p', 'n', 'b', 'r', 'q']

const material = computed(() => {
  const hist     = gameStore.history   // reactive: recomputes on every move
  const viewIdx  = gameStore.viewIdx
  const whiteCap = { p:0, n:0, b:0, r:0, q:0 }
  const blackCap = { p:0, n:0, b:0, r:0, q:0 }
  for (let i = 0; i < viewIdx; i++) {
    const mv = hist[i]
    if (!mv?.captured) continue
    if (mv.color === 'w') whiteCap[mv.captured] = (whiteCap[mv.captured] || 0) + 1
    else                  blackCap[mv.captured] = (blackCap[mv.captured] || 0) + 1
  }
  let wPts = 0, bPts = 0
  for (const t of PIECE_ORDER) {
    wPts += whiteCap[t] * PIECE_VALUE[t]
    bPts += blackCap[t] * PIECE_VALUE[t]
  }
  return { whiteCap, blackCap, wAdv: wPts - bPts, bAdv: bPts - wPts }
})

function captureList(capObj, pieceColor) {
  if (!capObj) return []
  const list = []
  for (const t of PIECE_ORDER) {
    for (let i = 0; i < (capObj[t] || 0); i++) {
      list.push(`/img/pieces/${pieceColor}${t.toUpperCase()}.svg`)
    }
  }
  return list
}

// ── MP overlay (waiting for opponent) ──
const mpOverlayVisible = computed(() =>
  uiStore.currentMode === 'multiplayer' && mp.mpWaiting.value
)

function mpCopyLink() {
  const url = mp.copyLink()
  uiStore.showToast('Link copied!')
}

onMounted(async () => {
  // Fetch user info
  try {
    const me = await fetch('/api/me').then(r => r.json())
    window.__chessUser = me.username || '…'
    gameStore.playerElo = me.elo ?? 1200
  } catch (_) {}

  // Init eval worker
  engineStore.initEvalWorker()

  // Load game history
  await gameStore.loadHistory()

  // Check for multiplayer room param
  const roomId = route.query.room
  if (roomId) {
    uiStore.setMode('multiplayer')
    await gameStore.newGame()
    mp.initMultiplayer(roomId, {
      gameStore,
      uiStore,
      engineStore,
    })
  } else {
    await gameStore.newGame()
  }
})

// Navigate away: disconnect MP socket
watch(() => route.path, (path) => {
  if (path !== '/chess' && mp.mpSocket.value) {
    mp.disconnect()
  }
})

// Watch for review navigation: update badge
watch(() => gameStore.viewIdx, (idx) => {
  if (reviewStore.reviewingHistory) {
    reviewStore.showBadgeForMove(idx, gameStore.history)
    const vg = gameStore.viewGame
    engineStore.scheduleEval(vg.fen(), vg.turn())
  } else if (!gameStore.atLivePos) {
    const vg = gameStore.viewGame
    engineStore.scheduleEval(vg.fen(), vg.turn())
  }
})

function mpEmitMove({ from, to, promotion }) {
  if (!mp.mpSocket.value || !mp.mpRoomId.value) return
  mp.mpSocket.value.emit('game:move', {
    roomId: mp.mpRoomId.value, from, to, promotion,
  })
}
</script>

<template>
  <NavBar />

  <!-- MP overlay: waiting for opponent -->
  <div
    v-if="mpOverlayVisible"
    style="position:fixed;inset:0;background:rgba(15,23,42,.88);z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;"
  >
    <div class="mp-overlay visible">
      <div class="spinner"></div>
      <div class="room-code">{{ mp.mpRoomId.value }}</div>
      <p>Waiting for your opponent…<br>Share this code or the link below.</p>
      <button class="btn sec" style="padding:6px 16px;font-size:12px;" @click="mpCopyLink">
        Copy Link
      </button>
    </div>
  </div>

  <div class="layout">
    <!-- Board column -->
    <div class="board-col">
      <!-- Black player bar (top) -->
      <div
        class="player-bar"
        :class="{ 'active-clock': uiStore.clockActive === 'b' }"
      >
        <span class="player-name">{{ blackBarName }}</span>
        <span
          class="player-clock"
          :class="{ 'low-time': uiStore.blackLowTime }"
        >{{ uiStore.blackClockDisplay }}</span>
      </div>
      <!-- Black's captures (white pieces Black has taken) -->
      <div class="captures-bar">
        <img
          v-for="(src, i) in captureList(material.blackCap, 'w')"
          :key="i" :src="src" class="captured-piece" alt=""
        />
        <span v-if="material.bAdv > 0" class="material-adv">+{{ material.bAdv }}</span>
      </div>

      <!-- Board -->
      <ChessBoard
        :mp-color="mp.mpColor.value"
        :mp-room-id="mp.mpRoomId.value"
        :mp-emit-move="mpEmitMove"
      />

      <!-- White's captures (black pieces White has taken) -->
      <div class="captures-bar">
        <img
          v-for="(src, i) in captureList(material.whiteCap, 'b')"
          :key="i" :src="src" class="captured-piece" alt=""
        />
        <span v-if="material.wAdv > 0" class="material-adv">+{{ material.wAdv }}</span>
      </div>

      <!-- White player bar (bottom) -->
      <div
        class="player-bar"
        :class="{ 'active-clock': uiStore.clockActive === 'w' }"
      >
        <span class="player-name">{{ whiteBarName }}</span>
        <span
          class="player-clock"
          :class="{ 'low-time': uiStore.whiteLowTime }"
        >{{ uiStore.whiteClockDisplay }}</span>
      </div>

      <!-- View banner -->
      <div v-if="showViewBanner" class="view-banner visible">
        Viewing move {{ gameStore.viewIdx }} / {{ gameStore.history.length }}
        <button @click="gameStore.goToEnd()">↩ Back to live</button>
      </div>
    </div>

    <!-- Panel -->
    <GamePanel
      :mp-status="mp.mpStatus.value"
      :mp-draw-btn-visible="mp.mpDrawBtnVisible.value"
      :mp-resign-btn-visible="mp.mpResignBtnVisible.value"
      :mp-waiting="mp.mpWaiting.value"
      :mp-draw-pending="mp.mpDrawPending.value"
      :mp-room-id="mp.mpRoomId.value"
      @mp-resign="mp.mpResign()"
      @mp-offer-draw="mp.mpOfferDraw()"
      @mp-accept-draw="mp.mpAcceptDraw()"
    />
  </div>

  <Toast />
  <WinModal />
</template>
