import { onMounted, onUnmounted, shallowRef } from 'vue'
import type { Selection } from '../model/flow'
import { displayIdFor, type DisplayGraph } from '../model/twins'

const HASH_PREFIX = '#node='

/** The card for the node id in a `#node=<id>` hash. Either member of a twin pair names its card. */
export function nodeIdFromHash(hash: string, graph: DisplayGraph): string | null {
  if (!hash.startsWith(HASH_PREFIX)) return null
  return displayIdFor(graph, decodeURIComponent(hash.slice(HASH_PREFIX.length)))
}

/**
 * The selected card or edge. Selecting a twin member's id selects its card. A selected node is mirrored in the URL hash so a link can point at it.
 * `reveal` counts requests to pan the graph to the selected node; selections made in the graph
 * itself do not pan.
 */
export function useSelection(graph: DisplayGraph) {
  const selection = shallowRef<Selection>(null)
  const reveal = shallowRef(0)

  function writeHash() {
    const current = selection.value
    const hash = current?.type === 'node' ? `${HASH_PREFIX}${encodeURIComponent(current.id)}` : ''
    if (window.location.hash === hash) return
    history.replaceState(null, '', hash === '' ? window.location.pathname + window.location.search : hash)
  }

  function selectNode(id: string, options: { reveal?: boolean } = {}) {
    selection.value = { type: 'node', id: displayIdFor(graph, id) ?? id }
    if (options.reveal) reveal.value++
    writeHash()
  }

  function selectEdge(id: string) {
    selection.value = { type: 'edge', id }
    writeHash()
  }

  function clear() {
    selection.value = null
    writeHash()
  }

  function readHash() {
    const id = nodeIdFromHash(window.location.hash, graph)
    if (id === null) {
      if (selection.value?.type === 'node') selection.value = null
      return
    }
    selection.value = { type: 'node', id }
    reveal.value++
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && selection.value !== null) clear()
  }

  onMounted(() => {
    readHash()
    window.addEventListener('hashchange', readHash)
    window.addEventListener('keydown', onKeydown)
  })
  onUnmounted(() => {
    window.removeEventListener('hashchange', readHash)
    window.removeEventListener('keydown', onKeydown)
  })

  return { selection, reveal, selectNode, selectEdge, clear }
}
