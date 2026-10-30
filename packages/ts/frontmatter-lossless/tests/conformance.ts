/**
 * Runs the frontmatter-lossless conformance suite,
 * `packages/conformance/frontmatter-lossless/suite.json`, against a build of
 * this package.
 *
 * The suite holds the cases this package and the Rust `frontmatter-lossless`
 * crate must agree on. The crate is the family's reference: its generator
 * writes every `expect`. `index.test.ts` runs the suite against the source and
 * `corpus-dist.test.ts` against `dist/`, both through {@link runSuite}.
 *
 * The suite's offsets are UTF-8 bytes. This package's are UTF-16 string
 * indices, so the runner converts them before it compares.
 *
 * Every section and case runs. A missing section, or a section, case key or
 * input key the runner does not know, fails it. On top of the stored values it checks what the
 * values cannot say on their own: a strict split composes back to its source,
 * the offsets index the source, an unterminated note has no block, and
 * composed text splits back to what went in.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import type * as Lib from '../src/index.ts'

/** The functions the suite exercises, from `src/` or from `dist/`. */
export type FrontmatterLossless = Pick<
  typeof Lib,
  'split' | 'compose' | 'newShape' | 'splitLenient'
>

interface Case {
  name: string
  input: Record<string, unknown>
  expect: unknown
}

interface Suite {
  family: string
  reference: string
  referenceVersion: string
  sections: Record<string, { description: string; cases: Case[] }>
}

/** The suite, read from its path in the repository. */
export function readSuite(): Suite {
  const url = new URL('../../../conformance/frontmatter-lossless/suite.json', import.meta.url)
  return JSON.parse(readFileSync(url, 'utf8')) as Suite
}

/** The sections this package runs. A missing or extra one fails the suite. */
export const SECTIONS = ['split', 'split_lenient', 'compose_edit', 'new_shape']

/** The keys a case may have. */
const CASE_KEYS = ['name', 'input', 'expect']

const encoder = new TextEncoder()

/** The UTF-8 byte offset of UTF-16 index `index` in `src`. */
export function byteOffset(src: string, index: number): number {
  return encoder.encode(src.slice(0, index)).length
}

/** `input`, checked to have exactly `keys`. */
function fields(input: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const extra = Object.keys(input).filter((k) => !keys.includes(k))
  if (extra.length > 0) throw new Error(`input has unknown keys ${extra.join(', ')}`)
  const missing = keys.filter((k) => !(k in input))
  if (missing.length > 0) throw new Error(`input has no ${missing.join(', ')}`)
  return input
}

function text(input: Record<string, unknown>, key: string): string {
  const v = input[key]
  if (typeof v !== 'string') throw new Error(`${key} is not a string`)
  return v
}

function maybeText(input: Record<string, unknown>, key: string): string | null {
  const v = input[key]
  if (v !== null && typeof v !== 'string') throw new Error(`${key} is not a string or null`)
  return v
}

/** What `lib` gives for `input` in `section`, in the suite's shape. */
export function run(
  lib: FrontmatterLossless,
  section: string,
  input: Record<string, unknown>,
): unknown {
  switch (section) {
    case 'split': {
      const source = text(fields(input, ['source']), 'source')
      const s = lib.split(source)
      return {
        yaml: s.yaml,
        yaml_range: {
          start: byteOffset(source, s.yamlRange.start),
          end: byteOffset(source, s.yamlRange.end),
        },
        body: s.body,
        body_start: byteOffset(source, s.bodyStart),
        bom: s.shape.bom,
        open_eol: s.shape.openEol,
        close_eol: s.shape.closeEol,
        close_sep: s.shape.closeSep,
        unterminated: s.unterminated,
      }
    }
    case 'split_lenient': {
      const l = lib.splitLenient(text(fields(input, ['source']), 'source'))
      return l === null ? null : { yaml: l.yaml, body: l.body }
    }
    case 'compose_edit': {
      const i = fields(input, ['source', 'yaml', 'body'])
      const shape = lib.split(text(i, 'source')).shape
      return { out: lib.compose(maybeText(i, 'yaml'), text(i, 'body'), shape) }
    }
    case 'new_shape': {
      const i = fields(input, ['eol', 'bom', 'yaml', 'body'])
      const eol = maybeText(i, 'eol')
      if (eol !== null && eol !== '\n' && eol !== '\r\n')
        throw new Error(`eol ${JSON.stringify(eol)} is not "\\n" or "\\r\\n"`)
      const bom = i['bom']
      if (bom !== null && typeof bom !== 'boolean') throw new Error('bom is not a boolean or null')
      const shape = lib.newShape({ eol: eol ?? undefined, bom: bom ?? undefined })
      return {
        shape: {
          bom: shape.bom,
          open_eol: shape.openEol,
          close_eol: shape.closeEol,
          close_sep: shape.closeSep,
        },
        out: lib.compose(maybeText(i, 'yaml'), text(i, 'body'), shape),
      }
    }
    default:
      throw new Error(`unknown section ${section}`)
  }
}

/** Checks the properties of a `split` case the stored values cannot say. */
function splitProperties(lib: FrontmatterLossless, source: string): void {
  const s = lib.split(source)
  expect(lib.compose(s.yaml, s.body, s.shape), 'the round trip is byte-identical').toBe(source)
  if (s.yaml !== null) expect(source.slice(s.yamlRange.start, s.yamlRange.end)).toBe(s.yaml)
  expect(source.slice(s.bodyStart)).toBe(s.body)
  if (s.unterminated === true)
    expect(s.yaml, 'only a note with no block can be unterminated').toBeNull()
}

/** Checks that `out` splits back to the `yaml` and `body` composed into it. */
function splitsBack(lib: FrontmatterLossless, out: string, input: Record<string, unknown>): void {
  const back = lib.split(out)
  expect([back.yaml, back.body]).toEqual([maybeText(input, 'yaml'), text(input, 'body')])
}

/** Registers one test per suite case, run against `lib`. */
export function runSuite(lib: FrontmatterLossless): void {
  const suite = readSuite()
  const ran = new Set<string>()
  const all = Object.entries(suite.sections).flatMap(([s, body]) =>
    body.cases.map((c) => `${s}/${c.name}`),
  )

  describe('conformance suite', () => {
    test('is the frontmatter-lossless suite, with Rust as its reference', () => {
      expect([suite.family, suite.reference]).toEqual(['frontmatter-lossless', 'rust'])
      expect(all.length).toBeGreaterThan(0)
    })

    test('has exactly the sections this package runs', () => {
      expect(Object.keys(suite.sections).sort()).toEqual([...SECTIONS].sort())
    })

    for (const [section, body] of Object.entries(suite.sections)) {
      if (!SECTIONS.includes(section)) continue
      describe(section, () => {
        for (const c of body.cases) {
          test(c.name, () => {
            expect(
              Object.keys(c).filter((k) => !CASE_KEYS.includes(k)),
              'unknown case keys',
            ).toEqual([])
            const got = run(lib, section, c.input)
            expect(got).toStrictEqual(c.expect)
            if (section === 'split') splitProperties(lib, text(c.input, 'source'))
            if (section === 'compose_edit' || section === 'new_shape') {
              splitsBack(lib, (got as { out: string }).out, c.input)
            }
            ran.add(`${section}/${c.name}`)
          })
        }
      })
    }

    // Vitest runs a file's tests in order, so this runs last.
    test('ran every case', () => {
      expect(all.filter((n) => !ran.has(n))).toEqual([])
    })
  })
}
