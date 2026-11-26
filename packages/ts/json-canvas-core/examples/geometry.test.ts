// Geometry helpers: bounds, hit testing, edge curves, resize handles and snapping.
import { expect, test } from 'vitest'
import {
  bezierMidpoint,
  bezierPoint,
  calculateControlPoints,
  calculateSnap,
  getAnchorPoint,
  getAnchorPointFromBounds,
  getBoundingBoxFromNodes,
  getBoundingBoxFromRects,
  getResizeDirection,
  nodeIntersectsRect,
  pointInRect,
  rectIntersectsRect,
  RESIZE_CURSORS,
  type INode,
} from '@osdlc/json-canvas-core'

const node = (id: string, x: number, y: number, width = 100, height = 50): INode => ({
  id,
  type: 'text',
  x,
  y,
  width,
  height,
  text: id,
})

test('bounding boxes and hit tests', () => {
  // #region bounds
  const nodes = [node('a', 0, 0), node('b', 200, 100)]

  const box = getBoundingBoxFromNodes(nodes)
  expect(box?.width).toEqual(300)
  expect(box?.centerY).toEqual(75)
  expect(getBoundingBoxFromRects([{ x: 0, y: 0, width: 10, height: 10 }])?.right).toEqual(10)
  getBoundingBoxFromNodes([]) // null

  pointInRect({ x: 105, y: 10 }, nodes[0]!, 10) // true: within 10 of the edge
  rectIntersectsRect(nodes[0]!, { x: 90, y: 40, width: 50, height: 50 }) // true
  nodeIntersectsRect(nodes[1]!, { x: 0, y: 0, width: 50, height: 50 }) // false
  // #endregion bounds

  expect(box).toMatchObject({ width: 300, height: 150, centerX: 150, centerY: 75 })
  expect(getBoundingBoxFromRects([{ x: 0, y: 0, width: 10, height: 10 }])?.right).toBe(10)
  expect(getBoundingBoxFromNodes([])).toBeNull()
  expect(pointInRect({ x: 105, y: 10 }, nodes[0]!, 10)).toBe(true)
  expect(pointInRect({ x: 105, y: 10 }, nodes[0]!)).toBe(false)
  expect(rectIntersectsRect(nodes[0]!, { x: 90, y: 40, width: 50, height: 50 })).toBe(true)
  expect(nodeIntersectsRect(nodes[1]!, { x: 0, y: 0, width: 50, height: 50 })).toBe(false)
})

test('an edge curve between two nodes', () => {
  // #region bezier
  const from = getAnchorPointFromBounds({ x: 0, y: 0, width: 100, height: 50 }, 'right')
  const to = getAnchorPointFromBounds({ x: 300, y: 100, width: 100, height: 50 }, 'left')
  const { control1, control2 } = calculateControlPoints(from, to, 'right', 'left')
  const curve = { start: from, control1, control2, end: to }

  bezierPoint(curve, 0) // from
  bezierMidpoint(curve) // the middle, for a label
  // #endregion bezier

  expect(from).toEqual({ x: 100, y: 25 })
  expect(to).toEqual({ x: 300, y: 125 })
  expect(control1.x).toBeGreaterThan(from.x)
  expect(control2.x).toBeLessThan(to.x)
  expect(bezierPoint(curve, 0)).toEqual(from)
  expect(bezierPoint(curve, 1)).toEqual(to)
  expect(bezierMidpoint(curve).x).toBeCloseTo(200)
})

test('an anchor point read from a positioned element', () => {
  // #region anchor
  // In a browser, pass an HTMLElement with inline `left` and `top`. Any object of this shape works.
  const element = { style: { left: '100px', top: '50px' }, offsetWidth: 80, offsetHeight: 40 }

  getAnchorPoint(element, 'right') // { x: 182, y: 70 }: 2 units outside, so arrowheads show
  // #endregion anchor

  expect(getAnchorPoint(element, 'right')).toEqual({ x: 182, y: 70 })
  expect(getAnchorPoint(element, 'top')).toEqual({ x: 140, y: 48 })
})

test('resize handles', () => {
  // #region resize
  const rect = { x: 0, y: 0, width: 200, height: 100 }

  const handle = getResizeDirection({ x: 199, y: 99 }, rect, 8) // 'se'
  const cursor = handle ? RESIZE_CURSORS[handle] : 'default' // 'se-resize'
  getResizeDirection({ x: 100, y: 50 }, rect, 8) // null: the middle drags
  // #endregion resize

  expect(handle).toBe('se')
  expect(cursor).toBe('se-resize')
  expect(getResizeDirection({ x: 100, y: 50 }, rect, 8)).toBeNull()
})

test('snapping a drag to other nodes', () => {
  // #region snap
  const target = node('t', 300, 0)
  const dragged = getBoundingBoxFromNodes([node('d', 0, 0)])!

  // Dragging 195 right leaves the node 5 short of the target's left edge.
  const snap = calculateSnap(dragged, [target], 195, 0, 8)
  expect(snap.dx).toEqual(200) // the right edge now meets the target's left edge
  expect(snap.guides).toContainEqual({ type: 'vertical', position: 300, alignment: 'edge' })
  // #endregion snap

  expect(snap.dx).toBe(200)
  expect(snap.guides).toContainEqual({ type: 'vertical', position: 300, alignment: 'edge' })
})
