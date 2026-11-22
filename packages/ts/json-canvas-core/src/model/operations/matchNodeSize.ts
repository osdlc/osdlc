// =============================================================================
// Match Node Size Operation
// =============================================================================

import type { ICanvasContent, INode } from '../../types.ts'
import type { HandlerResult, MatchNodeSizeOperation } from '../types.ts'
import { handlerFailure, handlerSuccess } from '../types.ts'
import { getNode } from './helpers.ts'

export function handleMatchNodeSize(
  canvas: ICanvasContent,
  op: MatchNodeSizeOperation,
): HandlerResult {
  if (op.nodeIds.length < 2) {
    return handlerFailure('INSUFFICIENT_NODES', 'Match size requires at least 2 nodes')
  }

  // Validate all nodes exist. Holding the drafts rather than their indices
  // makes the miss check the narrowing.
  const nodes: INode[] = []
  for (const nodeId of op.nodeIds) {
    const node = getNode(canvas, nodeId)
    if (!node) {
      return handlerFailure('NODE_NOT_FOUND', `Node with ID "${nodeId}" not found`)
    }
    nodes.push(node)
  }

  // Use first node as reference. `op.nodeIds.length >= 2` was checked above and
  // every id resolved, so `reference` is always present — but destructuring
  // and re-stating the guard costs nothing and cannot go stale.
  const [reference, ...targets] = nodes
  if (!reference) {
    return handlerFailure('INSUFFICIENT_NODES', 'Match size requires at least 2 nodes')
  }

  // Apply to remaining nodes
  for (const node of targets) {
    if (op.dimension === 'width' || op.dimension === 'both') {
      node.width = reference.width
    }
    if (op.dimension === 'height' || op.dimension === 'both') {
      node.height = reference.height
    }
  }

  return handlerSuccess()
}
