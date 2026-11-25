// =============================================================================
// Delete Edges Operation
// =============================================================================

import type { ICanvasContent } from '../../types.ts'
import type { DeleteEdgesOperation, HandlerResult } from '../types.ts'
import { handlerFailure, handlerSuccess } from '../types.ts'
import { edgeExists } from './helpers.ts'

export function handleDeleteEdges(canvas: ICanvasContent, op: DeleteEdgesOperation): HandlerResult {
  // Validate all edges exist
  for (const edgeId of op.edgeIds) {
    if (!edgeExists(canvas, edgeId)) {
      return handlerFailure('EDGE_NOT_FOUND', `Edge with ID "${edgeId}" not found`)
    }
  }

  const edgeIdSet = new Set(op.edgeIds)

  // Remove the edges
  canvas.edges = canvas.edges.filter((edge) => !edgeIdSet.has(edge.id))

  return handlerSuccess()
}
