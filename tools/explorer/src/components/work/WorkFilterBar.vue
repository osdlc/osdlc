<script setup lang="ts">
import { computed } from 'vue'
import type { TaskStatus, TaskType } from '../../model/plan'
import type { PlanIndex } from '../../model/work'
import { emptyWorkFilters, hasWorkFilters, type WorkFacets } from '../../model/workFilters'
import FacetGroup from '../controls/FacetGroup.vue'

const props = defineProps<{ facets: WorkFacets; index: PlanIndex; nextUpCount: number }>()

const statuses = defineModel<TaskStatus[]>('statuses', { required: true })
const milestones = defineModel<string[]>('milestones', { required: true })
const types = defineModel<TaskType[]>('types', { required: true })
const nextUp = defineModel<boolean>('nextUp', { required: true })

const filtered = computed(() =>
  hasWorkFilters({ statuses: statuses.value, milestones: milestones.value, types: types.value, nextUp: nextUp.value }),
)
const statusName = (status: TaskStatus) => props.index.statusLabel(status)
const milestoneName = (id: string) => props.index.milestone.get(id)?.title ?? id
const typeName = (type: TaskType) => props.index.plan.types.find((t) => t.id === type)?.label ?? type

function reset() {
  const empty = emptyWorkFilters()
  statuses.value = empty.statuses
  milestones.value = empty.milestones
  types.value = empty.types
}
</script>

<template>
  <div class="work-filters">
    <button
      type="button"
      class="work-filters__next"
      :aria-pressed="nextUp"
      title="Highlight the tasks that are not done and wait on nothing unfinished"
      @click="nextUp = !nextUp"
    >
      <span aria-hidden="true">▶</span> Next up <span class="work-filters__count">{{ nextUpCount }}</span>
    </button>
    <FacetGroup v-model="statuses" label="Status" :options="facets.statuses" :label-for="statusName" />
    <FacetGroup v-model="types" label="Type" :options="facets.types" :label-for="typeName" />
    <FacetGroup v-model="milestones" label="Milestone" :options="facets.milestones" :label-for="milestoneName" />
    <button v-if="filtered" type="button" class="work-filters__reset" @click="reset">Clear filters</button>
  </div>
</template>

<style scoped>
.work-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 18px;
}

.work-filters__next {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 10px;
  border: 1.5px solid var(--next);
  border-radius: 999px;
  background: var(--surface);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.work-filters__next[aria-pressed='true'] {
  background: var(--next-bg);
  box-shadow: 0 0 0 2px var(--next);
}

.work-filters__count {
  color: var(--muted);
  font-size: 11px;
  font-weight: 400;
}

.work-filters__reset {
  padding: 2px 8px;
  border: 0;
  background: none;
  color: var(--accent);
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
}
</style>
