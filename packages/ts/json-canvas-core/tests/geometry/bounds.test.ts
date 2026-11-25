import { describe, expect, it } from 'vitest'
import type { INode } from '../../src/types.ts'
import { getBoundingBoxFromNodes, getBoundingBoxFromRects } from '../../src/geometry/bounds.ts'

describe('getBoundingBoxFromNodes', () => {
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

  it('should return null for empty array', () => {
    expect(getBoundingBoxFromNodes([])).toBeNull()
  })

  it('should return correct bounds for single node', () => {
    const nodes = [createMockNode('n1', 100, 100, 200, 150)]
    const bounds = getBoundingBoxFromNodes(nodes)

    expect(bounds).toEqual({
      left: 100,
      top: 100,
      right: 300,
      bottom: 250,
      centerX: 200,
      centerY: 175,
      width: 200,
      height: 150,
    })
  })

  it('should return correct bounds for multiple nodes', () => {
    const nodes = [
      createMockNode('n1', 0, 0, 100, 100),
      createMockNode('n2', 200, 50, 100, 100),
      createMockNode('n3', 50, 200, 100, 100),
    ]
    const bounds = getBoundingBoxFromNodes(nodes)

    expect(bounds).toEqual({
      left: 0,
      top: 0,
      right: 300,
      bottom: 300,
      centerX: 150,
      centerY: 150,
      width: 300,
      height: 300,
    })
  })

  it('should handle overlapping nodes', () => {
    const nodes = [createMockNode('n1', 0, 0, 150, 150), createMockNode('n2', 50, 50, 150, 150)]
    const bounds = getBoundingBoxFromNodes(nodes)

    expect(bounds).toEqual({
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      centerX: 100,
      centerY: 100,
      width: 200,
      height: 200,
    })
  })

  it('should handle negative coordinates', () => {
    const nodes = [createMockNode('n1', -100, -100, 50, 50), createMockNode('n2', 50, 50, 50, 50)]
    const bounds = getBoundingBoxFromNodes(nodes)

    expect(bounds).toEqual({
      left: -100,
      top: -100,
      right: 100,
      bottom: 100,
      centerX: 0,
      centerY: 0,
      width: 200,
      height: 200,
    })
  })
})

describe('getBoundingBoxFromRects', () => {
  it('should return null for empty array', () => {
    expect(getBoundingBoxFromRects([])).toBeNull()
  })

  it('should return correct bounds for single rect', () => {
    const rects = [{ x: 50, y: 50, width: 100, height: 80 }]
    const bounds = getBoundingBoxFromRects(rects)

    expect(bounds).toEqual({
      left: 50,
      top: 50,
      right: 150,
      bottom: 130,
      centerX: 100,
      centerY: 90,
      width: 100,
      height: 80,
    })
  })

  it('should return correct bounds for multiple rects', () => {
    const rects = [
      { x: 0, y: 0, width: 50, height: 50 },
      { x: 100, y: 100, width: 50, height: 50 },
    ]
    const bounds = getBoundingBoxFromRects(rects)

    expect(bounds).toEqual({
      left: 0,
      top: 0,
      right: 150,
      bottom: 150,
      centerX: 75,
      centerY: 75,
      width: 150,
      height: 150,
    })
  })
})
