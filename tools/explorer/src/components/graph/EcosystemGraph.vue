<script setup lang="ts">
import { MarkerType, type Edge, type GraphNode, type Node } from '@vue-flow/core'
import { computed } from 'vue'
import type { CardData, FlowEdgeSpec, FlowNodeSpec } from '../../model/flow'
import { NODE_HEIGHT, NODE_WIDTH, boundsOf, type Band } from '../../model/layout'
import EcoNodeCard from './EcoNodeCard.vue'
import GraphCanvas from './GraphCanvas.vue'
import LayerBands from './LayerBands.vue'

const props = defineProps<{
  nodes: FlowNodeSpec[]
  edges: FlowEdgeSpec[]
  bands: Band[]
  /** The node to pan to when `revealToken` changes. */
  revealId: string | null
  revealToken: number
  compact: boolean
}>()

const emit = defineEmits<{
  selectNode: [id: string]
  selectEdge: [id: string]
  clear: []
}>()

const flowNodes = computed<Node<CardData>[]>(() =>
  props.nodes.map((spec) => ({ ...spec, width: NODE_WIDTH, height: NODE_HEIGHT })),
)

const flowEdges = computed<Edge[]>(() =>
  props.edges.map((spec) => ({
    id: spec.id,
    source: spec.source,
    target: spec.target,
    sourceHandle: spec.sourceHandle,
    targetHandle: spec.targetHandle,
    type: spec.type,
    label: spec.label,
    class: spec.class,
    data: spec.data,
    markerEnd:
      spec.markerColor === null
        ? undefined
        : { type: MarkerType.ArrowClosed, color: spec.markerColor, width: 16, height: 16 },
  })),
)

// The bands, not just the nodes, so the layer labels are in view too.
const bounds = computed(() => boundsOf(props.bands))

function minimapClass(node: GraphNode) {
  return `minimap-node--${(node.data as CardData).category}`
}
</script>

<template>
  <GraphCanvas
    class="eco-graph"
    flow-id="ecosystem"
    :nodes="flowNodes"
    :edges="flowEdges"
    :bounds="bounds"
    :reveal-id="revealId"
    :reveal-token="revealToken"
    :compact="compact"
    :minimap-class="minimapClass"
    @select-node="emit('selectNode', $event)"
    @select-edge="emit('selectEdge', $event)"
    @clear="emit('clear')"
  >
    <template #node-eco="nodeProps">
      <EcoNodeCard :id="nodeProps.id" :data="nodeProps.data" />
    </template>
    <template #underlay>
      <LayerBands :bands="bands" />
    </template>
  </GraphCanvas>
</template>

<style scoped>
.eco-graph :deep(.eco-edge .vue-flow__edge-path) {
  stroke: var(--edge-both);
  stroke-width: 1.5;
}

/* Edges in both states recede a little so cards stay readable among ~140 edges. */
.eco-graph :deep(.eco-edge--both:not(.is-focused)) {
  opacity: 0.6;
}

.eco-graph :deep(.eco-edge--removed .vue-flow__edge-path) {
  stroke: var(--removed);
  stroke-dasharray: 6 4;
}

.eco-graph :deep(.eco-edge--added .vue-flow__edge-path) {
  stroke: var(--added);
  stroke-width: 2;
}

.eco-graph :deep(.eco-edge.is-focused .vue-flow__edge-path) {
  stroke-width: 3;
}

/* Overlaps: violet, dotted, no arrowhead and a ≈ tag, so colour is not the only signal. */
.eco-graph :deep(.eco-edge--overlap .vue-flow__edge-path) {
  stroke: var(--overlap);
  stroke-width: 3;
  stroke-dasharray: 0.5 6;
  stroke-linecap: round;
}

.eco-graph :deep(.eco-edge--overlap.eco-edge--both:not(.is-focused)) {
  opacity: 0.9;
}

.eco-graph :deep(.eco-edge--overlap.is-focused .vue-flow__edge-path) {
  stroke-width: 4.5;
}

/* An overlap the plan removes keeps its look but its line fades; its tag stays readable and says it is going away. */
.eco-graph :deep(.eco-edge--overlap.eco-edge--removed:not(.is-focused) .vue-flow__edge-path) {
  opacity: 0.5;
}

.eco-graph :deep(.eco-edge--overlap .vue-flow__edge-textbg) {
  fill: var(--overlap-bg);
  stroke: var(--overlap);
  stroke-width: 1;
  stroke-dasharray: 1 2;
}

.eco-graph :deep(.eco-edge--overlap .vue-flow__edge-text) {
  fill: var(--overlap-text);
  font-size: 11px;
  font-weight: 600;
}

.eco-graph :deep(.eco-edge.is-dimmed) {
  opacity: 0.15;
}

.eco-graph :deep(.vue-flow__minimap-node.minimap-node--twin) {
  fill: var(--twin);
}

.eco-graph :deep(.vue-flow__minimap-node.minimap-node--kept) {
  fill: var(--kept);
}

.eco-graph :deep(.vue-flow__minimap-node.minimap-node--going-away) {
  fill: var(--removed);
}

.eco-graph :deep(.vue-flow__minimap-node.minimap-node--to-make) {
  fill: var(--added);
}
</style>
