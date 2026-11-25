<template>
  <div class="vjc-history-panel" :class="{ expanded: isExpanded }">
    <!-- Toggle button (always visible) -->
    <button
      class="toggle-btn"
      :title="isExpanded ? 'Collapse history' : 'Show history'"
      @click="toggleExpanded"
    >
      <span class="toggle-icon">{{ isExpanded ? '‹' : '›' }}</span>
      <span v-if="!isExpanded" class="toggle-label">History</span>
      <span v-if="!isExpanded && totalEntries > 1" class="toggle-count">({{ totalEntries }})</span>
    </button>

    <!-- Expanded content -->
    <div v-if="isExpanded" class="panel-content">
      <div class="panel-header">
        <span class="panel-title">History</span>
        <span class="entry-count">{{ totalEntries }} state{{ totalEntries === 1 ? '' : 's' }}</span>
        <button class="close-btn" title="Collapse" @click="toggleExpanded">×</button>
      </div>

      <div class="panel-body">
        <div v-if="entries.length === 0" class="empty-state">No history yet</div>
        <ul v-else class="history-list">
          <li
            v-for="entry in reversedEntries"
            :key="entry.index"
            :class="{
              'history-entry': true,
              'is-current': entry.isCurrent,
              'is-past': entry.position === 'past',
              'is-future': entry.position === 'future',
            }"
            @click="handleEntryClick(entry.index)"
          >
            <span class="entry-index">#{{ entry.index }}</span>
            <span class="entry-summary">{{ entry.summary }}</span>
            <span v-if="entry.isCurrent" class="current-badge">current</span>
            <span v-else-if="entry.position === 'future'" class="future-badge">redo</span>
          </li>
        </ul>
      </div>

      <div class="panel-footer">
        <button class="action-btn" :disabled="!canUndo" @click="$emit('undo')">Undo</button>
        <button class="action-btn" :disabled="!canRedo" @click="$emit('redo')">Redo</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HistoryEntry } from '@osdlc/json-canvas-core'
import { computed, type PropType, ref } from 'vue'

const props = defineProps({
  entries: {
    type: Array as PropType<HistoryEntry[]>,
    required: true,
  },
  canUndo: {
    type: Boolean,
    default: false,
  },
  canRedo: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits<{
  (e: 'go-to', index: number): void
  (e: 'undo'): void
  (e: 'redo'): void
}>()

const isExpanded = ref(false)

const totalEntries = computed(() => props.entries.length)

// Show entries in reverse order (newest first) for easier navigation
const reversedEntries = computed(() => [...props.entries].reverse())

function toggleExpanded() {
  isExpanded.value = !isExpanded.value
}

function handleEntryClick(index: number) {
  emit('go-to', index)
}
</script>

<style scoped>
.vjc-history-panel {
  position: fixed;
  top: 1rem;
  left: 1rem;
  bottom: 1rem;
  z-index: var(--vjc-z-output);
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  pointer-events: none;
}

.vjc-history-panel > * {
  pointer-events: auto;
}

/* Toggle button */
.toggle-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 10px;
  background: var(--vjc-color-bg-1);
  border: 1px solid var(--vjc-color-ui-1);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--vjc-color-tx-1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transition:
    background 0.1s,
    border-color 0.1s;
  white-space: nowrap;
}

.toggle-btn:hover {
  background: var(--vjc-color-bg-2);
  border-color: var(--vjc-color-ui-2);
}

.vjc-history-panel.expanded .toggle-btn {
  display: none;
}

.toggle-icon {
  font-size: 16px;
  font-weight: bold;
  color: var(--vjc-color-ax-1);
}

.toggle-label {
  font-weight: 500;
}

.toggle-count {
  color: var(--vjc-color-tx-2);
  font-size: 12px;
}

/* Panel content */
.panel-content {
  display: flex;
  flex-direction: column;
  width: 18em;
  max-width: calc(100vw - 2rem);
  max-height: calc(100vh - 2rem);
  background: var(--vjc-color-bg-1);
  border: 1px solid var(--vjc-color-ui-1);
  border-radius: 12px;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--vjc-color-ui-1);
  gap: 8px;
}

.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--vjc-color-tx-2);
}

.entry-count {
  flex: 1;
  font-size: 11px;
  color: var(--vjc-color-tx-3);
}

.close-btn {
  background: transparent;
  border: none;
  font-size: 20px;
  line-height: 1;
  color: var(--vjc-color-tx-2);
  cursor: pointer;
  padding: 0 4px;
  transition: color 0.1s;
}

.close-btn:hover {
  color: var(--vjc-color-tx-1);
}

.panel-body {
  flex: 1;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  min-height: 100px;
  max-height: 400px;
}

.empty-state {
  padding: 24px 16px;
  text-align: center;
  color: var(--vjc-color-tx-3);
  font-size: 13px;
}

/* History list */
.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.history-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 12px;
  border-bottom: 1px solid var(--vjc-color-ui-1);
  transition: background 0.1s;
}

.history-entry:last-child {
  border-bottom: none;
}

.history-entry:hover {
  background: var(--vjc-color-bg-2);
}

.history-entry.is-current {
  background: var(--vjc-color-ui-1);
}

.history-entry.is-current:hover {
  background: var(--vjc-color-ui-1);
  cursor: default;
}

.history-entry.is-future {
  opacity: 0.6;
}

.entry-index {
  color: var(--vjc-color-tx-3);
  font-family: var(--vjc-font-mono);
  font-size: 11px;
  min-width: 2em;
}

.entry-summary {
  flex: 1;
  color: var(--vjc-color-tx-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.current-badge,
.future-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
  text-transform: uppercase;
  font-weight: 600;
}

.current-badge {
  background: var(--vjc-color-ax-1);
  color: var(--vjc-color-bg-1);
}

.future-badge {
  background: var(--vjc-color-ui-2);
  color: var(--vjc-color-tx-2);
}

.panel-footer {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--vjc-color-ui-1);
  justify-content: center;
}

.action-btn {
  padding: 6px 16px;
  background: var(--vjc-color-ui-1);
  border: 1px solid var(--vjc-color-ui-2);
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--vjc-color-tx-2);
  cursor: pointer;
  transition:
    background 0.1s,
    color 0.1s,
    border-color 0.1s;
}

.action-btn:hover:not(:disabled) {
  background: var(--vjc-color-ui-2);
  color: var(--vjc-color-tx-1);
  border-color: var(--vjc-color-ui-3);
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Mobile responsive */
@media (max-width: 800px) {
  .vjc-history-panel {
    top: auto;
    bottom: 56px;
    left: 1rem;
  }

  .vjc-history-panel.expanded {
    top: 0;
    left: 0;
    right: 0;
    bottom: 48px;
  }

  .vjc-history-panel.expanded .panel-content {
    width: 100%;
    max-width: 100%;
    height: 100%;
    max-height: 100%;
    border-radius: 0;
    border: none;
  }
}
</style>
