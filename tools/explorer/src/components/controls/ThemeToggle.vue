<script setup lang="ts">
import { THEME_LABEL, type ThemeChoice } from '../../model/theme'

defineProps<{ theme: ThemeChoice }>()
defineEmits<{ cycle: [] }>()
</script>

<template>
  <button
    type="button"
    class="theme-toggle"
    :title="`Theme: ${THEME_LABEL[theme]}. Press to change.`"
    @click="$emit('cycle')"
  >
    Theme: {{ THEME_LABEL[theme] }}
  </button>
</template>

<style scoped>
.theme-toggle {
  padding: 3px 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
}

.theme-toggle:hover {
  border-color: var(--border-strong);
}
</style>
