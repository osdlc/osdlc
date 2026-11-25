import type { Direction } from '../types.ts'
import type { Point } from './types.ts'

/**
 * Calculate anchor point from node bounds (pure function, no DOM).
 *
 * Returns the center point of the specified side of the bounding rectangle.
 *
 * @param bounds - Rectangle with x, y, width, height
 * @param side - Which side of the rectangle to anchor to
 * @returns Point at the center of the specified side
 */
export function getAnchorPointFromBounds(
  bounds: { x: number; y: number; width: number; height: number },
  side: Direction,
): Point {
  switch (side) {
    case 'top':
      return { x: bounds.x + bounds.width / 2, y: bounds.y }
    case 'bottom':
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height }
    case 'left':
      return { x: bounds.x, y: bounds.y + bounds.height / 2 }
    case 'right':
    default:
      return { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 }
  }
}
