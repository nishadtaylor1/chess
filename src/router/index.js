import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
import ChessView from '../views/ChessView.vue'
import LobbyView from '../views/LobbyView.vue'

const routes = [
  { path: '/', redirect: '/chess' },
  { path: '/login', component: LoginView },
  { path: '/register', component: RegisterView },
  { path: '/chess', component: ChessView, meta: { requiresAuth: true } },
  { path: '/lobby', component: LobbyView, meta: { requiresAuth: true } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Auth guard: check session before protected routes
router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true
  try {
    const res = await fetch('/api/me')
    if (res.ok) return true
    return '/login'
  } catch {
    return '/login'
  }
})

export default router
