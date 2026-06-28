<script setup>
import { computed } from 'vue'
import { useEngineStore, getStep, fmtElo } from '../../stores/engine.js'
import { useUiStore }   from '../../stores/ui.js'
import { useGameStore } from '../../stores/game.js'

const engineStore = useEngineStore()
const uiStore     = useUiStore()
const gameStore   = useGameStore()

// Pinia auto-unwraps store refs — access without .value
const step  = computed(() => getStep(engineStore.eloSliderIdx))
const wStep = computed(() => getStep(engineStore.wEloSliderIdx))
const bStep = computed(() => getStep(engineStore.bEloSliderIdx))

function onEloInput(val) {
  // Block slider changes mid-game
  if (gameStore.history.length > 0 && !gameStore.game.isGameOver()) return
  engineStore.eloSliderIdx = parseInt(val)
}
</script>

<template>
  <!-- vs-computer ELO section -->
  <div v-if="uiStore.currentMode === 'vs-computer'" id="eloSection" class="psec"
       :style="{ display: uiStore.playMode === 'analysis' ? 'none' : '' }">
    <div class="plbl">AI Strength</div>
    <div class="elo-display">
      <!-- step is a local computed ref — auto-unwrapped in template -->
      <div class="elo-num">{{ fmtElo(step) }}</div>
      <div>
        <div class="elo-label">{{ step.label }}</div>
        <div class="elo-sub">{{ step.elo === 'Max' ? 'Full Strength' : 'ELO Rating' }}</div>
      </div>
    </div>
    <input
      type="range" min="0" max="24" step="1"
      :value="engineStore.eloSliderIdx"
      :disabled="uiStore.settingsLocked"
      @input="onEloInput($event.target.value)"
    />
    <div class="elo-ticks">
      <span>500</span><span>800</span><span>1100</span><span>1400</span>
      <span>1700</span><span>2000</span><span>2300</span><span>2600</span><span>Max</span>
    </div>
  </div>

  <!-- cpu-vs-cpu ELO section -->
  <div v-if="uiStore.currentMode === 'cpu-vs-cpu'" class="psec">
    <div class="plbl">Engine Strengths</div>
    <div class="two-elo">
      <div class="side-elo">
        <div class="side-lbl">⬜ White</div>
        <div class="side-num">{{ fmtElo(wStep) }}</div>
        <input
          type="range" min="0" max="24" step="1"
          :value="engineStore.wEloSliderIdx"
          @input="engineStore.wEloSliderIdx = parseInt($event.target.value)"
        />
      </div>
      <div class="side-elo">
        <div class="side-lbl">⬛ Black</div>
        <div class="side-num">{{ fmtElo(bStep) }}</div>
        <input
          type="range" min="0" max="24" step="1"
          :value="engineStore.bEloSliderIdx"
          @input="engineStore.bEloSliderIdx = parseInt($event.target.value)"
        />
      </div>
    </div>
  </div>
</template>
