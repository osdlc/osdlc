// =============================================================================
// @osdlc/json-canvas-vue - Vue 3 JSON Canvas Components
// =============================================================================

// -----------------------------------------------------------------------------
// Styles (CSS variables and base styles)
// -----------------------------------------------------------------------------

// The library build writes this stylesheet to dist/style.css, which the host
// imports as `@osdlc/json-canvas-vue/style.css`. The built JavaScript does not
// import it, and the declaration step removes this line from the `.d.ts`.
import './index.css'

// -----------------------------------------------------------------------------
// Components
// -----------------------------------------------------------------------------

// Each component's TSDoc sits on its `export` line: a single-file component
// has no declaration of its own for a reader to attach it to.

/**
 * The board: renders a JSON Canvas document and edits it with pan and zoom,
 * drag, resize, selection, in-place text editing, edge drawing and undo and
 * redo. Props: `canvasContent` (the document), `nodeComponents`, `theme`
 * (`'light'` or `'dark'`) and `readonly`. Emits `change` with the new
 * immutable canvas after every committed operation. Exposes `execute`,
 * `executeBatch`, `undo`, `redo` and `fitToView`.
 */
export { default as JsonCanvas } from './components/Canvas/index.vue'

/**
 * One node of the board (text, file, link or group) with its chrome and its
 * in-place editor. Props: `node`, `scale`, `translateX`, `translateY`,
 * `nodeComponents`, `editing` and `selected`. Emits `edit-commit` and
 * `edit-cancel`. A host that replaces the board's chrome mounts it directly.
 *
 * @experimental The props mirror the board's internal state and may change
 * in any release.
 */
export { default as CanvasNode } from './components/CanvasNode/index.vue'

/**
 * The floating panel that edits the colour, edge style and group background
 * of the selection. Props: `selectedNodes`, `selectedEdge`, `edgeMidpoint`,
 * `panX`, `panY` and `scale`. Emits `update:node` for one node, `update:nodes`
 * for several, `update:edge` and `delete`.
 *
 * @experimental The props mirror the board's internal state and may change
 * in any release.
 */
export { default as EditPanel } from './components/EditPanel/index.vue'

// -----------------------------------------------------------------------------
// Re-export the core types and helpers a host of the board uses
// -----------------------------------------------------------------------------

export type {
  BackgroundStyle,
  // Operation types
  CanvasOperation,
  CreatedIds,
  Direction,
  ErrorCode,
  HistoryEntry,
  HistoryOptions,
  IBaseNode,
  ICanvasContent,
  IEdge,
  IFileNode,
  IGroupNode,
  ILinkNode,
  INode,
  ITextNode,
  MarkerType,
  NodeType,
  OperationError,
  OperationResult,
  PresetColor,
  ValidationError,
  ValidationErrorCode,
  ValidationResult,
} from '@osdlc/json-canvas-core'

export {
  Colors,
  formatValidationErrors,
  isFileNode,
  isGroupNode,
  isLinkNode,
  isTextNode,
  isValidCanvas,
  isValidColor,
  isValidHexColor,
  normalizeCanvas,
  resolveColor,
  validateCanvasData,
} from '@osdlc/json-canvas-core'

// -----------------------------------------------------------------------------
// Vue-specific markdown rendering
// -----------------------------------------------------------------------------

export type { MarkdownRenderer } from './markdown.ts'

/**
 * Host content components by node type, for the `nodeComponents` prop of
 * `JsonCanvas`: each replaces the built-in body rendering of its node type
 * and receives the node as its `node` prop.
 */
export type NodeComponents = Partial<Record<'text' | 'file' | 'link', import('vue').Component>>

export {
  getActiveRenderer,
  getActiveRendererId,
  getRenderers,
  plainTextRenderer,
  registerMarkdownRenderer,
  renderedMarkdown,
  setActiveRenderer,
  unregisterMarkdownRenderer,
  useRendererVersion,
} from './markdown.ts'

// -----------------------------------------------------------------------------
// Composables
// -----------------------------------------------------------------------------

export { type UseCanvasOperationsReturn, useCanvasOperations } from './composables/index.ts'
