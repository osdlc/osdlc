import { describe, expect, it } from 'vitest'
import type { INode } from '../../src/types.ts'
import {
  nodeIntersectsRect,
  pointInRect,
  rectIntersectsRect,
} from '../../src/geometry/intersection.ts'

describe('rectIntersectsRect', () => {
  it('should return true for overlapping rectangles', () => {
    const a = { x: 0, y: 0, width: 100, height: 100 }
    const b = { x: 50, y: 50, width: 100, height: 100 }
    expect(rectIntersectsRect(a, b)).toBe(true)
  })

  it('should return true for touching rectangles (edges)', () => {
    const a = { x: 0, y: 0, width: 100, height: 100 }
    const b = { x: 100, y: 0, width: 100, height: 100 }
    expect(rectIntersectsRect(a, b)).toBe(true)
  })

  it('should return true for touching rectangles (corners)', () => {
    const a = { x: 0, y: 0, width: 100, height: 100 }
    const b = { x: 100, y: 100, width: 100, height: 100 }
    expect(rectIntersectsRect(a, b)).toBe(true)
  })

  it('should return false for non-overlapping rectangles (horizontal gap)', () => {
    const a = { x: 0, y: 0, width: 100, height: 100 }
    const b = { x: 200, y: 0, width: 100, height: 100 }
    expect(rectIntersectsRect(a, b)).toBe(false)
  })

  it('should return false for non-overlapping rectangles (vertical gap)', () => {
    const a = { x: 0, y: 0, width: 100, height: 100 }
    const b = { x: 0, y: 200, width: 100, height: 100 }
    expect(rectIntersectsRect(a, b)).toBe(false)
  })

  it('should return true when one rectangle contains another', () => {
    const a = { x: 0, y: 0, width: 200, height: 200 }
    const b = { x: 50, y: 50, width: 50, height: 50 }
    expect(rectIntersectsRect(a, b)).toBe(true)
    expect(rectIntersectsRect(b, a)).toBe(true)
  })

  it('should handle negative coordinates', () => {
    const a = { x: -100, y: -100, width: 150, height: 150 }
    const b = { x: -50, y: -50, width: 100, height: 100 }
    expect(rectIntersectsRect(a, b)).toBe(true)
  })
})

describe('pointInRect', () => {
  const rect = { x: 100, y: 100, width: 200, height: 150 }

  it('should return true for point inside rectangle', () => {
    expect(pointInRect({ x: 150, y: 150 }, rect)).toBe(true)
  })

  it('should return true for point on rectangle edge', () => {
    expect(pointInRect({ x: 100, y: 150 }, rect)).toBe(true) // left edge
    expect(pointInRect({ x: 300, y: 150 }, rect)).toBe(true) // right edge
    expect(pointInRect({ x: 200, y: 100 }, rect)).toBe(true) // top edge
    expect(pointInRect({ x: 200, y: 250 }, rect)).toBe(true) // bottom edge
  })

  it('should return true for point on rectangle corner', () => {
    expect(pointInRect({ x: 100, y: 100 }, rect)).toBe(true) // top-left
    expect(pointInRect({ x: 300, y: 100 }, rect)).toBe(true) // top-right
    expect(pointInRect({ x: 100, y: 250 }, rect)).toBe(true) // bottom-left
    expect(pointInRect({ x: 300, y: 250 }, rect)).toBe(true) // bottom-right
  })

  it('should return false for point outside rectangle', () => {
    expect(pointInRect({ x: 50, y: 150 }, rect)).toBe(false)
    expect(pointInRect({ x: 350, y: 150 }, rect)).toBe(false)
    expect(pointInRect({ x: 200, y: 50 }, rect)).toBe(false)
    expect(pointInRect({ x: 200, y: 300 }, rect)).toBe(false)
  })

  describe('with boundary expansion', () => {
    it('should include points within boundary distance', () => {
      expect(pointInRect({ x: 95, y: 150 }, rect, 10)).toBe(true)
      expect(pointInRect({ x: 305, y: 150 }, rect, 10)).toBe(true)
    })

    it('should exclude points beyond boundary distance', () => {
      expect(pointInRect({ x: 85, y: 150 }, rect, 10)).toBe(false)
      expect(pointInRect({ x: 315, y: 150 }, rect, 10)).toBe(false)
    })
  })
})

describe('nodeIntersectsRect', () => {
  const createMockNode = (x: number, y: number, width: number, height: number): INode => ({
    id: 'test-node',
    type: 'text',
    x,
    y,
    width,
    height,
    text: 'test',
  })

  it('should return true when node intersects selection rect', () => {
    const node = createMockNode(100, 100, 200, 150)
    const selectionRect = { x: 150, y: 150, width: 100, height: 100 }
    expect(nodeIntersectsRect(node, selectionRect)).toBe(true)
  })

  it('should return true when selection rect contains node', () => {
    const node = createMockNode(100, 100, 50, 50)
    const selectionRect = { x: 50, y: 50, width: 200, height: 200 }
    expect(nodeIntersectsRect(node, selectionRect)).toBe(true)
  })

  it('should return true when node contains selection rect', () => {
    const node = createMockNode(0, 0, 500, 500)
    const selectionRect = { x: 100, y: 100, width: 50, height: 50 }
    expect(nodeIntersectsRect(node, selectionRect)).toBe(true)
  })

  it('should return false when node is completely outside selection rect', () => {
    const node = createMockNode(0, 0, 100, 100)
    const selectionRect = { x: 200, y: 200, width: 100, height: 100 }
    expect(nodeIntersectsRect(node, selectionRect)).toBe(false)
  })
})
