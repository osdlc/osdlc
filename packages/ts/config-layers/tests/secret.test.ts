/**
 * The `secret` flag: the schema walk finds a flagged field under every node
 * kind it can descend into, throws at section-definition time under one it
 * cannot, and the layer check it adds refuses the key in the project file.
 */

import { describe, expect, test } from 'vitest'

import { z } from 'zod'

import type { ConfigKeyMeta } from '../src/meta.ts'
import { defineConfigSection, projectLayerIssues } from '../src/section.ts'
import { sectionSecretPaths } from '../src/secret.ts'

const META: ConfigKeyMeta = {
  category: 'core',
  consumers: ['meta.ts#readConfigMeta'],
  layers: ['project', 'local'],
  applies_via: 'read',
  enforcement: 'soft',
  runs_in: ['cli'],
}

const secret = () => z.string().meta({ secret: true })

const section = (schema: z.ZodType, meta: ConfigKeyMeta = META) =>
  defineConfigSection({ key: 's', schema: schema.describe('A section.'), meta })

const paths = (schema: z.ZodType, meta?: ConfigKeyMeta) =>
  sectionSecretPaths(section(schema, meta)).map((p) => p.join('.'))

describe('the schema walk finds a secret under', () => {
  test('an object field', () => {
    expect(paths(z.object({ token: secret(), other: z.string() }))).toEqual(['s.token'])
  })
  test('a record value and an array element (the * index branch)', () => {
    expect(paths(z.object({ r: z.record(z.string(), secret()), a: z.array(secret()) }))).toEqual([
      's.r.*',
      's.a.*',
    ])
  })
  test('a tuple item and its rest (one deduped path)', () => {
    expect(paths(z.tuple([z.string(), secret()], secret()))).toEqual(['s.*'])
  })
  test('a union option', () => {
    expect(paths(z.union([z.string(), z.object({ k: secret() })]))).toEqual(['s.k'])
  })
  test('a discriminated union branch', () => {
    const schema = z.discriminatedUnion('type', [
      z.object({ type: z.literal('a') }),
      z.object({ type: z.literal('b'), url: secret() }),
    ])
    expect(paths(schema)).toEqual(['s.url'])
  })
  test('an intersection side', () => {
    expect(paths(z.intersection(z.object({ a: z.string() }), z.object({ b: secret() })))).toEqual([
      's.b',
    ])
  })
  test('a lazy schema', () => {
    expect(paths(z.lazy(() => z.object({ token: secret() })))).toEqual(['s.token'])
  })
  test('a preprocess pipe and its wrappers', () => {
    const schema = z.preprocess((v) => v, z.object({ k: secret().optional().default('x') }))
    expect(paths(schema)).toEqual(['s.k'])
  })
  test('a section-level flag covering the whole section', () => {
    expect(paths(z.object({ a: z.string() }), { ...META, secret: true })).toEqual(['s'])
  })
})

describe('a node the walk cannot descend into', () => {
  test('throws at definition, naming the node kind and path', () => {
    expect(() => section(z.object({ m: z.map(z.string(), secret()) }))).toThrow(
      /cannot descend into a "map" schema at s\.m/,
    )
  })
})

describe('a recursive schema', () => {
  test('throws at definition rather than list secrets to a fixed depth', () => {
    type Node = { token?: string | undefined; child?: Node | undefined }
    const node: z.ZodType<Node> = z.lazy(() =>
      z.object({ token: secret().optional(), child: node.optional() }),
    )
    expect(() => section(node)).toThrow(/recursive schema/)
  })
})

describe('the layer check', () => {
  const sections = [section(z.object({ token: secret() }))]

  test('refuses a secret in the project file, naming the key', () => {
    const issues = projectLayerIssues(sections, '/p', { s: { token: 'x' } })
    expect(issues.map((i) => i.path)).toEqual(['s.token'])
  })
  test('refuses a secret at an array index', () => {
    const arr = [section(z.object({ list: z.array(secret()) }))]
    const issues = projectLayerIssues(arr, '/p', { s: { list: ['a', 'b'] } })
    expect(issues.map((i) => i.path)).toEqual(['s.list.0', 's.list.1'])
  })
  test('hands a layerCheck value: undefined on a raw file, without throwing', () => {
    let seen: unknown = 'unset'
    const probe = defineConfigSection({
      key: 'probe',
      schema: z.object({ a: z.string().optional() }).optional().describe('Probe.'),
      meta: META,
      layerCheck: ({ value }) => {
        seen = value
        return []
      },
    })
    expect(projectLayerIssues([probe], '/p', { probe: { a: 'x' } })).toEqual([])
    expect(seen).toBeUndefined()
  })
})
