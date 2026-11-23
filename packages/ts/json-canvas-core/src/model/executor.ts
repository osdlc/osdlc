// =============================================================================
// Operation Executor - Validates and applies operations to canvas using Immer
// =============================================================================

import { produce } from 'immer'
import type { ICanvasContent } from '../types.ts'
import {
  generateId,
  handleAlignNodes,
  handleCreateEdge,
  handleCreateNode,
  handleDeleteEdges,
  handleDeleteNodes,
  handleDistributeNodes,
  handleDuplicateNodes,
  handleMatchNodeSize,
  handleMoveNodes,
  handleResizeNodes,
  handleUpdateEdge,
  handleUpdateNode,
} from './operations/index.ts'
import type { CanvasOperation, CreatedIds, HandlerResult, OperationResult } from './types.ts'
import { handlerSuccess, isOperationError, success } from './types.ts'

export { generateId }

// =============================================================================
// Main Executor
// =============================================================================

/**
 * Execute a single operation on the canvas via Immer, returning the new canvas as a Result.
 *
 * An id listed more than once in an operation's `nodeIds` or `edgeIds` counts once.
 */
export function executeOperation(
  canvas: ICanvasContent,
  operation: CanvasOperation,
): OperationResult {
  let handlerResult: HandlerResult | undefined
  let created: CreatedIds | undefined

  try {
    const newCanvas = produce(canvas, (draft) => {
      switch (operation.type) {
        case 'createNode':
          handlerResult = handleCreateNode(draft, operation)
          break
        case 'deleteNodes':
          handlerResult = handleDeleteNodes(draft, operation)
          break
        case 'updateNode':
          handlerResult = handleUpdateNode(draft, operation)
          break
        case 'moveNodes':
          handlerResult = handleMoveNodes(draft, operation)
          break
        case 'resizeNodes':
          handlerResult = handleResizeNodes(draft, operation)
          break
        case 'alignNodes':
          handlerResult = handleAlignNodes(draft, operation)
          break
        case 'distributeNodes':
          handlerResult = handleDistributeNodes(draft, operation)
          break
        case 'matchNodeSize':
          handlerResult = handleMatchNodeSize(draft, operation)
          break
        case 'duplicateNodes':
          handlerResult = handleDuplicateNodes(draft, operation)
          break
        case 'createEdge':
          handlerResult = handleCreateEdge(draft, operation)
          break
        case 'deleteEdges':
          handlerResult = handleDeleteEdges(draft, operation)
          break
        case 'updateEdge':
          handlerResult = handleUpdateEdge(draft, operation)
          break
        case 'batch':
          for (const childOp of operation.operations) {
            const childResult = executeOperationOnDraft(draft, childOp)
            if (!childResult.ok) {
              handlerResult = childResult
              break
            }
            if (childResult.created) {
              created = mergeCreatedIds(created, childResult.created)
            }
          }
          if (!handlerResult) {
            handlerResult = handlerSuccess(created)
          }
          break
        default: {
          // Exhaustive check - TypeScript will error if we miss a case
          const _exhaustive: never = operation
          handlerResult = {
            ok: false,
            error: {
              code: 'INVALID_OPERATION',
              message: `Unknown operation type: ${(_exhaustive as CanvasOperation).type}`,
            },
          }
        }
      }

      // If handler failed, throw to abort produce()
      if (handlerResult && !handlerResult.ok) {
        throw handlerResult.error
      }

      if (handlerResult?.ok && handlerResult.created) {
        created = handlerResult.created
      }
    })

    return success(newCanvas, created)
  } catch (error) {
    if (isOperationError(error)) {
      return { success: false, error }
    }
    throw error
  }
}

/** Executes an operation on an Immer draft, for batch operations already inside a produce(). */
function executeOperationOnDraft(draft: ICanvasContent, operation: CanvasOperation): HandlerResult {
  switch (operation.type) {
    case 'createNode':
      return handleCreateNode(draft, operation)
    case 'deleteNodes':
      return handleDeleteNodes(draft, operation)
    case 'updateNode':
      return handleUpdateNode(draft, operation)
    case 'moveNodes':
      return handleMoveNodes(draft, operation)
    case 'resizeNodes':
      return handleResizeNodes(draft, operation)
    case 'alignNodes':
      return handleAlignNodes(draft, operation)
    case 'distributeNodes':
      return handleDistributeNodes(draft, operation)
    case 'matchNodeSize':
      return handleMatchNodeSize(draft, operation)
    case 'duplicateNodes':
      return handleDuplicateNodes(draft, operation)
    case 'createEdge':
      return handleCreateEdge(draft, operation)
    case 'deleteEdges':
      return handleDeleteEdges(draft, operation)
    case 'updateEdge':
      return handleUpdateEdge(draft, operation)
    case 'batch': {
      let created: CreatedIds | undefined
      for (const childOp of operation.operations) {
        const result = executeOperationOnDraft(draft, childOp)
        if (!result.ok) {
          return result
        }
        if (result.created) {
          created = mergeCreatedIds(created, result.created)
        }
      }
      return handlerSuccess(created)
    }
    default: {
      const _exhaustive: never = operation
      return {
        ok: false,
        error: {
          code: 'INVALID_OPERATION',
          message: `Unknown operation type: ${(_exhaustive as CanvasOperation).type}`,
        },
      }
    }
  }
}

function mergeCreatedIds(
  a: CreatedIds | undefined,
  b: CreatedIds | undefined,
): CreatedIds | undefined {
  if (!a && !b) return undefined
  if (!a) return b
  if (!b) return a

  // Each key is spread in only when it has a value. Both are optional on
  // CreatedIds, and under exactOptionalPropertyTypes an optional property
  // will not accept an explicit `undefined`.
  const nodeIds = a.nodeIds || b.nodeIds ? [...(a.nodeIds ?? []), ...(b.nodeIds ?? [])] : undefined
  const edgeIds = a.edgeIds || b.edgeIds ? [...(a.edgeIds ?? []), ...(b.edgeIds ?? [])] : undefined

  return {
    ...(nodeIds !== undefined ? { nodeIds } : {}),
    ...(edgeIds !== undefined ? { edgeIds } : {}),
  }
}

/**
 * Execute operations in order within one Immer produce(); stops and returns on
 * the first failure. Created IDs accumulate across every operation, not just
 * the last one to report any.
 */
export function executeBatch(
  canvas: ICanvasContent,
  operations: CanvasOperation[],
): OperationResult {
  return executeOperation(canvas, { type: 'batch', operations })
}
