// =============================================================================
// Update Node Operation
// =============================================================================

import { isValidColor, validateNode } from '../../data/validation.ts'
import type { ICanvasContent, INode } from '../../types.ts'
import type { HandlerResult, UpdateNodeOperation } from '../types.ts'
import { handlerFailure, handlerSuccess } from '../types.ts'
import { badDimension, badPosition, findNodeIndex } from './helpers.ts'

export function handleUpdateNode(canvas: ICanvasContent, op: UpdateNodeOperation): HandlerResult {
  const index = findNodeIndex(canvas, op.nodeId)
  // Reading the element here rather than testing `index === -1` makes the
  // not-found check and the narrowing the same test: `nodes[-1]` is undefined.
  const existing = canvas.nodes[index]
  if (!existing) {
    return handlerFailure('NODE_NOT_FOUND', `Node with ID "${op.nodeId}" not found`)
  }

  const updates = op.updates as Record<string, unknown>

  if ('color' in updates && updates.color !== undefined) {
    if (!isValidColor(updates.color as string)) {
      return handlerFailure('INVALID_COLOR', `Invalid color: "${updates.color}"`)
    }
  }

  const badGeometry =
    ('x' in updates ? badPosition('x', updates.x) : undefined) ??
    ('y' in updates ? badPosition('y', updates.y) : undefined) ??
    ('width' in updates ? badDimension('width', updates.width) : undefined) ??
    ('height' in updates ? badDimension('height', updates.height) : undefined)
  if (badGeometry) {
    return badGeometry
  }

  // The spread applies an explicitly-undefined value as a deletion, which is
  // how an optional property is cleared. Validate the merged node so the same
  // call cannot strip the property its resulting type requires.
  const merged = { ...existing, ...updates }
  const missing = validateNode(merged, 'node').filter((error) => error.code === 'MISSING_REQUIRED')
  if (missing.length > 0) {
    return handlerFailure('VALIDATION_FAILED', missing.map((error) => error.message).join('; '))
  }

  canvas.nodes[index] = merged as INode

  return handlerSuccess()
}
