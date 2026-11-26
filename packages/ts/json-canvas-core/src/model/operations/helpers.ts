// =============================================================================
// Shared Helpers for Operations
// =============================================================================

import type { ICanvasContent, INode } from '../../types.ts'
import type { HandlerResult } from '../types.ts'
import { handlerFailure } from '../types.ts'

// =============================================================================
// ID Generation
// =============================================================================

/** Generate a random hex ID for nodes/edges. */
export function generateId(): string {
  return Math.random().toString(16).slice(2, 14)
}

// =============================================================================
// Lookup Helpers
// =============================================================================

export function findNodeIndex(canvas: ICanvasContent, nodeId: string): number {
  return canvas.nodes.findIndex((n) => n.id === nodeId)
}

export function findEdgeIndex(canvas: ICanvasContent, edgeId: string): number {
  return canvas.edges.findIndex((e) => e.id === edgeId)
}

export function nodeExists(canvas: ICanvasContent, nodeId: string): boolean {
  return findNodeIndex(canvas, nodeId) !== -1
}

export function edgeExists(canvas: ICanvasContent, edgeId: string): boolean {
  return findEdgeIndex(canvas, edgeId) !== -1
}

export function getNode(canvas: ICanvasContent, nodeId: string): INode | undefined {
  const index = findNodeIndex(canvas, nodeId)
  return index !== -1 ? canvas.nodes[index] : undefined
}

// =============================================================================
// Id Lists
// =============================================================================

/** The ids with repeats dropped, in first-seen order. An id listed twice counts once. */
export function distinctIds(ids: readonly string[]): string[] {
  return [...new Set(ids)]
}

// =============================================================================
// Geometry Validation
// =============================================================================

/** A failure when `value` is not a finite coordinate, otherwise undefined. */
export function badPosition(field: string, value: unknown): HandlerResult | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return handlerFailure('INVALID_POSITION', `${field} must be a finite number`)
  }
  return undefined
}

/** A failure when `value` is not a positive finite size, otherwise undefined. */
export function badDimension(field: string, value: unknown): HandlerResult | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return handlerFailure('INVALID_DIMENSIONS', `${field} must be a positive finite number`)
  }
  return undefined
}
