import { describe, expect, it } from 'vitest'
import { getResizeDirection, RESIZE_CURSORS } from '../../src/geometry/resize.ts'

describe('getResizeDirection', () => {
  const rect = { x: 100, y: 100, width: 200, height: 150 }
  const boundary = 8

  describe('corner detection (priority)', () => {
    it('should detect northwest corner', () => {
      expect(getResizeDirection({ x: 100, y: 100 }, rect, boundary)).toBe('nw')
      expect(getResizeDirection({ x: 105, y: 103 }, rect, boundary)).toBe('nw')
    })

    it('should detect northeast corner', () => {
      expect(getResizeDirection({ x: 300, y: 100 }, rect, boundary)).toBe('ne')
      expect(getResizeDirection({ x: 297, y: 105 }, rect, boundary)).toBe('ne')
    })

    it('should detect southwest corner', () => {
      expect(getResizeDirection({ x: 100, y: 250 }, rect, boundary)).toBe('sw')
      expect(getResizeDirection({ x: 104, y: 247 }, rect, boundary)).toBe('sw')
    })

    it('should detect southeast corner', () => {
      expect(getResizeDirection({ x: 300, y: 250 }, rect, boundary)).toBe('se')
      expect(getResizeDirection({ x: 296, y: 246 }, rect, boundary)).toBe('se')
    })
  })

  describe('edge detection', () => {
    it('should detect north edge', () => {
      expect(getResizeDirection({ x: 200, y: 100 }, rect, boundary)).toBe('n')
      expect(getResizeDirection({ x: 200, y: 103 }, rect, boundary)).toBe('n')
    })

    it('should detect south edge', () => {
      expect(getResizeDirection({ x: 200, y: 250 }, rect, boundary)).toBe('s')
      expect(getResizeDirection({ x: 200, y: 247 }, rect, boundary)).toBe('s')
    })

    it('should detect east edge', () => {
      expect(getResizeDirection({ x: 300, y: 175 }, rect, boundary)).toBe('e')
      expect(getResizeDirection({ x: 297, y: 175 }, rect, boundary)).toBe('e')
    })

    it('should detect west edge', () => {
      expect(getResizeDirection({ x: 100, y: 175 }, rect, boundary)).toBe('w')
      expect(getResizeDirection({ x: 103, y: 175 }, rect, boundary)).toBe('w')
    })
  })

  describe('no resize', () => {
    it('should return null for point inside rect (not near edge)', () => {
      expect(getResizeDirection({ x: 200, y: 175 }, rect, boundary)).toBeNull()
    })

    it('should return null for point far outside rect', () => {
      expect(getResizeDirection({ x: 50, y: 50 }, rect, boundary)).toBeNull()
      expect(getResizeDirection({ x: 400, y: 400 }, rect, boundary)).toBeNull()
    })
  })

  describe('boundary sensitivity', () => {
    it('should respect different boundary sizes', () => {
      const smallBoundary = 2
      const largeBoundary = 20

      // Point at x=105 is within 20px of left edge (100) but not within 2px
      expect(getResizeDirection({ x: 105, y: 175 }, rect, smallBoundary)).toBeNull()
      expect(getResizeDirection({ x: 105, y: 175 }, rect, largeBoundary)).toBe('w')
    })

    it('should leave a central drag area when the boundary is large for the rect', () => {
      // Canvas.vue passes RESIZE_BOUNDARY / scale: 80 canvas units at 10% zoom.
      const node = { x: 0, y: 0, width: 200, height: 100 }
      const wide = 8 / 0.1
      expect(getResizeDirection({ x: 100, y: 50 }, node, wide)).toBeNull()
      expect(getResizeDirection({ x: 100, y: 40 }, node, wide)).toBeNull()
      expect(getResizeDirection({ x: 100, y: 60 }, node, wide)).toBeNull()
      // The edges and the band outside them still resize.
      expect(getResizeDirection({ x: 100, y: 0 }, node, wide)).toBe('n')
      expect(getResizeDirection({ x: 100, y: -70 }, node, wide)).toBe('n')
      expect(getResizeDirection({ x: 100, y: 100 }, node, wide)).toBe('s')
      expect(getResizeDirection({ x: 0, y: 50 }, node, wide)).toBe('w')
      expect(getResizeDirection({ x: 200, y: 50 }, node, wide)).toBe('e')
    })
  })
})

describe('RESIZE_CURSORS', () => {
  it('should have correct cursor for all directions', () => {
    expect(RESIZE_CURSORS.n).toBe('n-resize')
    expect(RESIZE_CURSORS.s).toBe('s-resize')
    expect(RESIZE_CURSORS.e).toBe('e-resize')
    expect(RESIZE_CURSORS.w).toBe('w-resize')
    expect(RESIZE_CURSORS.ne).toBe('ne-resize')
    expect(RESIZE_CURSORS.nw).toBe('nw-resize')
    expect(RESIZE_CURSORS.se).toBe('se-resize')
    expect(RESIZE_CURSORS.sw).toBe('sw-resize')
  })
})
