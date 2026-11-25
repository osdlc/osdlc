// =============================================================================
// useCanvasOperations - Vue composable for canvas operations with undo/redo
// =============================================================================

import type {
  CanvasOperation,
  HistoryEntry,
  HistoryOptions,
  ICanvasContent,
  OperationResult,
} from '@osdlc/json-canvas-core'
import { SnapshotHistory } from '@osdlc/json-canvas-core'
import type { ComputedRef, Ref, ShallowRef } from 'vue'
import { computed, ref, shallowRef } from 'vue'

// Re-export HistoryEntry type for consumers
export type { HistoryEntry } from '@osdlc/json-canvas-core'

/**
 * What `useCanvasOperations` returns: the reactive canvas, the operations that
 * change it, and the undo and redo state.
 */
export interface UseCanvasOperationsReturn {
  /** The reactive canvas content. Use shallowRef for performance with large canvases. */
  canvas: ShallowRef<ICanvasContent>

  /** Execute a single operation. Returns the operation result. */
  execute: (operation: CanvasOperation) => OperationResult

  /** Execute multiple operations as a single undoable unit. */
  executeBatch: (operations: CanvasOperation[]) => OperationResult

  /** Undo the last operation. */
  undo: () => OperationResult

  /** Redo the last undone operation. */
  redo: () => OperationResult

  /** Whether undo is available. Reactive. */
  canUndo: ComputedRef<boolean>

  /** Whether redo is available. Reactive. */
  canRedo: ComputedRef<boolean>

  /**
   * Create a checkpoint for later revert. Returns an opaque handle — not an
   * index into `historyEntries`, and never derived from `undoStackSize`. See
   * `SnapshotHistory.checkpoint` in `@osdlc/json-canvas-core`.
   */
  checkpoint: () => number

  /** Revert to a handle previously returned by `checkpoint()`. */
  revertTo: (checkpoint: number) => OperationResult

  /** The result of the last operation. Null if no operations yet. */
  lastResult: Ref<OperationResult | null>

  /** Reset the canvas to a new state and clear history. */
  reset: (newCanvas: ICanvasContent) => void

  /** Clear undo/redo history without changing the canvas. */
  clearHistory: () => void

  /** Current undo stack size. Reactive. */
  undoStackSize: ComputedRef<number>

  /** Current redo stack size. Reactive. */
  redoStackSize: ComputedRef<number>

  /**
   * All history entries for display. Reactive.
   *
   * @experimental The entry list is shaped for one panel and may change.
   */
  historyEntries: ComputedRef<HistoryEntry[]>

  /**
   * Jump to a specific history entry by index.
   *
   * @experimental The index scheme may change.
   */
  goToHistoryEntry: (index: number) => OperationResult
}

/**
 * Vue composable for managing canvas operations with undo/redo support.
 *
 * Uses Immer-based immutable state management internally. Each operation
 * returns a new canvas instance, enabling simple snapshot-based undo/redo.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useCanvasOperations } from '@osdlc/json-canvas-vue'
 *
 * const {
 *   canvas,
 *   execute,
 *   undo,
 *   redo,
 *   canUndo,
 *   canRedo
 * } = useCanvasOperations({ nodes: [], edges: [] })
 *
 * function addNode() {
 *   const result = execute({
 *     type: 'createNode',
 *     node: { type: 'text', x: 0, y: 0, width: 100, height: 50, text: 'Hello' }
 *   })
 *   if (result.success) {
 *     console.log('Created node IDs:', result.created?.nodeIds)
 *   }
 * }
 * </script>
 * ```
 */
export function useCanvasOperations(
  initialCanvas: ICanvasContent,
  options: HistoryOptions = {},
): UseCanvasOperationsReturn {
  const historyOptions = options

  let history = new SnapshotHistory(initialCanvas, historyOptions)

  // Use shallowRef for the canvas - history manages the state,
  // we just sync it here for Vue reactivity
  const canvas = shallowRef<ICanvasContent>(history.current)

  const lastResult = ref<OperationResult | null>(null)

  // Version counter to trigger reactivity for computed properties
  const version = ref(0)

  /**
   * Sync canvas ref with history and bump version for reactivity.
   */
  function syncState(): void {
    canvas.value = history.current
    version.value++
  }

  function execute(operation: CanvasOperation): OperationResult {
    const result = history.execute(operation)
    lastResult.value = result
    syncState()
    return result
  }

  function executeBatch(operations: CanvasOperation[]): OperationResult {
    const result = history.executeBatch(operations)
    lastResult.value = result
    syncState()
    return result
  }

  function undo(): OperationResult {
    const result = history.undo()
    lastResult.value = result
    syncState()
    return result
  }

  function redo(): OperationResult {
    const result = history.redo()
    lastResult.value = result
    syncState()
    return result
  }

  function checkpoint(): number {
    return history.checkpoint()
  }

  function revertTo(checkpoint: number): OperationResult {
    const result = history.revertTo(checkpoint)
    lastResult.value = result
    syncState()
    return result
  }

  function reset(newCanvas: ICanvasContent): void {
    history = new SnapshotHistory(newCanvas, historyOptions)
    canvas.value = history.current
    lastResult.value = null
    version.value++
  }

  function clearHistory(): void {
    history.clear()
    version.value++
  }

  // Reactive computed properties
  const canUndo = computed(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    version.value // Dependency for reactivity
    return history.canUndo()
  })

  const canRedo = computed(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    version.value // Dependency for reactivity
    return history.canRedo()
  })

  const undoStackSize = computed(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    version.value // Dependency for reactivity
    return history.undoSize
  })

  const redoStackSize = computed(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    version.value // Dependency for reactivity
    return history.redoSize
  })

  const historyEntries = computed(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    version.value // Dependency for reactivity
    return history.getEntries()
  })

  function goToHistoryEntry(index: number): OperationResult {
    const result = history.goToEntry(index)
    lastResult.value = result
    syncState()
    return result
  }

  return {
    canvas,
    execute,
    executeBatch,
    undo,
    redo,
    canUndo,
    canRedo,
    checkpoint,
    revertTo,
    lastResult,
    reset,
    clearHistory,
    undoStackSize,
    redoStackSize,
    historyEntries,
    goToHistoryEntry,
  }
}
