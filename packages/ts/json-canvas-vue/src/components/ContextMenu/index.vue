<template>
  <div
    v-if="visible"
    class="context-menu"
    :style="{ left: `${x}px`, top: `${y}px` }"
    @mousedown.stop
  >
    <!-- Alignment options (only when multiple nodes selected) -->
    <template v-if="selectedCount > 1">
      <div class="menu-section">
        <div class="menu-label">Align</div>
        <div class="menu-row">
          <button class="menu-btn" title="Align left" @click="alignLeft">
            <span class="icon">⫷</span>
          </button>
          <button class="menu-btn" title="Align center horizontally" @click="alignCenterH">
            <span class="icon">⫿</span>
          </button>
          <button class="menu-btn" title="Align right" @click="alignRight">
            <span class="icon">⫸</span>
          </button>
        </div>
        <div class="menu-row">
          <button class="menu-btn" title="Align top" @click="alignTop">
            <span class="icon">⫠</span>
          </button>
          <button class="menu-btn" title="Align center vertically" @click="alignCenterV">
            <span class="icon">⫥</span>
          </button>
          <button class="menu-btn" title="Align bottom" @click="alignBottom">
            <span class="icon">⫡</span>
          </button>
        </div>
      </div>

      <div class="menu-divider" />

      <div class="menu-section">
        <div class="menu-label">Distribute</div>
        <div class="menu-row">
          <button class="menu-btn wide" title="Distribute horizontally" @click="distributeH">
            <span class="icon">⫴</span>
            Horizontal
          </button>
        </div>
        <div class="menu-row">
          <button class="menu-btn wide" title="Distribute vertically" @click="distributeV">
            <span class="icon">⫵</span>
            Vertical
          </button>
        </div>
      </div>

      <div class="menu-divider" />

      <div class="menu-section">
        <div class="menu-label">Size</div>
        <div class="menu-row">
          <button class="menu-btn wide" title="Match width" @click="matchWidth">
            ↔ Same Width
          </button>
        </div>
        <div class="menu-row">
          <button class="menu-btn wide" title="Match height" @click="matchHeight">
            ↕ Same Height
          </button>
        </div>
        <div class="menu-row">
          <button class="menu-btn wide" title="Match size" @click="matchSize">⬚ Same Size</button>
        </div>
      </div>

      <div class="menu-divider" />
    </template>

    <!-- Actions available for single or multiple selection -->
    <div class="menu-section">
      <button class="menu-item" @click="duplicateSelection">
        <span class="item-icon">⎘</span>
        Duplicate
      </button>
      <button class="menu-item delete" @click="deleteSelection">
        <span class="item-icon">✕</span>
        Delete
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { INode } from '@osdlc/json-canvas-core'
import { computed, type PropType } from 'vue'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  x: {
    type: Number,
    default: 0,
  },
  y: {
    type: Number,
    default: 0,
  },
  selectedNodes: {
    type: Array as PropType<INode[]>,
    default: () => [],
  },
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'align', direction: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom'): void
  (e: 'distribute', direction: 'horizontal' | 'vertical'): void
  (e: 'match-size', dimension: 'width' | 'height' | 'both'): void
  (e: 'duplicate'): void
  (e: 'delete'): void
}>()

const selectedCount = computed(() => props.selectedNodes.length)

// Alignment actions
function alignLeft() {
  emit('align', 'left')
  emit('close')
}

function alignCenterH() {
  emit('align', 'center-h')
  emit('close')
}

function alignRight() {
  emit('align', 'right')
  emit('close')
}

function alignTop() {
  emit('align', 'top')
  emit('close')
}

function alignCenterV() {
  emit('align', 'center-v')
  emit('close')
}

function alignBottom() {
  emit('align', 'bottom')
  emit('close')
}

// Distribution actions
function distributeH() {
  emit('distribute', 'horizontal')
  emit('close')
}

function distributeV() {
  emit('distribute', 'vertical')
  emit('close')
}

// Size matching actions
function matchWidth() {
  emit('match-size', 'width')
  emit('close')
}

function matchHeight() {
  emit('match-size', 'height')
  emit('close')
}

function matchSize() {
  emit('match-size', 'both')
  emit('close')
}

// Other actions
function duplicateSelection() {
  emit('duplicate')
  emit('close')
}

function deleteSelection() {
  emit('delete')
  emit('close')
}
</script>

<style scoped>
.context-menu {
  position: fixed;
  background: var(--vjc-color-bg-1);
  border: 1px solid var(--vjc-color-ui-1);
  border-radius: 8px;
  padding: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  z-index: var(--vjc-z-context-menu);
  min-width: 160px;
}

.menu-section {
  margin-bottom: 4px;
}

.menu-section:last-child {
  margin-bottom: 0;
}

.menu-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--vjc-color-tx-2);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
  padding: 0 4px;
}

.menu-row {
  display: flex;
  gap: 4px;
  margin-bottom: 4px;
}

.menu-row:last-child {
  margin-bottom: 0;
}

.menu-btn {
  flex: 1;
  padding: 6px 8px;
  background: var(--vjc-color-bg-2);
  border: 1px solid var(--vjc-color-ui-1);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: var(--vjc-color-tx-1);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  transition:
    background 0.1s,
    border-color 0.1s;
}

.menu-btn:hover {
  background: var(--vjc-color-ui-1);
  border-color: var(--vjc-color-ui-2);
}

.menu-btn.wide {
  justify-content: flex-start;
}

.menu-btn .icon {
  font-size: 14px;
}

.menu-divider {
  height: 1px;
  background: var(--vjc-color-ui-1);
  margin: 8px 0;
}

.menu-item {
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: var(--vjc-color-tx-1);
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  transition: background 0.1s;
}

.menu-item:hover {
  background: var(--vjc-color-bg-2);
}

.menu-item.delete {
  color: #dc2626;
}

.menu-item.delete:hover {
  background: rgba(220, 38, 38, 0.1);
}

.item-icon {
  width: 16px;
  text-align: center;
}
</style>
