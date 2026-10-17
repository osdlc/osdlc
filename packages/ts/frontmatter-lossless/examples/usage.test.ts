/**
 * The package used the way a consumer uses it: through its name only. Every
 * export appears here at least once; `tests/exports.test.ts` checks that.
 */

import { describe, expect, test } from 'bun:test'

import {
  compose,
  split,
  splitLenient,
  type CloseEol,
  type LenientSplit,
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

  test('an unclosed block is body, not an error', () => {
    expect(split('---\ntitle: A\nno closing fence\n').yaml).toBeNull()
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
