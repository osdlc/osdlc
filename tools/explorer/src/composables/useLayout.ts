import { onMounted, shallowRef } from 'vue'
import { computeLayout, type Layout, type LayoutGraph } from '../model/layout'

/**
 * Lays the cards out once, over both states, so nothing moves when the view changes. `aspect` is
 * read once, on mount, to shape the graph to the space it gets.
 */
export function useLayout(graph: LayoutGraph, aspect: () => number) {
  const layout = shallowRef<Layout | null>(null)
  const error = shallowRef<string | null>(null)

  onMounted(async () => {
    try {
      // ELK is large, so it loads in its own chunk.
      const { default: ELK } = await import('elkjs/lib/elk.bundled.js')
      layout.value = await computeLayout(graph, new ELK(), aspect())
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    }
  })

  return { layout, error }
}
