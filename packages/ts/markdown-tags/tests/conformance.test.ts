/**
 * Runs the markdown-tags conformance suite,
 * `packages/conformance/markdown-tags/suite.json`, against this package.
 *
 * The suite holds the cases this package and the Rust `markdown-tags` crate
 * must agree on. The crate is the family's reference: its generator writes
 * every `inline_tags` expectation. Each case gives the tags found in a body
 * under all three dialects.
 *
 * The `renderer_only` section is a renderer's answer, read from the syntax
 * tree where a source scan cannot match it. This package skips it, by name,
 * and so does the crate. A section the runner does not know, a case key it
 * does not know and a case it does not run all fail it.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import { TAG_DIALECTS, extractBoth, inlineTags } from '../src/index.ts'

interface Case {
  name: string
  input: { body: string }
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

test('the suite has the sections this package knows', () => {
  expect(suite.family).toBe('markdown-tags')
  expect(suite.reference).toBe('rust')
  expect(Object.keys(suite.sections).sort()).toEqual(['inline_tags', RENDERER_ONLY])
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
      for (const dialect of TAG_DIALECTS) {
        test(dialect, () => {
          expect(inlineTags(c.input.body, dialect)).toEqual(c.expect[dialect])
        })
      }
      test('extractBoth', () => {
        expect(extractBoth(c.input.body)).toEqual([c.expect['unicode'], c.expect['ascii']])
      })
    })
  }
})
