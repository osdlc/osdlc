<script setup lang="ts">
import { computed } from 'vue'
import type { Selection } from '../../model/flow'
import { titleOf } from '../../model/card'
import { isOverlap, overlapLabel } from '../../model/relations'
import type { DisplayGraph } from '../../model/twins'
import { edgeId, type EcoEdge, type Ecosystem, type ViewMode } from '../../model/types'
import EdgeDetail from './EdgeDetail.vue'
import NodeDetail from './NodeDetail.vue'

const props = defineProps<{
  eco: Ecosystem
  graph: DisplayGraph
  view: ViewMode
  selection: Selection
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  selectNode: [id: string]
  selectEdge: [id: string]
}>()

const card = computed(() =>
  props.selection?.type === 'node' ? (props.graph.nodes.find((n) => n.id === props.selection?.id) ?? null) : null,
)
const edge = computed(() =>
  props.selection?.type === 'edge' ? (props.graph.edges.find((e) => edgeId(e) === props.selection?.id) ?? null) : null,
)
const edgeHeading = (e: EcoEdge) => (isOverlap(e) ? overlapLabel(e) : `${e.kind} edge`)
const heading = computed(() => {
  if (card.value) return titleOf(card.value.members).title
  return edge.value ? edgeHeading(edge.value) : 'Details'
})
</script>

<template>
  <aside class="panel" :class="{ 'is-open': open }" aria-label="Details">
    <div class="panel__bar">
      <button
        type="button"
        class="panel__toggle"
        :aria-expanded="open"
        aria-controls="detail-panel-body"
        :title="open ? 'Hide details' : 'Show details'"
        @click="open = !open"
      >
        <span class="panel__chevron" aria-hidden="true">{{ open ? '›' : '‹' }}</span>
        <span class="panel__heading">{{ heading }}</span>
      </button>
    </div>
    <div v-show="open" id="detail-panel-body" class="panel__body">
      <NodeDetail
        v-if="card"
        :key="card.id"
        :card="card"
        :eco="eco"
        :graph="graph"
        :view="view"
        @select-node="emit('selectNode', $event)"
        @select-edge="emit('selectEdge', $event)"
      />
      <EdgeDetail v-else-if="edge" :edge="edge" :graph="graph" @select-node="emit('selectNode', $event)" />
      <div v-else class="panel__empty">
        <p>Click a node or an edge to see its details.</p>
        <p>Tab moves through the nodes, Enter selects one, and Esc clears the selection.</p>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid var(--border);
  background: var(--surface);
}

.panel__bar {
  flex: none;
  border-bottom: 1px solid var(--border);
}

.panel__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
}

.panel__chevron {
  font-size: 18px;
  line-height: 1;
}

.panel__heading {
  overflow: hidden;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.panel__body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px 24px;
}

.panel__empty {
  color: var(--muted);
}

.panel__empty p {
  margin: 0 0 8px;
}

/* Collapsed on a wide screen: a thin rail with the toggle. */
.panel:not(.is-open) .panel__heading {
  display: none;
}

.panel:not(.is-open) .panel__bar {
  border-bottom: 0;
}
</style>

<style scoped>
@media (max-width: 760px) {
  .panel {
    border-top: 1px solid var(--border);
    border-left: 0;
    box-shadow: 0 -4px 16px rgb(0 0 0 / 0.12);
  }

  .panel__chevron {
    transform: rotate(-90deg);
  }

  .panel:not(.is-open) .panel__heading {
    display: block;
  }
}
</style>
