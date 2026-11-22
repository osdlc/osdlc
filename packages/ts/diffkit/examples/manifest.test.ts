/**
 * The manifest's schema, its types and the thresholds a run measures against.
 */
import { expect, test } from 'vitest'

import {
  DEFAULT_THRESHOLDS,
  prepManifestSchema,
  type PrepArgs,
  type PrepEnv,
  type PrepFile,
  type PrepFlag,
  type PrepGroup,
  type PrepManifest,
  type Thresholds,
} from '@osdlc/diffkit'

const file: PrepFile = {
  path: 'src/a.ts',
  status: 'modified',
  group: 'source',
  category: 'logic',
  language: 'TypeScript',
  added: 3,
  removed: 1,
}
const group: PrepGroup = { id: 'g1', roots: ['.'], files: ['src/a.ts'], lines: 4 }
const flag: PrepFlag = {
  kind: 'long-function',
  basis: 'measured',
  path: 'src/a.ts',
  line: 1,
  group: 'g1',
  detail: 'run is 120 lines long, 100% of it added',
  measurements: { name: 'run', lines: 120, addedShare: 1 },
}

const manifest: PrepManifest = {
  schema: 2,
  change: {
    kind: 'merge-base',
    label: 'main...HEAD',
    pr: null,
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
  },
  coverage: ['ts'],
  thresholds: DEFAULT_THRESHOLDS,
  files: { kept: [file], dropped: [{ path: 'pnpm-lock.yaml', reason: 'generated' }] },
  groups: [group],
  flags: [flag],
  notes: [],
}

test('the schema accepts a manifest and refuses a schema number it does not know', () => {
  expect(prepManifestSchema.parse(manifest)).toEqual(manifest)
  expect(prepManifestSchema.safeParse({ ...manifest, schema: 1 }).success).toBe(false)
})

test('the default thresholds, and a run that overrides one', () => {
  expect(DEFAULT_THRESHOLDS).toEqual({
    longFunctionLines: 90,
    longFunctionAddedShare: 0.5,
    groupSize: 12,
  })
  const tighter: Thresholds = { ...DEFAULT_THRESHOLDS, groupSize: 4 }
  const args: PrepArgs = { cwd: '.', pr: null, base: 'main', thresholds: { groupSize: 4 } }
  expect(args.thresholds).toEqual({ groupSize: tighter.groupSize })
})

test('the environment is two command runners', () => {
  const never: PrepEnv['git'] = {
    run: () => {
      throw new Error('not called')
    },
  }
  const env: PrepEnv = { git: never, gh: never }
  expect(Object.keys(env)).toEqual(['git', 'gh'])
})
