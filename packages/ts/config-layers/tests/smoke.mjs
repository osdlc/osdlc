// Runs the BUILT package under Node. The unit tests resolve the package name to
// the TypeScript source, so a broken emit could pass them and fail on the
// consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.ts copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'

import { didYouMean, substitutePathNames, valueAt, valueIsSet } from '@osdlc/config-layers'
import { didYouMean as lightDidYouMean } from '@osdlc/config-layers/did-you-mean'
import { systemDirs } from '@osdlc/config-layers/dirs'

assert.equal(valueIsSet(''), false)
assert.equal(valueIsSet('x'), true)
assert.equal(valueAt({ a: { b: 1 } }, 'a.b'), 1)
assert.equal(substitutePathNames('{dev}/x', { dev: '/d' }, 'paths:'), '/d/x')
assert.equal(didYouMean('pth', ['path', 'other']), 'did you mean: path?')

// The light subpaths hold the same bindings as the barrel.
assert.equal(lightDidYouMean, didYouMean)
assert.equal(typeof systemDirs, 'function')
