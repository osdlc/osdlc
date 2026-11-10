<script setup lang="ts">
import { computed } from 'vue'
import { sourceUrl } from '../../model/crossLinks'
import type { PlanMilestone } from '../../model/plan'
import { groupByStatus, milestoneNeighbours, progressOf, progressText, type MilestoneDep, type PlanIndex } from '../../model/work'
import ProgressBar from './ProgressBar.vue'
import StatusChip from './StatusChip.vue'
import TaskList from './TaskList.vue'

const props = defineProps<{ milestone: PlanMilestone; index: PlanIndex; deps: readonly MilestoneDep[] }>()

const emit = defineEmits<{
  selectTask: [id: number]
  selectMilestone: [id: string]
}>()

const tasks = computed(() => props.index.tasksOf.get(props.milestone.id) ?? [])
const progress = computed(() => progressOf(tasks.value))
const groups = computed(() => groupByStatus(props.index, tasks.value))
const neighbours = computed(() => milestoneNeighbours(props.deps, props.milestone.id))
const source = computed(() => sourceUrl(props.milestone.source))

const titleOf = (id: string) => props.index.milestone.get(id)?.title ?? id
const linksText = (dep: MilestoneDep) => dep.links.map((link) => `${link.from} → ${link.to}`).join(', ')
const linkSections = computed(() => [
  { title: 'Waits on', empty: 'No other milestone.', items: neighbours.value.waitsOn.map((dep) => ({ dep, id: dep.from })) },
  { title: 'Waited on by', empty: 'No other milestone.', items: neighbours.value.waitedOnBy.map((dep) => ({ dep, id: dep.to })) },
])
</script>

<template>
  <article class="milestone-detail">
    <header class="milestone-detail__head">
      <span class="milestone-detail__kind">Milestone</span>
      <h2 class="milestone-detail__title">{{ milestone.title }}</h2>
      <StatusChip :status="milestone.status" :label="index.statusLabel(milestone.status)" />
    </header>

    <p v-if="milestone.goal" class="milestone-detail__goal">{{ milestone.goal }}</p>

    <div class="milestone-detail__progress">
      <span>{{ progressText(progress) }}</span>
      <ProgressBar :progress="progress" />
    </div>

    <p v-if="source" class="milestone-detail__source">
      Source: <a :href="source" target="_blank" rel="noopener">{{ milestone.source }}</a>
    </p>

    <TaskList
      v-for="group in groups"
      :key="group.status"
      :title="group.label[0]!.toUpperCase() + group.label.slice(1)"
      :tasks="group.tasks"
      :status-label="index.statusLabel"
      empty=""
      @select-task="emit('selectTask', $event)"
    />

    <section v-for="section in linkSections" :key="section.title">
      <h3 class="section-title">{{ section.title }} <span class="count">{{ section.items.length }}</span></h3>
      <p v-if="section.items.length === 0" class="empty">{{ section.empty }}</p>
      <ul v-else class="milestones">
        <li v-for="item in section.items" :key="item.id">
          <button type="button" class="link-button" @click="emit('selectMilestone', item.id)">{{ titleOf(item.id) }}</button>
          <span class="milestones__via" :title="`Task links: ${linksText(item.dep)}`">tasks {{ linksText(item.dep) }}</span>
        </li>
      </ul>
    </section>
  </article>
</template>

<style scoped>
.milestone-detail {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}

.milestone-detail__head {
  display: grid;
  justify-items: start;
  gap: 4px;
}

.milestone-detail__kind {
  color: var(--muted);
  font-size: 12px;
}

.milestone-detail__title {
  margin: 0;
  font-size: 17px;
  overflow-wrap: anywhere;
}

.milestone-detail__goal {
  margin: 0;
}

.milestone-detail__progress {
  display: grid;
  gap: 4px;
  font-size: 13px;
}

.milestone-detail__source {
  margin: 0;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.section-title {
  margin: 0 0 6px;
  font-size: 13px;
}

.count {
  color: var(--muted);
  font-weight: 400;
}

.empty {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}

.milestones {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.milestones li {
  display: grid;
}

.milestones__via {
  color: var(--muted);
  font-family: var(--mono);
  font-size: 11px;
}

.link-button {
  justify-self: start;
  padding: 2px 0;
  border: 0;
  background: none;
  color: var(--accent);
  text-align: left;
  text-decoration: underline;
  text-decoration-color: var(--border-strong);
  cursor: pointer;
}
</style>
