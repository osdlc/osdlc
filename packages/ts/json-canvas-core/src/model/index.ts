// =============================================================================
// Operations Module - Canvas operation types and utilities
// =============================================================================

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type {
  // Node operations
  AlignDirection,
  AlignNodesOperation,
  // Base
  BaseOperation,
  // Batch
  BatchOperation,
  // Union
  CanvasOperation,
  // Created IDs
  CreatedIds,
  // Edge operations
  CreateEdgeOperation,
  CreateNodeOperation,
  DeleteEdgesOperation,
  DeleteNodesOperation,
  DistributeDirection,
  DistributeNodesOperation,
  DuplicateNodesOperation,
  // Result types
  ErrorCode,
  MatchNodeSizeOperation,
  MoveNodesOperation,
  OperationError,
  OperationResult,
  OperationType,
  ResizeNodesOperation,
  SizeDimension,
  UpdateEdgeOperation,
  UpdateNodeOperation,
} from './types.ts'

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------

export { isOperationError } from './types.ts'

// -----------------------------------------------------------------------------
// Executor
// -----------------------------------------------------------------------------

export { executeBatch, executeOperation } from './executor.ts'

// -----------------------------------------------------------------------------
// History
// -----------------------------------------------------------------------------

export type { HistoryEntry, HistoryOptions } from './history.ts'

export { SnapshotHistory } from './history.ts'
