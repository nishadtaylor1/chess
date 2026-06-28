<script setup>
import { useEngineStore } from '../../stores/engine.js'
const engineStore = useEngineStore()
</script>

<template>
  <div class="eval-col">
    <div class="eval-bar">
      <div
        class="eval-fill"
        :style="{ height: (100 - engineStore.evalBarState.pct) + '%' }"
      ></div>
      <span class="eval-lbl" :class="engineStore.evalBarState.labelClass">
        {{ engineStore.evalBarState.label }}
      </span>
    </div>
  </div>
</template>
