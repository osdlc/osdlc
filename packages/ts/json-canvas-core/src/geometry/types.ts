/**
 * A 2D point with x and y coordinates.
 */
export interface Point {
  x: number
  y: number
}

/**
 * A rectangle defined by position and dimensions.
 */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * A bounding box with computed edges and center.
 */
export interface BoundingBox {
  left: number
  top: number
  right: number
  bottom: number
  centerX: number
  centerY: number
  width: number
  height: number
}

/**
 * A snap guide line shown during drag operations.
 */
export interface SnapGuide {
  type: 'horizontal' | 'vertical'
  position: number
  alignment: 'edge' | 'center'
}

/**
 * Result of a snap calculation.
 */
export interface SnapResult {
  dx: number
  dy: number
  guides: SnapGuide[]
}

/** Resize handle direction; null means no resize handle is active. */
export type ResizeDirection = 'n' | 'e' | 's' | 'w' | 'ne' | 'se' | 'sw' | 'nw' | null

/**
 * A cubic bezier curve defined by start, end, and two control points.
 */
export interface BezierCurve {
  start: Point
  control1: Point
  control2: Point
  end: Point
}
