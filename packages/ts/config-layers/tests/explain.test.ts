/**
 * Tests for reading keys from a schema (`../src/explain.ts`) against a small
 * synthetic schema: the dotted key-path parser and walker, the shape renderer,
 * defaults and nested fields, and the plain-value path helpers.
 */

import { describe, expect, test } from 'vitest'

import { z } from 'zod'

import {
  defaultOf,
  describeShape,
  getIn,
  jsonSchemaOf,
  nestedFields,
  omitPath,
  resolveKeyPath,
  splitKeyPath,
  topLevelKeys,
} from '../src/explain.ts'
import type { ConfigKeyMeta } from '../src/meta.ts'

const META: ConfigKeyMeta = {
  category: 'core',
  consumers: ['meta.ts#readConfigMeta'],
  layers: ['project'],
  applies_via: 'read',
  enforcement: 'soft',
  runs_in: ['cli'],
}

const SHAPE: Record<string, z.ZodType> = {
  docs_site: z.string().default('site').describe('Where the site lives.').meta(META),
  limits: z
    .object({
      implement: z.number().int().min(0).default(2).describe('Parallel implement jobs.'),
      mode: z.enum(['rebase', 'merge']).default('rebase').describe('How to land.'),
      labels: z.array(z.string()).default([]).describe('Labels.'),
    })
    .strict()
    .prefault({})
    .describe('Caps.')
    .meta(META),
  workflows: z
    .record(z.string(), z.array(z.string()))
    .default({})
    .describe('Named lists.')
    .meta(META),
}

describe('splitKeyPath', () => {
  test('splits a dotted path into segments', () => {
    expect(splitKeyPath('server.limits.timeout')).toEqual(['server', 'limits', 'timeout'])
  })

  test('a bare top-level key is a single-segment path', () => {
    expect(splitKeyPath('docs_site')).toEqual(['docs_site'])
  })

  test('an empty key rejects with the dotted-segment hint', () => {
    expect(() => splitKeyPath('')).toThrow(
      "invalid key path '': use dotted segments like 'server.limits.timeout'",
    )
  })

  test('a trailing dot leaves an empty final segment and rejects', () => {
    expect(() => splitKeyPath('server.')).toThrow(
      "invalid key path 'server.': use dotted segments like 'server.limits.timeout'",
    )
  })

  test('consecutive dots leave an empty middle segment and reject', () => {
    expect(() => splitKeyPath('server..limits')).toThrow(
      "invalid key path 'server..limits': use dotted segments like 'server.limits.timeout'",
    )
  })
})

describe('resolveKeyPath', () => {
  test('a top-level key resolves to its own schema and section', () => {
    const r = resolveKeyPath(SHAPE, ['docs_site'])
    expect(r.section).toBe('docs_site')
    expect(r.path).toEqual(['docs_site'])
    expect(r.description).toBe('Where the site lives.')
  })

  test('a nested key resolves and inherits its section meta', () => {
    const r = resolveKeyPath(SHAPE, ['limits', 'implement'])
    expect(r.section).toBe('limits')
    expect(r.description).toBe('Parallel implement jobs.')
    expect(r.meta.category).toBe('core')
  })

  test('a record entry resolves to the record value schema', () => {
    expect(describeShape(resolveKeyPath(SHAPE, ['workflows', 'check']).schema)).toBe('list<string>')
  })

  test('an unknown top-level key names the config and lists the known keys', () => {
    expect(() => resolveKeyPath(SHAPE, ['nope'], { file: 'cfg.yaml' })).toThrow(
      "unknown cfg.yaml key 'nope' (known: docs_site, limits, workflows)",
    )
    expect(() => resolveKeyPath(SHAPE, ['nope'])).toThrow("unknown config key 'nope'")
  })

  test('a near miss is answered with the closest key path', () => {
    expect(() => resolveKeyPath(SHAPE, ['limits', 'implment'])).toThrow(
      "unknown key 'limits.implment'; did you mean: limits.implement?",
    )
    expect(() => resolveKeyPath(SHAPE, ['docs_sit'])).toThrow(
      "unknown config key 'docs_sit'; did you mean: docs_site?",
    )
  })

  test('walking past a scalar reports it is not a mapping', () => {
    expect(() => resolveKeyPath(SHAPE, ['docs_site', 'nope'])).toThrow(
      "'docs_site' is not a mapping, so 'nope' cannot be under it",
    )
  })

  test('topLevelKeys reads the meta of every key in declaration order', () => {
    expect(Object.keys(topLevelKeys(SHAPE))).toEqual(['docs_site', 'limits', 'workflows'])
  })
})

describe('describeShape, defaultOf, nestedFields, jsonSchemaOf', () => {
  test('shapes render as short type strings', () => {
    expect(describeShape(resolveKeyPath(SHAPE, ['docs_site']).schema)).toBe('string')
    expect(describeShape(resolveKeyPath(SHAPE, ['limits', 'implement']).schema)).toBe(
      'integer >= 0',
    )
    expect(describeShape(resolveKeyPath(SHAPE, ['limits', 'mode']).schema)).toBe(
      "'rebase' | 'merge'",
    )
    expect(describeShape(resolveKeyPath(SHAPE, ['limits', 'labels']).schema)).toBe('list<string>')
    expect(describeShape(resolveKeyPath(SHAPE, ['limits']).schema)).toBe('object')
    expect(describeShape(resolveKeyPath(SHAPE, ['workflows']).schema)).toBe(
      'map<string, list<string>>',
    )
  })

  test('defaultOf is the schema parse of undefined', () => {
    expect(defaultOf(resolveKeyPath(SHAPE, ['docs_site']).schema)).toBe('site')
    expect(defaultOf(resolveKeyPath(SHAPE, ['limits']).schema)).toEqual({
      implement: 2,
      mode: 'rebase',
      labels: [],
    })
    expect(defaultOf(z.string())).toBeUndefined()
  })

  test('nestedFields lists an object field children and is empty for a scalar', () => {
    expect(nestedFields(resolveKeyPath(SHAPE, ['limits']).schema).map((f) => f.name)).toEqual([
      'implement',
      'mode',
      'labels',
    ])
    expect(nestedFields(resolveKeyPath(SHAPE, ['docs_site']).schema)).toEqual([])
  })

  test('jsonSchemaOf strips prose and meta', () => {
    const json = jsonSchemaOf(resolveKeyPath(SHAPE, ['docs_site']).schema)
    expect(json).not.toHaveProperty('description')
    expect(json).not.toHaveProperty('default')
    expect(json['type']).toBe('string')
  })
})

describe('getIn and omitPath', () => {
  const value = { a: { b: { c: 1 }, d: 2 }, e: [1] }

  test('getIn finds a nested value and reports a miss', () => {
    expect(getIn(value, ['a', 'b', 'c'])).toEqual({ found: true, value: 1 })
    expect(getIn(value, ['a', 'x'])).toEqual({ found: false, value: undefined })
    expect(getIn(value, ['e', '0'])).toEqual({ found: false, value: undefined })
  })

  test('omitPath removes one key and leaves siblings and the input alone', () => {
    expect(omitPath(value, ['a', 'b'])).toEqual({ a: { d: 2 }, e: [1] })
    expect(value.a.b).toEqual({ c: 1 })
    expect(omitPath(value, ['a', 'nope', 'deeper'])).toEqual(value)
  })
})
