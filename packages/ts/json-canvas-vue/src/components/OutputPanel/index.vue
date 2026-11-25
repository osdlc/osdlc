<template>
  <div class="output-panel" :class="{ expanded: isExpanded }">
    <!-- Toggle button (always visible) -->
    <button
      class="toggle-btn"
      :title="isExpanded ? 'Collapse panel' : 'Show JSON output'"
      @click="toggleExpanded"
    >
      <span class="toggle-icon">{{ isExpanded ? '›' : '‹' }}</span>
      <span v-if="!isExpanded" class="toggle-label">JSON</span>
    </button>

    <!-- Expanded content -->
    <div v-if="isExpanded" class="panel-content theme-dark">
      <div class="panel-header">
        <span class="panel-title">JSON Canvas</span>
        <button class="close-btn" title="Collapse" @click="toggleExpanded">×</button>
      </div>

      <div class="panel-body">
        <pre><code class="language-json">{{ formattedJson }}</code></pre>
      </div>

      <div class="panel-footer">
        <button class="action-btn" @click="handleCopy">
          {{ copyButtonText }}
        </button>
        <button class="action-btn" @click="handleDownload">Download</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ICanvasContent } from '@osdlc/json-canvas-core'
import { computed, type PropType, ref } from 'vue'

const props = defineProps({
  canvasContent: {
    type: Object as PropType<ICanvasContent>,
    required: true,
  },
})

const isExpanded = ref(false)
const copyButtonText = ref('Copy')

const formattedJson = computed(() => {
  return JSON.stringify(props.canvasContent, null, 2)
})

function toggleExpanded() {
  isExpanded.value = !isExpanded.value
}

async function handleCopy() {
  try {
    await navigator.clipboard.writeText(formattedJson.value)
    copyButtonText.value = 'Copied!'
    setTimeout(() => {
      copyButtonText.value = 'Copy'
    }, 2000)
  } catch (err) {
    console.error('Failed to copy to clipboard:', err)
    copyButtonText.value = 'Failed'
    setTimeout(() => {
      copyButtonText.value = 'Copy'
    }, 2000)
  }
}

function handleDownload() {
  const blob = new Blob([formattedJson.value], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'canvas.canvas'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.output-panel {
  position: fixed;
  top: 1rem;
  right: 1rem;
  bottom: 1rem;
  z-index: var(--vjc-z-output);
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  pointer-events: none;
}

.output-panel > * {
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

.output-panel.expanded .toggle-btn {
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

/* Panel content */
.panel-content {
  display: flex;
  flex-direction: column;
  width: 24em;
  max-width: calc(100vw - 2rem);
  height: calc(100vh - 2rem);
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
}

.panel-title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--vjc-color-tx-2);
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
  padding: 16px;
  -webkit-overflow-scrolling: touch;
}

.panel-body pre {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}

.panel-body code {
  background: transparent;
  border: none;
  padding: 0;
  font-size: inherit;
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

.action-btn:hover {
  background: var(--vjc-color-ui-2);
  color: var(--vjc-color-tx-1);
  border-color: var(--vjc-color-ui-3);
}

/* Mobile responsive */
@media (max-width: 800px) {
  .output-panel {
    top: auto;
    bottom: 56px;
    right: 1rem;
  }

  .output-panel.expanded {
    top: 0;
    left: 0;
    right: 0;
    bottom: 48px;
  }

  .output-panel.expanded .panel-content {
    width: 100%;
    max-width: 100%;
    height: 100%;
    border-radius: 0;
    border: none;
  }
}
</style>
