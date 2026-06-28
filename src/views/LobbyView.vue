<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { io } from 'socket.io-client'

const router     = useRouter()
const gamesList  = ref([])
const myUsername = ref('')
const creating   = ref(false)
const toastMsg   = ref('')
const toastShow  = ref(false)
let   socket     = null
let   toastTimer = null

function showToast(msg, ms = 2500) {
  if (toastTimer) clearTimeout(toastTimer)
  toastMsg.value  = msg
  toastShow.value = true
  toastTimer = setTimeout(() => { toastShow.value = false }, ms)
}

function renderGames(list) {
  gamesList.value = list
}

function joinGame(roomId) {
  router.push(`/chess?room=${roomId}`)
}

function createGame() {
  creating.value = true
  socket.emit('lobby:create')
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' })
  router.push('/login')
}

function relTime(createdAt) {
  const ago = Math.round((Date.now() - new Date(createdAt)) / 1000)
  return ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`
}

onMounted(async () => {
  try {
    const me = await fetch('/api/me').then(r => r.json())
    myUsername.value = me.username || ''
    window.__chessUser = me.username || ''
  } catch (_) {}

  socket = io()

  socket.on('lobby:list', renderGames)

  socket.on('lobby:created', ({ roomId }) => {
    router.push(`/chess?room=${roomId}`)
  })

  socket.on('lobby:error', msg => {
    showToast(msg, 3500)
    creating.value = false
  })

  socket.emit('lobby:get')
})

onUnmounted(() => {
  if (socket) socket.disconnect()
})
</script>

<template>
  <div>
    <nav>
      <div class="brand">
        <router-link to="/chess">♟ <span>Chess</span></router-link>
      </div>
      <div class="user">
        Signed in as <strong>{{ myUsername }}</strong>
        <button @click="logout">Sign out</button>
      </div>
    </nav>

    <div style="max-width:640px;margin:40px auto;padding:0 20px;">
      <h2 style="font-size:22px;font-weight:700;margin-bottom:6px;">Play a Friend</h2>
      <p style="color:#64748b;font-size:13px;margin-bottom:28px;">
        Create a game and share the link, or join an open game below.
      </p>

      <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:22px;margin-bottom:24px;">
        <h3 style="font-size:15px;font-weight:600;margin-bottom:5px;">Create a Game</h3>
        <p style="font-size:13px;color:#94a3b8;margin-bottom:16px;">
          You'll play as White. A shareable link is generated automatically.
        </p>
        <button class="btn" style="width:auto;display:inline-block;padding:9px 20px;"
                :disabled="creating" @click="createGame">
          {{ creating ? 'Creating…' : 'Create Game' }}
        </button>
      </div>

      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#475569;margin-bottom:10px;">
        Open Games
      </div>

      <div style="display:flex;flex-direction:column;gap:8px;">
        <div v-if="!gamesList.length"
             style="color:#475569;font-size:13px;text-align:center;padding:28px 0;">
          No open games right now.
        </div>
        <div
          v-for="g in gamesList"
          :key="g.id"
          style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;"
        >
          <div>
            <div style="font-size:14px;font-weight:600;">♟ {{ g.creator }}</div>
            <div style="font-size:11px;color:#475569;margin-top:2px;">{{ relTime(g.createdAt) }}</div>
          </div>
          <span v-if="g.creator === myUsername" style="font-size:12px;color:#475569;">Your open game</span>
          <button v-else class="btn" style="width:auto;display:inline-block;padding:6px 16px;"
                  @click="joinGame(g.id)">Join</button>
        </div>
      </div>

      <div style="margin-top:28px;text-align:center;font-size:13px;color:#475569;">
        Want to play the computer?
        <router-link to="/chess" style="color:#6366f1;text-decoration:none;">Solo play</router-link>
      </div>
    </div>

    <div class="toast" :class="{ show: toastShow }">{{ toastMsg }}</div>
  </div>
</template>
