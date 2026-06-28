<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/game.js'

const gameStore = useGameStore()
const router    = useRouter()

const username = computed(() => {
  // Stored in sessionStorage after login, fetched on mount in ChessView
  return window.__chessUser || '…'
})

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' })
  router.push('/login')
}
</script>

<template>
  <nav>
    <div class="brand">
      <router-link to="/chess">♟ <span>Chess</span></router-link>
    </div>
    <div class="user">
      Signed in as <strong>{{ username }}</strong>
      <span style="font-size:11px;color:#64748b;">
        • ELO <strong style="color:#6366f1;font-size:13px;">{{ gameStore.playerElo }}</strong>
      </span>
      <router-link to="/lobby" style="font-size:12px;color:#94a3b8;text-decoration:none;border:1px solid #475569;padding:5px 12px;border-radius:5px;">
        Play a Friend
      </router-link>
      <button @click="logout">Sign out</button>
    </div>
  </nav>
</template>
