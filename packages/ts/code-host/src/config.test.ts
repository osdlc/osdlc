import { describe, expect, test } from 'vitest'
import { resolve } from 'node:path'

import { consumerProblems, checkConfigMeta } from '@osdlc/config-layers'

import { codeHostSection } from './config.ts'

const PACKAGE_ROOT = resolve(import.meta.dirname, '..')
const shape = { [codeHostSection.key]: codeHostSection.schema }

describe('codeHostSection', () => {
  test('carries well-formed meta and a description (structure only; the host checks the terms)', () => {
    expect(checkConfigMeta(shape)).toEqual([])
  })

  test('every consumer names a file in this package that mentions its symbol', () => {
    expect(consumerProblems(shape, PACKAGE_ROOT)).toEqual([])
  })

  test('defaults to auto-detection and refuses an unknown key', () => {
    expect(codeHostSection.schema.parse(undefined)).toEqual({ override: null })
    expect(codeHostSection.schema.safeParse({ overide: 'github' }).success).toBe(false)
    expect(codeHostSection.schema.safeParse({ override: 'gitlab' }).success).toBe(false)
  })
})
