// =============================================================================
// Duplicate Nodes Operation
// =============================================================================

import type { ICanvasContent, INode } from '../../types.ts'
import type { DuplicateNodesOperation, HandlerResult } from '../types.ts'
import { handlerFailure, handlerSuccess } from '../types.ts'
import { badPosition, distinctIds, generateId, getNode } from './helpers.ts'

export function handleDuplicateNodes(
  canvas: ICanvasContent,
  op: DuplicateNodesOperation,
): HandlerResult {
  const badOffset = badPosition('offsetX', op.offsetX) ?? badPosition('offsetY', op.offsetY)
  if (badOffset) {
    return badOffset
  }

  const nodeIds = distinctIds(op.nodeIds)

  // Validate all nodes exist and collect them
  const nodesToDuplicate: INode[] = []
  for (const nodeId of nodeIds) {
    // `getNode` misses exactly when the index lookup would have returned -1.
    const node = getNode(canvas, nodeId)
    if (!node) {
      return handlerFailure('NODE_NOT_FOUND', `Node with ID "${nodeId}" not found`)
    }
    nodesToDuplicate.push(node)
  }

  // Create duplicates
  const newNodeIds: string[] = []
  for (const node of nodesToDuplicate) {
    const newId = generateId()
    const newNode: INode = {
      ...node,
      id: newId,
      x: node.x + op.offsetX,
      y: node.y + op.offsetY,
    }
    canvas.nodes.push(newNode)
    newNodeIds.push(newId)
  }

  return handlerSuccess({ nodeIds: newNodeIds })
}
