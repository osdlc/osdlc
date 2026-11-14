// Runs the BUILT package under Node. The unit tests run the TypeScript source
// (vitest.config.ts aliases the package name to it), so dist/ is compiled but
// never run anywhere else. A broken emit, or a launcher template left out of
// dist/, passes every other check and fails on the consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. `package-checks ts` copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'

import {
  findPlatform,
  launcherManifest,
  NPM_PLATFORMS,
  platformManifest,
  platformPackageName,
  renderLauncher,
} from '@osdlc/npm-binary'

const product = {
  binary: 'tool',
  launcher: '@acme/tool',
  scope: '@acme',
  platformPrefix: 'tool',
  binaryDir: '',
}
const mac = findPlatform(NPM_PLATFORMS, 'darwin-arm64')
assert.equal(platformPackageName(product, mac), '@acme/tool-darwin-arm64')
assert.deepEqual(platformManifest(product, mac, { version: '1.0.0', description: 'd' }).os, [
  'darwin',
])
assert.equal(
  Object.keys(
    launcherManifest(product, NPM_PLATFORMS, {
      version: '1.0.0',
      description: 'd',
      launcherPath: 'bin/tool.js',
    }).optionalDependencies,
  ).length,
  NPM_PLATFORMS.length,
)

// The launcher template ships in dist/ and every placeholder is filled.
const js = renderLauncher(product, NPM_PLATFORMS)
assert.ok(js.startsWith('#!/usr/bin/env node'))
assert.doesNotMatch(js, /\{\{\w+\}\}/)
assert.match(js, /const BINARY = "tool"/)

console.log('npm-binary smoke: OK')
