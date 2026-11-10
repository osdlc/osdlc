<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue'
import AppHeader from './components/AppHeader.vue'
import FilterBar from './components/controls/FilterBar.vue'
import GraphLegend from './components/controls/GraphLegend.vue'
import DetailPanel from './components/detail/DetailPanel.vue'
import EcosystemGraph from './components/graph/EcosystemGraph.vue'
import { useLayout } from './composables/useLayout'
import { useMediaQuery } from './composables/useMediaQuery'
import { useSelection } from './composables/useSelection'
import { loadData } from './loadData'
import { cardMatchesQuery, emptyFilters, facetsOf, visibleGraph } from './model/filters'
import { toFlow } from './model/flow'
import { RELATIONS, overlapsInView } from './model/relations'
import { groupTwins } from './model/twins'
import type { ViewMode } from './model/types'

const { source, eco, problems } = loadData()
const facets = facetsOf(eco)
const graph = groupTwins(eco)

const view = shallowRef<ViewMode>('compare')
const filters = reactive(emptyFilters())
const compact = useMediaQuery('(max-width: 760px)')
const panelOpen = shallowRef(!compact.value)

const PANEL_WIDTH = 360
const TOP_HEIGHT = 150
const { layout, error } = useLayout(graph, () => {
  const width = window.innerWidth - (compact.value ? 0 : PANEL_WIDTH)
  const height = Math.max(200, window.innerHeight - TOP_HEIGHT)
  return Math.min(2.5, Math.max(0.6, width / height))
})
const { selection, reveal, selectNode, selectEdge, clear } = useSelection(graph)

// A new selection, from the graph, the panel or the URL, opens the panel.
watch(
  () => (selection.value ? `${selection.value.type}:${selection.value.id}` : null),
  (key) => {
    if (key !== null) panelOpen.value = true
  },
)

const visible = computed(() => visibleGraph(graph, view.value, filters))
const matchCount = computed(
  () => visible.value.nodes.filter((node) => cardMatchesQuery(node, filters.query, view.value)).length,
)
const flow = computed(() =>
  layout.value
    ? toFlow({
        graph,
        nodes: visible.value.nodes,
        edges: visible.value.edges,
        positions: layout.value.positions,
        view: view.value,
        selection: selection.value,
        query: filters.query,
      })
    : { nodes: [], edges: [] },
)
const overlapCount = computed(() => overlapsInView(eco, view.value).length)
const onlyOverlaps = computed(() => filters.relations.length === 1 && filters.relations[0] === 'overlaps')

function toggleOnlyOverlaps() {
  filters.relations = onlyOverlaps.value ? [...RELATIONS] : ['overlaps']
}

const revealId = computed(() => (selection.value?.type === 'node' ? selection.value.id : null))

function onSelectNode(id: string, fromPanel = false) {
  selectNode(id, { reveal: fromPanel })
}
</script>

<template>
  <div class="app" :class="{ 'is-panel-open': panelOpen }">
    <div class="app__top">
      <AppHeader
        v-model:view="view"
        :source="source"
        :as-of="eco.asOf"
        :problems="problems"
        :overlap-count="overlapCount"
        :only-overlaps="onlyOverlaps"
        @toggle-only-overlaps="toggleOnlyOverlaps"
      />
      <details class="app__tools" :open="!compact">
        <summary class="app__tools-toggle">Filters and legend</summary>
        <div class="app__tools-body">
          <FilterBar
            v-model:query="filters.query"
            v-model:languages="filters.languages"
            v-model:kinds="filters.kinds"
            v-model:repo-ids="filters.repos"
            v-model:relations="filters.relations"
            :facets="facets"
            :repos="eco.repos"
            :match-count="matchCount"
          />
          <GraphLegend :view="view" />
        </div>
      </details>
    </div>
    <main class="app__graph">
      <p v-if="error" class="app__message">The layout failed: {{ error }}</p>
      <p v-else-if="!layout" class="app__message">Laying out the graph…</p>
      <EcosystemGraph
        v-else
        :nodes="flow.nodes"
        :edges="flow.edges"
        :bands="layout.bands"
        :reveal-id="revealId"
        :reveal-token="reveal"
        :compact="compact"
        @select-node="onSelectNode"
        @select-edge="selectEdge"
        @clear="clear"
      />
    </main>
    <DetailPanel
      v-model:open="panelOpen"
      class="app__panel"
      :eco="eco"
      :graph="graph"
      :view="view"
      :selection="selection"
      @select-node="onSelectNode($event, true)"
      @select-edge="selectEdge"
    />
  </div>
</template>

<style scoped>
.app {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 44px;
  grid-template-rows: auto minmax(0, 1fr);
  grid-template-areas:
    'top top'
    'graph panel';
  height: 100%;
}

.app.is-panel-open {
  grid-template-columns: minmax(0, 1fr) 360px; /* PANEL_WIDTH */
}

.app__top {
  grid-area: top;
  display: grid;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.app__tools-toggle {
  display: none;
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
}

.app__tools-body {
  display: grid;
  gap: 8px;
}

.app__graph {
  grid-area: graph;
  position: relative;
  min-height: 0;
}

.app__panel {
  grid-area: panel;
}

.app__message {
  padding: 24px;
  color: var(--muted);
}

/* Narrow screens: the panel becomes a bottom sheet over the graph. */
@media (max-width: 760px) {
  .app,
  .app.is-panel-open {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr) auto;
    grid-template-areas:
      'top'
      'graph'
      'panel';
  }

  .app__top {
    padding: 8px 12px;
  }

  .app__tools-toggle {
    display: list-item;
  }

  .app__tools[open] .app__tools-body {
    margin-top: 8px;
  }

  .app.is-panel-open .app__panel {
    height: 55vh;
  }
}
</style>
