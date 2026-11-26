// =============================================================================
// @osdlc/json-canvas-core - Framework-agnostic JSON Canvas utilities
// =============================================================================

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type {
  BackgroundStyle,
  Direction,
  // Node update types (for update operations)
  FileNodeUpdate,
  GroupNodeUpdate,
  IBaseNode,
  ICanvasContent,
  IEdge,
  IFileNode,
  IGroupNode,
  ILinkNode,
  INode,
  ITextNode,
  LinkNodeUpdate,
  MarkerType,
  // New node types (for creation operations)
  NewFileNode,
  NewGroupNode,
  NewLinkNode,
  NewNode,
  NewTextNode,
  NodeType,
  NodeUpdate,
  PresetColor,
  TextNodeUpdate,
} from './types.ts'

// -----------------------------------------------------------------------------
// Type Guards and Utilities
// -----------------------------------------------------------------------------

export {
  Colors,
  isFileNode,
  isGroupNode,
  isLinkNode,
  isTextNode,
  resolveColor,
  sortNodesForRendering,
} from './types.ts'

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

export type { ValidationError, ValidationErrorCode, ValidationResult } from './data/validation.ts'

export {
  formatValidationErrors,
  isValidCanvas,
  isValidColor,
  isValidHexColor,
  normalizeCanvas,
  validateCanvasData,
} from './data/validation.ts'

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------

export { getAnchorPoint, type PositionedBox } from './utils/index.ts'

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

export { MAX_SCALE, MIN_SCALE, ZOOM_SPEED } from './config.ts'

// -----------------------------------------------------------------------------
// Operations
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
  // Created IDs for operation results
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
} from './model/index.ts'

export { executeBatch, executeOperation, isOperationError } from './model/index.ts'

// -----------------------------------------------------------------------------
// Operation History
// -----------------------------------------------------------------------------

export type { HistoryEntry, HistoryOptions } from './model/index.ts'

export { SnapshotHistory } from './model/index.ts'

// -----------------------------------------------------------------------------
// Geometry
// -----------------------------------------------------------------------------

export type {
  BezierCurve,
  BoundingBox,
  Point,
  Rect,
  ResizeDirection,
  SnapGuide,
  SnapResult,
} from './geometry/index.ts'

export {
  bezierMidpoint,
  bezierPoint,
  calculateControlPoints,
  calculateSnap,
  getAnchorPointFromBounds,
  getBoundingBoxFromNodes,
  getBoundingBoxFromRects,
  getResizeDirection,
  nodeIntersectsRect,
  pointInRect,
  RESIZE_CURSORS,
  rectIntersectsRect,
} from './geometry/index.ts'

// -----------------------------------------------------------------------------
// ViewModel
// -----------------------------------------------------------------------------

export type {
  SelectionState,
  ViewModelConfig,
  ViewModelEvent,
  ViewportState,
} from './viewmodel/index.ts'

export { CanvasViewModel, DEFAULT_CONFIG, mergeConfig } from './viewmodel/index.ts'
