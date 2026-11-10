<script setup lang="ts">
import { computed } from 'vue'
import { APP_VIEW_LABEL, type AppView } from '../model/route'
import { useTheme } from '../composables/useTheme'
import ThemeToggle from './controls/ThemeToggle.vue'
import ViewSwitch from './controls/ViewSwitch.vue'

const props = defineProps<{
  /** The data file behind the current view. */
  source: string
  /** True when that file is a sample, not the real data. */
  sample: boolean
  asOf: string
  problems: string[]
}>()

const { theme, cycle } = useTheme()
const appView = defineModel<AppView>('appView', { required: true })

const APP_VIEWS = (Object.keys(APP_VIEW_LABEL) as AppView[]).map((value) => ({ value, label: APP_VIEW_LABEL[value] }))
const problemText = computed(() => props.problems.join('\n'))
</script>

<template>
  <header class="app-header">
    <h1 class="app-header__title">Markdown ecosystem</h1>
    <ViewSwitch v-model="appView" label="What to show" :options="APP_VIEWS" class="app-header__views" />
    <span class="app-header__source" :class="{ 'is-fixture': sample }">
      Data: <code>{{ source }}</code><template v-if="sample"> (sample)</template>
      <template v-if="asOf"> · as of {{ asOf }}</template>
    </span>
    <details v-if="problems.length > 0" class="app-header__problems">
      <summary>{{ problems.length }} data {{ problems.length === 1 ? 'problem' : 'problems' }}</summary>
      <pre>{{ problemText }}</pre>
    </details>
    <div class="app-header__controls">
      <slot />
      <ThemeToggle :theme="theme" @cycle="cycle" />
    </div>
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

.app-header__views {
  font-weight: 600;
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

.app-header__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin-left: auto;
}
</style>
