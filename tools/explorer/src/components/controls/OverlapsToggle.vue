<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  /** Overlap edges in the current view. */
  count: number
  pressed: boolean
}>()

const emit = defineEmits<{ toggle: [] }>()

const text = computed(() => `${props.count} ${props.count === 1 ? 'overlap' : 'overlaps'}`)
const title = computed(() => (props.pressed ? 'Show every relation again' : 'Show only the overlap edges'))
</script>

<template>
  <button type="button" class="overlaps-toggle" :aria-pressed="pressed" :title="title" @click="emit('toggle')">
    <span aria-hidden="true">≈</span> {{ text }}
  </button>
</template>

<style scoped>
.overlaps-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 9px;
  border: 1.5px dotted var(--overlap);
  border-radius: 999px;
  background: var(--overlap-bg);
  color: var(--overlap-text);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.overlaps-toggle[aria-pressed='true'] {
  border-style: solid;
  box-shadow: 0 0 0 2px var(--overlap);
}
</style>
