// =============================================================================
// Align Nodes Operation
// =============================================================================

import type { ICanvasContent, INode } from '../../types.ts'
import type { AlignNodesOperation, HandlerResult } from '../types.ts'
import { handlerFailure, handlerSuccess } from '../types.ts'
import { distinctIds, getNode } from './helpers.ts'

export function handleAlignNodes(canvas: ICanvasContent, op: AlignNodesOperation): HandlerResult {
  const nodeIds = distinctIds(op.nodeIds)
  if (nodeIds.length < 2) {
    return handlerFailure('INSUFFICIENT_NODES', 'Align requires at least 2 nodes')
  }

  // Validate all nodes exist and collect them
  const nodes: INode[] = []
  for (const nodeId of nodeIds) {
    // `getNode` returns undefined exactly when the index lookup would have
    // returned -1, so the miss check and the narrowing are the same test.
    const node = getNode(canvas, nodeId)
    if (!node) {
      return handlerFailure('NODE_NOT_FOUND', `Node with ID "${nodeId}" not found`)
    }
    nodes.push(node)
  }

  // Calculate alignment target
  switch (op.direction) {
    case 'left': {
      const minX = Math.min(...nodes.map((n) => n.x))
      for (const node of nodes) node.x = minX
      break
    }
    case 'right': {
      const maxRight = Math.max(...nodes.map((n) => n.x + n.width))
      for (const node of nodes) node.x = maxRight - node.width
      break
    }
    case 'top': {
      const minY = Math.min(...nodes.map((n) => n.y))
      for (const node of nodes) node.y = minY
      break
    }
    case 'bottom': {
      const maxBottom = Math.max(...nodes.map((n) => n.y + n.height))
      for (const node of nodes) node.y = maxBottom - node.height
      break
    }
    case 'center-h': {
      const centerX = nodes.reduce((sum, n) => sum + n.x + n.width / 2, 0) / nodes.length
      for (const node of nodes) node.x = centerX - node.width / 2
      break
    }
    case 'center-v': {
      const centerY = nodes.reduce((sum, n) => sum + n.y + n.height / 2, 0) / nodes.length
      for (const node of nodes) node.y = centerY - node.height / 2
      break
    }
  }

  return handlerSuccess()
}
