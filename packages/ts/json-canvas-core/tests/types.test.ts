import { describe, expect, it } from 'vitest'
import {
  Colors,
  type IFileNode,
  type IGroupNode,
  type ILinkNode,
  type ITextNode,
  isFileNode,
  isGroupNode,
  isLinkNode,
  isTextNode,
  resolveColor,
  sortNodesForRendering,
} from '../src/types.ts'

describe('Colors', () => {
  it('should have 6 preset colors', () => {
    expect(Object.keys(Colors)).toHaveLength(6)
  })

  it('should map preset numbers to hex colors', () => {
    expect(Colors['1']).toBe('#ef4444') // Red
    expect(Colors['2']).toBe('#f97316') // Orange
    expect(Colors['3']).toBe('#eab308') // Yellow
    expect(Colors['4']).toBe('#22c55e') // Green
    expect(Colors['5']).toBe('#06b6d4') // Cyan
    expect(Colors['6']).toBe('#a855f7') // Purple
  })
})

describe('resolveColor', () => {
  it('should return undefined for undefined input', () => {
    expect(resolveColor(undefined)).toBeUndefined()
  })

  it('should resolve preset colors to hex values', () => {
    expect(resolveColor('1')).toBe('#ef4444')
    expect(resolveColor('2')).toBe('#f97316')
    expect(resolveColor('3')).toBe('#eab308')
    expect(resolveColor('4')).toBe('#22c55e')
    expect(resolveColor('5')).toBe('#06b6d4')
    expect(resolveColor('6')).toBe('#a855f7')
  })

  it('should return hex colors as-is', () => {
    expect(resolveColor('#FF0000')).toBe('#FF0000')
    expect(resolveColor('#3b82f6')).toBe('#3b82f6')
    expect(resolveColor('#000')).toBe('#000')
  })

  it('should return unknown values as-is', () => {
    expect(resolveColor('7')).toBe('7')
    expect(resolveColor('invalid')).toBe('invalid')
  })
})

describe('isTextNode', () => {
  it('should return true for text nodes', () => {
    const node: ITextNode = {
      id: 'test',
      type: 'text',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      text: 'Hello',
    }
    expect(isTextNode(node)).toBe(true)
  })

  it('should return false for non-text nodes', () => {
    const fileNode: IFileNode = {
      id: 'test',
      type: 'file',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      file: 'test.md',
    }
    expect(isTextNode(fileNode)).toBe(false)
  })
})

describe('isFileNode', () => {
  it('should return true for file nodes', () => {
    const node: IFileNode = {
      id: 'test',
      type: 'file',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      file: 'test.md',
    }
    expect(isFileNode(node)).toBe(true)
  })

  it('should return true for file nodes with subpath', () => {
    const node: IFileNode = {
      id: 'test',
      type: 'file',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      file: 'test.md',
      subpath: '#heading',
    }
    expect(isFileNode(node)).toBe(true)
  })

  it('should return false for non-file nodes', () => {
    const textNode: ITextNode = {
      id: 'test',
      type: 'text',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      text: 'Hello',
    }
    expect(isFileNode(textNode)).toBe(false)
  })
})

describe('isLinkNode', () => {
  it('should return true for link nodes', () => {
    const node: ILinkNode = {
      id: 'test',
      type: 'link',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      url: 'https://example.com',
    }
    expect(isLinkNode(node)).toBe(true)
  })

  it('should return false for non-link nodes', () => {
    const textNode: ITextNode = {
      id: 'test',
      type: 'text',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      text: 'Hello',
    }
    expect(isLinkNode(textNode)).toBe(false)
  })
})

describe('isGroupNode', () => {
  it('should return true for group nodes', () => {
    const node: IGroupNode = {
      id: 'test',
      type: 'group',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    }
    expect(isGroupNode(node)).toBe(true)
  })

  it('should return true for group nodes with optional properties', () => {
    const node: IGroupNode = {
      id: 'test',
      type: 'group',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      label: 'My Group',
      background: 'image.png',
      backgroundStyle: 'cover',
    }
    expect(isGroupNode(node)).toBe(true)
  })

  it('should return false for non-group nodes', () => {
    const textNode: ITextNode = {
      id: 'test',
      type: 'text',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      text: 'Hello',
    }
    expect(isGroupNode(textNode)).toBe(false)
  })
})

describe('sortNodesForRendering', () => {
  const textNode: ITextNode = {
    id: 'text1',
    type: 'text',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    text: 'Hello',
  }

  const fileNode: IFileNode = {
    id: 'file1',
    type: 'file',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    file: 'test.md',
  }

  const groupNode: IGroupNode = {
    id: 'group1',
    type: 'group',
    x: 0,
    y: 0,
    width: 200,
    height: 200,
  }

  const groupNode2: IGroupNode = {
    id: 'group2',
    type: 'group',
    x: 100,
    y: 100,
    width: 200,
    height: 200,
    label: 'Second Group',
  }

  it('should return empty array for empty input', () => {
    expect(sortNodesForRendering([])).toEqual([])
  })

  it('should place group nodes before other nodes', () => {
    const nodes = [textNode, groupNode, fileNode]
    const sorted = sortNodesForRendering(nodes)

    expect(sorted).toHaveLength(3)
    expect(sorted[0]?.type).toBe('group')
    expect(sorted[1]?.type).toBe('text')
    expect(sorted[2]?.type).toBe('file')
  })

  it('should preserve relative order of groups', () => {
    const nodes = [groupNode, textNode, groupNode2]
    const sorted = sortNodesForRendering(nodes)

    expect(sorted[0]?.id).toBe('group1')
    expect(sorted[1]?.id).toBe('group2')
    expect(sorted[2]?.id).toBe('text1')
  })

  it('should preserve relative order of non-groups', () => {
    const linkNode: ILinkNode = {
      id: 'link1',
      type: 'link',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      url: 'https://example.com',
    }

    const nodes = [textNode, groupNode, fileNode, linkNode]
    const sorted = sortNodesForRendering(nodes)

    expect(sorted[0]?.id).toBe('group1')
    expect(sorted[1]?.id).toBe('text1')
    expect(sorted[2]?.id).toBe('file1')
    expect(sorted[3]?.id).toBe('link1')
  })

  it('should handle arrays with only groups', () => {
    const nodes = [groupNode, groupNode2]
    const sorted = sortNodesForRendering(nodes)

    expect(sorted).toHaveLength(2)
    expect(sorted[0]?.id).toBe('group1')
    expect(sorted[1]?.id).toBe('group2')
  })

  it('should handle arrays with no groups', () => {
    const nodes = [textNode, fileNode]
    const sorted = sortNodesForRendering(nodes)

    expect(sorted).toHaveLength(2)
    expect(sorted[0]?.id).toBe('text1')
    expect(sorted[1]?.id).toBe('file1')
  })
})
