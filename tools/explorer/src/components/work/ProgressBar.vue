<script setup lang="ts">
import { computed } from 'vue'
import { progressText, type Progress } from '../../model/work'

const props = defineProps<{ progress: Progress }>()

const percent = computed(() => (props.progress.total === 0 ? 0 : (100 * props.progress.done) / props.progress.total))
</script>

<template>
  <span class="progress" role="img" :aria-label="progressText(progress)">
    <span class="progress__fill" :style="{ width: `${percent}%` }" />
  </span>
</template>

<style scoped>
.progress {
  display: block;
  height: 6px;
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--surface);
}

.progress__fill {
  display: block;
  height: 100%;
  background: var(--done);
}
</style>
