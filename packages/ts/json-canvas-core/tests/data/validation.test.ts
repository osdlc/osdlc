import { describe, expect, it } from 'vitest'
import { executeOperation } from '../../src/model/executor.ts'
import { type ICanvasContent, sortNodesForRendering } from '../../src/types.ts'
import {
  formatValidationErrors,
  isValidCanvas,
  isValidColor,
  isValidHexColor,
  normalizeCanvas,
  type ValidationResult,
  validateCanvasData,
  validateEdge,
  validateNode,
} from '../../src/data/validation.ts'

// ============================================================================
// Color Validation Tests
// ============================================================================

describe('isValidHexColor', () => {
  it('should accept valid 6-digit hex colors', () => {
    expect(isValidHexColor('#000000')).toBe(true)
    expect(isValidHexColor('#FFFFFF')).toBe(true)
    expect(isValidHexColor('#ff5733')).toBe(true)
    expect(isValidHexColor('#aAbBcC')).toBe(true)
  })

  it('should accept valid 3-digit hex colors', () => {
    expect(isValidHexColor('#000')).toBe(true)
    expect(isValidHexColor('#FFF')).toBe(true)
    expect(isValidHexColor('#f53')).toBe(true)
    expect(isValidHexColor('#ABC')).toBe(true)
  })

  it('should reject invalid hex colors', () => {
    expect(isValidHexColor('000000')).toBe(false) // Missing #
    expect(isValidHexColor('#0000')).toBe(false) // 4 digits
    expect(isValidHexColor('#00000')).toBe(false) // 5 digits
    expect(isValidHexColor('#0000000')).toBe(false) // 7 digits
    expect(isValidHexColor('#GGGGGG')).toBe(false) // Invalid characters
    expect(isValidHexColor('red')).toBe(false) // Named color
    expect(isValidHexColor('')).toBe(false) // Empty
  })
})

describe('isValidColor', () => {
  it('should accept preset colors', () => {
    expect(isValidColor('1')).toBe(true)
    expect(isValidColor('2')).toBe(true)
    expect(isValidColor('3')).toBe(true)
    expect(isValidColor('4')).toBe(true)
    expect(isValidColor('5')).toBe(true)
    expect(isValidColor('6')).toBe(true)
  })

  it('should accept valid hex colors', () => {
    expect(isValidColor('#ff5733')).toBe(true)
    expect(isValidColor('#ABC')).toBe(true)
  })

  it('should accept undefined', () => {
    expect(isValidColor(undefined)).toBe(true)
  })

  it('should reject invalid colors', () => {
    expect(isValidColor('7')).toBe(false)
    expect(isValidColor('red')).toBe(false)
    expect(isValidColor('invalid')).toBe(false)
  })

  it('should reject the empty string', () => {
    expect(isValidColor('')).toBe(false)
  })
})

// ============================================================================
// Node Validation Tests
// ============================================================================

describe('validateNode', () => {
  const validTextNode = {
    id: 'text1',
    type: 'text',
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    text: 'Hello world',
  }

  describe('base node validation', () => {
    it('should pass for valid node', () => {
      const errors = validateNode(validTextNode, 'nodes[0]')
      expect(errors).toHaveLength(0)
    })

    it('should fail if node is not an object', () => {
      const errors = validateNode('not an object', 'nodes[0]')
      expect(errors).toHaveLength(1)
      expect(errors[0]?.code).toBe('INVALID_TYPE')
    })

    it('should fail if id is missing or invalid', () => {
      const noId = { ...validTextNode, id: undefined }
      let errors = validateNode(noId, 'nodes[0]')
      expect(errors.some((e) => e.path === 'nodes[0].id')).toBe(true)

      const emptyId = { ...validTextNode, id: '' }
      errors = validateNode(emptyId, 'nodes[0]')
      expect(errors.some((e) => e.path === 'nodes[0].id')).toBe(true)

      const numberId = { ...validTextNode, id: 123 }
      errors = validateNode(numberId, 'nodes[0]')
      expect(errors.some((e) => e.path === 'nodes[0].id')).toBe(true)
    })

    it('should fail if type is invalid', () => {
      const invalidType = { ...validTextNode, type: 'invalid' }
      const errors = validateNode(invalidType, 'nodes[0]')
      expect(errors.some((e) => e.path === 'nodes[0].type')).toBe(true)
    })

    it('should fail if x, y, width, or height is not a number', () => {
      const badX = { ...validTextNode, x: '0' }
      expect(validateNode(badX, 'nodes[0]').some((e) => e.path === 'nodes[0].x')).toBe(true)

      const badY = { ...validTextNode, y: null }
      expect(validateNode(badY, 'nodes[0]').some((e) => e.path === 'nodes[0].y')).toBe(true)

      const badWidth = { ...validTextNode, width: 'wide' }
      expect(validateNode(badWidth, 'nodes[0]').some((e) => e.path === 'nodes[0].width')).toBe(true)

      const badHeight = { ...validTextNode, height: undefined }
      expect(validateNode(badHeight, 'nodes[0]').some((e) => e.path === 'nodes[0].height')).toBe(
        true,
      )
    })

    it('should fail if x, y, width, or height is not finite', () => {
      const parsed = JSON.parse(
        '{"id":"a","type":"text","text":"t","x":1e999,"y":0,"width":10,"height":10}',
      ) as Record<string, unknown>
      expect(validateNode(parsed, 'nodes[0]').some((e) => e.path === 'nodes[0].x')).toBe(true)

      const nanY = { ...validTextNode, y: Number.NaN }
      expect(validateNode(nanY, 'nodes[0]').some((e) => e.path === 'nodes[0].y')).toBe(true)

      const infWidth = { ...validTextNode, width: Number.POSITIVE_INFINITY }
      expect(validateNode(infWidth, 'nodes[0]').some((e) => e.path === 'nodes[0].width')).toBe(true)

      const nanHeight = { ...validTextNode, height: Number.NaN }
      expect(validateNode(nanHeight, 'nodes[0]').some((e) => e.path === 'nodes[0].height')).toBe(
        true,
      )
    })

    it('should fail if width or height is non-positive', () => {
      const zeroWidth = { ...validTextNode, width: 0 }
      expect(validateNode(zeroWidth, 'nodes[0]').some((e) => e.path === 'nodes[0].width')).toBe(
        true,
      )

      const negativeHeight = { ...validTextNode, height: -10 }
      expect(
        validateNode(negativeHeight, 'nodes[0]').some((e) => e.path === 'nodes[0].height'),
      ).toBe(true)
    })

    it('should fail with INVALID_VALUE for each non-finite field', () => {
      // JSON.parse turns 1e999 into Infinity, which JSON.stringify writes back as null.
      for (const field of ['x', 'y', 'width', 'height'] as const) {
        for (const value of [Infinity, -Infinity, NaN]) {
          const node = { ...validTextNode, [field]: value }
          const errors = validateNode(node, 'nodes[0]')
          expect(
            errors.some((e) => e.path === `nodes[0].${field}` && e.code === 'INVALID_VALUE'),
            `${field}=${value}`,
          ).toBe(true)
        }
      }
      const parsed: unknown = JSON.parse(
        '{"nodes":[{"id":"a","type":"text","text":"t","x":0,"y":0,"width":1e999,"height":100}],"edges":[]}',
      )
      expect(validateCanvasData(parsed).valid).toBe(false)
    })

    it('should fail if color is invalid', () => {
      const invalidColor = { ...validTextNode, color: 'invalid' }
      const errors = validateNode(invalidColor, 'nodes[0]')
      expect(errors.some((e) => e.path === 'nodes[0].color')).toBe(true)
    })

    it('should pass with valid preset color', () => {
      const presetColor = { ...validTextNode, color: '3' }
      const errors = validateNode(presetColor, 'nodes[0]')
      expect(errors).toHaveLength(0)
    })

    it('should pass with valid hex color', () => {
      const hexColor = { ...validTextNode, color: '#ff5733' }
      const errors = validateNode(hexColor, 'nodes[0]')
      expect(errors).toHaveLength(0)
    })
  })

  describe('text node validation', () => {
    it('should fail if text property is missing', () => {
      const noText = {
        id: 'text1',
        type: 'text',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
      }
      const errors = validateNode(noText, 'nodes[0]')
      expect(errors.some((e) => e.path === 'nodes[0].text')).toBe(true)
    })
  })

  describe('file node validation', () => {
    const validFileNode = {
      id: 'file1',
      type: 'file',
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      file: 'path/to/file.md',
    }

    it('should pass for valid file node', () => {
      const errors = validateNode(validFileNode, 'nodes[0]')
      expect(errors).toHaveLength(0)
    })

    it('should fail if file property is missing', () => {
      const noFile = {
        id: 'file1',
        type: 'file',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
      }
      const errors = validateNode(noFile, 'nodes[0]')
      expect(errors.some((e) => e.path === 'nodes[0].file')).toBe(true)
    })

    it('should fail if subpath does not start with #', () => {
      const badSubpath = { ...validFileNode, subpath: 'heading' }
      const errors = validateNode(badSubpath, 'nodes[0]')
      expect(errors.some((e) => e.path === 'nodes[0].subpath')).toBe(true)
    })

    it('should pass if subpath starts with #', () => {
      const goodSubpath = { ...validFileNode, subpath: '#heading' }
      const errors = validateNode(goodSubpath, 'nodes[0]')
      expect(errors).toHaveLength(0)
    })
  })

  describe('link node validation', () => {
    const validLinkNode = {
      id: 'link1',
      type: 'link',
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      url: 'https://example.com',
    }

    it('should pass for valid link node', () => {
      const errors = validateNode(validLinkNode, 'nodes[0]')
      expect(errors).toHaveLength(0)
    })

    it('should fail if url property is missing', () => {
      const noUrl = {
        id: 'link1',
        type: 'link',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
      }
      const errors = validateNode(noUrl, 'nodes[0]')
      expect(errors.some((e) => e.path === 'nodes[0].url')).toBe(true)
    })
  })

  describe('group node validation', () => {
    const validGroupNode = {
      id: 'group1',
      type: 'group',
      x: 0,
      y: 0,
      width: 200,
      height: 200,
    }

    it('should pass for valid group node', () => {
      const errors = validateNode(validGroupNode, 'nodes[0]')
      expect(errors).toHaveLength(0)
    })

    it('should pass with optional label', () => {
      const withLabel = { ...validGroupNode, label: 'My Group' }
      const errors = validateNode(withLabel, 'nodes[0]')
      expect(errors).toHaveLength(0)
    })

    it('should pass with valid backgroundStyle', () => {
      const withCover = { ...validGroupNode, backgroundStyle: 'cover' }
      expect(validateNode(withCover, 'nodes[0]')).toHaveLength(0)

      const withRatio = { ...validGroupNode, backgroundStyle: 'ratio' }
      expect(validateNode(withRatio, 'nodes[0]')).toHaveLength(0)

      const withRepeat = { ...validGroupNode, backgroundStyle: 'repeat' }
      expect(validateNode(withRepeat, 'nodes[0]')).toHaveLength(0)
    })

    it('should fail with invalid backgroundStyle', () => {
      const badStyle = { ...validGroupNode, backgroundStyle: 'invalid' }
      const errors = validateNode(badStyle, 'nodes[0]')
      expect(errors.some((e) => e.path === 'nodes[0].backgroundStyle')).toBe(true)
    })
  })
})

// ============================================================================
// Edge Validation Tests
// ============================================================================

describe('validateEdge', () => {
  const nodeIds = new Set(['node1', 'node2', 'node3'])

  const validEdge = {
    id: 'edge1',
    fromNode: 'node1',
    toNode: 'node2',
  }

  it('should pass for valid edge', () => {
    const errors = validateEdge(validEdge, 'edges[0]', nodeIds)
    expect(errors).toHaveLength(0)
  })

  it('should fail if edge is not an object', () => {
    const errors = validateEdge('not an object', 'edges[0]', nodeIds)
    expect(errors).toHaveLength(1)
    expect(errors[0]?.code).toBe('INVALID_TYPE')
  })

  it('should fail if id is missing or invalid', () => {
    const noId = { ...validEdge, id: undefined }
    expect(validateEdge(noId, 'edges[0]', nodeIds).some((e) => e.path === 'edges[0].id')).toBe(true)

    const emptyId = { ...validEdge, id: '' }
    expect(validateEdge(emptyId, 'edges[0]', nodeIds).some((e) => e.path === 'edges[0].id')).toBe(
      true,
    )
  })

  it('should fail if fromNode references non-existent node', () => {
    const badFrom = { ...validEdge, fromNode: 'nonexistent' }
    const errors = validateEdge(badFrom, 'edges[0]', nodeIds)
    expect(errors.some((e) => e.code === 'INVALID_REFERENCE')).toBe(true)
  })

  it('should fail if toNode references non-existent node', () => {
    const badTo = { ...validEdge, toNode: 'nonexistent' }
    const errors = validateEdge(badTo, 'edges[0]', nodeIds)
    expect(errors.some((e) => e.code === 'INVALID_REFERENCE')).toBe(true)
  })

  it('should fail with invalid fromSide', () => {
    const badSide = { ...validEdge, fromSide: 'invalid' }
    const errors = validateEdge(badSide, 'edges[0]', nodeIds)
    expect(errors.some((e) => e.path === 'edges[0].fromSide')).toBe(true)
  })

  it('should fail with invalid toSide', () => {
    const badSide = { ...validEdge, toSide: 'middle' }
    const errors = validateEdge(badSide, 'edges[0]', nodeIds)
    expect(errors.some((e) => e.path === 'edges[0].toSide')).toBe(true)
  })

  it('should pass with valid side values', () => {
    const withSides = { ...validEdge, fromSide: 'right', toSide: 'left' }
    const errors = validateEdge(withSides, 'edges[0]', nodeIds)
    expect(errors).toHaveLength(0)
  })

  it('should fail with invalid fromEnd', () => {
    const badEnd = { ...validEdge, fromEnd: 'circle' }
    const errors = validateEdge(badEnd, 'edges[0]', nodeIds)
    expect(errors.some((e) => e.path === 'edges[0].fromEnd')).toBe(true)
  })

  it('should fail with invalid toEnd', () => {
    const badEnd = { ...validEdge, toEnd: 'diamond' }
    const errors = validateEdge(badEnd, 'edges[0]', nodeIds)
    expect(errors.some((e) => e.path === 'edges[0].toEnd')).toBe(true)
  })

  it('should pass with valid marker types', () => {
    const withMarkers = { ...validEdge, fromEnd: 'arrow', toEnd: 'none' }
    const errors = validateEdge(withMarkers, 'edges[0]', nodeIds)
    expect(errors).toHaveLength(0)
  })

  it('should pass with valid label', () => {
    const withLabel = { ...validEdge, label: 'Connection' }
    const errors = validateEdge(withLabel, 'edges[0]', nodeIds)
    expect(errors).toHaveLength(0)
  })

  it('should fail with invalid color', () => {
    const badColor = { ...validEdge, color: 'invalid' }
    const errors = validateEdge(badColor, 'edges[0]', nodeIds)
    expect(errors.some((e) => e.path === 'edges[0].color')).toBe(true)
  })
})

// ============================================================================
// Canvas Validation Tests
// ============================================================================

describe('validateCanvasData', () => {
  it('should pass for valid canvas', () => {
    const canvas = {
      nodes: [
        {
          id: 'text1',
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: 'Hello',
        },
        {
          id: 'text2',
          type: 'text',
          x: 150,
          y: 0,
          width: 100,
          height: 50,
          text: 'World',
        },
      ],
      edges: [
        {
          id: 'edge1',
          fromNode: 'text1',
          toNode: 'text2',
          fromSide: 'right',
          toSide: 'left',
        },
      ],
    }
    const result = validateCanvasData(canvas)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should fail if canvas is not an object', () => {
    const result = validateCanvasData('not an object')
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.code === 'INVALID_TYPE')).toBe(true)
  })

  it('should fail if nodes is not an array', () => {
    const result = validateCanvasData({ nodes: 'not an array' })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.path === 'nodes')).toBe(true)
  })

  it('should fail if edges is not an array', () => {
    const result = validateCanvasData({ nodes: [], edges: 'not an array' })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.path === 'edges')).toBe(true)
  })

  it('should validate edges even when nodes is omitted', () => {
    const result = validateCanvasData({
      edges: [{ id: 'e1', fromNode: 'x', toNode: 'y' }],
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.path === 'edges[0].fromNode')).toBe(true)
    expect(result.errors.some((e) => e.path === 'edges[0].toNode')).toBe(true)
  })

  it('should detect duplicate node IDs', () => {
    const canvas = {
      nodes: [
        {
          id: 'dup',
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: 'A',
        },
        {
          id: 'dup',
          type: 'text',
          x: 150,
          y: 0,
          width: 100,
          height: 50,
          text: 'B',
        },
      ],
      edges: [],
    }
    const result = validateCanvasData(canvas)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.code === 'DUPLICATE_ID')).toBe(true)
  })

  it('should detect duplicate edge IDs', () => {
    const canvas = {
      nodes: [
        {
          id: 'n1',
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: 'A',
        },
        {
          id: 'n2',
          type: 'text',
          x: 150,
          y: 0,
          width: 100,
          height: 50,
          text: 'B',
        },
      ],
      edges: [
        { id: 'dup', fromNode: 'n1', toNode: 'n2' },
        { id: 'dup', fromNode: 'n2', toNode: 'n1' },
      ],
    }
    const result = validateCanvasData(canvas)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.code === 'DUPLICATE_ID')).toBe(true)
  })

  it('should pass with empty nodes and edges', () => {
    const result = validateCanvasData({ nodes: [], edges: [] })
    expect(result.valid).toBe(true)
  })

  it('should pass with undefined nodes and edges', () => {
    const result = validateCanvasData({})
    expect(result.valid).toBe(true)
  })

  it('should fail if canvas is an array', () => {
    const result = validateCanvasData([])
    expect(result.valid).toBe(false)
    expect(result.errors[0]?.code).toBe('INVALID_TYPE')
  })
})

describe('normalizeCanvas', () => {
  it('fills in the nodes and edges the spec makes optional', () => {
    expect(normalizeCanvas({})).toEqual({ nodes: [], edges: [] })
    const nodes = [{ id: 'a', type: 'text', x: 0, y: 0, width: 1, height: 1, text: '' }] as const
    const normalized = normalizeCanvas({ nodes: [...nodes] })
    expect(normalized.nodes).toEqual(nodes)
    expect(normalized.edges).toEqual([])
  })

  it('returns a complete canvas as is', () => {
    const canvas: ICanvasContent = { nodes: [], edges: [] }
    expect(normalizeCanvas(canvas)).toBe(canvas)
  })
})

describe('isValidCanvas', () => {
  it('should return true for valid canvas', () => {
    const canvas = {
      nodes: [
        {
          id: 'text1',
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: 'Hello',
        },
      ],
      edges: [],
    }
    expect(isValidCanvas(canvas)).toBe(true)
  })

  it('should return false for invalid canvas', () => {
    const canvas = {
      nodes: [{ id: 123, type: 'invalid' }], // Invalid
      edges: [],
    }
    expect(isValidCanvas(canvas)).toBe(false)
  })

  it('should return false unless nodes and edges are both arrays', () => {
    // The guard narrows to ICanvasContent, whose nodes and edges are required.
    expect(isValidCanvas({})).toBe(false)
    expect(isValidCanvas([])).toBe(false)
    expect(isValidCanvas({ nodes: [] })).toBe(false)
    expect(isValidCanvas({ edges: [] })).toBe(false)
    expect(isValidCanvas({ nodes: [], edges: [] })).toBe(true)
  })

  it('should return false when nodes or edges is absent', () => {
    const node = { id: 'a', type: 'text', text: 'hi', x: 0, y: 0, width: 100, height: 50 }
    expect(isValidCanvas({ nodes: [node] })).toBe(false)
    expect(isValidCanvas({ edges: [] })).toBe(false)
    expect(isValidCanvas({})).toBe(false)
  })
})

describe('normalizeCanvas with operations', () => {
  const node = { id: 'a', type: 'text', text: 'hi', x: 0, y: 0, width: 100, height: 50 }

  it('fills absent nodes and edges so a spec-valid canvas works with operations', () => {
    const raw: unknown = { nodes: [node] }
    expect(validateCanvasData(raw).valid).toBe(true)

    const canvas = normalizeCanvas(raw as Partial<ICanvasContent>)
    expect(canvas.edges).toEqual([])
    expect(isValidCanvas(canvas)).toBe(true)

    const result = executeOperation(canvas, {
      type: 'createEdge',
      edge: { fromNode: 'a', toNode: 'a' },
    })
    expect(result.success).toBe(true)
    expect(sortNodesForRendering(normalizeCanvas({ edges: [] }).nodes)).toEqual([])
  })

  it('keeps present arrays and other top-level fields', () => {
    const nodes = [node] as ICanvasContent['nodes']
    const input = { nodes, edges: [], extra: 1 } as Partial<ICanvasContent>
    const canvas = normalizeCanvas(input)
    expect(canvas.nodes).toBe(nodes)
    expect((canvas as unknown as { extra: number }).extra).toBe(1)
  })
})

describe('formatValidationErrors', () => {
  it('should format errors into readable strings', () => {
    const result: ValidationResult = {
      valid: false,
      errors: [
        {
          path: 'nodes[0].id',
          message: 'Node id must be a string',
          code: 'INVALID_TYPE',
        },
        {
          path: 'edges[1].fromNode',
          message: 'Edge references non-existent node',
          code: 'INVALID_REFERENCE',
        },
      ],
      warnings: [],
    }

    const formatted = formatValidationErrors(result)
    expect(formatted).toHaveLength(2)
    expect(formatted[0]).toBe('[nodes[0].id] Node id must be a string')
    expect(formatted[1]).toBe('[edges[1].fromNode] Edge references non-existent node')
  })

  it('should handle errors without path', () => {
    const result: ValidationResult = {
      valid: false,
      errors: [
        {
          path: '',
          message: 'Canvas content must be an object',
          code: 'INVALID_TYPE',
        },
      ],
      warnings: [],
    }

    const formatted = formatValidationErrors(result)
    expect(formatted[0]).toBe('Canvas content must be an object')
  })
})

// ============================================================================
// Integration Tests
// ============================================================================

describe('Full Canvas Validation', () => {
  it('should validate a complete valid canvas', () => {
    const canvas = {
      nodes: [
        {
          id: 'text1',
          type: 'text',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          text: '# Welcome\n\nThis is **markdown**',
          color: '1',
        },
        {
          id: 'file1',
          type: 'file',
          x: 250,
          y: 0,
          width: 200,
          height: 80,
          file: 'notes/readme.md',
          subpath: '#overview',
        },
        {
          id: 'link1',
          type: 'link',
          x: 0,
          y: 150,
          width: 200,
          height: 60,
          url: 'https://github.com',
        },
        {
          id: 'group1',
          type: 'group',
          x: -20,
          y: -20,
          width: 500,
          height: 250,
          label: 'Container',
          backgroundStyle: 'cover',
        },
      ],
      edges: [
        {
          id: 'e1',
          fromNode: 'text1',
          toNode: 'file1',
          fromSide: 'right',
          toSide: 'left',
          toEnd: 'arrow',
        },
        {
          id: 'e2',
          fromNode: 'text1',
          toNode: 'link1',
          fromSide: 'bottom',
          toSide: 'top',
          label: 'Related',
          color: '4',
        },
      ],
    }

    const result = validateCanvasData(canvas)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should catch multiple errors in invalid canvas', () => {
    const canvas = {
      nodes: [
        { id: '', type: 'invalid', x: 'bad', y: 0, width: -10, height: 100 }, // Multiple errors
        { id: 'text1', type: 'text', x: 0, y: 0, width: 100, height: 50 }, // Missing text
      ],
      edges: [
        {
          id: 'e1',
          fromNode: 'nonexistent',
          toNode: 'also-nonexistent',
          fromSide: 'middle',
        }, // Bad references and side
      ],
    }

    const result = validateCanvasData(canvas)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(5)
  })
})
