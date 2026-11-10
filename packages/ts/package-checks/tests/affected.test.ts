// The affected-package pick, over a made-up workspace.
import { strict as assert } from 'node:assert'

import { test } from 'vitest'

import { OSDLC, pick, withDependencies, type Manifest } from '@osdlc/package-checks'

// `app` depends on `lib`, which depends on the config package `tsconfig`.
// `twin` has a Rust crate, and `wasm` is built from `wasm-wasm`.
const manifests = new Map<string, Manifest>([
  ['packages/ts/app', { name: '@x/app', dependencies: { '@x/lib': 'workspace:^' } }],
  ['packages/ts/lib', { name: '@x/lib', devDependencies: { '@x/tsconfig': 'workspace:^' } }],
  ['packages/ts/tsconfig', { name: '@x/tsconfig' }],
  ['packages/ts/twin', { name: '@x/twin', devDependencies: { vitest: '^5' } }],
  ['packages/ts/wasm', { name: '@x/wasm' }],
  ['packages/ts/feed-wasm', { name: '@x/feed-wasm' }],
])
const ALL = [...manifests.keys()].sort()
const pr = (files: string[] | null) => pick({ event: 'pull_request', files, manifests })

test('a package change picks that package and its dependents', () => {
  assert.deepEqual(pr(['packages/ts/lib/index.ts']), ['packages/ts/app', 'packages/ts/lib'])
  assert.deepEqual(pr(['packages/ts/app/README.md']), ['packages/ts/app'])
  assert.deepEqual(pr(['packages/ts/tsconfig/base.json']), [
    'packages/ts/app',
    'packages/ts/lib',
    'packages/ts/tsconfig',
  ])
})

test('a Rust twin maps to its TypeScript twin', () => {
  assert.deepEqual(pr(['packages/rust/twin/tests/fixtures/parity.json']), ['packages/ts/twin'])
  assert.deepEqual(pr(['packages/rust/wasm-wasm/src/lib.rs']), ['packages/ts/wasm'])
  assert.deepEqual(pr(['packages/rust/only-rust/src/lib.rs']), [])
  // A `-wasm` crate whose package keeps the suffix.
  assert.deepEqual(pr(['packages/rust/feed-wasm/src/lib.rs']), ['packages/ts/feed-wasm'])
})

test('a Rust twin with another name maps through rustTwinNames', () => {
  const named = new Map([...manifests, ['packages/ts/gfm-table', { name: '@x/gfm-table' }]])
  const files = ['packages/rust/gfm-pipe-table/tests/fixtures/parity.json']
  const settings = { ...OSDLC, rustTwinNames: { 'gfm-pipe-table': 'gfm-table' } }
  assert.deepEqual(pick({ event: 'pull_request', files, manifests: named, settings }), [
    'packages/ts/gfm-table',
  ])
  assert.deepEqual(pick({ event: 'pull_request', files, manifests: named }), [])
})

test('a file outside every package picks nothing', () => {
  assert.deepEqual(pr(['packages/README.md', '.changeset/a-change.md']), [])
})

test('a shared root input picks every package', () => {
  for (const file of [
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'package.json',
    '.npmrc',
    '.oxlintrc.json',
    '.changeset/config.json',
    'package-checks.json',
    'packages/conformance/families.json',
  ]) {
    assert.deepEqual(pr(['packages/ts/app/a.ts', file]), ALL, file)
  }
})

test('the shared setting adds patterns', () => {
  const settings = { ...OSDLC, shared: ['^\\.github/workflows/packages-ci\\.yml$', '^scripts/'] }
  const at = (file: string) =>
    pick({ event: 'pull_request', files: ['packages/ts/app/a.ts', file], manifests, settings })
  assert.deepEqual(at('.github/workflows/packages-ci.yml'), ALL)
  assert.deepEqual(at('scripts/bounded-run.ts'), ALL)
  assert.deepEqual(at('.github/workflows/other.yml'), ['packages/ts/app'])
})

test('the settings move the package folders and the registry', () => {
  const moved = new Map([...manifests].map(([d, m]) => [d.replace('packages/ts/', 'libs/'), m]))
  const settings = {
    ...OSDLC,
    tsDir: 'libs',
    rustWorkspace: 'crates',
    families: 'suites/families.json',
  }
  const families = new Map([['dirs', { implementations: ['libs/twin'], readers: [] }]])
  const at = (files: string[]) =>
    pick({ event: 'pull_request', files, manifests: moved, families, settings })
  assert.deepEqual(at(['libs/lib/a.ts']), ['libs/app', 'libs/lib'])
  assert.deepEqual(at(['crates/twin/src/lib.rs']), ['libs/twin'])
  assert.deepEqual(at(['suites/dirs/suite.json']), ['libs/twin'])
  assert.deepEqual(at(['suites/families.json']).length, moved.size)
  assert.deepEqual(at(['packages/ts/lib/a.ts']), [])
})

test('any event but a pull request, or a failed diff, picks every package', () => {
  for (const event of ['push', 'workflow_dispatch', undefined]) {
    assert.deepEqual(pick({ event, files: ['packages/ts/app/a.ts'], manifests }), ALL)
  }
  assert.deepEqual(pr(null), ALL)
})

test('a build also takes the workspace dependencies', () => {
  assert.deepEqual(withDependencies(['packages/ts/app'], manifests), [
    'packages/ts/app',
    'packages/ts/lib',
    'packages/ts/tsconfig',
  ])
})

test('a family links its implementations, its readers and its suite', () => {
  const families = new Map([
    [
      'dirs',
      {
        implementations: ['packages/ts/twin', 'packages/rust/rusty-dirs'],
        readers: ['packages/ts/app'],
      },
    ],
  ])
  const fam = (files: string[]) => pick({ event: 'pull_request', files, manifests, families })
  const both = ['packages/ts/app', 'packages/ts/twin']
  assert.deepEqual(fam(['packages/conformance/dirs/suite.json']), both)
  assert.deepEqual(fam(['packages/conformance/dirs/README.md']), both)
  assert.deepEqual(fam(['packages/rust/rusty-dirs/src/lib.rs']), both)
  // A change under a reader alone does not run the implementations.
  assert.deepEqual(fam(['packages/ts/app/a.ts']), ['packages/ts/app'])
  assert.deepEqual(fam(['packages/conformance/other/suite.json']), [])
  assert.deepEqual(fam(['packages/conformance/families.json']), ALL)
})
