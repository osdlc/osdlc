<script setup lang="ts">
import { computed } from 'vue'
import type { DisplayGraph } from '../../model/twins'
import type { MilestoneDep, PlanIndex } from '../../model/work'
import type { WorkSelection } from '../../model/workFlow'
import MilestoneDetail from './MilestoneDetail.vue'
import TaskDetail from './TaskDetail.vue'

/** The panel body in the Work view: the selected task or milestone. */
const props = defineProps<{
  index: PlanIndex
  deps: readonly MilestoneDep[]
  graph: DisplayGraph
  selection: WorkSelection
}>()

const emit = defineEmits<{
  selectTask: [id: number]
  selectMilestone: [id: string]
  selectComponent: [id: string]
}>()

const task = computed(() => (props.selection?.type === 'task' ? (props.index.task.get(props.selection.id) ?? null) : null))
const milestone = computed(() =>
  props.selection?.type === 'milestone' ? (props.index.milestone.get(props.selection.id) ?? null) : null,
)
</script>

<template>
  <TaskDetail
    v-if="task"
    :key="`task-${task.id}`"
    :task="task"
    :index="index"
    :graph="graph"
    @select-task="emit('selectTask', $event)"
    @select-milestone="emit('selectMilestone', $event)"
    @select-component="emit('selectComponent', $event)"
  />
  <MilestoneDetail
    v-else-if="milestone"
    :key="`milestone-${milestone.id}`"
    :milestone="milestone"
    :index="index"
    :deps="deps"
    @select-task="emit('selectTask', $event)"
    @select-milestone="emit('selectMilestone', $event)"
  />
  <div v-else class="panel-empty">
    <p>Click a task or a milestone to see its details.</p>
    <p>Tab moves through the cards, Enter selects one, and Esc clears the selection.</p>
  </div>
</template>
