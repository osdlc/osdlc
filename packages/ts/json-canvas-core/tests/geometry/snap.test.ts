import { describe, expect, it } from 'vitest'
import type { INode } from '../../src/types.ts'
import { calculateSnap } from '../../src/geometry/snap.ts'
import type { BoundingBox } from '../../src/geometry/types.ts'

describe('calculateSnap', () => {
  const createMockNode = (
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): INode => ({
    id,
    type: 'text',
    x,
    y,
    width,
    height,
    text: 'test',
  })

  const createBounds = (left: number, top: number, width: number, height: number): BoundingBox => ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    centerX: left + width / 2,
    centerY: top + height / 2,
    width,
    height,
  })

  describe('no snap when no targets', () => {
    it('should return original deltas when no target nodes', () => {
      const dragBounds = createBounds(100, 100, 200, 150)
      const result = calculateSnap(dragBounds, [], 50, 30, 8)

      expect(result.dx).toBe(50)
      expect(result.dy).toBe(30)
      expect(result.guides).toHaveLength(0)
    })
  })

  describe('horizontal snap (left edge to left edge)', () => {
    it('should snap when within threshold', () => {
      const dragBounds = createBounds(100, 100, 100, 100)
      const targetNode = createMockNode('target', 205, 300, 100, 100)

      // Moving right by 100px would put left edge at 200
      // Target left edge is at 205, diff is 5 (within threshold of 8)
      const result = calculateSnap(dragBounds, [targetNode], 100, 0, 8)

      expect(result.dx).toBe(105) // 100 + 5 to align
      expect(result.guides).toContainEqual({
        type: 'vertical',
        position: 205,
        alignment: 'edge',
      })
    })

    it('should not snap when beyond threshold', () => {
      const dragBounds = createBounds(100, 100, 100, 100)
      const targetNode = createMockNode('target', 220, 300, 100, 100)

      // Moving right by 100px would put left edge at 200
      // Target left edge is at 220, diff is 20 (beyond threshold of 8)
      const result = calculateSnap(dragBounds, [targetNode], 100, 0, 8)

      expect(result.dx).toBe(100) // No adjustment
      expect(result.guides).toHaveLength(0)
    })
  })

  describe('horizontal snap (right edge to right edge)', () => {
    it('should snap right edges', () => {
      // Drag: left=100, right=200
      const dragBounds = createBounds(100, 100, 100, 100)
      // Target: left=50, right=205
      // Position left edge far from drag's left (100) to avoid left-left snap
      const targetNode = createMockNode('target', 50, 300, 155, 100)

      // With dx=0: projRight=200, target right=205, diff=5
      // projLeft=100 vs node.x=50 → diff=-50, not within threshold
      const result = calculateSnap(dragBounds, [targetNode], 0, 0, 8)

      expect(result.dx).toBe(5)
      expect(result.guides).toContainEqual({
        type: 'vertical',
        position: 205,
        alignment: 'edge',
      })
    })
  })

  describe('horizontal snap (left edge to right edge)', () => {
    it('should snap left to right edge', () => {
      const dragBounds = createBounds(200, 100, 100, 100)
      const targetNode = createMockNode('target', 0, 300, 195, 100)

      // Drag bounds left is at 200, target right is at 195, diff is -5
      const result = calculateSnap(dragBounds, [targetNode], 0, 0, 8)

      expect(result.dx).toBe(-5)
    })
  })

  describe('horizontal snap (center to center)', () => {
    it('should snap center X alignment', () => {
      // Drag: left=100, right=200, centerX=150
      const dragBounds = createBounds(100, 100, 100, 100)
      // Target: left=30, right=280, centerX=155
      // Position edges far from drag's edges to only trigger center snap
      const targetNode = createMockNode('target', 30, 300, 250, 100)
      // Target centerX = 30 + 125 = 155, diff from 150 is 5

      const result = calculateSnap(dragBounds, [targetNode], 0, 0, 8)

      expect(result.dx).toBe(5)
      expect(result.guides).toContainEqual({
        type: 'vertical',
        position: 155,
        alignment: 'center',
      })
    })
  })

  describe('vertical snap (top edge to top edge)', () => {
    it('should snap when within threshold', () => {
      const dragBounds = createBounds(100, 100, 100, 100)
      const targetNode = createMockNode('target', 300, 105, 100, 100)

      // Moving down by 0 keeps top at 100
      // Target top is at 105, diff is 5
      const result = calculateSnap(dragBounds, [targetNode], 0, 0, 8)

      expect(result.dy).toBe(5)
      expect(result.guides).toContainEqual({
        type: 'horizontal',
        position: 105,
        alignment: 'edge',
      })
    })
  })

  describe('vertical snap (bottom edge to bottom edge)', () => {
    it('should snap bottom edges', () => {
      // Drag: top=100, bottom=200
      const dragBounds = createBounds(100, 100, 100, 100)
      // Target: top=50, bottom=205
      // Position top edge far from drag's top (100) to avoid top-top snap
      const targetNode = createMockNode('target', 300, 50, 100, 155)
      // Target bottom = 50 + 155 = 205, diff from 200 is 5

      const result = calculateSnap(dragBounds, [targetNode], 0, 0, 8)

      expect(result.dy).toBe(5)
      expect(result.guides).toContainEqual({
        type: 'horizontal',
        position: 205,
        alignment: 'edge',
      })
    })
  })

  describe('vertical snap (center to center)', () => {
    it('should snap center Y alignment', () => {
      // Drag: top=100, bottom=200, centerY=150
      const dragBounds = createBounds(100, 100, 100, 100)
      // Target: top=30, bottom=280, centerY=155
      // Position edges far from drag's edges to only trigger center snap
      const targetNode = createMockNode('target', 300, 30, 100, 250)
      // Target centerY = 30 + 125 = 155, diff from 150 is 5

      const result = calculateSnap(dragBounds, [targetNode], 0, 0, 8)

      expect(result.dy).toBe(5)
      expect(result.guides).toContainEqual({
        type: 'horizontal',
        position: 155,
        alignment: 'center',
      })
    })
  })

  describe('combined horizontal and vertical snap', () => {
    it('should snap both axes simultaneously', () => {
      const dragBounds = createBounds(100, 100, 100, 100)
      const targetNode = createMockNode('target', 105, 105, 100, 100)

      const result = calculateSnap(dragBounds, [targetNode], 0, 0, 8)

      expect(result.dx).toBe(5)
      expect(result.dy).toBe(5)
      expect(result.guides).toHaveLength(2)
    })
  })

  describe('multiple target nodes', () => {
    it('should snap to first match found per node (last node with match wins)', () => {
      const dragBounds = createBounds(100, 100, 100, 100)
      // Only first node has a snap target within threshold
      const targetNode1 = createMockNode('target1', 103, 300, 100, 100)
      // Second node is far outside threshold (all edges and center are > 8px away)
      const targetNode2 = createMockNode('target2', 500, 300, 100, 100)

      const result = calculateSnap(dragBounds, [targetNode1, targetNode2], 0, 0, 8)

      // Should snap to node1's left edge at 103
      expect(result.dx).toBe(3)
    })

    it('should use last matching node when multiple nodes match', () => {
      const dragBounds = createBounds(100, 100, 100, 100)
      const targetNode1 = createMockNode('target1', 103, 300, 100, 100)
      const targetNode2 = createMockNode('target2', 106, 300, 100, 100)

      const result = calculateSnap(dragBounds, [targetNode1, targetNode2], 0, 0, 8)

      // Algorithm iterates through all nodes; last matching node wins
      expect(result.dx).toBe(6)
    })

    it('should only return guides that describe the applied delta', () => {
      const dragBounds = createBounds(100, 100, 100, 100)
      const targetNode1 = createMockNode('target1', 103, 300, 100, 100)
      const targetNode2 = createMockNode('target2', 106, 300, 100, 100)

      const result = calculateSnap(dragBounds, [targetNode1, targetNode2], 0, 0, 8)

      // dx=6 lands the left edge on 106, so 103 is no longer an alignment
      expect(result.dx).toBe(6)
      expect(result.guides).toEqual([{ type: 'vertical', position: 106, alignment: 'edge' }])
    })

    it('should keep every guide that shares the applied delta', () => {
      // Left edge aligns with target1.x, right edge with target2's right edge.
      // Both describe the same ~0.01 delta, but the two subtractions differ in
      // floating-point representation, so the survivor check needs a tolerance.
      const dragBounds = createBounds(100, 100, 100, 100)
      const targetNode1 = createMockNode('target1', 100.01, 300, 100, 100)
      const targetNode2 = createMockNode('target2', 150.01, 300, 50, 100)

      const result = calculateSnap(dragBounds, [targetNode1, targetNode2], 0, 0, 8)

      const verticalGuides = result.guides.filter((g) => g.type === 'vertical')
      expect(verticalGuides.map((g) => g.position)).toEqual([100.01, 200.01])
    })

    it('should return guides in target-node order, not grouped by axis', () => {
      const dragBounds = createBounds(100, 100, 100, 100)
      // First node aligns only on the y axis, second only on the x axis.
      const yOnly = createMockNode('yOnly', 500, 103, 100, 100)
      const xOnly = createMockNode('xOnly', 103, 900, 100, 100)

      const result = calculateSnap(dragBounds, [yOnly, xOnly], 0, 0, 8)

      expect(result.guides).toEqual([
        { type: 'horizontal', position: 103, alignment: 'edge' },
        { type: 'vertical', position: 103, alignment: 'edge' },
      ])
    })

    it('should treat sub-ulp delta gaps as one alignment at large coordinates', () => {
      // At x ~ 1e10 one ulp is ~1.9e-6, so two deltas a couple of ulps apart
      // are indistinguishable noise, not competing alignments. A fixed 1e-6
      // tolerance would call them different and drop the first guide.
      const left = 1e10
      const width = 1000
      const right = left + width
      const dragBounds = createBounds(left, 100, width, 100)
      const twoUlps = 2 ** -18 // 3.81e-6, two ulps at this magnitude

      const targetNode1 = createMockNode('target1', left + 3, 300, 100, 100)
      // Right edge lands on right + 3 + twoUlps.
      const targetNode2 = createMockNode('target2', right + 3 + twoUlps - 100, 300, 100, 100)

      const result = calculateSnap(dragBounds, [targetNode1, targetNode2], 0, 0, 8)

      const verticalGuides = result.guides.filter((g) => g.type === 'vertical')
      expect(verticalGuides).toHaveLength(2)
      expect(verticalGuides[0]?.position).toBe(left + 3)
    })

    it('should still drop overridden guides at large coordinates', () => {
      // Guards the tolerance against over-relaxing: a real 3px difference at
      // the same magnitude must still override the earlier guide.
      const left = 1e10
      const dragBounds = createBounds(left, 100, 100, 100)
      const targetNode1 = createMockNode('target1', left + 3, 300, 100, 100)
      const targetNode2 = createMockNode('target2', left + 6, 300, 100, 100)

      const result = calculateSnap(dragBounds, [targetNode1, targetNode2], 0, 0, 8)

      expect(result.dx).toBe(6)
      expect(result.guides).toEqual([{ type: 'vertical', position: left + 6, alignment: 'edge' }])
    })
  })

  describe('guide deduplication', () => {
    it('should not create duplicate guides at same position', () => {
      const dragBounds = createBounds(100, 100, 100, 100)
      // Two nodes with same left edge
      const targetNode1 = createMockNode('target1', 105, 200, 100, 100)
      const targetNode2 = createMockNode('target2', 105, 400, 100, 100)

      const result = calculateSnap(dragBounds, [targetNode1, targetNode2], 0, 0, 8)

      // Should only have one vertical guide at 105
      const verticalGuides = result.guides.filter((g) => g.type === 'vertical')
      expect(verticalGuides).toHaveLength(1)
      expect(verticalGuides[0]?.position).toBe(105)
    })
  })

  describe('threshold sensitivity', () => {
    it('should respect different threshold values', () => {
      const dragBounds = createBounds(100, 100, 100, 100)
      const targetNode = createMockNode('target', 110, 300, 100, 100)

      // With threshold 5, diff of 10 should not snap
      const result1 = calculateSnap(dragBounds, [targetNode], 0, 0, 5)
      expect(result1.dx).toBe(0)

      // With threshold 15, diff of 10 should snap
      const result2 = calculateSnap(dragBounds, [targetNode], 0, 0, 15)
      expect(result2.dx).toBe(10)
    })
  })
})
