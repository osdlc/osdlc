import type { INode } from '../types.ts'
import type { Point, Rect } from './types.ts'

/**
 * Test if two rectangles intersect (overlap or touch).
 *
 * @param a - First rectangle
 * @param b - Second rectangle
 * @returns true if the rectangles intersect
 */
export function rectIntersectsRect(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.width < b.x ||
    a.x > b.x + b.width ||
    a.y + a.height < b.y ||
    a.y > b.y + b.height
  )
}

/**
 * Test if a point is within a rectangle.
 * Optionally expands the rectangle by a boundary amount.
 *
 * @param point - The point to test
 * @param rect - The rectangle to test against
 * @param boundary - Optional expansion of the rectangle bounds (default: 0)
 * @returns true if the point is inside the (optionally expanded) rectangle
 */
export function pointInRect(point: Point, rect: Rect, boundary: number = 0): boolean {
  return (
    point.x >= rect.x - boundary &&
    point.x <= rect.x + rect.width + boundary &&
    point.y >= rect.y - boundary &&
    point.y <= rect.y + rect.height + boundary
  )
}

/**
 * Test if a node intersects a selection rectangle.
 * Useful for marquee selection.
 *
 * @param node - The node to test
 * @param rect - The selection rectangle
 * @returns true if the node intersects the rectangle
 */
export function nodeIntersectsRect(node: INode, rect: Rect): boolean {
  return rectIntersectsRect({ x: node.x, y: node.y, width: node.width, height: node.height }, rect)
}
