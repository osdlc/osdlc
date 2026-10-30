// Tests for affected-packages.ts, over a made-up workspace.
//
//   node --test scripts/affected-packages.test.ts
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { pick, withDependencies } from './affected-packages.ts'
import type { Manifest } from './affected-packages.ts'

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

test('a file outside every package picks nothing', () => {
  assert.deepEqual(pr(['packages/README.md', '.changeset/a-change.md']), [])
})

test('a shared root input picks every package', () => {
  for (const file of [
    'pnpm-lock.yaml',
    'package.json',
    '.oxlintrc.json',
    '.github/workflows/packages-ci.yml',
    '.github/workflows/packages-windows-tier2.yml',
    'scripts/bounded-run.ts',
    'scripts/bounded-run.test.ts',
    'scripts/check-packages.ts',
    'scripts/package-shape-ts.ts',
    'scripts/package-shape-ts.test.ts',
    '.changeset/config.json',
  ]) {
    assert.deepEqual(pr(['packages/ts/app/a.ts', file]), ALL, file)
  }
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

test('a family links its implementations and its suite', () => {
  const families = new Map([['dirs', ['packages/ts/twin', 'packages/rust/rusty-dirs']]])
  const fam = (files: string[]) => pick({ event: 'pull_request', files, manifests, families })
  assert.deepEqual(fam(['packages/conformance/dirs/suite.json']), ['packages/ts/twin'])
  assert.deepEqual(fam(['packages/conformance/dirs/README.md']), ['packages/ts/twin'])
  assert.deepEqual(fam(['packages/rust/rusty-dirs/src/lib.rs']), ['packages/ts/twin'])
  assert.deepEqual(fam(['packages/conformance/other/suite.json']), [])
  assert.deepEqual(fam(['packages/conformance/families.json']), ALL)
})
