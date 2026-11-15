import { shallowRef } from 'vue'
import type { Selection } from '../model/flow'
import { parseHash } from '../model/route'
import { displayIdFor, type DisplayGraph } from '../model/twins'

/** The card for the node id in a `#node=<id>` hash. Either member of a twin pair names its card. */
export function nodeIdFromHash(hash: string, graph: DisplayGraph): string | null {
  const route = parseHash(hash)
  if (route.view !== 'components' || route.node === null) return null
  return displayIdFor(graph, route.node)
}

/**
 * The selected card or edge in the Components view. Selecting a twin member's id selects its card.
 * `reveal` counts requests to pan the graph to the selected node; selections made in the graph
 * itself do not pan.
 */
export function useSelection(graph: DisplayGraph) {
  const selection = shallowRef<Selection>(null)
  const reveal = shallowRef(0)

  function selectNode(id: string, options: { reveal?: boolean } = {}) {
    selection.value = { type: 'node', id: displayIdFor(graph, id) ?? id }
    if (options.reveal) reveal.value++
  }

  function selectEdge(id: string) {
    selection.value = { type: 'edge', id }
  }

  function clear() {
    selection.value = null
  }

  return { selection, reveal, selectNode, selectEdge, clear }
}
