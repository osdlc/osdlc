// Runs the built package under Node. The unit tests run the TypeScript source
// (vitest.config.ts aliases the package name to it), so nothing else runs
// dist/. Without this check, a broken build output would pass every other
// check and fail on the consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. `package-checks ts` copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.
//
// It keeps off the real home: OSDLC_ROOT points the osdlc directories into a
// temp dir, `home` is passed, and OSDLC_REPOSITORIES and every other variable
// that moves an osdlc directory (`OSDLC_<HOME>_DIR`, OSDLC_CONVENTION) are
// cleared, then restored. The list is written out, since this file may import
// nothing but the package.

import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { OSDLC_VENDOR_DIRS, osdlcDirs } from '@osdlc/ecosystem'
import {
  CheckoutLocator,
  defaultRoots,
  locateCheckout,
  parseRepoTarget,
  repositoriesFile,
  resolveRoots,
} from '@osdlc/ecosystem/repositories'

const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ecosystem-smoke-')))
const cleared = [
  'OSDLC_REPOSITORIES',
  'OSDLC_CONVENTION',
  'OSDLC_REQUIRE_OVERRIDE',
  ...['DURABLE', 'CONFIG', 'CACHE', 'STATE', 'LOGS', 'RUNTIME', 'SCRATCH'].map(
    (home) => `OSDLC_${home}_DIR`,
  ),
]
const saved = Object.fromEntries(
  ['OSDLC_ROOT', ...cleared].map((name) => [name, process.env[name]]),
)
for (const name of cleared) delete process.env[name]
process.env.OSDLC_ROOT = join(dir, 'osdlc')
try {
  const home = join(dir, 'home')
  mkdirSync(join(home, 'dev', 'not-a-repo', '.git'), { recursive: true })

  assert.equal(OSDLC_VENDOR_DIRS.vendor, 'osdlc')
  const config = osdlcDirs().standalone('osdlc').config().path
  assert.equal(config, join(dir, 'osdlc', 'config', 'osdlc'))

  const file = repositoriesFile({ home })
  assert.equal(file.path(), join(config, 'repositories.yaml'))
  assert.equal(file.read(), null)
  file.writeRoots(['~/dev', '/nowhere'], { etag: null })
  assert.deepEqual(file.load().value, { roots: ['~/dev', '/nowhere'] })

  const resolved = resolveRoots({ home })
  assert.deepEqual(resolved, { roots: [join(home, 'dev')], source: 'file', file: file.path() })
  assert.deepEqual(defaultRoots({ home }), [])

  // The .git there is not a repository git can read, so it is skipped.
  const locator = new CheckoutLocator({ home, resolveAlias: () => null })
  assert.deepEqual(locator.locate('acme/widgets'), [])
  assert.deepEqual(locateCheckout(parseRepoTarget('github.com/acme/widgets'), { home }), [])
} finally {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  rmSync(dir, { recursive: true, force: true })
}

console.log('ecosystem smoke: OK')
