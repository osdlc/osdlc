import type { Point, Rect, ResizeDirection } from './types.ts'

/**
 * Determine which resize handle (if any) a point is near.
 *
 * @param point - The point to check (in canvas coordinates)
 * @param rect - The rectangle to check against
 * @param boundary - The resize handle boundary size (how close to edge triggers resize).
 *   Outside the rect the band is always this wide; inside it is capped at a
 *   quarter of the rect's width/height, so a large boundary (low zoom) still
 *   leaves a central area that returns null and can be dragged.
 * @returns The resize direction, or null if not near any edge/corner
 */
export function getResizeDirection(point: Point, rect: Rect, boundary: number): ResizeDirection {
  const innerX = Math.min(boundary, rect.width / 4)
  const innerY = Math.min(boundary, rect.height / 4)
  const nearLeft = point.x >= rect.x - boundary && point.x <= rect.x + innerX
  const nearRight =
    point.x >= rect.x + rect.width - innerX && point.x <= rect.x + rect.width + boundary
  const nearTop = point.y >= rect.y - boundary && point.y <= rect.y + innerY
  const nearBottom =
    point.y >= rect.y + rect.height - innerY && point.y <= rect.y + rect.height + boundary

  const inHorizontal = point.x >= rect.x - boundary && point.x <= rect.x + rect.width + boundary
  const inVertical = point.y >= rect.y - boundary && point.y <= rect.y + rect.height + boundary

  // Corner detection (priority over edges)
  if (nearTop && nearLeft) return 'nw'
  if (nearTop && nearRight) return 'ne'
  if (nearBottom && nearLeft) return 'sw'
  if (nearBottom && nearRight) return 'se'

  // Edge detection
  if (nearTop && inHorizontal) return 'n'
  if (nearBottom && inHorizontal) return 's'
  if (nearLeft && inVertical) return 'w'
  if (nearRight && inVertical) return 'e'

  return null
}

/**
 * CSS `cursor` value for each resize handle direction. A `null` direction, no
 * handle, has no entry.
 */
export const RESIZE_CURSORS: Record<NonNullable<ResizeDirection>, string> = {
  n: 'n-resize',
  s: 's-resize',
  e: 'e-resize',
  w: 'w-resize',
  ne: 'ne-resize',
  nw: 'nw-resize',
  se: 'se-resize',
  sw: 'sw-resize',
}
