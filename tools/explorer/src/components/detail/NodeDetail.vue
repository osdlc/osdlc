<script setup lang="ts">
import { computed } from 'vue'
import { titleOf } from '../../model/card'
import { neighboursOf } from '../../model/neighbours'
import type { DisplayGraph, DisplayNode } from '../../model/twins'
import { isTwinCard } from '../../model/twins'
import type { PlanTask } from '../../model/plan'
import type { Ecosystem, ViewMode } from '../../model/types'
import { changeOf } from '../../model/view'
import ChangeTag from '../ChangeTag.vue'
import MemberFacts from './MemberFacts.vue'
import NeighbourList from './NeighbourList.vue'

const props = defineProps<{
  card: DisplayNode
  eco: Ecosystem
  graph: DisplayGraph
  view: ViewMode
  planTasks: ReadonlyMap<number, PlanTask>
}>()

const emit = defineEmits<{
  selectNode: [id: string]
  selectEdge: [id: string]
  selectTask: [id: number]
}>()

const twin = computed(() => isTwinCard(props.card))
const title = computed(() => titleOf(props.card.members))
const change = computed(() => changeOf(props.card.states))
const neighbours = computed(() => neighboursOf(props.graph, props.card.id, props.view))
</script>

<template>
  <article class="node-detail">
    <header class="node-detail__head">
      <h2 class="node-detail__name">
        {{ title.title }}
        <span v-if="title.subtitle" class="node-detail__subtitle">{{ title.subtitle }}</span>
      </h2>
      <ChangeTag :change="change" />
    </header>
    <p v-if="twin" class="node-detail__pair">
      A twin pair: the same library in TypeScript and Rust, drawn as one card. Each one's facts are below.
    </p>

    <MemberFacts
      v-for="member in card.members"
      :key="member.id"
      :node="member"
      :eco="eco"
      :heading="twin"
      :plan-tasks="planTasks"
      @select-task="emit('selectTask', $event)"
    />

    <NeighbourList
      v-if="neighbours.overlaps.length > 0"
      title="Overlaps with"
      :items="neighbours.overlaps"
      :show-via="twin"
      empty="Nothing in this view."
      @select-node="emit('selectNode', $event)"
      @select-edge="emit('selectEdge', $event)"
    />
    <NeighbourList
      title="Depends on"
      :items="neighbours.dependsOn"
      :show-via="twin"
      empty="Nothing in this view."
      @select-node="emit('selectNode', $event)"
      @select-edge="emit('selectEdge', $event)"
    />
    <NeighbourList
      title="Used by"
      :items="neighbours.usedBy"
      :show-via="twin"
      empty="Nothing in this view."
      @select-node="emit('selectNode', $event)"
      @select-edge="emit('selectEdge', $event)"
    />
  </article>
</template>

<style scoped>
.node-detail {
  display: grid;
  /* minmax(0, …) so one long word cannot widen the panel past its edge. */
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}

.node-detail__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.node-detail__name {
  margin: 0;
  font-size: 17px;
  overflow-wrap: anywhere;
}

.node-detail__subtitle {
  display: block;
  color: var(--muted);
  font-size: 13px;
  font-weight: 500;
}

.node-detail__pair {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}
</style>
