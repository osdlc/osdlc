import type { INode } from '../types.ts'
import type { BoundingBox, Rect } from './types.ts'

/**
 * Calculate a bounding box from an array of nodes.
 *
 * @param nodes - Array of nodes to calculate bounds for
 * @returns BoundingBox or null if the array is empty
 */
export function getBoundingBoxFromNodes(nodes: INode[]): BoundingBox | null {
  if (nodes.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const node of nodes) {
    minX = Math.min(minX, node.x)
    minY = Math.min(minY, node.y)
    maxX = Math.max(maxX, node.x + node.width)
    maxY = Math.max(maxY, node.y + node.height)
  }

  return {
    left: minX,
    top: minY,
    right: maxX,
    bottom: maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
  }
}

/**
 * Calculate a bounding box from an array of rectangles.
 *
 * @param rects - Array of rectangles to calculate bounds for
 * @returns BoundingBox or null if the array is empty
 */
export function getBoundingBoxFromRects(rects: Rect[]): BoundingBox | null {
  if (rects.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const rect of rects) {
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y)
    maxX = Math.max(maxX, rect.x + rect.width)
    maxY = Math.max(maxY, rect.y + rect.height)
  }

  return {
    left: minX,
    top: minY,
    right: maxX,
    bottom: maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
  }
}
