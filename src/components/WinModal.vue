<script setup>
import { ref, watch } from 'vue'
import { useUiStore } from '../stores/ui.js'
import { useGameStore } from '../stores/game.js'

const uiStore   = useUiStore()
const gameStore = useGameStore()

const confettiCanvas = ref(null)
const displayElo = ref(0)
let confettiRafId = null

watch(() => uiStore.winModal.visible, (visible) => {
  if (visible) {
    displayElo.value = uiStore.winModal.oldElo
    launchConfetti()
    setTimeout(() => {
      animateEloCount(uiStore.winModal.oldElo, uiStore.winModal.newElo, 1400)
    }, 500)
  } else {
    stopConfetti()
  }
})

function animateEloCount(from, to, duration) {
  const start = performance.now()
  const tick = ts => {
    const p = Math.min((ts - start) / duration, 1)
    const eased = 1 - Math.pow(1 - p, 3)
    displayElo.value = Math.round(from + (to - from) * eased)
    if (p < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

function launchConfetti() {
  if (!confettiCanvas.value) return
  const canvas = confettiCanvas.value
  canvas.width  = window.innerWidth
  canvas.height = window.innerHeight
  canvas.style.display = 'block'
  const ctx = canvas.getContext('2d')
  const palette = ['#6366f1','#f0d9b5','#4ade80','#1bada6','#a855f7','#fbbf24','#e2e8f0','#f472b6']
  const particles = Array.from({ length: 220 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height * 0.6 - canvas.height * 0.3,
    w: 6 + Math.random() * 8, h: 4 + Math.random() * 6,
    color: palette[Math.floor(Math.random() * palette.length)],
    vx: (Math.random() - 0.5) * 5,
    vy: -2 + Math.random() * 5,
    rot: Math.random() * Math.PI * 2,
    rotV: (Math.random() - 0.5) * 0.18,
    alpha: 1,
  }))
  const t0 = performance.now()
  function draw(ts) {
    const elapsed = ts - t0
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    let anyAlive = false
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.13; p.rot += p.rotV
      if (elapsed > 2200) p.alpha = Math.max(0, p.alpha - 0.014)
      if (p.alpha > 0 && p.y < canvas.height + 30) anyAlive = true
      ctx.save()
      ctx.globalAlpha = p.alpha
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
      ctx.restore()
    }
    confettiRafId = anyAlive ? requestAnimationFrame(draw) : null
    if (!anyAlive) canvas.style.display = 'none'
  }
  if (confettiRafId) cancelAnimationFrame(confettiRafId)
  confettiRafId = requestAnimationFrame(draw)
}

function stopConfetti() {
  if (confettiRafId) { cancelAnimationFrame(confettiRafId); confettiRafId = null }
  if (confettiCanvas.value) {
    confettiCanvas.value.style.display = 'none'
    confettiCanvas.value.getContext('2d').clearRect(
      0, 0, confettiCanvas.value.width, confettiCanvas.value.height
    )
  }
}

function closeModal() {
  uiStore.closeWinModal()
  gameStore.newGame()
}

const eloChange = () => uiStore.winModal.eloChange
const showDelta = () => displayElo.value === uiStore.winModal.newElo
</script>

<template>
  <canvas ref="confettiCanvas" id="confettiCanvas"></canvas>

  <div id="winModal" :class="{ visible: uiStore.winModal.visible }">
    <div class="win-box">
      <div class="win-trophy">🏆</div>
      <div class="win-title">You Won!</div>
      <div class="win-elo-row">
        <span class="win-elo-old">{{ uiStore.winModal.oldElo }}</span>
        <span class="win-elo-arrow">→</span>
        <span class="win-elo-new">{{ displayElo }}</span>
      </div>
      <div class="win-elo-delta" :class="{ show: showDelta() }">
        {{ uiStore.winModal.eloChange >= 0 ? '+' : '' }}{{ uiStore.winModal.eloChange }} ELO
      </div>
      <button class="btn" style="width:160px" @click="closeModal">Play Again</button>
    </div>
  </div>
</template>
