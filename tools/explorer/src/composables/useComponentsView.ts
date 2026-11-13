import { computed, reactive, shallowRef } from 'vue'
import { cardMatchesQuery, emptyFilters, facetsOf, visibleGraph } from '../model/filters'
import { componentHeading, toFlow } from '../model/flow'
import { RELATIONS, overlapsInView } from '../model/relations'
import { groupTwins } from '../model/twins'
import type { Ecosystem, ViewMode } from '../model/types'
import { useLayout } from './useLayout'
import { useSelection } from './useSelection'

/** The Components view's state: the state switch, filters, layout, selection and what to draw. */
export function useComponentsView(eco: Ecosystem, aspect: () => number) {
  const facets = facetsOf(eco)
  const graph = groupTwins(eco)
  const mode = shallowRef<ViewMode>('compare')
  const filters = reactive(emptyFilters())
  const { layout, error } = useLayout(graph, aspect)
  const { selection, reveal, selectNode, selectEdge, clear } = useSelection(graph)

  const visible = computed(() => visibleGraph(graph, mode.value, filters))
  const matchCount = computed(
    () => visible.value.nodes.filter((node) => cardMatchesQuery(node, filters.query, mode.value)).length,
  )
  const flow = computed(() =>
    layout.value
      ? toFlow({
          graph,
          nodes: visible.value.nodes,
          edges: visible.value.edges,
          positions: layout.value.positions,
          view: mode.value,
          selection: selection.value,
          query: filters.query,
        })
      : { nodes: [], edges: [] },
  )
  const overlapCount = computed(() => overlapsInView(eco, mode.value).length)
  const onlyOverlaps = computed(() => filters.relations.length === 1 && filters.relations[0] === 'overlaps')
  const revealId = computed(() => (selection.value?.type === 'node' ? selection.value.id : null))
  const heading = computed(() => componentHeading(graph, selection.value))

  function toggleOnlyOverlaps() {
    filters.relations = onlyOverlaps.value ? [...RELATIONS] : ['overlaps']
  }

  return {
    facets,
    graph,
    mode,
    filters,
    layout,
    error,
    selection,
    reveal,
    selectNode,
    selectEdge,
    clear,
    flow,
    matchCount,
    overlapCount,
    onlyOverlaps,
    toggleOnlyOverlaps,
    revealId,
    heading,
  }
}
