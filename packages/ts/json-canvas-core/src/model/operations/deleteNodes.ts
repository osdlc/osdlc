// =============================================================================
// Delete Nodes Operation
// =============================================================================

import type { ICanvasContent } from '../../types.ts'
import type { DeleteNodesOperation, HandlerResult } from '../types.ts'
import { handlerFailure, handlerSuccess } from '../types.ts'
import { nodeExists } from './helpers.ts'

export function handleDeleteNodes(canvas: ICanvasContent, op: DeleteNodesOperation): HandlerResult {
  // Validate all nodes exist
  for (const nodeId of op.nodeIds) {
    if (!nodeExists(canvas, nodeId)) {
      return handlerFailure('NODE_NOT_FOUND', `Node with ID "${nodeId}" not found`)
    }
  }

  const nodeIdSet = new Set(op.nodeIds)

  // Remove connected edges first
  canvas.edges = canvas.edges.filter(
    (edge) => !nodeIdSet.has(edge.fromNode) && !nodeIdSet.has(edge.toNode),
  )

  // Remove the nodes
  canvas.nodes = canvas.nodes.filter((node) => !nodeIdSet.has(node.id))

  return handlerSuccess()
}
