import { describe, expect, it } from 'vitest'
import { bezierMidpoint, bezierPoint, calculateControlPoints } from '../../src/geometry/bezier.ts'
import type { BezierCurve } from '../../src/geometry/types.ts'

describe('bezierPoint', () => {
  const curve: BezierCurve = {
    start: { x: 0, y: 0 },
    control1: { x: 0, y: 100 },
    control2: { x: 100, y: 100 },
    end: { x: 100, y: 0 },
  }

  it('should return start point at t=0', () => {
    const point = bezierPoint(curve, 0)
    expect(point.x).toBe(0)
    expect(point.y).toBe(0)
  })

  it('should return end point at t=1', () => {
    const point = bezierPoint(curve, 1)
    expect(point.x).toBe(100)
    expect(point.y).toBe(0)
  })

  it('should return midpoint at t=0.5', () => {
    const point = bezierPoint(curve, 0.5)
    // For this symmetric curve, midpoint should be at (50, 75)
    expect(point.x).toBe(50)
    expect(point.y).toBe(75)
  })

  it('should interpolate correctly at t=0.25', () => {
    const point = bezierPoint(curve, 0.25)
    // Using cubic bezier formula
    const t = 0.25
    const mt = 0.75
    const expectedX = 3 * mt * t ** 2 * 100 + t ** 3 * 100
    const expectedY = 3 * mt ** 2 * t * 100 + 3 * mt * t ** 2 * 100

    expect(point.x).toBeCloseTo(expectedX)
    expect(point.y).toBeCloseTo(expectedY)
  })

  describe('straight line', () => {
    const straightCurve: BezierCurve = {
      start: { x: 0, y: 0 },
      control1: { x: 33.33, y: 0 },
      control2: { x: 66.67, y: 0 },
      end: { x: 100, y: 0 },
    }

    it('should produce points on a straight line', () => {
      expect(bezierPoint(straightCurve, 0).y).toBeCloseTo(0)
      expect(bezierPoint(straightCurve, 0.5).y).toBeCloseTo(0)
      expect(bezierPoint(straightCurve, 1).y).toBeCloseTo(0)
    })
  })
})

describe('bezierMidpoint', () => {
  it('should return the midpoint of the curve (t=0.5)', () => {
    const curve: BezierCurve = {
      start: { x: 0, y: 0 },
      control1: { x: 0, y: 100 },
      control2: { x: 100, y: 100 },
      end: { x: 100, y: 0 },
    }

    const midpoint = bezierMidpoint(curve)
    const expected = bezierPoint(curve, 0.5)

    expect(midpoint.x).toBe(expected.x)
    expect(midpoint.y).toBe(expected.y)
  })
})

describe('calculateControlPoints', () => {
  describe('right to left connection', () => {
    it('should extend control points horizontally', () => {
      const from = { x: 100, y: 100 }
      const to = { x: 300, y: 100 }
      const { control1, control2 } = calculateControlPoints(from, to, 'right', 'left')

      expect(control1.x).toBeGreaterThan(from.x)
      expect(control1.y).toBe(from.y)
      expect(control2.x).toBeLessThan(to.x)
      expect(control2.y).toBe(to.y)
    })
  })

  describe('left to right connection', () => {
    it('should extend control points horizontally in opposite direction', () => {
      const from = { x: 300, y: 100 }
      const to = { x: 100, y: 100 }
      const { control1, control2 } = calculateControlPoints(from, to, 'left', 'right')

      expect(control1.x).toBeLessThan(from.x)
      expect(control1.y).toBe(from.y)
      expect(control2.x).toBeGreaterThan(to.x)
      expect(control2.y).toBe(to.y)
    })
  })

  describe('top to bottom connection', () => {
    it('should extend control points vertically', () => {
      const from = { x: 100, y: 300 }
      const to = { x: 100, y: 100 }
      const { control1, control2 } = calculateControlPoints(from, to, 'top', 'bottom')

      expect(control1.x).toBe(from.x)
      expect(control1.y).toBeLessThan(from.y)
      expect(control2.x).toBe(to.x)
      expect(control2.y).toBeGreaterThan(to.y)
    })
  })

  describe('bottom to top connection', () => {
    it('should extend control points vertically in opposite direction', () => {
      const from = { x: 100, y: 100 }
      const to = { x: 100, y: 300 }
      const { control1, control2 } = calculateControlPoints(from, to, 'bottom', 'top')

      expect(control1.x).toBe(from.x)
      expect(control1.y).toBeGreaterThan(from.y)
      expect(control2.x).toBe(to.x)
      expect(control2.y).toBeLessThan(to.y)
    })
  })

  describe('minimum control distance', () => {
    it('should maintain minimum 50px control distance for close points', () => {
      const from = { x: 100, y: 100 }
      const to = { x: 110, y: 100 } // Only 10px apart
      const { control1, control2 } = calculateControlPoints(from, to, 'right', 'left')

      // Control distance should be at least 50 (the minimum)
      expect(control1.x - from.x).toBe(50)
      expect(to.x - control2.x).toBe(50)
    })
  })

  describe('control distance scaling', () => {
    it('should scale control distance with point separation', () => {
      const from = { x: 0, y: 0 }
      const to = { x: 500, y: 0 } // 500px apart horizontally
      const { control1, control2 } = calculateControlPoints(from, to, 'right', 'left')

      // 40% of 500 = 200, which is > 50 minimum
      expect(control1.x - from.x).toBe(200)
      expect(to.x - control2.x).toBe(200)
    })
  })
})
