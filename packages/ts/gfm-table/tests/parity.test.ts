/**
 * The shared conformance fixture. It lives in the Rust twin,
 * `packages/rust/gfm-pipe-table/tests/fixtures/parity.json`, which its
 * `tests/parity.rs` also reads. This suite reads it by its path in the
 * repository, so a case added on either side goes in the fixture, never in
 * one package's own suite. Every section has a runner in parity-run.ts, and
 * an unknown section fails the run.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { byteOffset, RUNNERS, utf16Offset } from './parity-run.ts'

const FIXTURE_PATH = join(
  import.meta.dirname,
  '../../../rust/gfm-pipe-table/tests/fixtures/parity.json',
)
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')) as Record<string, unknown>

interface Case {
  name: string
  expected: unknown
  [input: string]: unknown
}

const sections = Object.entries(fixture).filter(([key]) => !key.startsWith('_'))

test('every section has a runner', () => {
  expect(sections.map(([key]) => key).filter((key) => !(key in RUNNERS))).toEqual([])
  expect(Object.keys(RUNNERS).filter((key) => !(key in fixture))).toEqual([])
})

test('the byte offset conversion', () => {
  expect(byteOffset('a中👍b', 4)).toBe(8)
  expect(utf16Offset('a中👍b', 8)).toBe(4)
  expect(() => utf16Offset('中', 1)).toThrow()
  // Byte 2 of the emoji: inside its surrogate pair, so not a boundary.
  expect(() => utf16Offset('|👍', 4)).toThrow()
})

for (const [section, cases] of sections) {
  describe(section, () => {
    for (const c of cases as Case[]) {
      test(c.name, () => {
        expect(RUNNERS[section]!(c)).toEqual(c.expected)
      })
    }
  })
}
