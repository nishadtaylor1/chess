<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useGameStore }   from '../../stores/game.js'
import { useEngineStore } from '../../stores/engine.js'
import { useUiStore }     from '../../stores/ui.js'
import { useReviewStore } from '../../stores/review.js'
import { useAnnotations } from '../../composables/useAnnotations.js'
import AnnotationLayer    from './AnnotationLayer.vue'
import EvalBar            from './EvalBar.vue'

const props = defineProps({
  mpColor:    { type: String, default: null },
  mpRoomId:   { type: String, default: null },
  mpEmitMove: { type: Function, default: null },
})

const gameStore   = useGameStore()
const engineStore = useEngineStore()
const uiStore     = useUiStore()
const reviewStore = useReviewStore()

const { annotations, previewAnnotation, annotatingFrom, toggleAnnotation, clearAnnotations, getAnnotationColor } = useAnnotations()

// Drag state (local refs — correctly use .value)
const dragState    = ref(null)  // { fromSq, pieceImg }
const ghostVisible = ref(false)
const ghostX       = ref(0)
const ghostY       = ref(0)
const ghostSrc     = ref('')

const boardEl = ref(null)
const boardSize = ref(504)

// ── Flip board for multiplayer Black ──
const flipBoard = computed(() =>
  uiStore.currentMode === 'multiplayer' && props.mpColor === 'b'
)

// ── Rank / file order ──
const rankOrder = computed(() => flipBoard.value ? [0,1,2,3,4,5,6,7] : [7,6,5,4,3,2,1,0])
const fileOrder = computed(() => flipBoard.value ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7])
const ranks     = computed(() => flipBoard.value ? [1,2,3,4,5,6,7,8] : [8,7,6,5,4,3,2,1])
const files     = computed(() => flipBoard.value ? 'hgfedcba' : 'abcdefgh')

// ── Computed squares ──
// Access gameVersion to be reactive — Pinia auto-unwraps refs, so no .value needed
const squares = computed(() => {
  void gameStore.gameVersion   // track reactive dependency
  const vg       = gameStore.viewGame   // auto-unwrapped Chess instance
  const lastMv   = gameStore.lastMove   // auto-unwrapped move object or null
  const hFrom    = gameStore.viewIdx > 0 ? lastMv?.from : null
  const hTo      = gameStore.viewIdx > 0 ? lastMv?.to   : null
  const sel      = gameStore.selected
  const legal    = gameStore.legalMoves
  const drag     = dragState.value  // local ref, needs .value

  const result = []
  for (const rank of rankOrder.value) {
    for (const file of fileOrder.value) {
      const sq    = String.fromCharCode(97 + file) + (rank + 1)
      const light = (rank + file) % 2 === 1
      const piece = vg.get(sq)

      const classes = ['sq', light ? 'light' : 'dark']
      if (sq === hFrom) classes.push('last-from')
      if (sq === hTo)   classes.push('last-to')
      if (sel === sq && gameStore.atLivePos) classes.push('selected')
      if (drag?.fromSq === sq) classes.push('drag-src')
      if (legal && gameStore.atLivePos) {
        const lm = legal.find(m => m.to === sq)
        if (lm) classes.push(piece ? 'legal-capture' : 'legal-empty')
      }

      // Badge: live quality badge or review badge
      let badge = null
      const mqb = engineStore.moveQualityBadge  // auto-unwrapped
      const rb  = reviewStore.reviewBadge         // auto-unwrapped
      if (mqb?.sq === sq) {
        badge = mqb.quality
      } else if (reviewStore.reviewingHistory && rb?.sq === sq) {
        badge = rb.quality
      }

      result.push({ sq, classes: classes.join(' '), piece, badge })
    }
  }
  return result
})

// ── Opening hint arrow ──
const openingHintArrow = computed(() => {
  if (!gameStore.atLivePos) return null
  if (uiStore.currentMode !== 'vs-computer') return null
  if (uiStore.playMode === 'analysis') return null
  return gameStore.getOpeningHintArrow()
})

// ── Interaction guard ──
function canInteract() {
  if (reviewStore.reviewingHistory) return false
  if (gameStore.game.isGameOver()) return false
  if (uiStore.currentMode === 'multiplayer') {
    if (!props.mpColor || !props.mpRoomId) return false
    if (!gameStore.atLivePos) return false
    return gameStore.game.turn() === props.mpColor
  }
  if (uiStore.currentMode === 'vs-computer') {
    if (engineStore.aiThinking) return false
    if (!gameStore.atLivePos && uiStore.playMode !== 'analysis') return false
    if (uiStore.playMode !== 'analysis' && gameStore.game.turn() !== 'w') return false
  }
  return true
}

// ── Square mousedown ──
function onSqDown(sq, e) {
  // Right-click: begin annotation drag
  if (e.button === 2) {
    e.preventDefault()
    annotatingFrom.value = sq
    return
  }
  if (e.button !== 0) return

  // Left-click: clear annotations
  clearAnnotations()

  if (!canInteract()) return

  const vg = gameStore.viewGame  // auto-unwrapped Chess instance

  // Complete a pending click-to-move
  if (gameStore.selected && gameStore.selected !== sq &&
      gameStore.legalMoves?.find(m => m.to === sq)) {
    const from = gameStore.selected
    gameStore.selected   = null
    gameStore.legalMoves = null
    gameStore.handleMove(from, sq, 'q', props.mpEmitMove)
    return
  }

  const piece = vg.get(sq)
  const myColor = uiStore.currentMode === 'multiplayer'
    ? props.mpColor
    : (uiStore.currentMode === 'vs-computer' && uiStore.playMode !== 'analysis'
        ? 'w'
        : vg.turn())

  if (!piece || piece.color !== myColor) {
    gameStore.selected   = null
    gameStore.legalMoves = null
    return
  }

  e.preventDefault()
  gameStore.selected   = sq
  gameStore.legalMoves = vg.moves({ square: sq, verbose: true })

  // Start drag
  ghostSrc.value     = `/img/pieces/${piece.color}${piece.type.toUpperCase()}.svg`
  ghostVisible.value = true
  ghostX.value       = e.clientX
  ghostY.value       = e.clientY
  dragState.value    = { fromSq: sq }
}

// ── Mouse move (global) ──
function onMouseMove(e) {
  if (dragState.value) {
    ghostX.value = e.clientX
    ghostY.value = e.clientY
    return
  }
  if (!annotatingFrom.value) return
  const el = document.elementFromPoint(e.clientX, e.clientY)
  const sq = el?.closest('[data-sq]')?.dataset.sq
  previewAnnotation.value = (sq && sq !== annotatingFrom.value)
    ? { type: 'arrow', from: annotatingFrom.value, to: sq, color: getAnnotationColor(e) }
    : (sq ? { type: 'circle', sq: annotatingFrom.value, color: getAnnotationColor(e) } : null)
}

// ── Mouse up (global) ──
function onMouseUp(e) {
  // Finalise right-click annotation
  if (e.button === 2) {
    previewAnnotation.value = null
    if (annotatingFrom.value) {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const sq = el?.closest('[data-sq]')?.dataset.sq
      if (sq) {
        if (sq !== annotatingFrom.value)
          toggleAnnotation({ type: 'arrow', from: annotatingFrom.value, to: sq, color: getAnnotationColor(e) })
        else
          toggleAnnotation({ type: 'circle', sq, color: getAnnotationColor(e) })
      }
      annotatingFrom.value = null
    }
    return
  }

  // Left-button drag-drop
  if (!dragState.value) return
  const { fromSq } = dragState.value
  dragState.value    = null
  ghostVisible.value = false

  const el   = document.elementFromPoint(e.clientX, e.clientY)
  const toSq = el?.closest('[data-sq]')?.dataset.sq
  if (toSq && toSq !== fromSq && gameStore.legalMoves?.find(m => m.to === toSq)) {
    gameStore.selected   = null
    gameStore.legalMoves = null
    gameStore.handleMove(fromSq, toSq, 'q', props.mpEmitMove)
  } else if (toSq === fromSq) {
    // Keep selection — piece was picked up and put back
  } else {
    gameStore.selected   = null
    gameStore.legalMoves = null
  }
}

// Keyboard navigation
function onKeyDown(e) {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return
  if (e.key === 'ArrowLeft')  { e.preventDefault(); gameStore.goBack() }
  if (e.key === 'ArrowRight') { e.preventDefault(); gameStore.goForward() }
  if (e.key === 'Home')       { e.preventDefault(); gameStore.goToStart() }
  if (e.key === 'End')        { e.preventDefault(); gameStore.goToEnd() }
}

onMounted(() => {
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  document.addEventListener('keydown', onKeyDown)
  // Measure board size
  if (boardEl.value) {
    boardSize.value = boardEl.value.offsetWidth || 504
  }
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  document.removeEventListener('keydown', onKeyDown)
})

function onContextMenu(e) { e.preventDefault() }
</script>

<template>
  <!-- Drag ghost -->
  <img
    v-if="ghostVisible"
    class="drag-ghost"
    :src="ghostSrc"
    :style="{ left: ghostX + 'px', top: ghostY + 'px' }"
    draggable="false"
    alt=""
  />

  <div class="board-outer" style="position:relative;">
    <div class="board-row">
      <!-- Rank labels -->
      <div class="rank-col">
        <div v-for="r in ranks" :key="r">{{ r }}</div>
      </div>

      <!-- Board -->
      <div
        id="board"
        ref="boardEl"
        @contextmenu="onContextMenu"
      >
        <div
          v-for="sq in squares"
          :key="sq.sq"
          :class="sq.classes"
          :data-sq="sq.sq"
          @mousedown="onSqDown(sq.sq, $event)"
        >
          <img
            v-if="sq.piece"
            :src="`/img/pieces/${sq.piece.color}${sq.piece.type.toUpperCase()}.svg`"
            alt=""
            draggable="false"
          />
          <!-- Move quality badge -->
          <div
            v-if="sq.badge"
            class="move-badge"
            :style="{ background: sq.badge.bg, color: sq.badge.fg }"
            :title="sq.badge.label"
          >{{ sq.badge.symbol }}</div>
        </div>

        <!-- Annotation SVG layer -->
        <AnnotationLayer
          :annotations="annotations"
          :preview-annotation="previewAnnotation"
          :hint-arrow="gameStore.hintArrow"
          :opening-hint-arrow="openingHintArrow"
          :flip-board="flipBoard"
          :board-size="boardSize"
        />
      </div>

      <!-- Eval bar -->
      <EvalBar />
    </div>

    <!-- File labels -->
    <div class="file-labels">
      <div v-for="f in files" :key="f" class="file-label">{{ f }}</div>
    </div>
  </div>
</template>
