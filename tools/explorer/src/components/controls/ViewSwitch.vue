<script setup lang="ts">
import type { ViewMode } from '../../model/types'
import { VIEW_LABEL } from '../../model/view'

const view = defineModel<ViewMode>({ required: true })

const MODES: ViewMode[] = ['present', 'target', 'compare']
</script>

<template>
  <div class="view-switch" role="group" aria-label="Which state to show">
    <button
      v-for="mode in MODES"
      :key="mode"
      type="button"
      class="view-switch__option"
      :aria-pressed="view === mode"
      @click="view = mode"
    >
      {{ VIEW_LABEL[mode] }}
    </button>
  </div>
</template>

<style scoped>
.view-switch {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-2);
}

.view-switch__option {
  padding: 4px 14px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.view-switch__option[aria-pressed='true'] {
  background: var(--surface);
  color: var(--text);
  font-weight: 600;
  box-shadow: var(--shadow);
}
</style>
