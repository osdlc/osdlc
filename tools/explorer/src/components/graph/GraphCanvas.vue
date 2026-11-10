<script setup lang="ts">
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { VueFlow, useVueFlow, type Edge, type GraphNode, type Node } from '@vue-flow/core'
import { MiniMap } from '@vue-flow/minimap'
import { computed, useSlots, watch } from 'vue'

/**
 * The pan-and-zoom canvas both views draw on. It fits `bounds` once, pans to `revealId` when
 * `revealToken` changes, and selects a focused node on Enter. Node cards come in as `node-<type>`
 * slots, and custom edges as `edge-<type>` slots, and are passed on to Vue Flow; the `underlay` slot draws under the nodes, in graph units.
 */
const props = defineProps<{
  flowId: string
  nodes: Node[]
  edges: Edge[]
  /** What to fit on first draw, in graph units; null fits the nodes. */
  bounds: { x: number; y: number; width: number; height: number } | null
  revealId: string | null
  revealToken: number
  compact: boolean
  minimapClass?: (node: GraphNode) => string
  /**
   * The smallest zoom the first draw may use. When `bounds` only fits below it, the first draw
   * shows the top-left of `bounds` at this zoom instead, and the fit button still shows it all.
   */
  minFitZoom?: number
}>()

const emit = defineEmits<{
  selectNode: [id: string]
  selectEdge: [id: string]
  clear: []
}>()

const slots = useSlots()
// `node-<type>` and `edge-<type>` slots draw custom cards and edges.
const typeSlots = computed(() => Object.keys(slots).filter((name) => name.startsWith('node-') || name.startsWith('edge-')))

const { dimensions, fitBounds, fitView, setCenter, setViewport, viewport } = useVueFlow(props.flowId)

function reveal() {
  const id = props.revealId
  const target = id === null ? undefined : props.nodes.find((node) => node.id === id)
  if (!target) return
  const width = Number(target.width ?? 0)
  const height = Number(target.height ?? 0)
  const zoom = Math.max(viewport.value.zoom, 0.8)
  setCenter(target.position.x + width / 2, target.position.y + height / 2, { zoom, duration: 300 })
}

// Fit once, after the first nodes are measured; later changes keep the user's pan and zoom.
let fitted = false
async function onNodesInitialized() {
  if (fitted) return
  fitted = true
  const bounds = props.bounds
  const { width, height } = dimensions.value
  const fitZoom = bounds ? Math.min(width / bounds.width, height / bounds.height) : 1
  if (bounds && props.minFitZoom !== undefined && fitZoom < props.minFitZoom) {
    const zoom = props.minFitZoom
    await setViewport({ x: 8 - bounds.x * zoom, y: 8 - bounds.y * zoom, zoom })
  } else if (bounds) await fitBounds(bounds, { padding: 0.02 })
  else await fitView({ padding: 0.05 })
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
</script>

<template>
  <div class="graph" @keydown="onKeydown">
    <VueFlow
      :id="flowId"
      :nodes="nodes"
      :edges="edges"
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
      <template v-for="name in typeSlots" :key="name" #[name]="slotProps">
        <slot :name="name" v-bind="slotProps" />
      </template>
      <template #zoom-pane>
        <slot name="underlay" />
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
</style>
