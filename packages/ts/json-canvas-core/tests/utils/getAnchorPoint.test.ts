import { describe, expect, it } from 'vitest'
import { getAnchorPoint, type PositionedBox } from '../../src/utils/getAnchorPoint.ts'

/**
 * The properties of an element that getAnchorPoint reads.
 */
function createMockElement(
  left: number,
  top: number,
  width: number,
  height: number,
): PositionedBox {
  return {
    style: {
      left: `${left}px`,
      top: `${top}px`,
    },
    offsetWidth: width,
    offsetHeight: height,
  }
}

describe('getAnchorPoint', () => {
  const ARROW_OFFSET = 2

  describe('top side', () => {
    it('should return center-top point with offset', () => {
      const element = createMockElement(100, 100, 200, 100)
      const point = getAnchorPoint(element, 'top')

      expect(point.x).toBe(100 + 200 / 2) // x + width/2
      expect(point.y).toBe(100 - ARROW_OFFSET) // y - offset
    })
  })

  describe('right side', () => {
    it('should return right-center point with offset', () => {
      const element = createMockElement(100, 100, 200, 100)
      const point = getAnchorPoint(element, 'right')

      expect(point.x).toBe(100 + 200 + ARROW_OFFSET) // x + width + offset
      expect(point.y).toBe(100 + 100 / 2) // y + height/2
    })
  })

  describe('bottom side', () => {
    it('should return center-bottom point with offset', () => {
      const element = createMockElement(100, 100, 200, 100)
      const point = getAnchorPoint(element, 'bottom')

      expect(point.x).toBe(100 + 200 / 2) // x + width/2
      expect(point.y).toBe(100 + 100 + ARROW_OFFSET) // y + height + offset
    })
  })

  describe('left side', () => {
    it('should return left-center point with offset', () => {
      const element = createMockElement(100, 100, 200, 100)
      const point = getAnchorPoint(element, 'left')

      expect(point.x).toBe(100 - ARROW_OFFSET) // x - offset
      expect(point.y).toBe(100 + 100 / 2) // y + height/2
    })
  })

  describe('edge cases', () => {
    it('should handle element at origin', () => {
      const element = createMockElement(0, 0, 100, 50)

      expect(getAnchorPoint(element, 'top')).toEqual({
        x: 50,
        y: -ARROW_OFFSET,
      })
      expect(getAnchorPoint(element, 'right')).toEqual({
        x: 100 + ARROW_OFFSET,
        y: 25,
      })
      expect(getAnchorPoint(element, 'bottom')).toEqual({
        x: 50,
        y: 50 + ARROW_OFFSET,
      })
      expect(getAnchorPoint(element, 'left')).toEqual({
        x: -ARROW_OFFSET,
        y: 25,
      })
    })

    it('should handle negative positions', () => {
      const element = createMockElement(-50, -50, 100, 100)
      const point = getAnchorPoint(element, 'top')

      expect(point.x).toBe(-50 + 50) // 0
      expect(point.y).toBe(-50 - ARROW_OFFSET) // -52
    })

    it('should keep the fractional part of the position', () => {
      // CanvasNode writes `${node.x * scale}px`, fractional at most zooms.
      const element = createMockElement(115.5, -10.9, 220, 110)
      const point = getAnchorPoint(element, 'left')

      expect(point.x).toBeCloseTo(115.5 - ARROW_OFFSET)
      expect(point.y).toBeCloseTo(-10.9 + 110 / 2)
    })

    it('should keep fractional positions', () => {
      const element = createMockElement(-12.9, 33.75, 100, 50)
      const point = getAnchorPoint(element, 'left')

      expect(point.x).toBeCloseTo(-12.9 - ARROW_OFFSET)
      expect(point.y).toBeCloseTo(33.75 + 50 / 2)
    })
  })
})
