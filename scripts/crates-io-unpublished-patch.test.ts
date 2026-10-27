// Tests for crates-io-unpublished-patch.ts. The crates.io lookup is stubbed,
// so nothing reaches the network.
//
//   node --test scripts/crates-io-unpublished-patch.test.ts
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import type { CargoMetadata, CargoPackage, IndexEntry } from './crates-io-index.ts'
import { heldBackPackages, unpublishedPatch } from './crates-io-unpublished-patch.ts'

const pkg = (name: string, version: string, publish: string[] | null = null): CargoPackage => ({
  id: name,
  name,
  version,
  manifest_path: `/ws/${name}/Cargo.toml`,
  publish,
})

const metadata = (...packages: CargoPackage[]): CargoMetadata => ({
  workspace_root: '/ws',
  workspace_members: packages.map((p) => p.id),
  packages,
})

/** crates.io as a map from name to published versions; a missing name is not on crates.io. */
const index =
  (published: Record<string, string[]>) =>
  async (name: string): Promise<IndexEntry[] | null> =>
    published[name]?.map((vers) => ({ vers, yanked: false })) ?? null

const HEADER = '# Crates whose version is not on crates.io yet. See scripts/crates-io-unpublished-patch.ts.'

test('patches a new version and a crate not on crates.io; skips a published version', async () => {
  const out = await unpublishedPatch(
    metadata(pkg('yaml-splice', '0.3.3'), pkg('markdown-link', '0.5.0'), pkg('brand-new', '0.1.0')),
    new Set(),
    index({ 'yaml-splice': ['0.3.2'], 'markdown-link': ['0.5.0'] }),
  )
  assert.equal(
    out,
    [
      HEADER,
      '[patch.crates-io]',
      'yaml-splice = { path = "/ws/yaml-splice" }',
      'brand-new = { path = "/ws/brand-new" }',
      '',
    ].join('\n'),
  )
})

test('skips crates that are not published: Cargo.toml publish = false, or held back in release-plz.toml', async () => {
  const out = await unpublishedPatch(
    metadata(pkg('private', '0.1.0', []), pkg('held', '0.2.0'), pkg('other-registry', '0.1.0', ['other'])),
    new Set(['held']),
    index({}),
  )
  assert.equal(out, `${HEADER}\n`)
})

test('heldBackPackages reads release = false and publish = false from [[package]] entries only', () => {
  const toml = [
    '[workspace]',
    'release_always = true',
    'semver_check = true # a workspace key, not a package one',
    '',
    '# held',
    '[[package]]',
    'name = "a"',
    'release = false',
    '',
    '[[package]]',
    'name = "b"',
    'publish = false',
    '',
    '[[package]]',
    'name = "c"',
    'semver_check = false',
    '',
    '[[package]]',
    'release = false',
    'name = "d"',
  ].join('\n')
  assert.deepEqual([...heldBackPackages(toml)].sort(), ['a', 'b', 'd'])
})

test('heldBackPackages throws when [workspace] sets release or publish', () => {
  assert.throws(() => heldBackPackages('[workspace]\nrelease = false\n'), /sets `release` under \[workspace\]/)
  assert.throws(() => heldBackPackages('[workspace]\npublish = true\n'), /sets `publish` under \[workspace\]/)
})
