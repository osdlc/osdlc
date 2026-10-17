/**
 * @osdlc/frontmatter-lossless conformance — the TS half of the shared framing
 * corpus. The `frontmatter-lossless` Rust crate runs the same fixtures, so a
 * framing change that lands in only one implementation fails the other's
 * suite. Each fixture checks split parity, lenient parity, offset validity and
 * a byte-identical round trip.
 *
 * Plus TS mirrors of the Rust crate's hand-written tests (mid-text BOM, CRLF
 * value swap, the empty block), so the two suites cover the same ground even
 * where the corpus JSON has no field for it.
 *
 * `fixtures/conformance.json` is a copy of the Rust crate's corpus, pinned by
 * `CORPUS_SHA256` below, until the crate moves into this repository and both
 * read one file. See docs/planning/decisions/D-07-conformance-corpus.md.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { test, expect, describe } from 'bun:test'
import { split, compose, splitLenient, type CloseEol, type OpenEol } from '../index.ts'
import corpus from './fixtures/conformance.json'

/** The Rust crate's corpus this copy was taken from. Change it only with the crate's. */
const CORPUS_SHA256 = '02b7468385e8d743e1a3d4388c3a9f04eb97732d375e901ae99f653764d849c3'

test('the corpus copy matches the revision it was copied from', () => {
  const bytes = readFileSync(new URL('./fixtures/conformance.json', import.meta.url))
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(CORPUS_SHA256)
})

interface Fixture {
  name: string
  source: string
  split: {
    yaml: string | null
    body: string
    bom: boolean
    openEol: OpenEol
    closeEol: CloseEol
    closeSep: boolean
  }
  lenient: { yaml: string; body: string } | null
}

const fixtures = corpus as Fixture[]

// Built at runtime so no literal U+FEFF hides in this file's source.
const BOM = String.fromCharCode(0xfeff)

describe('shared conformance corpus', () => {
  test('the corpus is non-empty', () => {
    expect(fixtures.length).toBeGreaterThan(0)
  })

  for (const fx of fixtures) {
    test(`[${fx.name}] split matches the shared contract`, () => {
      const s = split(fx.source)
      expect(s.yaml).toBe(fx.split.yaml)
      expect(s.body).toBe(fx.split.body)
      expect(s.shape.bom).toBe(fx.split.bom)
      expect(s.shape.openEol).toBe(fx.split.openEol)
      expect(s.shape.closeEol).toBe(fx.split.closeEol)
      expect(s.shape.closeSep).toBe(fx.split.closeSep)
    })

    // The property that matters: split a note and recompose it, and land on
    // the original file byte for byte — anything that normalises fences,
    // drops or doubles a BOM, or rewrites CRLF fails here.
    test(`[${fx.name}] round trip is byte-identical`, () => {
      const s = split(fx.source)
      expect(compose(s.yaml, s.body, s.shape)).toBe(fx.source)
    })

    test(`[${fx.name}] lenient matches the shared contract`, () => {
      const l = splitLenient(fx.source)
      if (fx.lenient === null) {
        expect(l).toBeNull()
      } else {
        expect(l).not.toBeNull()
        expect(l?.yaml).toBe(fx.lenient.yaml)
        expect(l?.body).toBe(fx.lenient.body)
      }
    })

    // `yamlRange` and `bodyStart` index the original source exactly (as
    // string indices — the port's native indexing, per the module doc).
    test(`[${fx.name}] offsets index the original source`, () => {
      const s = split(fx.source)
      if (s.yaml !== null) {
        expect(fx.source.slice(s.yamlRange.start, s.yamlRange.end)).toBe(s.yaml)
      }
      expect(fx.source.slice(s.bodyStart)).toBe(s.body)
    })
  }
})

describe('framing details (mirrors of the Rust hand-written tests)', () => {
  test('a BOM anywhere but index zero is ordinary content, not framing', () => {
    const s = split(`---\ntitle: a${BOM}b\n---\nbody\n`)
    expect(s.shape.bom).toBe(false)
    expect(s.yaml).toBe(`title: a${BOM}b`)
  })

  test('CRLF fences survive a value swap', () => {
    // Emulate a splice: keep the shape, hand `compose` new YAML text. The
    // fences must come back as CRLF, not LF.
    const s = split('---\r\ntitle: old\r\n---\r\nbody\r\n')
    const out = compose('title: new\r', s.body, s.shape)
    expect(out).toBe('---\r\ntitle: new\r\n---\r\nbody\r\n')
    expect(out.includes('---\n')).toBe(false)
  })

  test('compose reproduces an empty block', () => {
    const s = split('---\n---\nbody\n')
    expect(s.yaml).toBe('')
    expect(s.body).toBe('body\n')
    expect(compose(s.yaml, s.body, s.shape)).toBe('---\n---\nbody\n')
  })

  test('lenient still needs a bare fence to close', () => {
    expect(splitLenient('---\na: 1\n---below\nb: 2\n---\nbody\n')).toEqual({
      yaml: 'a: 1\n---below\nb: 2',
      body: 'body\n',
    })
  })

  test('lenient does not strip a mid-whitespace BOM the way trimStart would', () => {
    // JS String.prototype.trimStart eats U+FEFF; Rust's trim_start does not.
    // The port must side with Rust: a BOM after leading spaces blocks the
    // fence from being recognised.
    expect(splitLenient(`  ${BOM}---\na: 1\n---\nbody\n`)).toBeNull()
  })
})

describe('branches the corpus does not reach', () => {
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
