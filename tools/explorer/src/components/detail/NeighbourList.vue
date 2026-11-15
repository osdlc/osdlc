<script setup lang="ts">
import type { Neighbour } from '../../model/neighbours'
import { isOverlap } from '../../model/relations'
import { edgeId, type EcoEdge } from '../../model/types'
import { changeOf, languageLabel } from '../../model/view'
import ChangeTag from '../ChangeTag.vue'

defineProps<{ title: string; items: Neighbour[]; empty: string; showVia?: boolean }>()

/** The tag beside the name: an overlap's kind, or any edge kind but plain depends. */
function kindOf(edge: EcoEdge): string | null {
  if (isOverlap(edge)) return `≈ ${edge.overlap ?? 'partial'}`
  return edge.kind === 'depends' ? null : edge.kind
}

const emit = defineEmits<{
  selectNode: [id: string]
  selectEdge: [id: string]
}>()
</script>

<template>
  <section class="neighbours">
    <h3 class="neighbours__title">{{ title }} <span class="neighbours__count">{{ items.length }}</span></h3>
    <p v-if="items.length === 0" class="neighbours__empty">{{ empty }}</p>
    <ul v-else class="neighbours__list">
      <li
        v-for="item in items"
        :key="edgeId(item.edge)"
        class="neighbours__item"
        :class="{ 'is-overlap': isOverlap(item.edge) }"
      >
        <div class="neighbours__row">
          <button type="button" class="neighbours__node" @click="emit('selectNode', item.node.id)">
            {{ item.node.name }}
          </button>
          <span v-if="kindOf(item.edge)" class="neighbours__kind">{{ kindOf(item.edge) }}</span>
          <button
            type="button"
            class="neighbours__edge"
            :title="`Show this ${item.edge.kind} edge`"
            @click="emit('selectEdge', item.displayEdgeId)"
          >
            <ChangeTag :change="changeOf(item.edge.states)" />
          </button>
        </div>
        <p v-if="showVia" class="neighbours__via">from {{ item.via.name }} ({{ languageLabel(item.via.language) }})</p>
        <p v-if="isOverlap(item.edge) && item.edge.note" class="neighbours__note">{{ item.edge.note }}</p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.neighbours__title {
  margin: 0 0 6px;
  font-size: 13px;
}

.neighbours__count {
  color: var(--muted);
  font-weight: 400;
}

.neighbours__empty {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}

.neighbours__list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.neighbours__row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.neighbours__item.is-overlap {
  padding: 4px 0 6px 8px;
  border-left: 3px dotted var(--overlap);
}

.neighbours__item.is-overlap .neighbours__kind {
  padding: 0 5px;
  border: 1px dotted var(--overlap);
  border-radius: 4px;
  background: var(--overlap-bg);
  color: var(--overlap-text);
  font-weight: 600;
  white-space: nowrap;
}

.neighbours__via {
  margin: 0 0 2px;
  color: var(--muted);
  font-size: 11px;
}

.neighbours__note {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--muted);
}

.neighbours__node {
  overflow: hidden;
  padding: 2px 0;
  border: 0;
  background: none;
  color: var(--accent);
  text-align: left;
  text-decoration: underline;
  text-decoration-color: var(--border-strong);
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.neighbours__kind {
  color: var(--muted);
  font-size: 11px;
}

.neighbours__edge {
  margin-left: auto;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}
</style>
