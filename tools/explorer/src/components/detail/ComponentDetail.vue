<script setup lang="ts">
import { computed } from 'vue'
import type { Selection } from '../../model/flow'
import type { PlanTask } from '../../model/plan'
import type { DisplayGraph } from '../../model/twins'
import { edgeId, type Ecosystem, type ViewMode } from '../../model/types'
import EdgeDetail from './EdgeDetail.vue'
import NodeDetail from './NodeDetail.vue'

/** The panel body in the Components view: the selected card or edge. */
const props = defineProps<{
  eco: Ecosystem
  graph: DisplayGraph
  view: ViewMode
  selection: Selection
  planTasks: ReadonlyMap<number, PlanTask>
}>()

const emit = defineEmits<{
  selectNode: [id: string]
  selectEdge: [id: string]
  selectTask: [id: number]
}>()

const card = computed(() =>
  props.selection?.type === 'node' ? (props.graph.nodes.find((n) => n.id === props.selection?.id) ?? null) : null,
)
const edge = computed(() =>
  props.selection?.type === 'edge' ? (props.graph.edges.find((e) => edgeId(e) === props.selection?.id) ?? null) : null,
)
</script>

<template>
  <NodeDetail
    v-if="card"
    :key="card.id"
    :card="card"
    :eco="eco"
    :graph="graph"
    :view="view"
    :plan-tasks="planTasks"
    @select-node="emit('selectNode', $event)"
    @select-edge="emit('selectEdge', $event)"
    @select-task="emit('selectTask', $event)"
  />
  <EdgeDetail v-else-if="edge" :edge="edge" :graph="graph" @select-node="emit('selectNode', $event)" />
  <div v-else class="panel-empty">
    <p>Click a node or an edge to see its details.</p>
    <p>Tab moves through the nodes, Enter selects one, and Esc clears the selection.</p>
  </div>
</template>
