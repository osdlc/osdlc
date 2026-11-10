<script setup lang="ts">
import { computed } from 'vue'
import type { DataSource } from '../model/data'
import type { ViewMode } from '../model/types'
import ViewSwitch from './controls/ViewSwitch.vue'

const props = defineProps<{
  source: DataSource
  asOf: string
  problems: string[]
  /** Overlap edges in the current view. */
  overlapCount: number
  onlyOverlaps: boolean
}>()

const emit = defineEmits<{ toggleOnlyOverlaps: [] }>()

const view = defineModel<ViewMode>('view', { required: true })

const overlapText = computed(() => `${props.overlapCount} ${props.overlapCount === 1 ? 'overlap' : 'overlaps'}`)
const overlapTitle = computed(() =>
  props.onlyOverlaps ? 'Show every relation again' : 'Show only the overlap edges',
)

const isFixture = computed(() => props.source === 'fixture.json')
const problemText = computed(() => props.problems.join('\n'))
</script>

<template>
  <header class="app-header">
    <h1 class="app-header__title">Markdown ecosystem</h1>
    <span class="app-header__source" :class="{ 'is-fixture': isFixture }">
      Data: <code>{{ source }}</code><template v-if="isFixture"> (sample)</template>
      <template v-if="asOf"> · as of {{ asOf }}</template>
    </span>
    <details v-if="problems.length > 0" class="app-header__problems">
      <summary>{{ problems.length }} data {{ problems.length === 1 ? 'problem' : 'problems' }}</summary>
      <pre>{{ problemText }}</pre>
    </details>
    <button
      v-if="overlapCount > 0"
      type="button"
      class="app-header__overlaps"
      :aria-pressed="onlyOverlaps"
      :title="overlapTitle"
      @click="emit('toggleOnlyOverlaps')"
    >
      <span aria-hidden="true">≈</span> {{ overlapText }}
    </button>
    <ViewSwitch v-model="view" class="app-header__switch" />
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}

.app-header__title {
  margin: 0;
  font-size: 17px;
  font-weight: 650;
}

.app-header__source {
  font-size: 12px;
  color: var(--muted);
}

.app-header__source code {
  font-family: var(--mono);
}

.app-header__source.is-fixture code {
  padding: 0 4px;
  border: 1px dashed var(--match);
  border-radius: 4px;
  color: var(--text);
}

.app-header__problems {
  position: relative;
  font-size: 12px;
  color: var(--removed);
}

.app-header__problems pre {
  position: absolute;
  z-index: 20;
  max-width: 560px;
  max-height: 50vh;
  overflow: auto;
  padding: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  white-space: pre-wrap;
}

.app-header__overlaps {
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

.app-header__overlaps[aria-pressed='true'] {
  border-style: solid;
  box-shadow: 0 0 0 2px var(--overlap);
}

.app-header__switch {
  margin-left: auto;
}
</style>
