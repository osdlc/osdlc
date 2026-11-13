<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { computed } from 'vue'
import type { TaskCardData } from '../../model/workFlow'
import StatusChip from './StatusChip.vue'

// Vue Flow passes many node props; only these are used, and the rest must not land on the DOM.
defineOptions({ inheritAttrs: false })

const props = defineProps<{ id: string; data: TaskCardData }>()

const task = computed(() => props.data.task)
const supporting = computed(() => task.value.type === 'supporting')
const classes = computed(() => [
  `task--${task.value.status}`,
  {
    'task--supporting': supporting.value,
    'is-selected': props.data.selected,
    'is-dimmed': props.data.dimmed,
    'is-next': props.data.highlighted,
  },
])
const label = computed(() => {
  const parts = [`Task ${task.value.id}: ${task.value.title}`, task.value.detail, props.data.statusLabel]
  if (supporting.value) parts.push('supporting')
  if (props.data.nextUp) parts.push('next up')
  return parts.filter(Boolean).join(' · ')
})
</script>

<template>
  <div class="task" :class="classes" :title="label">
    <Handle id="t-left" type="target" :position="Position.Left" class="task__handle" />
    <Handle id="s-right" type="source" :position="Position.Right" class="task__handle" />
    <Handle id="t-top" type="target" :position="Position.Top" class="task__handle" />
    <Handle id="s-top" type="source" :position="Position.Top" class="task__handle" />
    <div class="task__head">
      <span class="task__number">{{ task.id }}</span>
      <span class="task__title">{{ task.title }}</span>
    </div>
    <div class="task__detail">{{ task.detail }}</div>
    <div class="task__foot">
      <StatusChip :status="task.status" :label="data.statusLabel" />
      <span v-if="supporting" class="task__support">support</span>
      <span v-if="data.highlighted" class="task__next"><span aria-hidden="true">▶</span> next up</span>
    </div>
  </div>
</template>

<style scoped>
.task {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  width: 184px; /* TASK_WIDTH */
  height: 80px; /* TASK_HEIGHT */
  padding: 6px 9px;
  border: 1.5px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
  transition: opacity 120ms ease;
}

.task--doing {
  border: 2.5px solid var(--doing);
  padding: 5px 8px;
}

.task--owner {
  border-color: var(--owner);
}

.task--done {
  background: var(--surface-2);
  box-shadow: none;
  opacity: 0.62;
}

/* Supporting work: dashed, with a "support" label as well. */
.task--supporting {
  border-style: dashed;
}

.task.is-next {
  box-shadow: 0 0 0 3px var(--next);
  background: var(--next-bg);
}

.task.is-selected {
  box-shadow: 0 0 0 3px var(--accent);
}

.task.is-dimmed {
  opacity: 0.25;
}

.task__head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.task__number {
  flex: none;
  min-width: 22px;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--muted);
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 600;
  text-align: center;
}

.task__title {
  overflow: hidden;
  font-weight: 600;
  font-size: 12.5px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.task__detail {
  overflow: hidden;
  color: var(--muted);
  font-size: 11.5px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.task__foot {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.task__support {
  padding: 0 5px;
  border: 1px dashed var(--border-strong);
  border-radius: 4px;
  color: var(--muted);
  font-size: 10.5px;
  line-height: 15px;
}

.task__next {
  margin-left: auto;
  color: var(--text);
  font-size: 10.5px;
  font-weight: 700;
  white-space: nowrap;
}

.task__handle {
  opacity: 0;
  pointer-events: none;
}
</style>
