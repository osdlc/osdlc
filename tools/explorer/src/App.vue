<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import AppHeader from './components/AppHeader.vue'
import FilterBar from './components/controls/FilterBar.vue'
import GraphLegend from './components/controls/GraphLegend.vue'
import OverlapsToggle from './components/controls/OverlapsToggle.vue'
import ViewSwitch from './components/controls/ViewSwitch.vue'
import ComponentDetail from './components/detail/ComponentDetail.vue'
import DetailPanel from './components/detail/DetailPanel.vue'
import EcosystemGraph from './components/graph/EcosystemGraph.vue'
import WorkDetail from './components/work/WorkDetail.vue'
import WorkFilterBar from './components/work/WorkFilterBar.vue'
import WorkGraph from './components/work/WorkGraph.vue'
import WorkLegend from './components/work/WorkLegend.vue'
import { useComponentsView } from './composables/useComponentsView'
import { useHashRoute } from './composables/useHashRoute'
import { useKeydown } from './composables/useKeydown'
import { useMediaQuery } from './composables/useMediaQuery'
import { useWorkView } from './composables/useWorkView'
import { loadData } from './loadData'
import { loadPlan } from './loadPlan'
import { WORK_LEVEL_LABEL, type AppView, type Route, type WorkLevel } from './model/route'
import { displayIdFor } from './model/twins'
import type { ViewMode } from './model/types'
import { VIEW_LABEL } from './model/view'

const { source, eco, problems } = loadData()
const loadedPlan = loadPlan()

const appView = shallowRef<AppView>('components')
const compact = useMediaQuery('(max-width: 760px)')
const panelOpen = shallowRef(!compact.value)

const PANEL_WIDTH = 360
const TOP_HEIGHT = 150
const components = useComponentsView(eco, () => {
  const width = window.innerWidth - (compact.value ? 0 : PANEL_WIDTH)
  const height = Math.max(200, window.innerHeight - TOP_HEIGHT)
  return Math.min(2.5, Math.max(0.6, width / height))
})
const work = useWorkView(loadedPlan.plan)
const planTasks = work.index.task

const STATE_OPTIONS = (Object.keys(VIEW_LABEL) as ViewMode[]).map((value) => ({ value, label: VIEW_LABEL[value] }))
const LEVEL_OPTIONS = (['overview', 'detail'] as WorkLevel[]).map((value) => ({ value, label: WORK_LEVEL_LABEL[value] }))

const header = computed(() =>
  appView.value === 'components'
    ? { source, sample: source === 'fixture.json', asOf: eco.asOf }
    : { source: loadedPlan.found ? 'plan.json' : 'no plan.json', sample: false, asOf: loadedPlan.plan.asOf },
)
const allProblems = [...problems, ...loadedPlan.problems.map((problem) => `plan.json: ${problem}`)]

// A new selection, from the graph, the panel or the URL, opens the panel.
watch(
  () => {
    const selected = appView.value === 'components' ? components.selection.value : work.selection.value
    return selected ? `${appView.value}:${selected.type}:${selected.id}` : null
  },
  (key) => {
    if (key !== null) panelOpen.value = true
  },
)

const heading = computed(() => (appView.value === 'components' ? components.heading.value : work.heading.value))

function currentRoute(): Route {
  if (appView.value === 'components') {
    const selected = components.selection.value
    return { view: 'components', node: selected?.type === 'node' ? selected.id : null }
  }
  const selected = work.selection.value
  return {
    view: 'work',
    level: work.level.value,
    task: selected?.type === 'task' ? selected.id : null,
    milestone: selected?.type === 'milestone' ? selected.id : null,
  }
}

function applyRoute(route: Route) {
  appView.value = route.view
  if (route.view === 'components') {
    const id = route.node === null ? null : displayIdFor(components.graph, route.node)
    if (id !== null) components.selectNode(id, { reveal: true })
    else if (components.selection.value?.type === 'node') components.clear()
    return
  }
  work.level.value = route.level
  if (route.task !== null) work.selectTask(route.task, { reveal: true })
  else if (route.milestone !== null) work.selectMilestone(route.milestone, { reveal: true })
  else work.clear()
}

useHashRoute(currentRoute, applyRoute)

useKeydown((event) => {
  if (event.key !== 'Escape') return
  if (appView.value === 'components') components.clear()
  else work.clear()
})

function onSelectComponent(id: string, fromPanel = false) {
  components.selectNode(id, { reveal: fromPanel })
}

/** From a task's "Components it changes": show that card in the Components view. */
function openComponent(id: string) {
  appView.value = 'components'
  components.selectNode(id, { reveal: true })
}

/** From a component's plan tasks: show that task in the Work view. */
function openTask(id: number) {
  appView.value = 'work'
  work.selectTask(id, { reveal: true })
}
</script>

<template>
  <div class="app" :class="{ 'is-panel-open': panelOpen }">
    <div class="app__top">
      <AppHeader
        v-model:app-view="appView"
        :source="header.source"
        :sample="header.sample"
        :as-of="header.asOf"
        :problems="allProblems"
      >
        <template v-if="appView === 'components'">
          <OverlapsToggle
            v-if="components.overlapCount.value > 0"
            :count="components.overlapCount.value"
            :pressed="components.onlyOverlaps.value"
            @toggle="components.toggleOnlyOverlaps"
          />
          <ViewSwitch v-model="components.mode.value" label="Which state to show" :options="STATE_OPTIONS" />
        </template>
        <ViewSwitch v-else v-model="work.level.value" label="How much to show" :options="LEVEL_OPTIONS" />
      </AppHeader>
      <details class="app__tools" :open="!compact">
        <summary class="app__tools-toggle">Filters and legend</summary>
        <div v-if="appView === 'components'" class="app__tools-body">
          <FilterBar
            v-model:query="components.filters.query"
            v-model:languages="components.filters.languages"
            v-model:kinds="components.filters.kinds"
            v-model:repo-ids="components.filters.repos"
            v-model:relations="components.filters.relations"
            :facets="components.facets"
            :repos="eco.repos"
            :match-count="components.matchCount.value"
          />
          <GraphLegend :view="components.mode.value" />
        </div>
        <div v-else class="app__tools-body">
          <WorkFilterBar
            v-model:statuses="work.filters.statuses"
            v-model:milestones="work.filters.milestones"
            v-model:types="work.filters.types"
            v-model:next-up="work.filters.nextUp"
            :facets="work.facets"
            :index="work.index"
            :next-up-count="work.nextUp.size"
          />
          <WorkLegend :level="work.level.value" />
        </div>
      </details>
    </div>
    <main class="app__graph">
      <template v-if="appView === 'components'">
        <p v-if="components.error.value" class="app__message">The layout failed: {{ components.error.value }}</p>
        <p v-else-if="!components.layout.value" class="app__message">Laying out the graph…</p>
      </template>
      <p v-else-if="!loadedPlan.found" class="app__message">
        No <code>data/plan.json</code>. Run <code>pnpm build-data</code> to build it from the plan's records.
      </p>
      <!-- Each view keeps its pan, zoom and selection while the other is shown. -->
      <KeepAlive>
        <EcosystemGraph
          v-if="appView === 'components' && components.layout.value"
          :nodes="components.flow.value.nodes"
          :edges="components.flow.value.edges"
          :bands="components.layout.value.bands"
          :reveal-id="components.revealId.value"
          :reveal-token="components.reveal.value"
          :compact="compact"
          @select-node="onSelectComponent"
          @select-edge="components.selectEdge"
          @clear="components.clear"
        />
        <WorkGraph
          v-else-if="appView === 'work' && loadedPlan.found"
          :level="work.level.value"
          :nodes="work.flow.value.nodes"
          :edges="work.flow.value.edges"
          :lanes="work.layout.value.lanes"
          :bounds="work.bounds.value"
          :reveal-id="work.revealId.value"
          :reveal-token="work.reveal.value"
          :compact="compact"
          @select-node="work.selectNode"
          @clear="work.clear"
        />
      </KeepAlive>
    </main>
    <DetailPanel v-model:open="panelOpen" class="app__panel" :heading="heading">
      <ComponentDetail
        v-if="appView === 'components'"
        :eco="eco"
        :graph="components.graph"
        :view="components.mode.value"
        :selection="components.selection.value"
        :plan-tasks="planTasks"
        @select-node="onSelectComponent($event, true)"
        @select-edge="components.selectEdge"
        @select-task="openTask"
      />
      <WorkDetail
        v-else
        :index="work.index"
        :deps="work.deps"
        :graph="components.graph"
        :selection="work.selection.value"
        @select-task="work.selectTask($event, { reveal: true })"
        @select-milestone="work.selectMilestone($event, { reveal: true })"
        @select-component="openComponent"
      />
    </DetailPanel>
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
