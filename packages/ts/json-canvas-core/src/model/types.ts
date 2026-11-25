// =============================================================================
// Operation Types - Framework-agnostic canvas operation definitions
// =============================================================================

import type { ICanvasContent, IEdge, NewNode, NodeUpdate } from '../types.ts'

// =============================================================================
// Result Types
// =============================================================================

/**
 * Why an operation failed. A minor release may add values, so a `switch`
 * over it needs a `default` branch.
 */
export type ErrorCode =
  | 'NODE_NOT_FOUND'
  | 'EDGE_NOT_FOUND'
  | 'ID_ALREADY_EXISTS'
  | 'INVALID_COLOR'
  | 'INVALID_POSITION'
  | 'INVALID_DIMENSIONS'
  | 'INVALID_NODE_TYPE'
  | 'INVALID_EDGE_ENDPOINT'
  | 'INVALID_OPERATION'
  | 'INSUFFICIENT_NODES'
  | 'VALIDATION_FAILED'

/** Why an operation failed. */
export interface OperationError {
  /** What went wrong, for a program to branch on. */
  code: ErrorCode
  /** What went wrong, for a person to read. */
  message: string
  /** Extra data some failures carry. Its shape is not part of the API. */
  details?: unknown
}

/** The ids an operation created. Each list is present only when ids were created. */
export interface CreatedIds {
  nodeIds?: string[]
  edgeIds?: string[]
}

/**
 * What an operation returns instead of throwing. Test `success`: `true` carries
 * the new canvas and any created ids, `false` carries the error. The input
 * canvas is never changed.
 */
export type OperationResult =
  | { success: true; canvas: ICanvasContent; created?: CreatedIds }
  | { success: false; error: OperationError }

// =============================================================================
// Helper functions for creating results
// =============================================================================

/** Wraps a new canvas, and any created ids, as a successful `OperationResult`. */
export function success(canvas: ICanvasContent, created?: CreatedIds): OperationResult {
  // `created` is spread in only when supplied. Under
  // exactOptionalPropertyTypes an optional property will not accept an
  // explicit `undefined`, and every reader tests it for truthiness, so an
  // absent key is the same answer.
  return { success: true, canvas, ...(created !== undefined ? { created } : {}) }
}

/** Builds a failed `OperationResult` from an error code and message. */
export function failure(code: ErrorCode, message: string, details?: unknown): OperationResult {
  return { success: false, error: { code, message, details } }
}

/** True when a caught value has the shape of an `OperationError`: a `code` and a `message`. */
export function isOperationError(error: unknown): error is OperationError {
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error
}

// =============================================================================
// Internal Handler Result Type
// =============================================================================

/**
 * Internal result for operation handlers, which mutate the canvas (Immer draft)
 * directly rather than returning a new one. The executor wraps handlers with
 * Immer and produces the final OperationResult.
 */
export type HandlerResult =
  { ok: true; created?: CreatedIds } | { ok: false; error: OperationError }

/** A successful handler result, carrying any created ids. */
export function handlerSuccess(created?: CreatedIds): HandlerResult {
  return { ok: true, ...(created !== undefined ? { created } : {}) }
}

/** A failed handler result with an error code and message. */
export function handlerFailure(code: ErrorCode, message: string, details?: unknown): HandlerResult {
  return { ok: false, error: { code, message, details } }
}

// =============================================================================
// Base Operation Interface
// =============================================================================

/** The shape every operation shares: a `type` that names the operation. */
export interface BaseOperation {
  type: string
}

// =============================================================================
// Node Operations
// =============================================================================

/**
 * Alignment directions for align operation.
 */
export type AlignDirection = 'left' | 'right' | 'top' | 'bottom' | 'center-h' | 'center-v'

/**
 * Distribution directions for distribute operation.
 */
export type DistributeDirection = 'horizontal' | 'vertical'

/**
 * Size dimensions for match size operation.
 */
export type SizeDimension = 'width' | 'height' | 'both'

/**
 * Create a new node. Fails with ID_ALREADY_EXISTS if `id` is given and taken;
 * otherwise a unique ID is generated.
 */
export interface CreateNodeOperation extends BaseOperation {
  type: 'createNode'
  node: NewNode
}

/**
 * Delete nodes by ID.
 * Also removes any edges connected to the deleted nodes.
 */
export interface DeleteNodesOperation extends BaseOperation {
  type: 'deleteNodes'
  nodeIds: string[]
}

/** Update node properties; only those specified change, the rest are untouched. */
export interface UpdateNodeOperation extends BaseOperation {
  type: 'updateNode'
  nodeId: string
  updates: NodeUpdate
}

/**
 * Move nodes by delta values.
 */
export interface MoveNodesOperation extends BaseOperation {
  type: 'moveNodes'
  nodeIds: string[]
  deltaX: number
  deltaY: number
}

/**
 * Resize nodes to new dimensions.
 */
export interface ResizeNodesOperation extends BaseOperation {
  type: 'resizeNodes'
  nodeIds: string[]
  width: number
  height: number
}

/**
 * Align nodes to a common edge or center.
 */
export interface AlignNodesOperation extends BaseOperation {
  type: 'alignNodes'
  nodeIds: string[]
  direction: AlignDirection
}

/**
 * Distribute nodes evenly along an axis.
 * Requires at least 3 nodes.
 */
export interface DistributeNodesOperation extends BaseOperation {
  type: 'distributeNodes'
  nodeIds: string[]
  direction: DistributeDirection
}

/**
 * Match node sizes to the first node in the list.
 */
export interface MatchNodeSizeOperation extends BaseOperation {
  type: 'matchNodeSize'
  nodeIds: string[]
  dimension: SizeDimension
}

/**
 * Duplicate nodes with an offset.
 * Returns the IDs of the newly created nodes.
 */
export interface DuplicateNodesOperation extends BaseOperation {
  type: 'duplicateNodes'
  nodeIds: string[]
  offsetX: number
  offsetY: number
}

// =============================================================================
// Edge Operations
// =============================================================================

/**
 * Create a new edge.
 * If `id` is provided and already exists, operation fails with ID_ALREADY_EXISTS.
 * If `id` is not provided, a unique ID will be generated.
 */
export interface CreateEdgeOperation extends BaseOperation {
  type: 'createEdge'
  edge: Omit<IEdge, 'id'> & { id?: string }
}

/**
 * Delete edges by ID.
 */
export interface DeleteEdgesOperation extends BaseOperation {
  type: 'deleteEdges'
  edgeIds: string[]
}

/**
 * Update edge properties.
 * Only specified properties are updated; others remain unchanged.
 */
export interface UpdateEdgeOperation extends BaseOperation {
  type: 'updateEdge'
  edgeId: string
  updates: Partial<Omit<IEdge, 'id'>>
}

// =============================================================================
// Batch Operation
// =============================================================================

/**
 * Container for multiple operations to execute/undo as a single unit.
 */
export interface BatchOperation extends BaseOperation {
  type: 'batch'
  operations: CanvasOperation[]
}

// =============================================================================
// Canvas Operation Union
// =============================================================================

/** Any operation `executeOperation` accepts. Narrow it on `type`. */
export type CanvasOperation =
  // Node operations
  | CreateNodeOperation
  | DeleteNodesOperation
  | UpdateNodeOperation
  | MoveNodesOperation
  | ResizeNodesOperation
  | AlignNodesOperation
  | DistributeNodesOperation
  | MatchNodeSizeOperation
  | DuplicateNodesOperation
  // Edge operations
  | CreateEdgeOperation
  | DeleteEdgesOperation
  | UpdateEdgeOperation
  // Batch
  | BatchOperation

/** The `type` string of each operation. */
export type OperationType = CanvasOperation['type']
