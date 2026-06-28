<script setup>
import { useGameStore }   from '../../stores/game.js'
import { useReviewStore } from '../../stores/review.js'

const gameStore   = useGameStore()
const reviewStore = useReviewStore()

const icons = { win: '🏆', loss: '💀', draw: '🤝', resign: '🏳', flag: '⏱' }

function modeStr(g) {
  return g.difficulty === 'cpu-vs-cpu' ? 'CPU vs CPU' : 'vs AI'
}

function eloStr(g) {
  const wE = g.white_elo === 9999 ? 'Max' : g.white_elo
  const bE = g.black_elo === 9999 ? 'Max' : g.black_elo
  if (g.difficulty === 'cpu-vs-cpu') return `W:${wE} B:${bE}`
  return bE ? `ELO ${bE}` : (g.difficulty || '')
}

function dateStr(g) {
  try { return new Date(g.started_at).toLocaleDateString() } catch (_) { return '' }
}

function onClickGame(g) {
  if (g.pgn) reviewStore.startReview(g.pgn, gameStore)
}
</script>

<template>
  <div class="psec">
    <div class="plbl">Recent Games</div>
    <div class="history-list">
      <div
        v-if="!gameStore.historyRows.length"
        class="hist-item"
        style="justify-content:center;color:#475569;cursor:default"
      >No games yet</div>
      <div
        v-for="g in gameStore.historyRows.slice(0, 8)"
        :key="g.id"
        class="hist-item"
        @click="onClickGame(g)"
      >
        <span>
          {{ icons[g.result] || '🎮' }}
          <span class="res">{{ g.result }}</span>
          <span style="color:#475569;font-size:10px;">{{ modeStr(g) }}</span>
        </span>
        <div class="hist-meta">{{ eloStr(g) }}<br>{{ dateStr(g) }}</div>
      </div>
    </div>
  </div>
</template>
