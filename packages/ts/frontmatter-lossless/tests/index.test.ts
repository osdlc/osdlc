/**
 * @osdlc/frontmatter-lossless conformance — the TS half of the shared framing
 * corpus. The `frontmatter-lossless` Rust crate runs the same fixtures. Each
 * fixture checks split parity, lenient parity, offset validity, a
 * byte-identical round trip and its `edit` case, if it has one.
 *
 * Plus TS mirrors of the Rust crate's hand-written tests (mid-text BOM, CRLF
 * value swap, new text written into an empty block or after a closing fence at
 * the end of the file), so the two suites cover the same ground even where the
 * corpus JSON has no field for it.
 *
 * `fixtures/conformance.json` is a copy of the Rust crate's corpus, pinned by
 * `CORPUS_SHA256` below. The pin only stops the copy changing by accident: a
 * change to the crate's corpus does not reach this suite, and a change made
 * only here fails nothing in the crate. The copy is re-synced by hand until
 * the crate moves into this repository (sksizer/dev task T-ACAH) and both
 * suites read one file. See docs/planning/decisions/D-07-conformance-corpus.md.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { test, expect, describe } from 'bun:test'
import { split, compose, newShape, splitLenient, type CloseEol, type OpenEol } from '../index.ts'
import corpus from './fixtures/conformance.json'

/** The Rust crate's corpus this copy was taken from. Change it only with the crate's. */
const CORPUS_SHA256 = '75f48441a439f578b1f5207e273454c4ca9e298c91179c3a23d9c1c3958e606d'

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
  edit?: { yaml: string; body: string; out: string }
}

const fixtures = corpus as Fixture[]

const BOM = '\uFEFF'

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

    const edit = fx.edit
    if (edit) {
      test(`[${fx.name}] new text composed into its shape splits back`, () => {
        const out = compose(edit.yaml, edit.body, split(fx.source).shape)
        expect(out).toBe(edit.out)
        expect(split(out)).toMatchObject({ yaml: edit.yaml, body: edit.body })
      })
    }

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

  test('across the corpus, only a note with no block can be flagged', () => {
    for (const fx of fixtures) {
      const s = split(fx.source)
      if (s.unterminated) expect(s.yaml).toBeNull()
    }
  })
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
