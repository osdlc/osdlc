<script setup lang="ts">
import { computed } from 'vue'
import { OVERLAP_MEANING, isOverlap, overlapLabel } from '../../model/relations'
import { titleOf } from '../../model/card'
import { isTwinCard, type DisplayEdge, type DisplayGraph } from '../../model/twins'
import type { Change } from '../../model/types'
import { changeOf } from '../../model/view'
import ChangeTag from '../ChangeTag.vue'

const props = defineProps<{ edge: DisplayEdge; graph: DisplayGraph }>()

const emit = defineEmits<{ selectNode: [id: string] }>()

const cardOf = (id: string) => props.graph.nodes.find((n) => n.id === id)
const nameOf = (id: string) => {
  const card = cardOf(id)
  return card ? titleOf(card.members).title : id
}
const memberName = (id: string) =>
  props.graph.nodes.flatMap((n) => n.members).find((member) => member.id === id)?.name ?? id
/** The data edges behind this line, listed when it joins a twin card or stands for more than one. */
const dataEdges = computed(() => {
  const twinEnd = [props.edge.from, props.edge.to].some((id) => {
    const card = cardOf(id)
    return card !== undefined && isTwinCard(card)
  })
  return twinEnd || props.edge.members.length > 1 ? props.edge.members : []
})
const change = computed(() => changeOf(props.edge.states))
const statesText = computed(() => props.edge.states.join(' and '))
const overlap = computed(() => isOverlap(props.edge))
const title = computed(() => (overlap.value ? overlapLabel(props.edge) : `${props.edge.kind} edge`))
const overlapKind = computed(() => props.edge.overlap ?? 'partial')
const OVERLAP_FATE: Record<Change, string> = {
  removed: 'The plan removes this overlap.',
  both: 'The plan keeps this overlap.',
  added: 'The plan adds this overlap.',
}
const overlapFate = computed(() => OVERLAP_FATE[change.value])
</script>

<template>
  <article class="edge-detail">
    <header class="edge-detail__head">
      <h2 class="edge-detail__title" :class="{ 'is-overlap': overlap }">{{ title }}</h2>
      <ChangeTag :change="change" />
    </header>
    <dl v-if="overlap" class="facts">
      <dt>Between</dt>
      <dd>
        <button type="button" class="link-button" @click="emit('selectNode', edge.from)">{{ nameOf(edge.from) }}</button>
        and
        <button type="button" class="link-button" @click="emit('selectNode', edge.to)">{{ nameOf(edge.to) }}</button>
      </dd>
      <dt>Kind</dt>
      <dd><strong>{{ overlapKind }}</strong>: {{ OVERLAP_MEANING[overlapKind] }}</dd>
      <dt>What</dt>
      <dd>{{ edge.note }}</dd>
      <dt>States</dt>
      <dd>{{ statesText }}. {{ overlapFate }}</dd>
    </dl>
    <dl v-else class="facts">
      <dt>From</dt>
      <dd>
        <button type="button" class="link-button" @click="emit('selectNode', edge.from)">{{ nameOf(edge.from) }}</button>
      </dd>
      <dt>To</dt>
      <dd>
        <button type="button" class="link-button" @click="emit('selectNode', edge.to)">{{ nameOf(edge.to) }}</button>
      </dd>
      <dt>Kind</dt>
      <dd>{{ edge.kind }}</dd>
      <dt>States</dt>
      <dd>{{ statesText }}</dd>
      <template v-if="edge.note">
        <dt>Note</dt>
        <dd>{{ edge.note }}</dd>
      </template>
    </dl>
    <section v-if="dataEdges.length > 0" class="data-edges">
      <h3 class="data-edges__title">Data edges <span class="data-edges__count">{{ dataEdges.length }}</span></h3>
      <ul class="data-edges__list">
        <li v-for="member in dataEdges" :key="`${member.from}->${member.to}`" class="data-edges__item">
          <span class="data-edges__ends">{{ memberName(member.from) }} → {{ memberName(member.to) }}</span>
          <ChangeTag :change="changeOf(member.states)" />
          <p v-if="member.note && dataEdges.length > 1" class="data-edges__note">{{ member.note }}</p>
        </li>
      </ul>
    </section>
  </article>
</template>

<style scoped>
.data-edges__title {
  margin: 0 0 6px;
  font-size: 13px;
}

.data-edges__count {
  color: var(--muted);
  font-weight: 400;
}

.data-edges__list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
}

.data-edges__item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 8px;
}

.data-edges__ends {
  overflow-wrap: anywhere;
}

.data-edges__note {
  flex-basis: 100%;
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}

.edge-detail {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
}

.edge-detail__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.edge-detail__title {
  margin: 0;
  font-size: 17px;
}

.edge-detail__title.is-overlap {
  padding: 0 8px;
  border: 1.5px dotted var(--overlap);
  border-radius: 6px;
  background: var(--overlap-bg);
  color: var(--overlap-text);
}

.facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 12px;
  margin: 0;
  font-size: 13px;
}

.facts dt {
  color: var(--muted);
}

.facts dd {
  margin: 0;
}

.link-button {
  padding: 0;
  border: 0;
  background: none;
  color: var(--accent);
  text-align: left;
  text-decoration: underline;
  cursor: pointer;
}
</style>
