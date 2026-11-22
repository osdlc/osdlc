// =============================================================================
// Distribute Nodes Operation
// =============================================================================

import type { ICanvasContent, INode } from '../../types.ts'
import type { DistributeNodesOperation, HandlerResult } from '../types.ts'
import { handlerFailure, handlerSuccess } from '../types.ts'
import { getNode } from './helpers.ts'

export function handleDistributeNodes(
  canvas: ICanvasContent,
  op: DistributeNodesOperation,
): HandlerResult {
  if (op.nodeIds.length < 3) {
    return handlerFailure('INSUFFICIENT_NODES', 'Distribute requires at least 3 nodes')
  }

  // Holds draft elements, so the writes below land on the canvas.
  const nodes: INode[] = []
  for (const nodeId of op.nodeIds) {
    const node = getNode(canvas, nodeId)
    if (!node) {
      return handlerFailure('NODE_NOT_FOUND', `Node with ID "${nodeId}" not found`)
    }
    nodes.push(node)
  }

  // The `!first || !last` guards below cannot fire: at least 3 ids were
  // checked above and every one resolved. Kept as guards, not assertions, so
  // they stay correct if that entry check changes.
  if (op.direction === 'horizontal') {
    nodes.sort((a, b) => a.x - b.x)
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (!first || !last) {
      return handlerFailure('INSUFFICIENT_NODES', 'Distribute requires at least 3 nodes')
    }
    const totalSpan = last.x + last.width - first.x
    const totalNodeWidth = nodes.reduce((sum, n) => sum + n.width, 0)
    const gap = (totalSpan - totalNodeWidth) / (nodes.length - 1)

    let currentX = first.x
    for (const node of nodes) {
      node.x = currentX
      currentX += node.width + gap
    }
  } else {
    nodes.sort((a, b) => a.y - b.y)
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (!first || !last) {
      return handlerFailure('INSUFFICIENT_NODES', 'Distribute requires at least 3 nodes')
    }
    const totalSpan = last.y + last.height - first.y
    const totalNodeHeight = nodes.reduce((sum, n) => sum + n.height, 0)
    const gap = (totalSpan - totalNodeHeight) / (nodes.length - 1)

    let currentY = first.y
    for (const node of nodes) {
      node.y = currentY
      currentY += node.height + gap
    }
  }

  return handlerSuccess()
}
