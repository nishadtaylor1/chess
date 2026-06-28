<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const username = ref('')
const password = ref('')
const error    = ref('')
const loading  = ref(false)

async function submit() {
  error.value   = ''
  loading.value = true
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.value, password: password.value }),
    })
    const data = await res.json()
    if (data.ok) {
      window.__chessUser = username.value
      router.push('/chess')
    } else {
      error.value = data.error || 'Login failed.'
    }
  } catch (_) {
    error.value = 'Network error. Please try again.'
  }
  loading.value = false
}
</script>

<template>
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;">
    <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:40px;min-width:320px;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="font-size:32px;margin-bottom:8px;">♟</div>
        <h1 style="font-size:20px;font-weight:700;color:#e2e8f0;">Sign in to Chess</h1>
      </div>
      <form @submit.prevent="submit">
        <div style="margin-bottom:14px;">
          <label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:5px;">Username</label>
          <input v-model="username" type="text" required autocomplete="username"
            style="width:100%;background:#0f172a;border:1px solid #334155;border-radius:7px;color:#e2e8f0;padding:9px 12px;font-size:14px;outline:none;"
            @focus="$event.target.style.borderColor='#6366f1'"
            @blur="$event.target.style.borderColor='#334155'" />
        </div>
        <div style="margin-bottom:20px;">
          <label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:5px;">Password</label>
          <input v-model="password" type="password" required autocomplete="current-password"
            style="width:100%;background:#0f172a;border:1px solid #334155;border-radius:7px;color:#e2e8f0;padding:9px 12px;font-size:14px;outline:none;"
            @focus="$event.target.style.borderColor='#6366f1'"
            @blur="$event.target.style.borderColor='#334155'" />
        </div>
        <div v-if="error" style="color:#f87171;font-size:13px;margin-bottom:14px;">{{ error }}</div>
        <button type="submit" :disabled="loading" class="btn" style="margin-bottom:14px;">
          {{ loading ? 'Signing in…' : 'Sign in' }}
        </button>
        <p style="text-align:center;font-size:13px;color:#64748b;">
          Don't have an account?
          <router-link to="/register" style="color:#6366f1;text-decoration:none;">Register</router-link>
        </p>
      </form>
    </div>
  </div>
</template>
