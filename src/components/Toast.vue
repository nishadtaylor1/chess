<script setup>
import { useUiStore } from '../stores/ui.js'
const uiStore = useUiStore()
</script>

<template>
  <div class="toast" :class="{ show: uiStore.toastVisible }">
    {{ uiStore.toastMessage }}
  </div>
</template>
