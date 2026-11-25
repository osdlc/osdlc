<template>
  <div :id="node.id" :style="nodeStyle" :class="nodeClasses">
    <!-- Node label (shown above the node) -->
    <div class="node-name">
      {{ nodeLabel }}
    </div>

    <!-- In-place text editor: raw markdown in a textarea, committed as an
         updateNode operation by the parent. Rendered INSTEAD of the content
         so what you edit is exactly what the file stores. -->
    <textarea
      v-if="node.type === 'text' && editing"
      ref="editorRef"
      v-model="draftText"
      class="vjc-node-editor"
      data-canvas-node-editor
      @keydown.stop="onEditorKeydown"
      @blur="commit"
    />

    <!-- Host-supplied content component, when the host registered one for
         this node type. The node is the whole contract. -->
    <component
      :is="contentComponent"
      v-else-if="contentComponent"
      :node="node"
      class="node-custom-content"
    />

    <!-- Text Node Content -->
    <!-- eslint-disable vue/no-v-html -- sanitized at the renderedMarkdown seam -->
    <div v-else-if="node.type === 'text'" class="node-text" v-html="renderedText" />
    <!-- eslint-enable vue/no-v-html -->

    <!-- File Node Content -->
    <div v-else-if="node.type === 'file'" class="node-file">
      <div class="file-icon">
        {{ fileIcon }}
      </div>
      <div class="file-info">
        <div class="file-name">
          {{ fileName }}
        </div>
        <div v-if="fileSubpath" class="file-subpath">
          {{ fileSubpath }}
        </div>
      </div>
    </div>

    <!-- Link Node Content -->
    <div v-else-if="node.type === 'link'" class="node-link" @click="openLink">
      <div class="link-icon">🔗</div>
      <div class="link-info">
        <div class="link-domain">
          {{ linkDomain }}
        </div>
        <div class="link-url">
          {{ linkDisplayUrl }}
        </div>
      </div>
    </div>

    <!-- Group Node Content -->
    <div v-else-if="node.type === 'group'" class="node-group-content">
      <div v-if="groupLabel" class="group-label">
        {{ groupLabel }}
      </div>
    </div>

    <!-- Fallback for unknown types (backwards compatibility) -->
    <!-- eslint-disable vue/no-v-html -- sanitized at the renderedMarkdown seam -->
    <div v-else class="node-text" v-html="renderedText" />
    <!-- eslint-enable vue/no-v-html -->

    <!-- Edge anchors: one per side, visible on hover in an editable board
         (see `.vjc-editable` rules in index.css). Dragging one starts an
         edge; the parent's delegated pointerdown owns that gesture. -->
    <template v-if="node.type !== 'group'">
      <span
        v-for="side in ANCHOR_SIDES"
        :key="side"
        class="vjc-anchor"
        :data-anchor-side="side"
        :data-anchor-node="node.id"
      />
    </template>
  </div>
</template>

<script lang="ts" setup>
import {
  type INode,
  isFileNode,
  isGroupNode,
  isLinkNode,
  isTextNode,
  resolveColor,
} from '@osdlc/json-canvas-core'
import { type Component, computed, nextTick, type PropType, ref, watch } from 'vue'
import { plainTextRenderer, renderedMarkdown, useRendererVersion } from '../../markdown.ts'

const ANCHOR_SIDES = ['top', 'right', 'bottom', 'left'] as const

// A renderer switch re-renders every text node through the watch below.
const rendererVersion = useRendererVersion()

const props = defineProps({
  node: {
    type: Object as PropType<INode>,
    required: true,
  },
  scale: {
    type: Number,
    required: true,
  },
  translateX: {
    type: Number,
    required: true,
  },
  translateY: {
    type: Number,
    required: true,
  },
  /** Host content components by node type — see the Canvas prop of the same name. */
  nodeComponents: {
    type: Object as PropType<Partial<Record<'text' | 'file' | 'link', Component>>>,
    default: undefined,
  },
  /** This text node is being edited in place. */
  editing: {
    type: Boolean,
    default: false,
  },
  /**
   * This node is selected. Bound into the class list rather than left to the
   * parent's `classList.add`: Vue rewrites `className` whenever the bound
   * classes change (entering or leaving edit mode), which would wipe a class
   * added from outside.
   */
  selected: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits<{
  'edit-commit': [nodeId: string, text: string]
  'edit-cancel': []
}>()

// ── In-place editing ────────────────────────────────────────────────────────

const editorRef = ref<HTMLTextAreaElement | null>(null)
const draftText = ref('')
// Escape must not also commit through the blur it causes.
let cancelled = false

watch(
  () => props.editing,
  (editing) => {
    if (!editing) return
    cancelled = false
    draftText.value = isTextNode(props.node) ? props.node.text : ''
    nextTick(() => editorRef.value?.focus())
  },
  { immediate: true },
)

function commit() {
  if (cancelled) return
  emit('edit-commit', props.node.id, draftText.value)
}

function onEditorKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    cancelled = true
    emit('edit-cancel')
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    commit()
  }
}

// ── Content ─────────────────────────────────────────────────────────────────

const contentComponent = computed<Component | null>(() => {
  const type = props.node.type
  if (type !== 'text' && type !== 'file' && type !== 'link') return null
  return props.nodeComponents?.[type] ?? null
})

/** Expand #RGB to #RRGGBB, so an alpha suffix can be appended. */
function toLongHex(color: string): string {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color)
  return short ? `#${short[1]!.repeat(2)}${short[2]!.repeat(2)}${short[3]!.repeat(2)}` : color
}

// Computed styles
const nodeStyle = computed(() => {
  const color = resolveColor(props.node.color)
  const isGroup = props.node.type === 'group'

  // Themable via the `--vjc-*` contract rather than a literal: a literal
  // inline color outranks every host rule, which in dark mode is a grid of
  // white cards no stylesheet can fix.
  let backgroundColor: string
  if (isGroup) {
    // Groups have semi-transparent backgrounds: the colour plus a '20' alpha
    // byte, which needs the 6-digit form — '#f00' + '20' is not a colour.
    backgroundColor = color ? toLongHex(color) + '20' : 'var(--vjc-color-group-bg)'
  } else {
    backgroundColor = 'var(--vjc-color-node-bg)'
  }

  // Group background image support
  const backgroundImage =
    isGroup && isGroupNode(props.node) && props.node.background
      ? cssUrl(props.node.background)
      : undefined

  const backgroundSize =
    isGroup && isGroupNode(props.node) && props.node.backgroundStyle
      ? getBackgroundSize(props.node.backgroundStyle)
      : undefined

  const backgroundRepeat =
    isGroup && isGroupNode(props.node) && props.node.backgroundStyle === 'repeat'
      ? 'repeat'
      : 'no-repeat'

  return {
    height: `${props.node.height * props.scale}px`,
    width: `${props.node.width * props.scale}px`,
    left: `${props.node.x * props.scale}px`,
    top: `${props.node.y * props.scale}px`,
    fontSize: `${props.scale * 14}px`,
    lineHeight: `${props.scale * 18}px`,
    border: `${2 * props.scale}px ${isGroup ? 'dashed' : 'solid'} ${color || 'var(--vjc-color-node-border)'}`,
    backgroundColor,
    backgroundImage,
    backgroundSize,
    backgroundRepeat,
    backgroundPosition: 'center',
  }
})

/**
 * A quoted CSS `url()`. Unquoted, a path with a space, a parenthesis or a
 * quote is a bad-url token, and the browser drops the whole declaration.
 */
function cssUrl(value: string): string {
  return `url("${value.replace(/[\\"]/g, '\\$&')}")`
}

const nodeClasses = computed(() => ({
  node: true,
  'node-type-text': props.node.type === 'text',
  'node-type-file': props.node.type === 'file',
  'node-type-link': props.node.type === 'link',
  'node-type-group': props.node.type === 'group',
  'is-editing': props.editing,
  'is-selected': props.selected,
}))

// Node label - only group nodes have labels
const nodeLabel = computed(() => {
  if (isGroupNode(props.node)) return props.node.label || ''
  return ''
})

// Text node content. Rendering is async, so a ref fed by a watch replaces a
// computed; the token drops a slow render that resolves after a newer one.
const renderedText = ref('')
let renderToken = 0

watch(
  [() => (isTextNode(props.node) ? props.node.text : ''), rendererVersion],
  async ([text]) => {
    const token = ++renderToken
    let html = ''
    if (isTextNode(props.node)) {
      try {
        html = await renderedMarkdown(text)
      } catch {
        // A renderer that rejects must not leave the PREVIOUS text's HTML on
        // the node — wrong content, silently. Degrade to the escaped source,
        // the same way the math and mermaid blocks degrade to theirs.
        html = plainTextRenderer.render(text) as string
      }
    }
    if (token !== renderToken) return
    renderedText.value = html
  },
  { immediate: true },
)

// File node computed properties
const fileName = computed(() => {
  if (!isFileNode(props.node)) return ''
  const file = props.node.file
  return file.split('/').pop() || file
})

const fileSubpath = computed(() => {
  if (!isFileNode(props.node)) return ''
  return props.node.subpath || ''
})

const fileIcon = computed(() => {
  if (!isFileNode(props.node)) return '📁'
  const file = props.node.file
  const ext = file.split('.').pop()?.toLowerCase()

  switch (ext) {
    case 'md':
    case 'markdown':
      return '📝'
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
      return '🖼️'
    case 'pdf':
      return '📄'
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':
    case 'vue':
      return '💻'
    case 'json':
      return '📋'
    case 'css':
    case 'scss':
    case 'less':
      return '🎨'
    default:
      return '📁'
  }
})

// Link node computed properties
const linkDomain = computed(() => {
  if (!isLinkNode(props.node)) return ''
  const url = props.node.url
  try {
    const parsed = new URL(url)
    return parsed.hostname
  } catch {
    return url
  }
})

const linkDisplayUrl = computed(() => {
  if (!isLinkNode(props.node)) return ''
  const url = props.node.url
  try {
    const parsed = new URL(url)
    const path = parsed.pathname === '/' ? '' : parsed.pathname
    return parsed.hostname + path
  } catch {
    return url
  }
})

// A canvas file is untrusted input, so a click opens only these schemes. Any
// other (`javascript:`, `data:`) or a URL that does not parse does nothing.
const OPENABLE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

function openLink() {
  if (!isLinkNode(props.node)) return
  let protocol: string
  try {
    protocol = new URL(props.node.url).protocol
  } catch {
    return
  }
  if (!OPENABLE_PROTOCOLS.has(protocol)) return
  window.open(props.node.url, '_blank', 'noopener,noreferrer')
}

// Group node computed properties
const groupLabel = computed(() => {
  if (!isGroupNode(props.node)) return ''
  return props.node.label || ''
})

function getBackgroundSize(style: string): string {
  switch (style) {
    case 'cover':
      return 'cover'
    case 'ratio':
      return 'contain'
    case 'repeat':
      return 'auto'
    default:
      return 'cover'
  }
}
</script>

<style scoped>
/* General node styling */
.node {
  -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
  position: absolute;
  display: block;
  background-color: var(--vjc-color-bg-1);
  border-radius: 8px;
  box-shadow: 0 0 0 2px var(--vjc-color-ui-1);
  overflow: hidden;
  cursor: grab;
  -ms-user-select: none;
  -webkit-user-select: none;
  user-select: none;

  &.is-active {
    box-shadow: 0 0 0 2px var(--vjc-color-ui-3);
  }

  &.is-selected {
    box-shadow: 0 0 0 3px var(--vjc-color-ax-1);
    outline: 2px solid var(--vjc-color-ax-1);
    outline-offset: 2px;
  }

  &.is-selected.is-dragging {
    box-shadow:
      0 0 0 3px var(--vjc-color-ax-1),
      0 5px 15px rgba(0, 0, 0, 0.3);
  }

  &.is-dragging {
    cursor: grabbing;
    box-shadow:
      0 0 0 2px var(--vjc-color-ui-3),
      0 5px 15px rgba(0, 0, 0, 0.2);

    iframe {
      pointer-events: none;
    }

    .node-name {
      cursor: grabbing;
    }
  }

  /* Anchors escape the node's box; editing needs the caret visible. */
  &.is-editing {
    overflow: visible;
    cursor: text;
  }

  &:hover .node-name {
    opacity: 1;
    color: var(--vjc-color-tx-1);
    border-radius: 8px 8px 0 0;
  }

  .node-name {
    -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
    cursor: grab;
    opacity: 1;
    position: absolute;
    height: 2.25em;
    padding: 0.25em 0.5em;
    width: 100%;
    top: -2.25em;
    left: 0;
    color: var(--vjc-color-ui-2);
    font-size: calc(var(--font-smaller) * 1 / var(--scale));
    -ms-user-select: none;
    -webkit-user-select: none;
    user-select: none;
  }

  .node-text {
    padding: 12px 24px;
    overflow: auto;
    height: 100%;
  }

  .node-custom-content {
    overflow: auto;
    height: 100%;
  }
}

/* In-place editor */
.vjc-node-editor {
  display: block;
  width: 100%;
  height: 100%;
  padding: 12px 24px;
  margin: 0;
  border: none;
  border-radius: 8px;
  resize: none;
  outline: 2px solid var(--vjc-color-ax-1);
  outline-offset: -2px;
  background: var(--vjc-color-node-bg);
  color: var(--vjc-color-tx-1);
  font-family: var(--vjc-font-mono);
  font-size: 0.9em;
  line-height: 1.5;
  cursor: text;
  user-select: text;
  -webkit-user-select: text;
}

/* Group node styling */
.node-type-group {
  box-shadow: none;
  background-color: transparent;

  .node-group-content {
    height: 100%;
    position: relative;
  }

  .group-label {
    position: absolute;
    top: 8px;
    left: 12px;
    font-weight: 600;
    color: var(--vjc-color-tx-2);
    font-size: 0.9em;
  }
}

/* File node styling */
.node-type-file {
  .node-file {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 16px 20px;
    height: 100%;
  }

  .file-icon {
    font-size: 2em;
    line-height: 1;
  }

  .file-info {
    flex: 1;
    min-width: 0;
  }

  .file-name {
    font-weight: 600;
    word-break: break-word;
  }

  .file-subpath {
    color: var(--vjc-color-tx-2);
    font-size: 0.85em;
    margin-top: 4px;
  }
}

/* Link node styling */
.node-type-link {
  cursor: pointer;

  &:hover {
    box-shadow: 0 0 0 2px var(--vjc-color-ui-3);
  }

  .node-link {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 16px 20px;
    height: 100%;
  }

  .link-icon {
    font-size: 1.5em;
    line-height: 1;
  }

  .link-info {
    flex: 1;
    min-width: 0;
  }

  .link-domain {
    font-weight: 600;
    color: var(--vjc-color-ax-1);
  }

  .link-url {
    color: var(--vjc-color-tx-2);
    font-size: 0.85em;
    margin-top: 4px;
    word-break: break-all;
  }
}
</style>
