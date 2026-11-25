import { describe, expect, it } from 'vitest'
import { validateCanvasData } from '../../src/data/validation.ts'

const text = { id: 'a', type: 'text', x: 0, y: 0, width: 10, height: 10, text: 'a' }
const other = { ...text, id: 'b' }

/** The `path` and `code` pairs `validateCanvasData` reports for a canvas. */
function problems(canvas: unknown): string[] {
  return validateCanvasData(canvas).errors.map((e) => `${e.path} ${e.code}`)
}

describe('node fields', () => {
  it.each<[string, Record<string, unknown>, string]>([
    ['a numeric id', { id: 1 }, 'nodes[0].id INVALID_TYPE'],
    ['a blank id', { id: '  ' }, 'nodes[0].id INVALID_VALUE'],
    ['a numeric type', { type: 3 }, 'nodes[0].type INVALID_TYPE'],
    ['an unknown type', { type: 'image' }, 'nodes[0].type INVALID_VALUE'],
    ['a string x', { x: '0' }, 'nodes[0].x INVALID_TYPE'],
    ['an infinite x', { x: Infinity }, 'nodes[0].x INVALID_VALUE'],
    ['a string y', { y: '0' }, 'nodes[0].y INVALID_TYPE'],
    ['a NaN y', { y: NaN }, 'nodes[0].y INVALID_VALUE'],
    ['a string width', { width: '1' }, 'nodes[0].width INVALID_TYPE'],
    ['an infinite width', { width: Infinity }, 'nodes[0].width INVALID_VALUE'],
    ['a zero width', { width: 0 }, 'nodes[0].width INVALID_VALUE'],
    ['a string height', { height: '1' }, 'nodes[0].height INVALID_TYPE'],
    ['an infinite height', { height: Infinity }, 'nodes[0].height INVALID_VALUE'],
    ['a negative height', { height: -1 }, 'nodes[0].height INVALID_VALUE'],
    ['a numeric colour', { color: 4 }, 'nodes[0].color INVALID_TYPE'],
    ['a colour name', { color: 'red' }, 'nodes[0].color INVALID_FORMAT'],
    ['an empty colour', { color: '' }, 'nodes[0].color INVALID_FORMAT'],
    ['a text node with no text', { text: undefined }, 'nodes[0].text MISSING_REQUIRED'],
  ])('rejects %s', (_name, change, expected) => {
    expect(problems({ nodes: [{ ...text, ...change }], edges: [] })).toContain(expected)
  })

  it('accepts a preset and a hex colour', () => {
    expect(
      problems({
        nodes: [
          { ...text, color: '6' },
          { ...other, color: '#abc' },
        ],
      }),
    ).toEqual([])
  })

  it('rejects a node that is not an object', () => {
    expect(problems({ nodes: [null, 'x'] })).toEqual([
      'nodes[0] INVALID_TYPE',
      'nodes[1] INVALID_TYPE',
    ])
  })

  it('checks the properties of the other node types', () => {
    const file = { ...text, type: 'file', file: 'a.md' }
    const link = { ...text, type: 'link', url: 'https://example.com' }
    const group = { ...text, type: 'group' }
    expect(problems({ nodes: [file, { ...link, id: 'l' }, { ...group, id: 'g' }] })).toEqual([])

    expect(problems({ nodes: [{ ...file, file: 1 }] })).toContain('nodes[0].file MISSING_REQUIRED')
    expect(problems({ nodes: [{ ...file, subpath: 1 }] })).toContain(
      'nodes[0].subpath INVALID_TYPE',
    )
    expect(problems({ nodes: [{ ...file, subpath: 'heading' }] })).toContain(
      'nodes[0].subpath INVALID_FORMAT',
    )
    expect(problems({ nodes: [{ ...link, url: 1 }] })).toContain('nodes[0].url MISSING_REQUIRED')
    expect(problems({ nodes: [{ ...group, label: 1 }] })).toContain('nodes[0].label INVALID_TYPE')
    expect(problems({ nodes: [{ ...group, background: 1 }] })).toContain(
      'nodes[0].background INVALID_TYPE',
    )
    expect(problems({ nodes: [{ ...group, backgroundStyle: 1 }] })).toContain(
      'nodes[0].backgroundStyle INVALID_TYPE',
    )
    expect(problems({ nodes: [{ ...group, backgroundStyle: 'tile' }] })).toContain(
      'nodes[0].backgroundStyle INVALID_VALUE',
    )
  })
})

describe('edge fields', () => {
  const edge = { id: 'e', fromNode: 'a', toNode: 'b' }
  const canvas = (change: Record<string, unknown>) => ({
    nodes: [text, other],
    edges: [{ ...edge, ...change }],
  })

  it('accepts every side, marker and colour', () => {
    expect(
      problems(
        canvas({
          fromSide: 'top',
          toSide: 'left',
          fromEnd: 'none',
          toEnd: 'arrow',
          label: 'x',
          color: '1',
        }),
      ),
    ).toEqual([])
  })

  it.each<[string, Record<string, unknown>, string]>([
    ['a numeric id', { id: 1 }, 'edges[0].id INVALID_TYPE'],
    ['a blank id', { id: '' }, 'edges[0].id INVALID_VALUE'],
    ['a numeric fromNode', { fromNode: 1 }, 'edges[0].fromNode INVALID_TYPE'],
    ['an unknown fromNode', { fromNode: 'zz' }, 'edges[0].fromNode INVALID_REFERENCE'],
    ['a numeric toNode', { toNode: 1 }, 'edges[0].toNode INVALID_TYPE'],
    ['an unknown toNode', { toNode: 'zz' }, 'edges[0].toNode INVALID_REFERENCE'],
    ['a numeric fromSide', { fromSide: 1 }, 'edges[0].fromSide INVALID_TYPE'],
    ['an unknown fromSide', { fromSide: 'middle' }, 'edges[0].fromSide INVALID_VALUE'],
    ['a numeric toSide', { toSide: 1 }, 'edges[0].toSide INVALID_TYPE'],
    ['an unknown toSide', { toSide: 'middle' }, 'edges[0].toSide INVALID_VALUE'],
    ['a numeric fromEnd', { fromEnd: 1 }, 'edges[0].fromEnd INVALID_TYPE'],
    ['an unknown fromEnd', { fromEnd: 'dot' }, 'edges[0].fromEnd INVALID_VALUE'],
    ['a numeric toEnd', { toEnd: 1 }, 'edges[0].toEnd INVALID_TYPE'],
    ['an unknown toEnd', { toEnd: 'dot' }, 'edges[0].toEnd INVALID_VALUE'],
    ['a numeric label', { label: 1 }, 'edges[0].label INVALID_TYPE'],
    ['a numeric colour', { color: 1 }, 'edges[0].color INVALID_TYPE'],
    ['a colour name', { color: 'blue' }, 'edges[0].color INVALID_FORMAT'],
  ])('rejects %s', (_name, change, expected) => {
    expect(problems(canvas(change))).toContain(expected)
  })

  it('rejects an edge that is not an object, and a duplicate edge id', () => {
    expect(problems({ nodes: [text, other], edges: [7] })).toEqual(['edges[0] INVALID_TYPE'])
    expect(problems({ nodes: [text, other], edges: [edge, edge] })).toEqual([
      'edges[1].id DUPLICATE_ID',
    ])
  })
})

describe('the canvas itself', () => {
  it('rejects a duplicate node id, a non-array nodes and a non-array edges', () => {
    expect(problems({ nodes: [text, text] })).toEqual(['nodes[1].id DUPLICATE_ID'])
    expect(problems({ nodes: {} })).toEqual(['nodes INVALID_TYPE'])
    expect(problems({ edges: 'x' })).toEqual(['edges INVALID_TYPE'])
  })

  it('reports no warnings', () => {
    expect(validateCanvasData({ nodes: [text, text] }).warnings).toEqual([])
  })
})
