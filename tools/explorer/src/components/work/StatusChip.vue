<script setup lang="ts">
import { computed } from 'vue'
import type { TaskStatus } from '../../model/plan'

/** A status as an icon and words: colour is never the only signal. */
const props = defineProps<{ status: TaskStatus; label: string }>()

const ICON: Record<TaskStatus, string> = { done: '✓', doing: '◐', owner: 'you', todo: '○' }
const icon = computed(() => ICON[props.status])
</script>

<template>
  <span class="status" :class="`status--${status}`">
    <span class="status__icon" aria-hidden="true">{{ icon }}</span>{{ label }}
  </span>
</template>

<style scoped>
.status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 16px;
  white-space: nowrap;
}

.status__icon {
  display: inline-grid;
  flex: none;
  place-items: center;
  min-width: 14px;
  height: 14px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.status--done .status__icon {
  border-radius: 50%;
  background: var(--done);
  color: var(--surface);
  font-size: 9.5px;
}

.status--doing {
  color: var(--doing);
  font-weight: 600;
}

.status--owner {
  color: var(--owner);
  font-weight: 600;
}

.status--owner .status__icon {
  padding: 0 4px;
  border-radius: 999px;
  background: var(--owner);
  color: var(--surface);
  font-size: 9.5px;
  letter-spacing: 0.02em;
}
</style>
