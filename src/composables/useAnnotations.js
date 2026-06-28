import { ref } from 'vue'

export function useAnnotations() {
  const annotations       = ref([]) // [{ type:'arrow'|'circle', from?, to?, sq?, color }]
  const previewAnnotation = ref(null)
  const annotatingFrom    = ref(null)

  function getAnnotationColor(e) {
    if (e.shiftKey)              return 'rgba(255,200,0,0.9)'
    if (e.ctrlKey || e.metaKey) return 'rgba(220,55,55,0.9)'
    return 'rgba(50,210,80,0.88)'
  }

  function toggleAnnotation(ann) {
    const same = a =>
      a.type === ann.type &&
      (a.type === 'circle'
        ? a.sq === ann.sq
        : a.from === ann.from && a.to === ann.to)
    const idx = annotations.value.findIndex(same)
    if (idx >= 0) annotations.value.splice(idx, 1)
    else           annotations.value.push(ann)
  }

  function clearAnnotations() {
    annotations.value = []
  }

  return {
    annotations,
    previewAnnotation,
    annotatingFrom,
    toggleAnnotation,
    clearAnnotations,
    getAnnotationColor,
  }
}
