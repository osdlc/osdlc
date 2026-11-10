<script setup lang="ts">
import type { WorkLevel } from '../../model/route'
import StatusChip from './StatusChip.vue'

defineProps<{ level: WorkLevel }>()
</script>

<template>
  <div class="legend">
    <span class="legend__title">Legend</span>
    <StatusChip status="todo" label="not started" />
    <span class="legend__item"><span class="swatch swatch--doing" /><StatusChip status="doing" label="in progress" /></span>
    <span class="legend__item"><span class="swatch swatch--done" /><StatusChip status="done" label="done (faded)" /></span>
    <StatusChip status="owner" label="waiting on owner" />
    <span class="legend__item"><span class="swatch swatch--support" />support: supporting work</span>
    <span class="legend__item"><span class="swatch swatch--next" />▶ next up</span>
    <span class="legend__item">
      <svg class="line" viewBox="0 0 36 8" aria-hidden="true"><line x1="0" y1="4" x2="36" y2="4" class="line--open" /></svg>
      still waiting
    </span>
    <span class="legend__item">
      <svg class="line" viewBox="0 0 36 8" aria-hidden="true"><line x1="0" y1="4" x2="36" y2="4" class="line--done" /></svg>
      prerequisite done
    </span>
    <span class="legend__note">
      <template v-if="level === 'detail'">Each band is a milestone, in plan order; the view opens on the beeline milestones. Arrows run from a task to the task that waits on it; left to right is the order work can happen.</template>
      <template v-else>Arrows run from a milestone to one that waits on it, because one of its tasks does.</template>
    </span>
  </div>
</template>

<style scoped>
.legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 16px;
  font-size: 12px;
}

.legend__title,
.legend__note {
  color: var(--muted);
}

.legend__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.swatch {
  display: inline-block;
  width: 22px;
  height: 14px;
  border: 1.5px solid var(--border-strong);
  border-radius: 3px;
  background: var(--surface);
}

.swatch--doing {
  border: 2.5px solid var(--doing);
}

.swatch--done {
  background: var(--surface-2);
  opacity: 0.62;
}

.swatch--support {
  border-style: dashed;
}

.swatch--next {
  background: var(--next-bg);
  box-shadow: 0 0 0 2px var(--next);
}

.line {
  flex: none;
  width: 30px;
  height: 8px;
}

.line--open {
  stroke: var(--edge-strong);
  stroke-width: 2;
}

.line--done {
  stroke: var(--edge-both);
  stroke-width: 2;
  stroke-dasharray: 5 4;
}
</style>
