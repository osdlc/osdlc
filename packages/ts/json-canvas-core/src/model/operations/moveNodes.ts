// =============================================================================
// Move Nodes Operation
// =============================================================================

import type { ICanvasContent, INode } from '../../types.ts'
import type { HandlerResult, MoveNodesOperation } from '../types.ts'
import { handlerFailure, handlerSuccess } from '../types.ts'
import { badPosition, distinctIds, getNode } from './helpers.ts'

export function handleMoveNodes(canvas: ICanvasContent, op: MoveNodesOperation): HandlerResult {
  const badDelta = badPosition('deltaX', op.deltaX) ?? badPosition('deltaY', op.deltaY)
  if (badDelta) {
    return badDelta
  }

  const nodeIds = distinctIds(op.nodeIds)

  // Validate all nodes exist. Holding the drafts rather than their indices
  // makes the miss check the narrowing, so the mutation below needs no guard.
  const nodes: INode[] = []
  for (const nodeId of nodeIds) {
    const node = getNode(canvas, nodeId)
    if (!node) {
      return handlerFailure('NODE_NOT_FOUND', `Node with ID "${nodeId}" not found`)
    }
    nodes.push(node)
  }

  // Apply moves
  for (const node of nodes) {
    node.x += op.deltaX
    node.y += op.deltaY
  }

  return handlerSuccess()
}
