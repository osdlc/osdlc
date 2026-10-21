// Tests for affected-packages.mjs, over a made-up workspace.
//
//   node --test .github/scripts/affected-packages.test.mjs
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { pick, withDependencies } from './affected-packages.mjs'

// `app` depends on `lib`, which depends on the config package `tsconfig`.
// `twin` has a Rust crate, and `wasm` is built from `wasm-wasm`.
const manifests = new Map([
  ['packages/ts/app', { name: '@x/app', dependencies: { '@x/lib': 'workspace:^' } }],
  ['packages/ts/lib', { name: '@x/lib', devDependencies: { '@x/tsconfig': 'workspace:^' } }],
  ['packages/ts/tsconfig', { name: '@x/tsconfig' }],
  ['packages/ts/twin', { name: '@x/twin', devDependencies: { vitest: '^5' } }],
  ['packages/ts/wasm', { name: '@x/wasm' }],
])
const ALL = [...manifests.keys()].sort()
const pr = (files) => pick({ event: 'pull_request', files, manifests })

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
    '.github/scripts/check-packages.mjs',
    '.github/scripts/package-shape.mjs',
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
