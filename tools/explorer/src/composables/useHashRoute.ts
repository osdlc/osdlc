import { onMounted, onUnmounted, watch } from 'vue'
import { formatHash, parseHash, type Route } from '../model/route'

/**
 * Keeps the URL hash in step with the app. `current` is the route the app shows; `apply` moves the
 * app to a route read from the hash, once at setup and again whenever the hash changes from
 * outside, such as a pasted link or the back button.
 */
export function useHashRoute(current: () => Route, apply: (route: Route) => void) {
  const read = () => apply(parseHash(window.location.hash))
  read()

  watch(
    () => formatHash(current()),
    (hash) => {
      if (window.location.hash === hash) return
      // replaceState, so selections do not fill the history, and so no hashchange fires.
      history.replaceState(null, '', hash === '' ? window.location.pathname + window.location.search : hash)
    },
    { immediate: true },
  )

  onMounted(() => window.addEventListener('hashchange', read))
  onUnmounted(() => window.removeEventListener('hashchange', read))
}
