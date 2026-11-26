// Validating untrusted input, and the helpers for colours and node kinds.
import { expect, test } from 'vitest'
import {
  Colors,
  formatValidationErrors,
  isFileNode,
  isGroupNode,
  isLinkNode,
  isTextNode,
  isValidCanvas,
  isValidColor,
  isValidHexColor,
  normalizeCanvas,
  resolveColor,
  sortNodesForRendering,
  validateCanvasData,
  type ICanvasContent,
} from '@osdlc/json-canvas-core'

test('validate untrusted input, then normalise it', () => {
  // #region validate
  const input: unknown = JSON.parse('{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":10}]}')

  const result = validateCanvasData(input)
  expect(result.valid).toEqual(false)
  expect(result.errors[0]?.path).toEqual('nodes[0].height')
  expect(result.errors[0]?.code).toEqual('INVALID_TYPE')
  formatValidationErrors(result) // ['[nodes[0].height] Node height must be a number', …]
  // #endregion validate

  expect(result.valid).toBe(false)
  expect(result.errors[0]).toMatchObject({ path: 'nodes[0].height', code: 'INVALID_TYPE' })
  expect(result.errors[1]).toMatchObject({ path: 'nodes[0].text', code: 'MISSING_REQUIRED' })
  expect(formatValidationErrors(result)).toContain('[nodes[0].height] Node height must be a number')
})

test('nodes and edges are optional in the format, required by ICanvasContent', () => {
  // #region normalize
  const input: unknown = JSON.parse(
    '{"nodes":[{"id":"a","type":"link","x":0,"y":0,"width":10,"height":10,"url":"https://example.com"}]}',
  )

  expect(validateCanvasData(input).valid).toEqual(true) // the spec lets `edges` be absent
  isValidCanvas(input) // false: ICanvasContent needs both arrays

  const canvas: ICanvasContent = normalizeCanvas(input as Partial<ICanvasContent>)
  expect(canvas.edges).toEqual([])
  // #endregion normalize

  expect(validateCanvasData(input).valid).toBe(true)
  expect(isValidCanvas(input)).toBe(false)
  expect(canvas.edges).toEqual([])
  expect(isValidCanvas(canvas)).toBe(true)
  const whole: ICanvasContent = { nodes: [], edges: [] }
  expect(normalizeCanvas(whole)).toBe(whole)
})

test('colours', () => {
  // #region colors
  isValidColor('3') // true: a preset, '1' to '6'
  isValidColor('#f80') // true
  isValidColor('red') // false
  isValidHexColor('#ff8800') // true

  resolveColor('4') // '#22c55e', Colors['4']
  resolveColor('#f80') // '#f80', returned as it is
  // #endregion colors

  expect(isValidColor('3')).toBe(true)
  expect(isValidColor('#f80')).toBe(true)
  expect(isValidColor('red')).toBe(false)
  expect(isValidHexColor('#ff8800')).toBe(true)
  expect(isValidHexColor('#ff88')).toBe(false)
  expect(resolveColor('4')).toBe(Colors['4'])
  expect(resolveColor('#f80')).toBe('#f80')
  expect(resolveColor(undefined)).toBeUndefined()
})

test('node kind guards and render order', () => {
  // #region guards
  const nodes = [
    { id: 't', type: 'text', x: 0, y: 0, width: 10, height: 10, text: '' },
    { id: 'g', type: 'group', x: 0, y: 0, width: 50, height: 50 },
    { id: 'f', type: 'file', x: 0, y: 0, width: 10, height: 10, file: 'a.md' },
    { id: 'l', type: 'link', x: 0, y: 0, width: 10, height: 10, url: 'https://example.com' },
  ] as const

  expect(nodes.filter((n) => isTextNode(n)).length).toEqual(1)
  // Groups paint below other nodes, as the spec asks.
  sortNodesForRendering([...nodes]).map((n) => n.id) // ['g', 't', 'f', 'l']
  // #endregion guards

  expect(nodes.filter((n) => isTextNode(n))).toHaveLength(1)
  expect(nodes.filter((n) => isFileNode(n))).toHaveLength(1)
  expect(nodes.filter((n) => isLinkNode(n))).toHaveLength(1)
  expect(nodes.filter((n) => isGroupNode(n))).toHaveLength(1)
  expect(sortNodesForRendering([...nodes]).map((n) => n.id)).toEqual(['g', 't', 'f', 'l'])
})
