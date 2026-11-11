<script setup lang="ts">
import type { MilestonePhase } from '../../model/plan'

/** A milestone's phase as its name in the phase colour, so colour is never the only signal. */
defineProps<{ phase: MilestonePhase; label: string }>()
</script>

<template>
  <span class="phase" :class="`phase--${phase}`">{{ label }}</span>
</template>

<style scoped>
.phase {
  --phase: var(--muted);
  display: inline-flex;
  align-items: center;
  padding: 0 7px;
  border: 1.5px solid var(--phase);
  border-radius: 999px;
  background: var(--surface);
  color: var(--phase);
  font-size: 10.5px;
  font-weight: 700;
  line-height: 15px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}

.phase--store {
  --phase: var(--phase-store);
}

.phase--model {
  --phase: var(--phase-model);
}

.phase--harness {
  --phase: var(--phase-harness);
}
</style>
