<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { useGameStore }   from '../../stores/game.js'
import { useReviewStore } from '../../stores/review.js'

const gameStore   = useGameStore()
const reviewStore = useReviewStore()

const mlBody = ref(null)

// Pinia auto-unwraps store refs — no .value needed for store properties
const pairs = computed(() => {
  const h = gameStore.history  // auto-unwrapped array
  const result = []
  for (let i = 0; i < h.length; i += 2) {
    result.push({
      num: Math.floor(i / 2) + 1,
      white: { idx: i,     san: h[i]?.san     || '', move: h[i] },
      black: { idx: i + 1, san: h[i+1]?.san   || '', move: h[i+1] },
    })
  }
  return result
})

function sanClass(idx) {
  const vi = gameStore.viewIdx  // auto-unwrapped number
  if (idx + 1 === vi) return 'mv-san current'
  if (idx + 1 < vi)  return 'mv-san viewed'
  return 'mv-san'
}

function quality(idx) {
  if (!reviewStore.reviewingHistory) return null  // auto-unwrapped boolean
  return reviewStore.reviewQualities[idx + 1] || null  // auto-unwrapped array
}

// Auto-scroll to current move
watch(() => gameStore.viewIdx, async () => {
  await nextTick()
  if (mlBody.value) mlBody.value.scrollTop = mlBody.value.scrollHeight
})

async function copyPgn() {
  const btn = document.getElementById('copyPgnBtn')
  await gameStore.copyPgn()
  if (btn) {
    btn.textContent = '✓ Copied!'
    setTimeout(() => { btn.textContent = 'Copy PGN' }, 1800)
  }
}
</script>

<template>
  <div class="move-list">
    <div class="ml-head">
      <span>Moves</span>
      <button id="copyPgnBtn" class="copy-btn" @click="copyPgn">Copy PGN</button>
    </div>
    <div class="ml-body" ref="mlBody">
      <div v-for="pair in pairs" :key="pair.num" class="mv-pair">
        <span class="mv-num">{{ pair.num }}.</span>
        <span
          :class="sanClass(pair.white.idx)"
          @click="gameStore.goToMove(pair.white.idx + 1)"
        >
          {{ pair.white.san }}
          <span
            v-if="quality(pair.white.idx)"
            class="mv-quality"
            :style="{ color: quality(pair.white.idx).bg }"
            :title="quality(pair.white.idx).label"
          >{{ quality(pair.white.idx).symbol }}</span>
        </span>
        <span
          v-if="pair.black.san"
          :class="sanClass(pair.black.idx)"
          @click="gameStore.goToMove(pair.black.idx + 1)"
        >
          {{ pair.black.san }}
          <span
            v-if="quality(pair.black.idx)"
            class="mv-quality"
            :style="{ color: quality(pair.black.idx).bg }"
            :title="quality(pair.black.idx).label"
          >{{ quality(pair.black.idx).symbol }}</span>
        </span>
        <span v-else class="mv-san"></span>
      </div>
    </div>
    <div class="nav-bar">
      <button class="nav-btn" :disabled="gameStore.viewIdx === 0"
              @click="gameStore.goToStart()" title="Start (Home)">⏮</button>
      <button class="nav-btn" :disabled="gameStore.viewIdx === 0"
              @click="gameStore.goBack()" title="Back (←)">◀</button>
      <button class="nav-btn" :disabled="gameStore.atLivePos"
              @click="gameStore.goForward()" title="Forward (→)">▶</button>
      <button class="nav-btn" :disabled="gameStore.atLivePos"
              @click="gameStore.goToEnd()" title="End (End)">⏭</button>
    </div>
  </div>
</template>
