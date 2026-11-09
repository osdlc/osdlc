/**
 * Runs the markdown-tags conformance suite,
 * `packages/conformance/markdown-tags/suite.json`, against this package.
 *
 * The suite holds the cases this package and the Rust `markdown-tags` crate
 * must agree on. The crate is the family's reference: its generator writes
 * every expectation but `renderer_only`'s. An `inline_tags` case gives the tags
 * found in a body under all three dialects; a `tag_at` case gives the tag at
 * one offset.
 *
 * The `renderer_only` section is a renderer's answer, read from the syntax
 * tree where a source scan cannot match it. This package skips it, by name,
 * and so does the crate. A section the runner does not know, a case key it
 * does not know and a case it does not run all fail it.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import { TAG_DIALECTS, extractBoth, inlineTags, isTagDialect, tagAt } from '../src/index.ts'

interface Case {
  name: string
  input: Record<string, unknown>
  expect: Record<string, unknown>
}

interface Suite {
  family: string
  reference: string
  sections: Record<string, { description: string; cases: Case[] }>
}

const suite = JSON.parse(
  readFileSync(new URL('../../../conformance/markdown-tags/suite.json', import.meta.url), 'utf8'),
) as Suite

const CASE_KEYS = ['name', 'input', 'expect']
const RENDERER_ONLY = 'renderer_only'

const ENCODER = new TextEncoder()

/** The UTF-16 index of UTF-8 byte offset `offset` in `text`, or null off a character boundary. */
function utf16Index(text: string, offset: number): number | null {
  let bytes = 0
  let index = 0
  for (const char of text) {
    if (bytes === offset) return index
    if (bytes > offset) return null
    bytes += ENCODER.encode(char).length
    index += char.length
  }
  return bytes === offset ? index : null
}

test('the suite has the sections this package knows', () => {
  expect(suite.family).toBe('markdown-tags')
  expect(suite.reference).toBe('rust')
  expect(Object.keys(suite.sections).sort()).toEqual(
    ['inline_tags', RENDERER_ONLY, 'tag_at'].sort(),
  )
})

describe('inline_tags', () => {
  const cases = suite.sections['inline_tags']!.cases
  test('has cases', () => {
    expect(cases.length).toBeGreaterThan(0)
  })
  for (const c of cases) {
    describe(c.name, () => {
      test('has only the known keys', () => {
        expect(Object.keys(c).sort()).toEqual([...CASE_KEYS].sort())
        expect(Object.keys(c.input)).toEqual(['body'])
      })
      const body = c.input['body'] as string
      for (const dialect of TAG_DIALECTS) {
        test(dialect, () => {
          expect(inlineTags(body, dialect)).toEqual(c.expect[dialect])
        })
      }
      test('extractBoth', () => {
        expect(extractBoth(body)).toEqual([c.expect['unicode'], c.expect['ascii']])
      })
    })
  }
})

describe('tag_at', () => {
  const cases = suite.sections['tag_at']!.cases
  test('has cases', () => {
    expect(cases.length).toBeGreaterThan(0)
  })
  for (const c of cases) {
    test(c.name, () => {
      expect(Object.keys(c).sort()).toEqual([...CASE_KEYS].sort())
      expect(Object.keys(c.input).sort()).toEqual(['dialect', 'index', 'text'])
      const dialect = c.input['dialect']
      if (!isTagDialect(dialect)) throw new Error(`unknown dialect ${String(dialect)}`)
      const text = c.input['text'] as string
      const index = utf16Index(text, c.input['index'] as number)
      expect(index === null ? null : tagAt(text, index, dialect)).toEqual(c.expect['tag'])
    })
  }
})
