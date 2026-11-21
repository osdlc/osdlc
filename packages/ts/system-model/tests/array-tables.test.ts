/**
 * Manifests whose dependency tables are arrays rather than tables.
 *
 * In JavaScript an array IS an object, so a `typeof x === 'object'` guard
 * lets one through and the walk invents index-named dependencies from it —
 * a divergence the Rust peer cannot have, because its `as_object()` /
 * `as_table()` reject arrays. Written against a scratch tree rather than the
 * shared `mini-repo` fixture, which both implementations walk and neither may
 * change unilaterally.
 */

import { afterAll, beforeAll, expect, test } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { walkManifests } from '../src/manifest-walk.ts'
import type { ManifestInfo } from '../src/manifest-model.ts'

let root: string
let manifests: ManifestInfo[]

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'manifest-graph-arrays-'))
  await mkdir(join(root, 'node-pkg'), { recursive: true })
  await writeFile(
    join(root, 'node-pkg/package.json'),
    JSON.stringify({
      name: 'weird',
      dependencies: ['left-pad', 'lodash'],
      devDependencies: ['vitest'],
      bin: ['./cli.js'],
    }),
  )
  await mkdir(join(root, 'rust-crate'), { recursive: true })
  await writeFile(
    join(root, 'rust-crate/Cargo.toml'),
    // Root-level key first: bare keys after a `[table]` header belong to that
    // table, so `dependencies` has to precede `[package]` to sit at the root.
    ['dependencies = ["serde", "toml"]', '', '[package]', 'name = "weird-crate"', ''].join('\n'),
  )
  manifests = await walkManifests(root)
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

const byDir = (dir: string): ManifestInfo => {
  const m = manifests.find((m) => m.dir === dir)
  if (!m) throw new Error(`no manifest at dir "${dir}"`)
  return m
}

test('an array-valued node dependency table declares nothing', () => {
  const m = byDir('node-pkg')
  expect(m.error).toBeNull()
  expect(m.name).toBe('weird')
  expect(m.deps).toEqual([])
})

test('an array-valued node `bin` is not a bin', () => {
  expect(byDir('node-pkg').hasBin).toBe(false)
})

test('an array-valued cargo dependency table declares nothing', () => {
  const m = byDir('rust-crate')
  expect(m.error).toBeNull()
  expect(m.name).toBe('weird-crate')
  expect(m.deps).toEqual([])
})
