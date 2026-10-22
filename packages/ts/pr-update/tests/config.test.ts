import { describe, expect, test } from 'vitest'
import { resolve } from 'node:path'

import { checkConfigMeta, consumerProblems } from '@osdlc/config-layers'

import {
  DEFAULT_PR_UPDATE_CONFIG,
  prUpdateSection,
  prUpdateStandaloneSchema,
} from '../src/config.ts'

const PACKAGE_ROOT = resolve(import.meta.dirname, '..')
const shape = { [prUpdateSection.key]: prUpdateSection.schema }

describe('prUpdateSection', () => {
  test('carries well-formed meta and a description (structure only; the host checks the terms)', () => {
    expect(checkConfigMeta(shape)).toEqual([])
  })

  test('every consumer names a file in this package that mentions its symbol', () => {
    expect(consumerProblems(shape, PACKAGE_ROOT)).toEqual([])
  })

  test('an absent block parses to the defaults', () => {
    expect(prUpdateSection.schema.parse(undefined)).toEqual(DEFAULT_PR_UPDATE_CONFIG)
  })

  test('a typo is refused at the top level and at every nested level', () => {
    for (const block of [
      { strategi: 'merge' },
      { guards: { reviewd: 'merge' } },
      { repair: { comand: 'x' } },
      { overrides: [{ strategy: 'skip', lable: 'x' }] },
      { resolvers: [{ paths: ['a'], run: 'b', runn: 'c' }] },
    ]) {
      expect(prUpdateSection.schema.safeParse(block).success).toBe(false)
    }
  })

  test('test_command is standalone-only: the section refuses it, the standalone schema accepts it', () => {
    expect(prUpdateSection.schema.safeParse({ test_command: 'make test' }).success).toBe(false)
    expect(prUpdateStandaloneSchema.safeParse({ test_command: 'make test' }).success).toBe(true)
    expect(prUpdateStandaloneSchema.safeParse({ test_comand: 'x' }).success).toBe(false)
  })
})
