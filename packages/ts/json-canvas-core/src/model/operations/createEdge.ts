// =============================================================================
// Create Edge Operation
// =============================================================================

import { isValidColor } from '../../data/validation.ts'
import type { ICanvasContent, IEdge } from '../../types.ts'
import type { CreateEdgeOperation, HandlerResult } from '../types.ts'
import { handlerFailure, handlerSuccess } from '../types.ts'
import { edgeExists, generateId, nodeExists } from './helpers.ts'

export function handleCreateEdge(canvas: ICanvasContent, op: CreateEdgeOperation): HandlerResult {
  const id = op.edge.id ?? generateId()

  // Check if ID already exists
  if (edgeExists(canvas, id)) {
    return handlerFailure('ID_ALREADY_EXISTS', `Edge with ID "${id}" already exists`)
  }

  // Validate endpoint nodes exist
  if (!nodeExists(canvas, op.edge.fromNode)) {
    return handlerFailure('INVALID_EDGE_ENDPOINT', `fromNode "${op.edge.fromNode}" not found`)
  }
  if (!nodeExists(canvas, op.edge.toNode)) {
    return handlerFailure('INVALID_EDGE_ENDPOINT', `toNode "${op.edge.toNode}" not found`)
  }

  // Validate color if provided
  if (op.edge.color !== undefined && !isValidColor(op.edge.color)) {
    return handlerFailure('INVALID_COLOR', `Invalid color: "${op.edge.color}"`)
  }

  // Create the edge
  const edge: IEdge = { ...op.edge, id }

  // Add to canvas
  canvas.edges.push(edge)

  return handlerSuccess({ edgeIds: [id] })
}
