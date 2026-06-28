import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const TCS = [
  { min: 0,  inc: 0  },
  { min: 1,  inc: 0  },
  { min: 2,  inc: 1  },
  { min: 3,  inc: 0  },
  { min: 3,  inc: 2  },
  { min: 5,  inc: 0  },
  { min: 5,  inc: 3  },
  { min: 10, inc: 0  },
  { min: 15, inc: 10 },
  { min: 30, inc: 0  },
  { min: 60, inc: 0  },
]

export const useUiStore = defineStore('ui', () => {
  // Mode
  const currentMode = ref('vs-computer') // 'vs-computer' | 'cpu-vs-cpu' | 'multiplayer'
  const playMode    = ref('casual')       // 'casual' | 'challenge' | 'analysis'
  const tcIdx       = ref(5)              // index into TCS array (default 5+0 Blitz)

  const tc = computed(() => TCS[tcIdx.value] || TCS[0])

  // Toast
  const toastMessage = ref('')
  const toastVisible = ref(false)
  let   toastTimer   = null

  function showToast(msg, ms = 3000) {
    if (toastTimer) clearTimeout(toastTimer)
    toastMessage.value = msg
    toastVisible.value = true
    toastTimer = setTimeout(() => { toastVisible.value = false }, ms)
  }

  // Win modal
  const winModal = ref({ visible: false, oldElo: 0, newElo: 0, eloChange: 0 })

  function showWinModal(oldElo, newElo, eloChange) {
    winModal.value = { visible: true, oldElo, newElo, eloChange }
  }

  function closeWinModal() {
    winModal.value = { ...winModal.value, visible: false }
  }

  // Settings lock
  const settingsLocked = ref(false)

  function lockSettings() {
    settingsLocked.value = true
  }

  function unlockSettings() {
    settingsLocked.value = false
  }

  // Clock
  const whiteMs    = ref(0)
  const blackMs    = ref(0)
  const clockActive = ref(null) // 'w' | 'b' | null
  let   clockTid   = null

  function fmtMs(ms) {
    if (ms <= 0) return '0:00'
    const s = Math.ceil(ms / 1000)
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
  }

  const whiteClockDisplay = computed(() =>
    tc.value.min === 0 ? '∞' : fmtMs(whiteMs.value)
  )
  const blackClockDisplay = computed(() =>
    tc.value.min === 0 ? '∞' : fmtMs(blackMs.value)
  )
  const whiteLowTime = computed(() =>
    tc.value.min > 0 && clockActive.value === 'w' && whiteMs.value < 10000
  )
  const blackLowTime = computed(() =>
    tc.value.min > 0 && clockActive.value === 'b' && blackMs.value < 10000
  )

  // Called with an optional onFlag callback: (color) => void
  let _onFlag = null

  function clockInit(onFlag) {
    if (clockTid) { clearInterval(clockTid); clockTid = null }
    clockActive.value = null
    _onFlag = onFlag || null
    const t = playMode.value === 'challenge' ? tc.value : { min: 0, inc: 0 }
    whiteMs.value = t.min * 60000
    blackMs.value = t.min * 60000
  }

  function clockSwitch(toColor) {
    const t = playMode.value === 'challenge' ? tc.value : { min: 0, inc: 0 }
    if (t.inc > 0 && clockActive.value) {
      if (clockActive.value === 'w') whiteMs.value += t.inc * 1000
      else                           blackMs.value  += t.inc * 1000
    }
    if (clockTid) { clearInterval(clockTid); clockTid = null }
    clockActive.value = toColor
    if (t.min === 0) return
    clockTid = setInterval(() => {
      if (clockActive.value === 'w') whiteMs.value -= 100
      else                           blackMs.value  -= 100
      const ms = clockActive.value === 'w' ? whiteMs.value : blackMs.value
      if (ms <= 0) {
        whiteMs.value = Math.max(0, whiteMs.value)
        blackMs.value = Math.max(0, blackMs.value)
        clearInterval(clockTid); clockTid = null
        if (_onFlag) _onFlag(clockActive.value)
      }
    }, 100)
  }

  function clockStop() {
    if (clockTid) { clearInterval(clockTid); clockTid = null }
    clockActive.value = null
  }

  // Thinking bar
  const thinkingBarActive   = ref(false)
  const thinkingBarCCActive = ref(false)
  const statusCCText        = ref('')

  // Multiplayer pending win (set in game:end so elo update can trigger modal)
  const pendingMpWin = ref(false)

  // Mode switching helpers
  function setMode(mode) {
    currentMode.value = mode
  }

  function setPlayMode(pm) {
    playMode.value = pm
  }

  return {
    currentMode,
    playMode,
    tcIdx,
    tc,
    toastMessage,
    toastVisible,
    showToast,
    winModal,
    showWinModal,
    closeWinModal,
    settingsLocked,
    lockSettings,
    unlockSettings,
    whiteMs,
    blackMs,
    clockActive,
    whiteClockDisplay,
    blackClockDisplay,
    whiteLowTime,
    blackLowTime,
    clockInit,
    clockSwitch,
    clockStop,
    thinkingBarActive,
    thinkingBarCCActive,
    statusCCText,
    pendingMpWin,
    setMode,
    setPlayMode,
  }
})
