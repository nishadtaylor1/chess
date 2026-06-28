<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter }      from 'vue-router'
import { useGameStore }   from '../../stores/game.js'
import { useEngineStore, getStep } from '../../stores/engine.js'
import { useUiStore, TCS }  from '../../stores/ui.js'
import { useReviewStore } from '../../stores/review.js'
import { ECO_BOOK }       from '../../data/openings.js'
import EloSlider    from './EloSlider.vue'
import MoveList     from './MoveList.vue'
import GameHistory  from './GameHistory.vue'

const props = defineProps({
  mpStatus:          { type: String,  default: '' },
  mpDrawBtnVisible:  { type: Boolean, default: false },
  mpResignBtnVisible:{ type: Boolean, default: false },
  mpWaiting:         { type: Boolean, default: false },
  mpDrawPending:     { type: Boolean, default: false },
  mpRoomId:          { type: String,  default: null },
})

const emit = defineEmits(['mpResign', 'mpOfferDraw', 'mpAcceptDraw'])

const gameStore   = useGameStore()
const engineStore = useEngineStore()
const uiStore     = useUiStore()
const reviewStore = useReviewStore()
const router      = useRouter()

// ── Status text ──
// Pinia auto-unwraps store refs, so no .value needed when accessing store properties
const statusText = computed(() => {
  void gameStore.gameVersion   // track reactive dependency
  const g = gameStore.game
  if (reviewStore.reviewingHistory) return '⏪ Reviewing — ← → to navigate'
  if (g.isCheckmate()) return g.turn() === 'w' ? '💀 Black wins by checkmate!' : '🏆 White wins by checkmate!'
  if (g.isStalemate()) return '🤝 Stalemate — Draw'
  if (g.isDraw())      return '🤝 Draw'
  if (g.isCheck())     return g.turn() === 'w' ? '⚠️ White is in check' : '⚠️ Black is in check'
  if (uiStore.currentMode === 'multiplayer') {
    return props.mpStatus
  }
  if (uiStore.currentMode === 'vs-computer' && uiStore.playMode !== 'analysis') {
    return g.turn() === 'w' ? '🟢 Your turn (White)' : '⏳ AI is thinking…'
  }
  return g.turn() === 'w' ? '⬜ White to move' : '⬛ Black to move'
})

// Opening trainer
const openingGroups = computed(() => {
  const groups = {}
  ECO_BOOK.forEach((o, i) => {
    if (!groups[o.group]) groups[o.group] = []
    groups[o.group].push({ idx: i, name: o.name, eco: o.eco })
  })
  return Object.entries(groups)
})

const openingStatusText = computed(() => {
  const op = gameStore.selectedOpening   // auto-unwrapped
  if (!op) return ''
  const idx = gameStore.openingIdx       // auto-unwrapped
  if (idx < 0) return `↗ Deviated from ${op.name}`
  if (idx >= op.moves.length) return `✓ ${op.name} — complete!`
  const moveNum = Math.floor(idx / 2) + 1
  return `📖 ${op.name} — move ${moveNum}`
})

const openingStatusColor = computed(() => {
  const op = gameStore.selectedOpening
  if (!op) return ''
  const idx = gameStore.openingIdx
  if (idx < 0) return '#64748b'
  if (idx >= op.moves.length) return '#4ade80'
  return '#a5b4fc'
})

// Auto-detected opening bar (casual + analysis only)
const showAutoOpening = computed(() =>
  uiStore.currentMode === 'vs-computer' && uiStore.playMode !== 'challenge'
)
const autoOpeningText = computed(() => {
  if (!showAutoOpening.value) return ''  // local computed ref, .value is correct
  const d = gameStore.detectedOpening    // auto-unwrapped
  return d ? `📖 ${d.eco} — ${d.name}` : ''
})

// Analysis opening info panel
const showOpeningInfo = computed(() =>
  uiStore.playMode === 'analysis' &&
  !!gameStore.detectedOpening &&
  !!gameStore.detectedOpening.description
)

// Mode switching
function setMode(mode) {
  if (mode === 'multiplayer') {
    router.push('/lobby')
    return
  }
  if (engineStore.cpuRunning) engineStore.stopCpuGame(uiStore)
  uiStore.setMode(mode)
  gameStore.newGame()
}

function setPlayMode(pm) {
  if (gameStore.history.length > 0 && !gameStore.game.isGameOver()) {
    uiStore.showToast('Finish or resign your game to change modes.', 2500)
    return
  }
  uiStore.setPlayMode(pm)
  gameStore.newGame()
}

async function resign() {
  if (gameStore.game.isGameOver()) { gameStore.newGame(); return }
  uiStore.clockStop()
  const step = getStep(engineStore.eloSliderIdx)
  await gameStore.saveGame('vs-computer', null, step.elo, 'resign')
  setTimeout(() => gameStore.newGame(), 1500)
}

function onOpeningChange(val) {
  gameStore.setOpening(val === '' ? -1 : parseInt(val))
}
</script>

<template>
  <div class="panel">
    <!-- Mode tabs -->
    <div class="mode-tabs">
      <button
        class="mode-tab"
        :class="{ active: uiStore.currentMode === 'vs-computer' }"
        @click="setMode('vs-computer')"
      >vs Computer</button>
      <button
        class="mode-tab"
        :class="{ active: uiStore.currentMode === 'cpu-vs-cpu' }"
        @click="setMode('cpu-vs-cpu')"
      >CPU vs CPU</button>
      <button class="mode-tab" @click="setMode('multiplayer')">Play Friend</button>
    </div>

    <!-- vs Computer section -->
    <div v-if="uiStore.currentMode === 'vs-computer'">
      <!-- Play mode pills -->
      <div class="play-pills">
        <button
          v-for="pm in ['casual', 'challenge', 'analysis']"
          :key="pm"
          class="play-pill"
          :class="{ active: uiStore.playMode === pm, locked: uiStore.settingsLocked }"
          @click="setPlayMode(pm)"
        >{{ pm.charAt(0).toUpperCase() + pm.slice(1) }}</button>
      </div>
      <div v-if="uiStore.settingsLocked" id="settingsLockNote">
        🔒 Mode &amp; difficulty locked mid-game
      </div>

      <div class="psec">
        <div class="status-box">{{ statusText }}</div>
        <div class="thinking-bar" :class="{ active: uiStore.thinkingBarActive }">
          <div class="fill"></div>
        </div>
        <div v-if="showAutoOpening" class="auto-opening-bar">{{ autoOpeningText }}</div>
      </div>

      <!-- ELO + time control -->
      <EloSlider />

      <!-- Time control (Challenge only) -->
      <div v-if="uiStore.playMode === 'challenge'" class="psec">
        <div class="plbl">Time Control</div>
        <select
          class="tc-select"
          :value="uiStore.tcIdx"
          @change="uiStore.tcIdx = parseInt($event.target.value)"
        >
          <option value="0">∞ Unlimited</option>
          <option value="1">1+0 Bullet</option>
          <option value="2">2+1 Bullet</option>
          <option value="3">3+0 Blitz</option>
          <option value="4">3+2 Blitz</option>
          <option value="5">5+0 Blitz</option>
          <option value="6">5+3 Blitz</option>
          <option value="7">10+0 Rapid</option>
          <option value="8">15+10 Rapid</option>
          <option value="9">30+0 Rapid</option>
          <option value="10">60+0 Classical</option>
        </select>
      </div>

      <!-- Opening Trainer (not analysis) -->
      <div v-if="uiStore.playMode !== 'analysis'" id="openingSection" class="psec">
        <div class="plbl">Opening Trainer</div>
        <select
          class="tc-select"
          :value="gameStore.selectedOpeningIdx >= 0 ? gameStore.selectedOpeningIdx : ''"
          @change="onOpeningChange($event.target.value)"
        >
          <option value="">— No Opening —</option>
          <optgroup v-for="[groupName, opts] in openingGroups" :key="groupName" :label="groupName">
            <option v-for="o in opts" :key="o.idx" :value="o.idx">
              {{ o.name }} ({{ o.eco }})
            </option>
          </optgroup>
        </select>
        <div
          class="opening-status"
          :style="{ color: openingStatusColor }"
        >{{ openingStatusText }}</div>
      </div>

      <!-- Analysis mode opening info panel -->
      <div v-if="showOpeningInfo" class="opening-info-panel visible">
        <div class="oi-name">{{ gameStore.detectedOpening.name }}</div>
        <div class="oi-eco">ECO: {{ gameStore.detectedOpening.eco }}</div>
        <div class="oi-desc">{{ gameStore.detectedOpening.description }}</div>
      </div>

      <!-- Action buttons -->
      <button class="btn" @click="gameStore.newGame()">New Game</button>

      <div v-if="uiStore.playMode !== 'challenge'" class="btn-row">
        <button class="btn sec" @click="engineStore.requestHint(gameStore)"
                :disabled="engineStore.hintLoading">
          {{ engineStore.hintLoading ? 'Thinking…' : '💡 Hint' }}
        </button>
      </div>

      <div class="btn-row">
        <button
          v-if="uiStore.playMode !== 'challenge'"
          class="btn warn"
          @click="gameStore.takeBack()"
        >↩ Take Back</button>
        <button class="btn sec" @click="resign">Resign</button>
      </div>
    </div>

    <!-- CPU vs CPU section -->
    <div v-if="uiStore.currentMode === 'cpu-vs-cpu'">
      <EloSlider />

      <div class="psec">
        <div class="plbl">Move Speed</div>
        <div class="speed-btns">
          <button
            v-for="[label, ms] in [['Slow',2500],['Normal',900],['Fast',200],['Instant',60]]"
            :key="label"
            class="speed-btn"
            :class="{ active: engineStore.cpuSpeed === ms }"
            @click="engineStore.setSpeed(ms)"
          >{{ label }}</button>
        </div>
      </div>

      <div v-if="engineStore.cpuRunning" class="psec">
        <div class="status-box">{{ uiStore.statusCCText || '…' }}</div>
        <div class="thinking-bar" :class="{ active: uiStore.thinkingBarCCActive }">
          <div class="fill"></div>
        </div>
      </div>

      <button
        v-if="!engineStore.cpuRunning"
        class="btn"
        @click="engineStore.startCpuGame(gameStore._buildGameCtx(), uiStore)"
      >Start</button>

      <div v-if="engineStore.cpuRunning" class="btn-row">
        <button class="btn sec" @click="engineStore.togglePause(gameStore._buildGameCtx(), uiStore)">
          {{ engineStore.cpuPaused ? 'Resume' : 'Pause' }}
        </button>
        <button class="btn dng" @click="engineStore.stopCpuGame(uiStore)">Stop</button>
      </div>
    </div>

    <!-- Multiplayer section -->
    <div v-if="uiStore.currentMode === 'multiplayer'">
      <div class="psec">
        <div class="status-box">{{ mpStatus || 'Connecting…' }}</div>
      </div>
      <div class="btn-row">
        <button
          v-if="mpDrawPending"
          class="btn warn"
          @click="emit('mpAcceptDraw')"
        >Accept Draw</button>
        <button
          v-else-if="mpDrawBtnVisible"
          class="btn warn"
          @click="emit('mpOfferDraw')"
        >Offer Draw</button>
        <button
          v-if="mpResignBtnVisible"
          class="btn dng"
          @click="emit('mpResign')"
        >Resign</button>
      </div>
      <button class="btn sec" style="margin-top:4px;" @click="$router.push('/lobby')">
        ← Back to Lobby
      </button>
    </div>

    <!-- Move list + nav (always shown) -->
    <div class="psec">
      <MoveList />
    </div>

    <!-- Review banner -->
    <div
      v-if="reviewStore.reviewingHistory"
      class="review-banner visible"
    >
      ⏪ Reviewing past game
      <button @click="reviewStore.closeReview(gameStore)">× Close</button>
    </div>

    <!-- Game history -->
    <GameHistory />
  </div>
</template>
