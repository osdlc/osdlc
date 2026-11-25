import {
  Colors,
  formatValidationErrors,
  type ICanvasContent,
  isFileNode,
  isGroupNode,
  isLinkNode,
  isTextNode,
  isValidCanvas,
  isValidColor,
  isValidHexColor,
  normalizeCanvas,
  resolveColor,
  validateCanvasData,
} from '@osdlc/json-canvas-vue'
import { expect, test } from 'vitest'

test('a canvas file may omit nodes or edges: normalise it before the board takes it', () => {
  // #region normalize
  const input: unknown = JSON.parse(
    '{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":100,"height":50,"text":"hi"}]}',
  )

  expect(validateCanvasData(input).valid).toBe(true) // the spec makes `edges` optional
  expect(isValidCanvas(input)).toBe(false) // ICanvasContent needs both arrays

  const canvas: ICanvasContent = normalizeCanvas(input as Partial<ICanvasContent>)
  expect(canvas.edges).toEqual([])
  // #endregion normalize

  expect(isValidCanvas(canvas)).toBe(true)
})

test('validation reports a path and a code for each problem', () => {
  const result = validateCanvasData({ nodes: [{ id: 'a', type: 'text', x: 0, y: 0, width: 10 }] })
  expect(result.valid).toBe(false)
  expect(result.errors[0]?.path).toBe('nodes[0].height')
  expect(formatValidationErrors(result)[0]).toContain('nodes[0].height')
})

test('node type guards narrow a node', () => {
  const [text, file, link, group] = [
    { id: 't', type: 'text', x: 0, y: 0, width: 1, height: 1, text: '' },
    { id: 'f', type: 'file', x: 0, y: 0, width: 1, height: 1, file: 'a.md' },
    { id: 'l', type: 'link', x: 0, y: 0, width: 1, height: 1, url: 'https://example.com' },
    { id: 'g', type: 'group', x: 0, y: 0, width: 1, height: 1 },
  ] as const
  expect([isTextNode(text), isFileNode(file), isLinkNode(link), isGroupNode(group)]).toEqual([
    true,
    true,
    true,
    true,
  ])
  expect(isTextNode(file)).toBe(false)
})

test('colours are a preset id or a hex value', () => {
  expect(resolveColor('1')).toBe(Colors['1'])
  expect(resolveColor('#abcdef')).toBe('#abcdef')
  expect(resolveColor(undefined)).toBeUndefined()
  expect([
    isValidColor('6'),
    isValidColor('red'),
    isValidHexColor('#fff'),
    isValidHexColor('fff'),
  ]).toEqual([true, false, true, false])
})
