<script setup lang="ts">
import { computed } from 'vue'
import type { Change } from '../model/types'
import { CHANGE_LABEL } from '../model/view'

const props = defineProps<{ change: Change }>()

const ICON: Record<Change, string> = { both: '=', removed: '−', added: '+' }
const icon = computed(() => ICON[props.change])
const label = computed(() => CHANGE_LABEL[props.change])
</script>

<template>
  <span class="change-tag" :class="`change-tag--${change}`">
    <span class="change-tag__icon" aria-hidden="true">{{ icon }}</span>{{ label }}
  </span>
</template>

<style scoped>
.change-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 6px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  font-size: 11px;
  line-height: 17px;
  white-space: nowrap;
  color: var(--muted);
  background: var(--surface);
}

.change-tag__icon {
  font-weight: 700;
}

.change-tag--removed {
  border-style: dashed;
  border-color: var(--removed);
  color: var(--removed);
  background: var(--removed-bg);
}

.change-tag--added {
  border-color: var(--added);
  color: var(--added-text);
  background: var(--added-bg);
}
</style>
