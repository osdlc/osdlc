// =============================================================================
// Snapshot History - Simple undo/redo using Immer's structural sharing
// =============================================================================

import type { ICanvasContent } from '../types.ts'
import { executeBatch, executeOperation } from './executor.ts'
import type { CanvasOperation, OperationResult } from './types.ts'
import { failure, success } from './types.ts'

// =============================================================================
// Types
// =============================================================================

/**
 * Internal state for history management.
 */
interface HistoryState {
  past: ICanvasContent[]
  present: ICanvasContent
  future: ICanvasContent[]
}

/** Options for `SnapshotHistory`. */
export interface HistoryOptions {
  /** Maximum number of undo entries to keep. Default: 500 */
  maxSize?: number
}

/**
 * One state in the history, for a list a person can click through: the undo
 * stack, the current state and the redo stack.
 *
 * @experimental The fields may change in any release.
 */
export interface HistoryEntry {
  /** Index in the history (0 = oldest, higher = more recent) */
  index: number
  /** Summary of the canvas state (node and edge counts) */
  summary: string
  /** Whether this is the current state */
  isCurrent: boolean
  /** Whether this is in the undo stack (past) or redo stack (future) */
  position: 'past' | 'current' | 'future'
}

// =============================================================================
// Snapshot History Class
// =============================================================================

/**
 * Undo and redo over canvas snapshots. It holds the current canvas and runs
 * every operation through `executeOperation`, so a failed operation changes
 * nothing.
 *
 * Immer's structural sharing reuses unchanged objects across snapshots, so
 * keeping many costs only what changed, and pruning old ones frees only that.
 */
export class SnapshotHistory {
  private state: HistoryState
  private maxSize: number
  private pruneThreshold: number
  /** Past entries dropped since construction; offsets checkpoint handles. */
  private prunedCount = 0

  constructor(initialCanvas: ICanvasContent, options: HistoryOptions = {}) {
    this.state = {
      past: [],
      present: initialCanvas,
      future: [],
    }
    this.maxSize = options.maxSize ?? 500
    this.pruneThreshold = Math.floor(this.maxSize * 1.2) // Prune when 20% over
  }

  /**
   * Lazy pruning - only prune when significantly over limit.
   */
  private maybePrune(): void {
    if (this.state.past.length > this.pruneThreshold) {
      const excess = this.state.past.length - this.maxSize
      this.state.past.splice(0, excess)
      this.prunedCount += excess
    }
  }

  /**
   * Runs an operation on the current canvas and, when it succeeds and changes something, records it.
   * An operation that changes nothing
   * (Immer hands back the same canvas) adds no entry and keeps the redo stack.
   */
  execute(operation: CanvasOperation): OperationResult {
    const result = executeOperation(this.state.present, operation)

    if (result.success && result.canvas !== this.state.present) {
      // Push current to past, update present, clear future
      this.state.past.push(this.state.present)
      this.state.present = result.canvas
      this.state.future = []

      this.maybePrune()
    }

    return result
  }

  /**
   * Runs several operations as one undo step. Like `execute`, a batch that
   * fails or changes nothing records no step. Created ids from every operation
   * are in the result.
   */
  executeBatch(operations: CanvasOperation[]): OperationResult {
    if (operations.length === 0) {
      return success(this.state.present)
    }

    // A per-operation loop here kept only the last operation's created IDs.
    const result = executeBatch(this.state.present, operations)
    if (!result.success || result.canvas === this.state.present) {
      return result // Failed or changed nothing: leave history alone
    }

    // Single history entry for entire batch
    this.state.past.push(this.state.present)
    this.state.present = result.canvas
    this.state.future = []

    this.maybePrune()

    return result
  }

  /** Steps back to the previous state. Fails with `INVALID_OPERATION` when there is nothing to undo. */
  undo(): OperationResult {
    const previous = this.state.past.pop()
    if (previous === undefined) {
      return failure('INVALID_OPERATION', 'Nothing to undo')
    }

    this.state.future.unshift(this.state.present)
    this.state.present = previous

    return success(this.state.present)
  }

  /** Steps forward to the state `undo` left. Fails with `INVALID_OPERATION` when there is nothing to redo. */
  redo(): OperationResult {
    const next = this.state.future.shift()
    if (next === undefined) {
      return failure('INVALID_OPERATION', 'Nothing to redo')
    }

    this.state.past.push(this.state.present)
    this.state.present = next

    return success(this.state.present)
  }

  /** True when `undo` has a state to go back to. */
  canUndo(): boolean {
    return this.state.past.length > 0
  }

  /** True when `redo` has a state to go forward to. */
  canRedo(): boolean {
    return this.state.future.length > 0
  }

  /**
   * Marks the current state and returns an opaque handle for `revertTo`.
   *
   * The handle counts every past entry ever recorded, including ones pruning
   * has since dropped, so it keeps naming the same state as `past` shifts
   * underneath it. It is not an index into `getEntries()`: do not do
   * arithmetic on it.
   */
  checkpoint(): number {
    return this.prunedCount + this.state.past.length
  }

  /**
   * Returns to the state a checkpoint marked, by undoing everything since. Fails
   * with `INVALID_OPERATION` when pruning or `clear` has dropped that state, and
   * for a value that is not a whole number or is ahead of the current state.
   */
  revertTo(checkpoint: number): OperationResult {
    // A checkpoint is only a position, so after an undo and a new edit drop its branch this
    // succeeds and returns another state. See T-01 in
    // docs/planning/tasks/T-01-checkpoints-name-a-state.md in the package source.
    if (!Number.isInteger(checkpoint)) {
      return failure('INVALID_OPERATION', 'Invalid checkpoint')
    }
    const checkpointIndex = checkpoint - this.prunedCount
    if (checkpointIndex > this.state.past.length) {
      return failure('INVALID_OPERATION', 'Invalid checkpoint')
    }
    if (checkpointIndex < 0) {
      return failure('INVALID_OPERATION', 'Checkpoint state has been discarded by history pruning')
    }

    while (this.state.past.length > checkpointIndex) {
      const result = this.undo()
      if (!result.success) {
        return result
      }
    }

    return success(this.state.present)
  }

  /** The current canvas. */
  get current(): ICanvasContent {
    return this.state.present
  }

  /** Drops the undo and redo stacks and keeps the current canvas. Earlier checkpoints stop working. */
  clear(): void {
    // Keep counting the dropped entries so an earlier checkpoint is rejected
    // instead of naming an unrelated state.
    this.prunedCount += this.state.past.length
    this.state.past = []
    this.state.future = []
  }

  /** How many steps `undo` can go back. */
  get undoSize(): number {
    return this.state.past.length
  }

  /** How many steps `redo` can go forward. */
  get redoSize(): number {
    return this.state.future.length
  }

  /**
   * Every state in the history, oldest to newest, with the current one marked.
   *
   * @experimental The entry shape may change in any release.
   */
  getEntries(): HistoryEntry[] {
    const entries: HistoryEntry[] = []

    // Past entries (oldest first)
    this.state.past.forEach((canvas, i) => {
      entries.push({
        index: i,
        summary: `${canvas.nodes.length} nodes, ${canvas.edges.length} edges`,
        isCurrent: false,
        position: 'past',
      })
    })

    // Current entry
    entries.push({
      index: this.state.past.length,
      summary: `${this.state.present.nodes.length} nodes, ${this.state.present.edges.length} edges`,
      isCurrent: true,
      position: 'current',
    })

    // Future entries (next to redo first)
    this.state.future.forEach((canvas, i) => {
      entries.push({
        index: this.state.past.length + 1 + i,
        summary: `${canvas.nodes.length} nodes, ${canvas.edges.length} edges`,
        isCurrent: false,
        position: 'future',
      })
    })

    return entries
  }

  /**
   * Moves to the state at `targetIndex` in `getEntries()`, by undoing or
   * redoing. 0 is the oldest state. Fails with `INVALID_OPERATION` for an index
   * that is not a whole number in range.
   *
   * @experimental The index scheme may change in any release.
   */
  goToEntry(targetIndex: number): OperationResult {
    const currentIndex = this.state.past.length
    const totalEntries = this.state.past.length + 1 + this.state.future.length

    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= totalEntries) {
      return failure('INVALID_OPERATION', 'Invalid history index')
    }

    if (targetIndex === currentIndex) {
      return success(this.state.present)
    }

    if (targetIndex < currentIndex) {
      // Go back (undo)
      const undoCount = currentIndex - targetIndex
      for (let i = 0; i < undoCount; i++) {
        const result = this.undo()
        if (!result.success) return result
      }
    } else {
      // Go forward (redo)
      const redoCount = targetIndex - currentIndex
      for (let i = 0; i < redoCount; i++) {
        const result = this.redo()
        if (!result.success) return result
      }
    }

    return success(this.state.present)
  }
}
