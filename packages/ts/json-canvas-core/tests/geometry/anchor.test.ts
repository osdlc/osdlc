import { describe, expect, it } from 'vitest'
import { getAnchorPointFromBounds } from '../../src/geometry/anchor.ts'

describe('getAnchorPointFromBounds', () => {
  const bounds = { x: 100, y: 200, width: 50, height: 30 }

  it('returns center of top edge for top side', () => {
    const point = getAnchorPointFromBounds(bounds, 'top')
    expect(point).toEqual({ x: 125, y: 200 })
  })

  it('returns center of bottom edge for bottom side', () => {
    const point = getAnchorPointFromBounds(bounds, 'bottom')
    expect(point).toEqual({ x: 125, y: 230 })
  })

  it('returns center of left edge for left side', () => {
    const point = getAnchorPointFromBounds(bounds, 'left')
    expect(point).toEqual({ x: 100, y: 215 })
  })

  it('returns center of right edge for right side', () => {
    const point = getAnchorPointFromBounds(bounds, 'right')
    expect(point).toEqual({ x: 150, y: 215 })
  })

  it('handles zero-sized bounds', () => {
    const zeroBounds = { x: 0, y: 0, width: 0, height: 0 }
    expect(getAnchorPointFromBounds(zeroBounds, 'top')).toEqual({ x: 0, y: 0 })
    expect(getAnchorPointFromBounds(zeroBounds, 'right')).toEqual({
      x: 0,
      y: 0,
    })
  })

  it('handles negative coordinates', () => {
    const negativeBounds = { x: -100, y: -50, width: 200, height: 100 }
    expect(getAnchorPointFromBounds(negativeBounds, 'top')).toEqual({
      x: 0,
      y: -50,
    })
    expect(getAnchorPointFromBounds(negativeBounds, 'bottom')).toEqual({
      x: 0,
      y: 50,
    })
    expect(getAnchorPointFromBounds(negativeBounds, 'left')).toEqual({
      x: -100,
      y: 0,
    })
    expect(getAnchorPointFromBounds(negativeBounds, 'right')).toEqual({
      x: 100,
      y: 0,
    })
  })
})
