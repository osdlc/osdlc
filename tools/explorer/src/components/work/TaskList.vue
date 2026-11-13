<script setup lang="ts">
import type { PlanTask, TaskStatus } from '../../model/plan'
import StatusChip from './StatusChip.vue'

/** A titled list of tasks, each a button that selects it. */
defineProps<{
  title: string
  tasks: PlanTask[]
  statusLabel: (status: TaskStatus) => string
  empty: string
}>()

const emit = defineEmits<{ selectTask: [id: number] }>()
</script>

<template>
  <section class="task-list">
    <h3 class="task-list__title">{{ title }} <span class="task-list__count">{{ tasks.length }}</span></h3>
    <p v-if="tasks.length === 0" class="task-list__empty">{{ empty }}</p>
    <ul v-else class="task-list__items">
      <li v-for="task in tasks" :key="task.id" class="task-list__item">
        <button type="button" class="task-list__link" @click="emit('selectTask', task.id)">
          <span class="task-list__number">{{ task.id }}</span>
          <span class="task-list__name">{{ task.title }}</span>
        </button>
        <StatusChip :status="task.status" :label="statusLabel(task.status)" />
      </li>
    </ul>
  </section>
</template>

<style scoped>
.task-list__title {
  margin: 0 0 6px;
  font-size: 13px;
}

.task-list__count {
  color: var(--muted);
  font-weight: 400;
}

.task-list__empty {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}

.task-list__items {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.task-list__item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-list__link {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  padding: 2px 0;
  border: 0;
  background: none;
  color: var(--accent);
  text-align: left;
  cursor: pointer;
}

.task-list__number {
  flex: none;
  min-width: 22px;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 11px;
  text-align: right;
}

.task-list__name {
  overflow: hidden;
  text-decoration: underline;
  text-decoration-color: var(--border-strong);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-list__item .status {
  margin-left: auto;
}
</style>
