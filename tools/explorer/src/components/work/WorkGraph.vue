<script setup lang="ts">
import { MarkerType, type Edge, type GraphNode, type Node } from '@vue-flow/core'
import { computed } from 'vue'
import type { Band } from '../../model/layout'
import type { WorkLevel } from '../../model/route'
import type { MilestoneCardData, TaskCardData, WorkEdgeSpec, WorkNodeSpec } from '../../model/workFlow'
import type { Lane } from '../../model/workLayout'
import GraphCanvas from '../graph/GraphCanvas.vue'
import ArcEdge from './ArcEdge.vue'
import LayerBands from '../graph/LayerBands.vue'
import MilestoneCard from './MilestoneCard.vue'
import TaskCard from './TaskCard.vue'

const props = defineProps<{
  level: WorkLevel
  nodes: WorkNodeSpec[]
  edges: WorkEdgeSpec[]
  lanes: Lane[]
  bounds: { x: number; y: number; width: number; height: number } | null
  revealId: string | null
  revealToken: number
  compact: boolean
}>()

const emit = defineEmits<{
  selectNode: [id: string]
  clear: []
}>()

const flowNodes = computed<Node<TaskCardData | MilestoneCardData>[]>(() =>
  props.nodes.map((spec) => ({ id: spec.id, type: spec.type, position: spec.position, width: spec.width, height: spec.height, data: spec.data })),
)

const flowEdges = computed<Edge[]>(() =>
  props.edges.map((spec) => ({
    id: spec.id,
    source: spec.source,
    target: spec.target,
    type: spec.arc ? 'arc' : 'default',
    sourceHandle: spec.arc ? 's-top' : 's-right',
    targetHandle: spec.arc ? 't-top' : 't-left',
    class: spec.class,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: spec.satisfied ? 'var(--edge-both)' : 'var(--edge-strong)',
      width: 16,
      height: 16,
    },
  })),
)

// Lanes reuse the layer bands; the milestone header node is their label.
const bands = computed<Band[]>(() => props.lanes.map((lane) => ({ ...lane, label: '', summary: '' })))

function minimapClass(node: GraphNode) {
  const data = node.data as TaskCardData | MilestoneCardData
  return data.kind === 'task' ? `minimap-task--${data.task.status}` : 'minimap-milestone'
}
</script>

<template>
  <GraphCanvas
    :key="level"
    class="work-graph"
    :flow-id="`work-${level}`"
    :nodes="flowNodes"
    :edges="flowEdges"
    :bounds="bounds"
    :reveal-id="revealId"
    :reveal-token="revealToken"
    :compact="compact"
    :minimap-class="minimapClass"
    :min-fit-zoom="0.8"
    @select-node="emit('selectNode', $event)"
    @clear="emit('clear')"
  >
    <template #node-task="nodeProps">
      <TaskCard :id="nodeProps.id" :data="nodeProps.data" />
    </template>
    <template #node-milestone="nodeProps">
      <MilestoneCard :id="nodeProps.id" :data="nodeProps.data" />
    </template>
    <template #edge-arc="edgeProps">
      <ArcEdge v-bind="edgeProps" />
    </template>
    <template #underlay>
      <LayerBands :bands="bands" />
    </template>
  </GraphCanvas>
</template>

<style scoped>
/* Solid dark arrows still hold work up; dashed faded ones come from a done task. */
.work-graph :deep(.work-edge .vue-flow__edge-path) {
  stroke: var(--edge-strong);
  stroke-width: 1.6;
}

.work-graph :deep(.work-edge.is-satisfied .vue-flow__edge-path) {
  stroke: var(--edge-both);
  stroke-dasharray: 5 4;
}

.work-graph :deep(.work-edge.is-satisfied:not(.is-focused)) {
  opacity: 0.55;
}

.work-graph :deep(.work-edge.is-focused .vue-flow__edge-path) {
  stroke-width: 3;
}

.work-graph :deep(.work-edge.is-dimmed) {
  opacity: 0.12;
}

.work-graph :deep(.vue-flow__minimap-node.minimap-task--done) {
  fill: var(--done);
}

.work-graph :deep(.vue-flow__minimap-node.minimap-task--doing) {
  fill: var(--doing);
}

.work-graph :deep(.vue-flow__minimap-node.minimap-task--owner) {
  fill: var(--owner);
}
</style>
