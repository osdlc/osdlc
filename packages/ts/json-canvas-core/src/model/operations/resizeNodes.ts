// =============================================================================
// Resize Nodes Operation
// =============================================================================

import type { ICanvasContent, INode } from '../../types.ts'
import type { HandlerResult, ResizeNodesOperation } from '../types.ts'
import { handlerFailure, handlerSuccess } from '../types.ts'
import { badDimension, getNode } from './helpers.ts'

export function handleResizeNodes(canvas: ICanvasContent, op: ResizeNodesOperation): HandlerResult {
  const badSize = badDimension('width', op.width) ?? badDimension('height', op.height)
  if (badSize) {
    return badSize
  }

  // Validate all nodes exist. Holding the drafts rather than their indices
  // makes the miss check the narrowing, so the mutation below needs no guard.
  const nodes: INode[] = []
  for (const nodeId of op.nodeIds) {
    const node = getNode(canvas, nodeId)
    if (!node) {
      return handlerFailure('NODE_NOT_FOUND', `Node with ID "${nodeId}" not found`)
    }
    nodes.push(node)
  }

  // Apply resize
  for (const node of nodes) {
    node.width = op.width
    node.height = op.height
  }

  return handlerSuccess()
}
