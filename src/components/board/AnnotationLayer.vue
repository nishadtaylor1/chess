<script setup>
import { computed } from 'vue'

const props = defineProps({
  annotations:        { type: Array,  default: () => [] },
  previewAnnotation:  { type: Object, default: null },
  hintArrow:          { type: Object, default: null },
  openingHintArrow:   { type: Object, default: null },
  flipBoard:          { type: Boolean, default: false },
  boardSize:          { type: Number, default: 504 },
})

const sqSz = computed(() => props.boardSize / 8)

function sqCenter(sq) {
  const file = sq.charCodeAt(0) - 97
  const rank = parseInt(sq[1]) - 1
  const s = sqSz.value
  return {
    x: props.flipBoard ? (7 - file + 0.5) * s : (file + 0.5) * s,
    y: props.flipBoard ? (rank + 0.5) * s      : (7 - rank + 0.5) * s,
  }
}

function mkArrow(from, to, color, alpha = 1) {
  if (from === to) return mkCircle(from, color, alpha)
  const s = sqSz.value
  const f = sqCenter(from), t = sqCenter(to)
  const dx = t.x - f.x, dy = t.y - f.y
  const len = Math.hypot(dx, dy); if (len === 0) return null
  const ux = dx / len, uy = dy / len
  const lw = s * 0.14, hw = s * 0.22, hl = s * 0.28
  const px = -uy * hw, py = ux * hw
  const sx = f.x + ux * s * 0.22, sy = f.y + uy * s * 0.22
  const ex = t.x - ux * hl,       ey = t.y - uy * hl
  return {
    type: 'arrow', color, alpha, lw, sx, sy, ex, ey,
    tx: t.x, ty: t.y, px, py,
  }
}

function mkCircle(sq, color, alpha = 1) {
  const c = sqCenter(sq)
  const s = sqSz.value
  return { type: 'circle', color, alpha, cx: c.x, cy: c.y, r: s * 0.44, sw: s * 0.1 }
}

const shapes = computed(() => {
  const result = []
  // Opening hint arrow (behind user annotations)
  if (props.openingHintArrow) {
    const s = mkArrow(props.openingHintArrow.from, props.openingHintArrow.to, 'rgba(50,210,80,0.82)')
    if (s) result.push(s)
  }
  // Committed annotations
  for (const a of props.annotations) {
    const s = a.type === 'arrow'
      ? mkArrow(a.from, a.to, a.color)
      : mkCircle(a.sq, a.color)
    if (s) result.push(s)
  }
  // In-flight preview
  if (props.previewAnnotation) {
    const p = props.previewAnnotation
    const s = p.type === 'arrow'
      ? mkArrow(p.from, p.to, p.color, 0.5)
      : mkCircle(p.sq, p.color, 0.5)
    if (s) result.push(s)
  }
  // Stockfish hint arrow (cyan, on top)
  if (props.hintArrow) {
    const s = mkArrow(props.hintArrow.from, props.hintArrow.to, 'rgba(96,196,255,0.92)')
    if (s) result.push(s)
  }
  return result
})
</script>

<template>
  <svg
    v-if="shapes.length"
    style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;overflow:visible;"
    :viewBox="`0 0 ${boardSize} ${boardSize}`"
  >
    <template v-for="(shape, i) in shapes" :key="i">
      <g v-if="shape.type === 'arrow'" :opacity="shape.alpha">
        <line
          :x1="shape.sx.toFixed(1)" :y1="shape.sy.toFixed(1)"
          :x2="shape.ex.toFixed(1)" :y2="shape.ey.toFixed(1)"
          :stroke="shape.color"
          :stroke-width="shape.lw.toFixed(1)"
          stroke-linecap="round"
        />
        <polygon
          :points="`${shape.tx.toFixed(1)},${shape.ty.toFixed(1)} ${(shape.ex+shape.px).toFixed(1)},${(shape.ey+shape.py).toFixed(1)} ${(shape.ex-shape.px).toFixed(1)},${(shape.ey-shape.py).toFixed(1)}`"
          :fill="shape.color"
        />
      </g>
      <circle
        v-else
        :cx="shape.cx.toFixed(1)" :cy="shape.cy.toFixed(1)"
        :r="shape.r.toFixed(1)"
        fill="none"
        :stroke="shape.color"
        :stroke-width="shape.sw.toFixed(1)"
        :opacity="shape.alpha"
      />
    </template>
  </svg>
</template>
