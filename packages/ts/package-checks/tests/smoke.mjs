// Runs the built package under Node. The unit tests run the TypeScript source
// (vitest.config.ts aliases the package name to it), so dist/ is compiled but
// never run anywhere else. A broken emit passes every other check and fails on
// the consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. The package check copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'

import {
  OSDLC,
  githubRepository,
  nextBreaking,
  pick,
  readConfig,
  shapeRs,
  shapeTs,
} from '@osdlc/package-checks'

assert.deepEqual(readConfig(undefined), OSDLC)
assert.deepEqual(shapeTs.authorProblems({ author: 'sksizer' }), [])
// smol-toml, a dependency, reads the manifest.
assert.equal(shapeRs.parseToml('[package]\nname = "x"\n').package.name, 'x')
assert.deepEqual(nextBreaking([0, 2, 1]), [0, 3, 0])
assert.equal(githubRepository('git+https://github.com/osdlc/markdown.git'), 'osdlc/markdown')
const manifests = new Map([['packages/ts/a', { name: '@x/a' }]])
assert.deepEqual(pick({ event: 'push', files: null, manifests }), ['packages/ts/a'])
// semver, a dependency, reads the engine ranges.
assert.deepEqual(shapeTs.enginesProblems({ engines: { node: '>=22' } }, {}), [])

console.log('smoke: @osdlc/package-checks ok')
