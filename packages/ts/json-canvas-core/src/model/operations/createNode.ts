// =============================================================================
// Create Node Operation
// =============================================================================

import { isValidColor } from '../../data/validation.ts'
import type { ICanvasContent, INode } from '../../types.ts'
import type { CreateNodeOperation, HandlerResult } from '../types.ts'
import { handlerFailure, handlerSuccess } from '../types.ts'
import { badDimension, badPosition, generateId, nodeExists } from './helpers.ts'

export function handleCreateNode(canvas: ICanvasContent, op: CreateNodeOperation): HandlerResult {
  const id = op.node.id ?? generateId()

  // Check if ID already exists
  if (nodeExists(canvas, id)) {
    return handlerFailure('ID_ALREADY_EXISTS', `Node with ID "${id}" already exists`)
  }

  // Validate color if provided
  if ('color' in op.node && op.node.color !== undefined) {
    if (!isValidColor(op.node.color)) {
      return handlerFailure('INVALID_COLOR', `Invalid color: "${op.node.color}"`)
    }
  }

  // Match handleUpdateNode's guards: without them a zero-size or non-finite
  // node is created here and only rejected when a later frame resizes it.
  const badGeometry =
    badPosition('x', op.node.x) ??
    badPosition('y', op.node.y) ??
    badDimension('width', op.node.width) ??
    badDimension('height', op.node.height)
  if (badGeometry) {
    return badGeometry
  }

  // Create the node with the ID
  const node: INode = { ...op.node, id } as INode

  // Add to canvas (mutates the Immer draft)
  canvas.nodes.push(node)

  return handlerSuccess({ nodeIds: [id] })
}
