import type { Direction } from '../types.ts'
import type { BezierCurve, Point } from './types.ts'

/**
 * Calculate a point along a cubic bezier curve at parameter t.
 *
 * @param curve - The bezier curve definition
 * @param t - Parameter from 0 to 1 (0 = start, 1 = end)
 * @returns The point on the curve at parameter t
 */
export function bezierPoint(curve: BezierCurve, t: number): Point {
  const mt = 1 - t
  const mt2 = mt * mt
  const mt3 = mt2 * mt
  const t2 = t * t
  const t3 = t2 * t

  return {
    x:
      mt3 * curve.start.x +
      3 * mt2 * t * curve.control1.x +
      3 * mt * t2 * curve.control2.x +
      t3 * curve.end.x,
    y:
      mt3 * curve.start.y +
      3 * mt2 * t * curve.control1.y +
      3 * mt * t2 * curve.control2.y +
      t3 * curve.end.y,
  }
}

/**
 * Calculate the midpoint of a cubic bezier curve.
 *
 * @param curve - The bezier curve definition
 * @returns The point at the middle of the curve (t = 0.5)
 */
export function bezierMidpoint(curve: BezierCurve): Point {
  return bezierPoint(curve, 0.5)
}

/**
 * Calculate bezier control points for an edge between two anchor points.
 * Control points exit/enter perpendicular to the node surface, creating
 * smooth curves that connect nodes naturally.
 *
 * @param from - Start point of the edge
 * @param to - End point of the edge
 * @param fromSide - Side of the source node the edge exits from
 * @param toSide - Side of the target node the edge enters
 * @returns Control points for a cubic bezier curve
 */
export function calculateControlPoints(
  from: Point,
  to: Point,
  fromSide: Direction,
  toSide: Direction,
): { control1: Point; control2: Point } {
  const controlDistance = Math.max(
    Math.abs(to.x - from.x) * 0.4,
    Math.abs(to.y - from.y) * 0.4,
    50, // Minimum control point distance
  )

  const control1 = { ...from }
  switch (fromSide) {
    case 'right':
      control1.x = from.x + controlDistance
      break
    case 'left':
      control1.x = from.x - controlDistance
      break
    case 'top':
      control1.y = from.y - controlDistance
      break
    case 'bottom':
      control1.y = from.y + controlDistance
      break
  }

  const control2 = { ...to }
  switch (toSide) {
    case 'right':
      control2.x = to.x + controlDistance
      break
    case 'left':
      control2.x = to.x - controlDistance
      break
    case 'top':
      control2.y = to.y - controlDistance
      break
    case 'bottom':
      control2.y = to.y + controlDistance
      break
  }

  return { control1, control2 }
}
