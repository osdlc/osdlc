import { describe, expect, test } from 'vitest'
import { z } from 'zod'

import {
  enumValues,
  fieldInfo,
  keyDescription,
  keyExists,
  kindOf,
  leafSchema,
  recordValueType,
  shapeOf,
  unwrapSchema,
} from '../src/schema.ts'
import { MachineSchema, ProjectSchema } from './support.ts'

describe('zod layout tripwire', () => {
  // The module reads zod's private `_def.type` / `_def.innerType`. If a zod
  // release moves them, every lookup silently returns null. This test fails
  // instead.
  test('wrappers peel by tag and records are tagged', () => {
    const wrapped = z.string().optional().default('x').nullable()
    expect((unwrapSchema(wrapped) as { _def: { type: string } })._def.type).toBe('string')
    expect((z.record(z.string(), z.string()) as { _def: { type: string } })._def.type).toBe(
      'record',
    )
    expect(Object.keys(shapeOf(ProjectSchema)).sort()).toEqual(['authority', 'checkout', 'paths'])
    expect(shapeOf(z.string())).toEqual({})
  })
})

describe('leafSchema / keyExists', () => {
  test('finds nested keys and treats a record as the leaf for its entries', () => {
    expect(leafSchema(ProjectSchema, 'checkout.layout')).not.toBeNull()
    expect(leafSchema(ProjectSchema, 'paths.anything')).toBe(shapeOf(ProjectSchema).paths!)
    expect(leafSchema(ProjectSchema, 'nope')).toBeNull()
    expect(leafSchema(ProjectSchema, 'checkout.nope')).toBeNull()
    expect(leafSchema(ProjectSchema, 'authority.deeper')).toBeNull()
    expect(keyExists(MachineSchema, 'repos')).toBe(true)
    expect(keyExists(MachineSchema, 'authority')).toBe(false)
  })
})

describe('keyDescription', () => {
  test('returns the first sentence, read off the outermost wrapper', () => {
    expect(keyDescription(ProjectSchema, 'authority')).toBe('The remote server the tool talks to.')
    expect(keyDescription(ProjectSchema, 'paths.dev')).toBe(keyDescription(ProjectSchema, 'paths'))
    expect(keyDescription(ProjectSchema, 'checkout.layout')).toBe('Where a checkout lands.')
    expect(keyDescription(MachineSchema, 'checkout.layout')).toBe('Overrides the project layout.')
  })

  test('null for an unknown key or one without prose', () => {
    expect(keyDescription(ProjectSchema, 'nope')).toBeNull()
    expect(keyDescription(z.object({ a: z.string() }), 'a')).toBeNull()
    expect(keyDescription(z.object({ a: z.string().describe('no period') }), 'a')).toBe('no period')
  })
})

describe('schema inspection helpers', () => {
  const schema = z.object({
    authority: ProjectSchema.shape['authority']!,
    checkout: ProjectSchema.shape['checkout']!,
    paths: ProjectSchema.shape['paths']!,
    protocol: z.enum(['https', 'ssh']).optional(),
  })

  test('kindOf, shapeOf, unwrapSchema and recordValueType', () => {
    expect(kindOf(schema.shape.checkout)).toBe('object')
    expect(kindOf(schema.shape.paths)).toBe('record')
    expect(Object.keys(shapeOf(unwrapSchema(schema.shape.checkout)))).toEqual(['layout'])
    expect(recordValueType(schema.shape.paths)).not.toBeNull()
    expect(recordValueType(schema.shape.authority)).toBeNull()
  })

  test('fieldInfo and enumValues', () => {
    expect(fieldInfo(schema.shape.paths)).toEqual({ optional: true, defaultValue: {} })
    expect(fieldInfo(z.string())).toEqual({ optional: false, defaultValue: undefined })
    expect(enumValues(schema.shape.protocol)).toEqual(['https', 'ssh'])
    expect(enumValues(schema.shape.authority)).toBeNull()
  })
})
