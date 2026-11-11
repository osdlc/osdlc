<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { computed } from 'vue'
import { progressText } from '../../model/work'
import type { MilestoneCardData } from '../../model/workFlow'
import PhaseTag from './PhaseTag.vue'
import ProgressBar from './ProgressBar.vue'
import StatusChip from './StatusChip.vue'

// Vue Flow passes many node props; only these are used, and the rest must not land on the DOM.
defineOptions({ inheritAttrs: false })

const props = defineProps<{ id: string; data: MilestoneCardData }>()

const milestone = computed(() => props.data.milestone)
const progress = computed(() => progressText(props.data.progress))
const classes = computed(() => [
  `milestone--${props.data.variant}`,
  `milestone--${milestone.value.status}`,
  milestone.value.phase ? `milestone--phase-${milestone.value.phase}` : 'milestone--no-phase',
  {
    'is-selected': props.data.selected,
    'is-dimmed': props.data.dimmed,
    'is-next': props.data.highlighted,
  },
])
const label = computed(() =>
  [`Milestone: ${milestone.value.title}`, props.data.phaseLabel, props.data.statusLabel, progress.value].filter(Boolean).join(' · '),
)
</script>

<template>
  <div class="milestone" :class="classes" :title="label">
    <template v-if="data.variant === 'card'">
      <Handle id="t-left" type="target" :position="Position.Left" class="milestone__handle" />
      <Handle id="s-right" type="source" :position="Position.Right" class="milestone__handle" />
    </template>
    <PhaseTag v-if="milestone.phase" class="milestone__phase" :phase="milestone.phase" :label="data.phaseLabel" />
    <div class="milestone__top">
      <StatusChip :status="milestone.status" :label="data.statusLabel" />
      <span v-if="data.highlighted" class="milestone__next"><span aria-hidden="true">▶</span> {{ data.nextUp }} next up</span>
      <span class="milestone__count">{{ progress }}</span>
    </div>
    <div class="milestone__title">{{ milestone.title }}</div>
    <ProgressBar :progress="data.progress" />
    <p class="milestone__goal">{{ milestone.goal }}</p>
  </div>
</template>

<style scoped>
.milestone {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 288px; /* MILESTONE_WIDTH */
  height: 136px; /* MILESTONE_HEIGHT */
  padding: 9px 12px;
  border: 1.5px solid var(--border-strong);
  border-top: 5px solid var(--milestone-phase);
  border-left-width: 5px;
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
  transition: opacity 120ms ease;
  position: relative;
  --milestone-phase: var(--border-strong);
}

/* The phase band: the card's top edge in the phase colour, with the phase name on it. */
.milestone--phase-store {
  --milestone-phase: var(--phase-store);
}

.milestone--phase-model {
  --milestone-phase: var(--phase-model);
}

.milestone--phase-harness {
  --milestone-phase: var(--phase-harness);
}

.milestone__phase {
  position: absolute;
  top: -3px;
  right: 12px;
  transform: translateY(-50%);
}

.milestone--lane {
  width: 264px; /* LANE_HEAD_WIDTH */
  height: 124px; /* LANE_HEAD_HEIGHT */
  padding: 8px 10px;
}

.milestone--doing {
  border-left-color: var(--doing);
}

.milestone--owner {
  border-left-color: var(--owner);
}

.milestone--done {
  border-left-color: var(--done);
}

.milestone.is-next {
  box-shadow: 0 0 0 3px var(--next);
}

.milestone.is-selected {
  box-shadow: 0 0 0 3px var(--accent);
}

.milestone.is-dimmed {
  opacity: 0.3;
}

.milestone__top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.milestone__count {
  margin-left: auto;
  color: var(--muted);
  font-size: 11.5px;
  white-space: nowrap;
}

.milestone__next {
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.milestone__title {
  display: -webkit-box;
  overflow: hidden;
  font-weight: 650;
  font-size: 14px;
  line-height: 1.25;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.milestone--lane .milestone__title {
  -webkit-line-clamp: 1;
}

.milestone__goal {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  color: var(--muted);
  font-size: 11.5px;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.milestone--lane .milestone__goal {
  -webkit-line-clamp: 3;
}

.milestone__handle {
  opacity: 0;
  pointer-events: none;
}
</style>
