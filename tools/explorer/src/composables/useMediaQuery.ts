import { onMounted, onUnmounted, shallowRef } from 'vue'

export function useMediaQuery(query: string) {
  const media = window.matchMedia(query)
  const matches = shallowRef(media.matches)
  const update = (event: MediaQueryListEvent) => {
    matches.value = event.matches
  }
  onMounted(() => media.addEventListener('change', update))
  onUnmounted(() => media.removeEventListener('change', update))
  return matches
}
