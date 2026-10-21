/**
 * Unit tests for the schema-driven scaffold generator (`../scaffold.ts`),
 * asserted against a small synthetic schema.
 */

import { describe, expect, test } from 'vitest'

import { z } from 'zod'

import type { ConfigKeyMeta } from '../meta.ts'
import { scaffoldLocalYaml, scaffoldYaml, starterYaml } from '../scaffold.ts'

import { vocabulary } from './support.ts'

const SYNTH = z
  .object({
    flag: z.boolean().default(true).describe('A boolean knob.'),
    count: z.number().int().default(3).describe('A number knob.'),
    mode: z.enum(['a', 'b', 'c']).default('b').describe('An enum knob.'),
    items: z.array(z.string()).default([]).describe('A list knob.'),
    optional_str: z.string().optional().describe('An optional string with no default.'),
    nested: z
      .object({
        inner: z.string().default('x').describe('A nested leaf.'),
      })
      .prefault({})
      .describe('A nested block.'),
  })
  .strict()

describe('scaffoldYaml — behaviors (synthetic schema)', () => {
  const y = scaffoldYaml(SYNTH, ['# header'])

  test('renders scalar defaults as YAML values', () => {
    expect(y).toContain('flag: true')
    expect(y).toContain('count: 3')
    expect(y).toContain('mode: b')
    expect(y).toContain('items: []')
  })

  test('emits enum choices as a comment', () => {
    expect(y).toContain('# one of: a | b | c')
  })

  test('optional-no-default keys are emitted commented, not active', () => {
    expect(y).toContain('# optional_str:')
    expect(y).not.toMatch(/^optional_str:/m)
  })

  test('descriptions render as comments', () => {
    expect(y).toContain('# A boolean knob.')
    expect(y).toContain('# A nested block.')
    expect(y).toContain('# A nested leaf.')
  })

  test('nested objects render as indented blocks', () => {
    expect(y).toMatch(/nested:\n(?: {2}#.*\n)* {2}inner: x/)
  })

  test('extraCommentsByKey injects commented lines under the named key', () => {
    const withExtra = scaffoldYaml(SYNTH, ['# header'], {
      extraCommentsByKey: { items: ['- foo', '- bar'] },
    })
    expect(withExtra).toContain('items: []')
    expect(withExtra).toContain('# - foo')
    expect(withExtra).toContain('# - bar')
  })
})

describe('scaffoldYaml — header, records and the local template', () => {
  const WITH_RECORD = z
    .object({
      names: z.record(z.string(), z.array(z.string())).default({}).describe('Named lists.'),
      plain: z.string().default('p').describe('A leaf.'),
    })
    .strict()

  test('the header opens the file and a blank line separates it from the body', () => {
    expect(scaffoldYaml(SYNTH, ['# one', '# two']).startsWith('# one\n# two\n\n')).toBe(true)
  })

  test('a record renders as an empty map with its notes and detected entries', () => {
    const y = scaffoldYaml(WITH_RECORD, ['# h'], {
      recordNotes: { names: ['# Example:', '# names:', '#   a:', '#     - x'] },
      extraCommentsByKey: { 'names.a': ['one', 'two'] },
    })
    expect(y).toContain('names: {}\n# Example:\n# names:\n#   a:\n#     - x\n')
    expect(y).toContain('#   a: detected — uncomment any to use:\n#     - one\n#     - two\n')
  })

  test('the local template comments out every key', () => {
    const y = scaffoldLocalYaml(SYNTH, ['# local'])
    expect(y.startsWith('# local\n\n')).toBe(true)
    expect(y).toContain('# flag: true')
    expect(y).not.toMatch(/^flag:/m)
  })
})

describe('starterYaml', () => {
  const META: ConfigKeyMeta = {
    category: 'core',
    consumers: ['meta.ts#readConfigMeta'],
    layers: ['project'],
    applies_via: 'read',
    enforcement: 'soft',
    runs_in: ['cli'],
  }
  const SCHEMA = z
    .object({
      flows: z
        .record(z.string(), z.array(z.string()))
        .default({})
        .describe('Named lists.')
        .meta(META),
      other: z.string().default('o').describe('Another key.').meta(META),
    })
    .strict()

  test('live entries are written under their key, everything else is commented out', () => {
    const y = starterYaml(SCHEMA, {
      header: ['# start'],
      categories: vocabulary.spec.categories,
      live: { flows: { build: ['make'], empty: [] } },
    })
    expect(y).toMatch(/^flows:\n {2}build:\n {4}- make$/m)
    expect(y).not.toContain('empty')
    expect(y).toContain('# other: o')
    expect(y).not.toMatch(/^other:/m)
  })

  test('a key whose category is not listed throws', () => {
    expect(() => starterYaml(SCHEMA, { header: [], categories: ['extras'] })).toThrow(/core/)
  })

  test('with nothing live the record is commented out like the rest', () => {
    const y = starterYaml(SCHEMA, {
      header: ['# start'],
      categories: vocabulary.spec.categories,
      live: { flows: {} },
    })
    expect(y).not.toMatch(/^flows:/m)
    expect(y).toContain('# flows: {}')
  })
})

describe('quote and wrap the pieces a scaffold is built from', () => {
  test('strings are quoted only when plain YAML would misread them', () => {
    const y = scaffoldYaml(
      z.object({
        a: z.string().default('plain'),
        b: z.string().default(''),
        c: z.string().default('a: b'),
        d: z.string().default("it's 5"),
      }),
      [],
    )
    expect(y).toContain('a: plain\n')
    expect(y).toContain("b: ''\n")
    expect(y).toContain("c: 'a: b'\n")
    expect(y).toContain("d: 'it''s 5'\n")
  })

  test('a long description wraps into comment lines', () => {
    const y = scaffoldYaml(
      z.object({ k: z.string().default('v').describe('word '.repeat(40)) }),
      [],
    )
    const comments = y.split('\n').filter((l) => l.startsWith('# word'))
    expect(comments.length).toBeGreaterThan(1)
    expect(y.split('\n').every((l) => l.length <= 78)).toBe(true)
  })

  test('an optional block is written commented out, line by line', () => {
    const y = scaffoldYaml(
      z.object({
        opt: z.object({ a: z.number().default(1), b: z.string().default('x') }).optional(),
      }),
      [],
    )
    expect(y).toContain('# opt:')
    expect(y).not.toMatch(/^opt:/m)
    expect(y).toMatch(/^ {2}# a: 1$/m)
  })
})
