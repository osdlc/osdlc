// =============================================================================
// Update Edge Operation
// =============================================================================

import { isValidColor } from '../../data/validation.ts'
import type { ICanvasContent } from '../../types.ts'
import type { HandlerResult, UpdateEdgeOperation } from '../types.ts'
import { handlerFailure, handlerSuccess } from '../types.ts'
import { findEdgeIndex, nodeExists } from './helpers.ts'

export function handleUpdateEdge(canvas: ICanvasContent, op: UpdateEdgeOperation): HandlerResult {
  const index = findEdgeIndex(canvas, op.edgeId)
  // Reading the element here rather than testing `index === -1` makes the
  // not-found check and the narrowing the same test: `edges[-1]` is undefined.
  const existing = canvas.edges[index]
  if (!existing) {
    return handlerFailure('EDGE_NOT_FOUND', `Edge with ID "${op.edgeId}" not found`)
  }

  // Validate endpoint nodes if being updated
  if ('fromNode' in op.updates && !nodeExists(canvas, op.updates.fromNode as string)) {
    return handlerFailure('INVALID_EDGE_ENDPOINT', `fromNode "${op.updates.fromNode}" not found`)
  }
  if ('toNode' in op.updates && !nodeExists(canvas, op.updates.toNode as string)) {
    return handlerFailure('INVALID_EDGE_ENDPOINT', `toNode "${op.updates.toNode}" not found`)
  }

  // Validate color if being updated
  if ('color' in op.updates && op.updates.color !== undefined) {
    if (!isValidColor(op.updates.color)) {
      return handlerFailure('INVALID_COLOR', `Invalid color: "${op.updates.color}"`)
    }
  }

  // Apply updates
  canvas.edges[index] = { ...existing, ...op.updates }

  return handlerSuccess()
}
