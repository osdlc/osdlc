// Tests for crates-io-unpublished-patch.ts. The crates.io lookup is stubbed,
// so nothing reaches the network.
//
//   node --test scripts/crates-io-unpublished-patch.test.ts
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import type { CargoDependency, CargoMetadata, CargoPackage, IndexEntry } from './crates-io-index.ts'
import { heldBackPackages, unpublishedPatch } from './crates-io-unpublished-patch.ts'

const pkg = (
  name: string,
  version: string,
  publish: string[] | null = null,
  dependencies: CargoDependency[] = [],
): CargoPackage => ({
  id: name,
  name,
  version,
  manifest_path: `/ws/${name}/Cargo.toml`,
  publish,
  dependencies,
})

/** A path dependency on the workspace crate `name`. */
const local = (name: string, kind: string | null = null): CargoDependency => ({ name, kind, path: `/ws/${name}` })

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

const HEADER = '# Crates whose version is not on crates.io yet, and the local crates they depend on. See scripts/crates-io-unpublished-patch.ts.'

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

test('patches the published crates a patched crate reaches through normal or build path dependencies', async () => {
  // markdown-link is new and depends on the published yaml-splice and
  // slug-collate by path. Patching markdown-link alone would leave yaml-splice
  // twice in the graph: local through markdown-link, and from crates.io for
  // markdown-relink. Dev and registry dependencies do not pull a crate in.
  const out = await unpublishedPatch(
    metadata(
      pkg('slug-collate', '0.1.2'),
      pkg('yaml-splice', '0.3.3', null, [local('slug-collate', 'build')]),
      pkg('frontmatter-lossless', '1.1.1'),
      pkg('serde-ish', '1.0.0'),
      pkg('markdown-link', '0.5.2', null, [
        local('yaml-splice'),
        local('frontmatter-lossless', 'dev'),
        { name: 'serde-ish', kind: null },
      ]),
      pkg('markdown-relink', '0.1.6', null, [local('markdown-link'), local('yaml-splice')]),
      pkg('yaml-splice-wasm', '0.1.0', [], [local('yaml-splice')]),
    ),
    new Set(),
    index({
      'slug-collate': ['0.1.2'],
      'yaml-splice': ['0.3.3'],
      'frontmatter-lossless': ['1.1.1'],
      'serde-ish': ['1.0.0'],
      'markdown-link': ['0.5.1'],
      'markdown-relink': ['0.1.6'],
    }),
  )
  assert.equal(
    out,
    [
      HEADER,
      '[patch.crates-io]',
      'slug-collate = { path = "/ws/slug-collate" }',
      'yaml-splice = { path = "/ws/yaml-splice" }',
      'markdown-link = { path = "/ws/markdown-link" }',
      '',
    ].join('\n'),
  )
})

test('a held-back crate is still patched when a patched crate reaches it, but a publish = false one is not', async () => {
  const out = await unpublishedPatch(
    metadata(pkg('held', '0.2.0'), pkg('private', '0.1.0', []), pkg('new', '0.1.0', null, [local('held'), local('private')])),
    new Set(['held']),
    index({ held: ['0.2.0'] }),
  )
  assert.equal(out, [HEADER, '[patch.crates-io]', 'held = { path = "/ws/held" }', 'new = { path = "/ws/new" }', ''].join('\n'))
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
