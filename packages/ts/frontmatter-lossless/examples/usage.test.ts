/**
 * The package used the way a consumer uses it: through its name only. Every
 * export appears here at least once; `tests/exports.test.ts` checks that.
 */

import { describe, expect, test } from 'bun:test'

import {
  compose,
  newShape,
  split,
  splitLenient,
  type CloseEol,
  type LenientSplit,
  type NewShapeOptions,
  type NoteShape,
  type OpenEol,
  type SourceRange,
  type Split,
} from '@osdlc/frontmatter-lossless'

const NOTE = '---\r\ntitle: Old\r\ntags: [a]\r\n---\r\n# Heading\r\n'

describe('split and compose', () => {
  test('a round trip gives back the same text', () => {
    const parts: Split = split(NOTE)
    expect(compose(parts.yaml, parts.body, parts.shape)).toBe(NOTE)
  })

  test('edit the YAML text and keep the CRLF fences', () => {
    const { yaml, body, shape } = split(NOTE)
    const edited = yaml!.replace('title: Old', 'title: New')
    expect(compose(edited, body, shape)).toBe(
      '---\r\ntitle: New\r\ntags: [a]\r\n---\r\n# Heading\r\n',
    )
  })

  test('offsets point into the source', () => {
    const { yaml, yamlRange, body, bodyStart } = split(NOTE)
    const range: SourceRange = yamlRange
    expect(NOTE.slice(range.start, range.end)).toBe(yaml!)
    expect(NOTE.slice(bodyStart)).toBe(body)
  })

  test('the shape records the BOM and both line endings', () => {
    const shape: NoteShape = split('\uFEFF---\ntitle: A\n---\nbody').shape
    const open: OpenEol = shape.openEol
    const close: CloseEol = shape.closeEol
    expect(shape.bom).toBe(true)
    expect(open).toBe('\n')
    expect(close).toBe('\n')
  })

  test('a note with no block has yaml null, and compose can add one', () => {
    const { yaml, body, shape } = split('just text\n')
    expect(yaml).toBeNull()
    expect(compose('title: Added', body, shape)).toBe('---\ntitle: Added\n---\njust text\n')
  })

  test('an unclosed block is body, not an error, and is flagged', () => {
    const unclosed = split('---\ntitle: A\nno closing fence\n')
    expect(unclosed.yaml).toBeNull()
    expect(unclosed.unterminated).toBe(true)
    expect(split('just text\n').unterminated).toBe(false)
  })
})

describe('newShape', () => {
  test('writes a new note with LF fences', () => {
    const note = compose('title: New', '# New\n', newShape())
    expect(note).toBe('---\ntitle: New\n---\n# New\n')
    expect(split(note).yaml).toBe('title: New')
  })

  test('takes the line ending and the BOM', () => {
    const opts: NewShapeOptions = { eol: '\r\n', bom: true }
    expect(compose('title: New\r', 'body\r\n', newShape(opts))).toBe(
      '\uFEFF---\r\ntitle: New\r\n---\r\nbody\r\n',
    )
  })
})

describe('splitLenient', () => {
  test('reads hand-written input that split rejects', () => {
    const sloppy = '\n\n---  \ntitle: A\n---\t\nbody\n'
    expect(split(sloppy).yaml).toBeNull()
    const read: LenientSplit | null = splitLenient(sloppy)
    expect(read).toEqual({ yaml: 'title: A', body: 'body\n' })
  })

  test('gives null when there is no block', () => {
    expect(splitLenient('just text\n')).toBeNull()
  })
})
