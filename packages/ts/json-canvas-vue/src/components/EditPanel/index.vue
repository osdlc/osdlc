<template>
  <div
    v-if="visible"
    class="edit-panel"
    :class="{ expanded: isExpanded }"
    :style="panelStyle"
    @mousedown.stop
  >
    <!-- Compact color bar -->
    <div class="color-bar">
      <button
        v-for="color in presetColors"
        :key="color.id"
        class="swatch"
        :class="{ active: currentColor === color.id }"
        :style="{ backgroundColor: color.hex }"
        :title="color.name"
        @click="setColor(color.id)"
      />
      <button
        class="swatch swatch-none"
        :class="{ active: !currentColor }"
        title="No color"
        @click="setColor(undefined)"
      >
        <span class="no-color-icon">&#x2715;</span>
      </button>
      <button
        class="more-btn"
        :class="{ active: isExpanded }"
        title="More options"
        @click="toggleExpanded"
      >
        &#x22EF;
      </button>
    </div>

    <!-- Expanded panel -->
    <div v-if="isExpanded" class="expanded-section">
      <!-- Custom color picker -->
      <div class="panel-row">
        <label>Custom</label>
        <input
          type="color"
          :value="currentHexColor"
          class="custom-color"
          title="Custom color"
          @input="setCustomColor"
        />
      </div>

      <!-- Group-specific: Background image -->
      <template v-if="isGroupSelected">
        <div class="panel-row">
          <label>Background</label>
          <input
            v-model="backgroundUrl"
            type="text"
            placeholder="URL..."
            class="text-input"
            @change="setBackgroundImage"
          />
        </div>
        <div v-if="backgroundUrl" class="panel-row">
          <label>Style</label>
          <select v-model="backgroundStyle" class="select-input" @change="setBackgroundStyle">
            <option value="cover">Cover</option>
            <option value="ratio">Ratio</option>
            <option value="repeat">Repeat</option>
          </select>
        </div>
      </template>

      <!-- Edge-specific: Arrows and label -->
      <template v-if="isEdgeSelected">
        <div class="panel-row">
          <label>Arrows</label>
          <div class="arrow-toggles">
            <button
              class="arrow-btn"
              :class="{ active: fromEnd === 'arrow' }"
              title="Start arrow"
              @click="toggleFromArrow"
            >
              &larr;
            </button>
            <button
              class="arrow-btn"
              :class="{ active: toEnd === 'arrow' }"
              title="End arrow"
              @click="toggleToArrow"
            >
              &rarr;
            </button>
          </div>
        </div>
        <div class="panel-row">
          <label>Label</label>
          <input
            v-model="edgeLabel"
            type="text"
            placeholder="Label..."
            class="text-input"
            @change="setEdgeLabel"
          />
        </div>
      </template>

      <!-- Delete button -->
      <div class="panel-row delete-row">
        <button class="delete-btn" @click="deleteSelection">Delete</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  type BackgroundStyle,
  Colors,
  type IEdge,
  type INode,
  isGroupNode,
  type PresetColor,
} from '@osdlc/json-canvas-core'
import { computed, type PropType, ref, watch } from 'vue'

const props = defineProps({
  selectedNodes: {
    type: Array as PropType<INode[]>,
    default: () => [],
  },
  selectedEdge: {
    type: Object as PropType<IEdge | null>,
    default: null,
  },
  // Edge midpoint for positioning (canvas coordinates)
  edgeMidpoint: {
    type: Object as PropType<{ x: number; y: number } | null>,
    default: null,
  },
  panX: {
    type: Number,
    default: 0,
  },
  panY: {
    type: Number,
    default: 0,
  },
  scale: {
    type: Number,
    default: 1,
  },
})

// Each payload is the whole, current entity, never a partial patch: the
// Canvas treats an optional key the payload leaves out as a request to clear
// it (that is how withOptional clears a field).
const emit = defineEmits<{
  (e: 'update:node', node: INode): void
  /** One action on a multi-selection: every node at once, so it is one undo step. */
  (e: 'update:nodes', nodes: INode[]): void
  (e: 'update:edge', edge: IEdge): void
  (e: 'delete'): void
}>()

// Expanded state
const isExpanded = ref(false)

// Color presets matching JSON Canvas spec
const presetColors = [
  { id: '1' as PresetColor, name: 'Red', hex: Colors['1'] },
  { id: '2' as PresetColor, name: 'Orange', hex: Colors['2'] },
  { id: '3' as PresetColor, name: 'Yellow', hex: Colors['3'] },
  { id: '4' as PresetColor, name: 'Green', hex: Colors['4'] },
  { id: '5' as PresetColor, name: 'Cyan', hex: Colors['5'] },
  { id: '6' as PresetColor, name: 'Purple', hex: Colors['6'] },
]

// Local state for group and edge properties
const backgroundUrl = ref('')
const backgroundStyle = ref<BackgroundStyle>('cover')
const edgeLabel = ref('')
const fromEnd = ref<'none' | 'arrow'>('none')
const toEnd = ref<'none' | 'arrow'>('arrow')

// Visibility
const visible = computed(() => props.selectedNodes.length > 0 || props.selectedEdge !== null)

// Selection type checks
/**
 * The selection when it is exactly one group node — the shape the group
 * controls below all gate on. Returning the node rather than a boolean means
 * the `length === 1` test narrows the element too, so no caller re-indexes.
 */
function soleGroup(nodes: readonly INode[]) {
  const only = nodes.length === 1 ? nodes[0] : undefined
  return only && isGroupNode(only) ? only : undefined
}

const isGroupSelected = computed(() => soleGroup(props.selectedNodes) !== undefined)

const isEdgeSelected = computed(() => props.selectedEdge !== null)

// Current color from selection
const currentColor = computed(() => {
  if (props.selectedEdge) {
    return props.selectedEdge.color
  }
  // Reading the first node up front rather than testing `length` twice: the
  // empty selection already needed a branch, and it is the narrowing.
  const first = props.selectedNodes[0]
  if (!first) return undefined
  if (props.selectedNodes.length === 1) {
    return first.color
  }
  // For multiple selection, show color if all same, otherwise undefined
  const firstColor = first.color
  const allSame = props.selectedNodes.every((n) => n.color === firstColor)
  return allSame ? firstColor : undefined
})

// Hex color for custom color picker
const currentHexColor = computed(() => {
  const color = currentColor.value
  if (!color) return '#888888'
  // If it's a preset, get the hex value
  if (color in Colors) {
    return Colors[color as PresetColor]
  }
  // Otherwise it's already hex
  return color
})

// Panel position - appears above or near selection
const panelStyle = computed(() => {
  let x = 0
  let y = 0

  if (props.selectedNodes.length > 0) {
    // Calculate bounding box of selected nodes
    let minX = Infinity,
      minY = Infinity
    let maxX = -Infinity,
      maxY = -Infinity

    for (const node of props.selectedNodes) {
      minX = Math.min(minX, node.x)
      minY = Math.min(minY, node.y)
      maxX = Math.max(maxX, node.x + node.width)
      maxY = Math.max(maxY, node.y + node.height)
    }

    // Position above center of bounding box
    x = (minX + maxX) / 2
    y = minY - 10
  } else if (props.selectedEdge && props.edgeMidpoint) {
    // Use edge midpoint for positioning
    x = props.edgeMidpoint.x
    y = props.edgeMidpoint.y - 20
  } else if (props.selectedEdge) {
    // Fallback: center of viewport (shouldn't happen if edgeMidpoint is passed)
    return {
      top: '100px',
      left: '50%',
      transform: 'translateX(-50%)',
    }
  }

  // Convert canvas coords to screen coords
  const screenX = x * props.scale + props.panX
  const screenY = y * props.scale + props.panY

  // Centre the panel on the anchor, using an estimated width per state
  const panelWidth = isExpanded.value ? 180 : 220

  return {
    left: `${Math.max(10, screenX - panelWidth / 2)}px`,
    top: `${Math.max(10, screenY - (isExpanded.value ? 200 : 50))}px`,
    transform: 'none',
  }
})

// Collapse when the selection changes. Keyed on ids: every committed edit
// hands in new node/edge objects for the same selection.
watch(
  () => `${props.selectedNodes.map((n) => n.id).join('\n')}\n|${props.selectedEdge?.id ?? ''}`,
  () => {
    isExpanded.value = false
  },
)

// Sync local state with selected edge
watch(
  () => props.selectedEdge,
  (edge) => {
    if (edge) {
      edgeLabel.value = edge.label || ''
      fromEnd.value = edge.fromEnd || 'none'
      toEnd.value = edge.toEnd ?? 'arrow'
    }
  },
  { immediate: true },
)

// Sync local state with selected group — when the group or its stored
// background changes, not on every new array, which would overwrite a URL
// being typed (it commits on change/blur) whenever the board pans.
watch(
  () => {
    const group = soleGroup(props.selectedNodes)
    return group ? `${group.id}\0${group.background ?? ''}\0${group.backgroundStyle ?? ''}` : ''
  },
  () => {
    const group = soleGroup(props.selectedNodes)
    if (group) {
      backgroundUrl.value = group.background || ''
      backgroundStyle.value = group.backgroundStyle || 'cover'
    }
  },
  { immediate: true },
)

// Actions
function toggleExpanded() {
  isExpanded.value = !isExpanded.value
}

/**
 * Re-emit `item` with one optional key set, or REMOVED when the new value is
 * undefined — the "No color" button and the cleared text fields take that
 * path. Neither simpler spelling works: assigning `undefined` into an optional
 * property is a type error under exactOptionalPropertyTypes, and merely
 * omitting the key from a spread literal would carry the old value through.
 */
function withOptional<T extends object, K extends keyof T>(
  item: T,
  key: K,
  value: T[K] | undefined,
): T {
  const { [key]: _cleared, ...rest } = item
  return (value === undefined ? rest : { ...rest, [key]: value }) as T
}

function setColor(colorId: PresetColor | string | undefined) {
  if (props.selectedEdge) {
    emit('update:edge', withOptional(props.selectedEdge, 'color', colorId))
  } else if (props.selectedNodes.length === 1) {
    emit('update:node', withOptional(props.selectedNodes[0]!, 'color', colorId))
  } else if (props.selectedNodes.length > 1) {
    emit(
      'update:nodes',
      props.selectedNodes.map((node) => withOptional(node, 'color', colorId)),
    )
  }
}

function setCustomColor(e: Event) {
  const input = e.target as HTMLInputElement
  setColor(input.value)
}

function setBackgroundImage() {
  const group = soleGroup(props.selectedNodes)
  if (group) {
    emit('update:node', withOptional(group, 'background', backgroundUrl.value || undefined))
  }
}

function setBackgroundStyle() {
  const group = soleGroup(props.selectedNodes)
  if (group) {
    emit('update:node', {
      ...group,
      backgroundStyle: backgroundStyle.value,
    })
  }
}

function toggleFromArrow() {
  if (props.selectedEdge) {
    const newEnd = fromEnd.value === 'arrow' ? 'none' : 'arrow'
    fromEnd.value = newEnd
    emit('update:edge', { ...props.selectedEdge, fromEnd: newEnd })
  }
}

function toggleToArrow() {
  if (props.selectedEdge) {
    const newEnd = toEnd.value === 'arrow' ? 'none' : 'arrow'
    toEnd.value = newEnd
    emit('update:edge', { ...props.selectedEdge, toEnd: newEnd })
  }
}

function setEdgeLabel() {
  if (props.selectedEdge) {
    emit('update:edge', withOptional(props.selectedEdge, 'label', edgeLabel.value || undefined))
  }
}

function deleteSelection() {
  emit('delete')
}
</script>

<style scoped>
.edit-panel {
  position: fixed;
  background: var(--vjc-color-bg-1);
  border: 1px solid var(--vjc-color-ui-1);
  border-radius: 6px;
  padding: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: var(--vjc-z-marquee);
}

.color-bar {
  display: flex;
  gap: 3px;
  align-items: center;
}

.swatch {
  width: 20px;
  height: 20px;
  border-radius: 3px;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  transition:
    transform 0.1s,
    border-color 0.1s;
}

.swatch.active {
  border-color: var(--vjc-color-tx-1);
}

.swatch:hover {
  transform: scale(1.15);
}

.swatch-none {
  background: var(--vjc-color-bg-2);
  border: 1px solid var(--vjc-color-ui-1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.no-color-icon {
  color: var(--vjc-color-tx-2);
  font-size: 10px;
}

.more-btn {
  width: 20px;
  height: 20px;
  border-radius: 3px;
  border: 1px solid var(--vjc-color-ui-1);
  background: var(--vjc-color-bg-2);
  color: var(--vjc-color-tx-2);
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 2px;
  transition: background 0.1s;
}

.more-btn:hover,
.more-btn.active {
  background: var(--vjc-color-ui-1);
}

/* Expanded section */
.expanded-section {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--vjc-color-ui-1);
}

.panel-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.panel-row:last-child {
  margin-bottom: 0;
}

.panel-row label {
  font-size: 11px;
  font-weight: 500;
  color: var(--vjc-color-tx-2);
  min-width: 55px;
}

.custom-color {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--vjc-color-ui-1);
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
}

.custom-color::-webkit-color-swatch-wrapper {
  padding: 2px;
}

.custom-color::-webkit-color-swatch {
  border: none;
  border-radius: 2px;
}

.text-input,
.select-input {
  flex: 1;
  padding: 4px 6px;
  border: 1px solid var(--vjc-color-ui-1);
  border-radius: 4px;
  background: var(--vjc-color-bg-2);
  color: var(--vjc-color-tx-1);
  font-size: 12px;
  font-family: inherit;
  min-width: 0;
}

.text-input:focus,
.select-input:focus {
  outline: none;
  border-color: var(--vjc-color-ax-1);
}

.arrow-toggles {
  display: flex;
  gap: 4px;
}

.arrow-btn {
  width: 28px;
  height: 24px;
  border: 1px solid var(--vjc-color-ui-1);
  border-radius: 4px;
  background: var(--vjc-color-bg-2);
  color: var(--vjc-color-tx-2);
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background 0.1s,
    color 0.1s;
}

.arrow-btn.active {
  background: var(--vjc-color-ax-1);
  border-color: var(--vjc-color-ax-1);
  color: white;
}

.arrow-btn:hover:not(.active) {
  border-color: var(--vjc-color-ui-2);
}

.delete-row {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--vjc-color-ui-1);
}

.delete-btn {
  flex: 1;
  background: #dc2626;
  color: white;
  border: none;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  font-size: 12px;
  transition: background 0.1s;
}

.delete-btn:hover {
  background: #b91c1c;
}
</style>
