/**
 * Tests for @osdlc/frontmatter-lossless against its TypeScript source.
 *
 * The family's conformance suite,
 * packages/conformance/frontmatter-lossless/suite.json, holds the cases this
 * package and the Rust `frontmatter-lossless` crate must agree on: the strict
 * split with its offsets, the lenient split, composing an edit into a note's
 * shape, and a new note's shape. The crate is the reference and writes every
 * expected value. `conformance.ts` runs the suite. `corpus-dist.test.ts` runs
 * it again against the built `dist/`. See
 * docs/planning/decisions/D-07-conformance-corpus.md.
 *
 * The tests after it are hand-written: ports of the Rust crate's own tests and
 * branches the suite's values cannot express.
 */
import { test, expect, describe } from 'vitest'

import * as lib from '../src/index.ts'
import { split, compose, newShape, splitLenient } from '../src/index.ts'
import { runSuite } from './conformance.ts'

const BOM = '\uFEFF'

runSuite(lib)

describe('framing details (mirrors of the Rust hand-written tests)', () => {
  test('a BOM anywhere but index zero is ordinary content, not framing', () => {
    const s = split(`---\ntitle: a${BOM}b\n---\nbody\n`)
    expect(s.shape.bom).toBe(false)
    expect(s.yaml).toBe(`title: a${BOM}b`)
  })

  test('CRLF fences survive a value swap', () => {
    // Simulate an edit: keep the shape and pass `compose` new YAML text. The
    // fences must come back as CRLF, not LF.
    const s = split('---\r\ntitle: old\r\n---\r\nbody\r\n')
    const out = compose('title: new\r', s.body, s.shape)
    expect(out).toBe('---\r\ntitle: new\r\n---\r\nbody\r\n')
    expect(out.includes('---\n')).toBe(false)
  })

  test('lenient still needs a bare fence to close', () => {
    expect(splitLenient('---\na: 1\n---below\nb: 2\n---\nbody\n')).toEqual({
      yaml: 'a: 1\n---below\nb: 2',
      body: 'body\n',
    })
  })

  test('lenient does not strip a mid-whitespace BOM the way trimStart would', () => {
    // JS String.prototype.trimStart strips U+FEFF. Rust's trim_start does not.
    // This package must match Rust: a BOM after leading spaces stops the fence
    // from being recognised.
    expect(splitLenient(`  ${BOM}---\na: 1\n---\nbody\n`)).toBeNull()
  })
})

describe('branches the suite also reaches, checked field by field', () => {
  test('a note that is only two adjacent fences, with nothing after', () => {
    const s = split('---\n---')
    expect(s.yaml).toBe('')
    expect(s.body).toBe('')
    expect(s.bodyStart).toBe(7)
    expect(s.shape).toEqual({ bom: false, openEol: '\n', closeEol: '', closeSep: false })
    expect(compose(s.yaml, s.body, s.shape)).toBe('---\n---')
  })

  test('a `---` followed by other text does not close the block', () => {
    const src = '---\na: 1\n---x\nb: 2\n---\nbody\n'
    const s = split(src)
    expect(s.yaml).toBe('a: 1\n---x\nb: 2')
    expect(s.body).toBe('body\n')
    expect(compose(s.yaml, s.body, s.shape)).toBe(src)
  })
})

describe('writing YAML into an empty block', () => {
  for (const [name, src, want] of [
    ['LF', '---\n---\nbody\n', '---\ntitle: x\n---\nbody\n'],
    ['CRLF', '---\r\n---\r\nbody\r\n', '---\r\ntitle: x\r\n---\r\nbody\r\n'],
  ] as const) {
    test(`${name}: the new text gets its own line and splits back`, () => {
      const s = split(src)
      const yaml = name === 'CRLF' ? 'title: x\r' : 'title: x'
      const out = compose(yaml, s.body, s.shape)
      expect(out).toBe(want)
      expect(split(out).yaml).toBe(yaml)
    })
  }
})

describe('adding a body after a closing fence at the end of the file', () => {
  for (const [name, src, yaml, body, want] of [
    ['LF', '---\ntitle: x\n---', 'title: x', 'new\n', '---\ntitle: x\n---\nnew\n'],
    [
      'CRLF',
      '---\r\ntitle: x\r\n---',
      'title: x\r',
      'new\r\n',
      '---\r\ntitle: x\r\n---\r\nnew\r\n',
    ],
    ['adjacent fences', '---\n---', '', 'new\n', '---\n---\nnew\n'],
  ] as const) {
    test(`${name}: the body gets its own line and splits back`, () => {
      const out = compose(yaml, body, split(src).shape)
      expect(out).toBe(want)
      expect(split(out)).toMatchObject({ yaml, body })
    })
  }
})

describe('splitLenient indentation', () => {
  test('an indented opening fence is accepted', () => {
    expect(splitLenient('  ---\na: 1\n---\nbody\n')).toEqual({ yaml: 'a: 1', body: 'body\n' })
  })

  test('an indented closing fence does not close the block', () => {
    expect(splitLenient('---\na: 1\n  ---\nb: 2\n---\nbody\n')).toEqual({
      yaml: 'a: 1\n  ---\nb: 2',
      body: 'body\n',
    })
  })
})

describe('unterminated', () => {
  for (const [name, src] of [
    ['LF', '---\ntitle: A\nno closing fence\n'],
    ['CRLF', '---\r\ntitle: A\r\nno closing fence\r\n'],
    ['BOM', `${BOM}---\ntitle: A\n`],
    ['BOM and CRLF', `${BOM}---\r\ntitle: A\r\n`],
    ['only the opening fence', '---\n'],
    ['a fence-like line that is not a terminator', '---\na: 1\n---x\n'],
  ] as const) {
    test(`${name}: flagged, and still read as body`, () => {
      const s = split(src)
      expect(s.unterminated).toBe(true)
      expect(s.yaml).toBeNull()
      expect(s.body).toBe(src.startsWith(BOM) ? src.slice(BOM.length) : src)
      expect(compose(s.yaml, s.body, s.shape)).toBe(src)
    })
  }

  for (const [name, src] of [
    ['no frontmatter', 'just text\n'],
    ['empty', ''],
    ['a fence with no line break', '---'],
    ['a fence after a blank line', '\n---\na: 1\n'],
    ['an indented fence', ' ---\na: 1\n'],
    ['a closed block', '---\na: 1\n---\nbody\n'],
    ['an empty block', '---\n---\n'],
    ['adjacent fences at the end', '---\n---'],
    ['a block closed at the end of the file', '---\na: 1\n---'],
  ] as const) {
    test(`${name}: not flagged`, () => {
      expect(split(src).unterminated).toBe(false)
    })
  }
})

describe('newShape', () => {
  test('defaults: LF fences, no BOM, a closing line ending', () => {
    expect(newShape()).toEqual({ bom: false, openEol: '\n', closeEol: '\n', closeSep: true })
    expect(newShape({ eol: undefined, bom: undefined })).toEqual(newShape())
  })

  test('is the shape split reads from a note composed with it', () => {
    for (const eol of ['\n', '\r\n'] as const) {
      for (const bom of [false, true]) {
        const shape = newShape({ eol, bom })
        const yaml = eol === '\n' ? 'a: 1\nb: 2' : 'a: 1\r\nb: 2\r'
        const note = compose(yaml, `body${eol}`, shape)
        const back = split(note)
        expect(back.shape).toEqual(shape)
        expect([back.yaml, back.body]).toEqual([yaml, `body${eol}`])
        expect(compose(back.yaml, back.body, back.shape)).toBe(note)
      }
    }
  })

  for (const [name, yaml, body, want] of [
    ['an empty block', '', 'body\n', '---\n\n---\nbody\n'],
    ['an empty body', 'a: 1', '', '---\na: 1\n---\n'],
    ['no block', null, 'body\n', 'body\n'],
  ] as const) {
    test(`${name}`, () => {
      const out = compose(yaml, body, newShape())
      expect(out).toBe(want)
      const back = split(out)
      expect([back.yaml, back.body]).toEqual([yaml, body])
    })
  }

  test('a fresh object each call', () => {
    expect(newShape()).not.toBe(newShape())
  })
})
