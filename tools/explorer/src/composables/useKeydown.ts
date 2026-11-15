import { onMounted, onUnmounted } from 'vue'

export function useKeydown(handler: (event: KeyboardEvent) => void) {
  onMounted(() => window.addEventListener('keydown', handler))
  onUnmounted(() => window.removeEventListener('keydown', handler))
}
