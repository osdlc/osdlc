<script setup lang="ts">
import { computed } from 'vue'
import { titleOf } from '../../model/card'
import { cardsForTask, sourceUrl } from '../../model/crossLinks'
import type { PlanTask } from '../../model/plan'
import type { DisplayGraph } from '../../model/twins'
import { isNextUp, unblocksOf, waitsOn, type PlanIndex } from '../../model/work'
import PhaseTag from './PhaseTag.vue'
import RichText from './RichText.vue'
import StatusChip from './StatusChip.vue'
import TaskList from './TaskList.vue'

const props = defineProps<{ task: PlanTask; index: PlanIndex; graph: DisplayGraph }>()

const emit = defineEmits<{
  selectTask: [id: number]
  selectMilestone: [id: string]
  selectComponent: [id: string]
}>()

const milestone = computed(() => props.index.milestone.get(props.task.milestone) ?? null)
const typeLabel = computed(() => props.index.plan.types.find((t) => t.id === props.task.type)?.label ?? props.task.type)
const before = computed(() => waitsOn(props.index, props.task.id))
const after = computed(() => unblocksOf(props.index, props.task.id))
const nextUp = computed(() => isNextUp(props.index, props.task))
const source = computed(() => sourceUrl(props.task.source))
const components = computed(() =>
  cardsForTask(props.graph, props.task.id).map((card) => ({
    id: card.id,
    title: titleOf(card.members).title,
    kind: [...new Set(card.members.map((m) => m.kind))].join(' + '),
  })),
)
</script>

<template>
  <article class="task-detail">
    <header class="task-detail__head">
      <span class="task-detail__number">Task {{ task.id }}</span>
      <h2 class="task-detail__title">{{ task.title }}</h2>
      <p v-if="task.detail" class="task-detail__line">{{ task.detail }}</p>
      <div class="task-detail__tags">
        <StatusChip :status="task.status" :label="index.statusLabel(task.status)" />
        <span v-if="task.type === 'supporting'" class="task-detail__support">support</span>
        <span v-if="nextUp" class="task-detail__next"><span aria-hidden="true">▶</span> next up</span>
      </div>
    </header>

    <dl class="facts">
      <dt>Status</dt>
      <dd>{{ index.statusLabel(task.status) }}</dd>
      <dt>Type</dt>
      <dd>{{ typeLabel }}</dd>
      <dt>Milestone</dt>
      <dd>
        <button v-if="milestone" type="button" class="link-button" @click="emit('selectMilestone', milestone.id)">
          {{ milestone.title }}
        </button>
        <template v-else>{{ task.milestone || 'none' }}</template>
      </dd>
      <template v-if="milestone?.phase">
        <dt>Phase</dt>
        <dd><PhaseTag :phase="milestone.phase" :label="index.phaseLabel(milestone.phase)" /></dd>
      </template>
      <template v-if="task.prs.length > 0">
        <dt>Pull requests</dt>
        <dd class="task-detail__prs">
          <a v-for="pr in task.prs" :key="pr.url" :href="pr.url" target="_blank" rel="noopener">{{ pr.label }}</a>
        </dd>
      </template>
      <template v-if="source">
        <dt>Source</dt>
        <dd><a :href="source" target="_blank" rel="noopener">{{ task.source }}</a></dd>
      </template>
    </dl>

    <RichText v-if="task.text" :text="task.text" />

    <TaskList
      title="Waits on"
      :tasks="before"
      :status-label="index.statusLabel"
      empty="Nothing: it can start any time."
      @select-task="emit('selectTask', $event)"
    />
    <TaskList
      title="Unblocks"
      :tasks="after"
      :status-label="index.statusLabel"
      empty="No task waits on it."
      @select-task="emit('selectTask', $event)"
    />

    <section>
      <h3 class="section-title">Components it changes <span class="count">{{ components.length }}</span></h3>
      <p v-if="components.length === 0" class="empty">No component lists this task.</p>
      <ul v-else class="components">
        <li v-for="card in components" :key="card.id">
          <button type="button" class="link-button" :title="`Show ${card.title} in the Components view`" @click="emit('selectComponent', card.id)">
            {{ card.title }}
          </button>
          <span class="components__kind">{{ card.kind }}</span>
        </li>
      </ul>
    </section>
  </article>
</template>

<style scoped>
.task-detail {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}

.task-detail__head {
  display: grid;
  gap: 4px;
}

.task-detail__prs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
}

.task-detail__number {
  color: var(--muted);
  font-family: var(--mono);
  font-size: 12px;
}

.task-detail__title {
  margin: 0;
  font-size: 17px;
  overflow-wrap: anywhere;
}

.task-detail__line {
  margin: 0;
  color: var(--muted);
}

.task-detail__tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.task-detail__support {
  padding: 0 5px;
  border: 1px dashed var(--border-strong);
  border-radius: 4px;
  color: var(--muted);
  font-size: 11px;
}

.task-detail__next {
  padding: 0 6px;
  border-radius: 4px;
  background: var(--next-bg);
  box-shadow: inset 0 0 0 1.5px var(--next);
  font-size: 11px;
  font-weight: 700;
}

.facts {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 4px 12px;
  margin: 0;
  font-size: 13px;
}

.facts dt {
  color: var(--muted);
}

.facts dd {
  margin: 0;
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

.components {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.components li {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.components__kind {
  margin-left: auto;
  color: var(--muted);
  font-size: 11px;
}

.link-button {
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
