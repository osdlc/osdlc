<script setup lang="ts">
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MarkerType, VueFlow, useVueFlow, type Edge, type GraphNode, type Node } from '@vue-flow/core'
import { MiniMap } from '@vue-flow/minimap'
import { computed, watch } from 'vue'
import type { CardData, FlowEdgeSpec, FlowNodeSpec } from '../../model/flow'
import { NODE_HEIGHT, NODE_WIDTH, boundsOf, type Band } from '../../model/layout'
import EcoNodeCard from './EcoNodeCard.vue'
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

const FLOW_ID = 'ecosystem'
const { fitBounds, setCenter, viewport } = useVueFlow(FLOW_ID)

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

function reveal() {
  const id = props.revealId
  const target = id === null ? undefined : props.nodes.find((node) => node.id === id)
  if (!target) return
  const zoom = Math.max(viewport.value.zoom, 0.8)
  setCenter(target.position.x + NODE_WIDTH / 2, target.position.y + NODE_HEIGHT / 2, { zoom, duration: 300 })
}

// Fit once, after the first nodes are measured; later view changes keep the user's pan and zoom.
let fitted = false
async function onNodesInitialized() {
  if (fitted) return
  fitted = true
  // The bands, not just the nodes, so the layer labels are in view too.
  const bounds = boundsOf(props.bands)
  if (bounds) await fitBounds(bounds, { padding: 0.02 })
  if (props.revealId !== null) reveal()
}

watch(() => props.revealToken, reveal)

// Enter on a focused node selects it; Vue Flow's own key handling is off with selection disabled.
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  const element = (event.target as HTMLElement | null)?.closest<HTMLElement>('.vue-flow__node')
  const id = element?.dataset.id
  if (!id) return
  event.preventDefault()
  emit('selectNode', id)
}

function minimapClass(node: GraphNode<CardData>) {
  return `minimap-node--${node.data.change}`
}
</script>

<template>
  <div class="graph" @keydown="onKeydown">
    <VueFlow
      :id="FLOW_ID"
      :nodes="flowNodes"
      :edges="flowEdges"
      :nodes-draggable="false"
      :nodes-connectable="false"
      :elements-selectable="false"
      :edges-focusable="false"
      :zoom-on-double-click="false"
      :min-zoom="0.15"
      :max-zoom="2"
      @nodes-initialized="onNodesInitialized"
      @node-click="emit('selectNode', $event.node.id)"
      @edge-click="emit('selectEdge', $event.edge.id)"
      @pane-click="emit('clear')"
    >
      <template #node-eco="nodeProps">
        <EcoNodeCard :id="nodeProps.id" :data="nodeProps.data" />
      </template>
      <template #zoom-pane>
        <LayerBands :bands="bands" />
      </template>
      <Background :gap="24" :size="1" pattern-color="var(--border)" />
      <Controls position="top-right" :show-interactive="false" />
      <MiniMap
        v-if="!compact"
        position="bottom-right"
        :width="150"
        :height="110"
        :node-class-name="minimapClass"
        pannable
        zoomable
      />
    </VueFlow>
  </div>
</template>

<style scoped>
.graph {
  position: relative;
  width: 100%;
  height: 100%;
}

.graph :deep(.vue-flow__node) {
  border-radius: var(--radius);
  cursor: pointer;
}

.graph :deep(.vue-flow__node:focus-visible) {
  outline: 3px solid var(--focus);
  outline-offset: 3px;
}

.graph :deep(.eco-edge .vue-flow__edge-path) {
  stroke: var(--edge-both);
  stroke-width: 1.5;
}

/* Edges in both states recede a little so cards stay readable among ~140 edges. */
.graph :deep(.eco-edge--both:not(.is-focused)) {
  opacity: 0.6;
}

.graph :deep(.eco-edge--removed .vue-flow__edge-path) {
  stroke: var(--removed);
  stroke-dasharray: 6 4;
}

.graph :deep(.eco-edge--added .vue-flow__edge-path) {
  stroke: var(--added);
  stroke-width: 2;
}

.graph :deep(.eco-edge.is-focused .vue-flow__edge-path) {
  stroke-width: 3;
}

/* Overlaps: amber, dotted, no arrowhead and a ≈ tag, so colour is not the only signal. */
.graph :deep(.eco-edge--overlap .vue-flow__edge-path) {
  stroke: var(--overlap);
  stroke-width: 3;
  stroke-dasharray: 0.5 6;
  stroke-linecap: round;
}

.graph :deep(.eco-edge--overlap.eco-edge--both:not(.is-focused)) {
  opacity: 0.9;
}

.graph :deep(.eco-edge--overlap.is-focused .vue-flow__edge-path) {
  stroke-width: 4.5;
}

/* An overlap the plan removes keeps its look but its line fades; its tag stays readable and says it is going away. */
.graph :deep(.eco-edge--overlap.eco-edge--removed:not(.is-focused) .vue-flow__edge-path) {
  opacity: 0.5;
}

.graph :deep(.eco-edge--overlap .vue-flow__edge-textbg) {
  fill: var(--overlap-bg);
  stroke: var(--overlap);
  stroke-width: 1;
  stroke-dasharray: 1 2;
}

.graph :deep(.eco-edge--overlap .vue-flow__edge-text) {
  fill: var(--overlap-text);
  font-size: 11px;
  font-weight: 600;
}

.graph :deep(.eco-edge.is-dimmed) {
  opacity: 0.15;
}

.graph :deep(.vue-flow__edge-textbg) {
  fill: var(--surface);
}

.graph :deep(.vue-flow__edge-text) {
  fill: var(--muted);
  font-size: 10px;
}

.graph :deep(.vue-flow__controls) {
  box-shadow: var(--shadow);
}

.graph :deep(.vue-flow__controls-button) {
  border-bottom-color: var(--border);
  background: var(--surface);
  fill: var(--text);
}

.graph :deep(.vue-flow__minimap) {
  border: 1px solid var(--border);
  background: var(--surface);
}

.graph :deep(.vue-flow__minimap-mask) {
  fill: var(--band-b);
}

.graph :deep(.vue-flow__minimap-node) {
  fill: var(--border-strong);
}

.graph :deep(.minimap-node--removed) {
  fill: var(--removed);
}

.graph :deep(.minimap-node--added) {
  fill: var(--added);
}
</style>
