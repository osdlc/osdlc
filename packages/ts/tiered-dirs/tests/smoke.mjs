// Runs the BUILT package under Node. The unit tests resolve the package name to
// the TypeScript source, so a broken emit could pass them and fail on the
// consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.mjs copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'
import { normalize } from 'node:path'

import {
  CONVENTIONS,
  HOMES,
  TIER_KINDS,
  TieredDirs,
  TieredDirsError,
  envVars,
  isValidSegment,
  overrideVars,
  rootedBaseDirs,
  systemBaseDirs,
  xdgBaseDirs,
} from '@osdlc/tiered-dirs'

const vars = envVars('EXAMPLE')
assert.equal(vars.root, 'EXAMPLE_ROOT')
assert.ok(overrideVars(vars).includes('EXAMPLE_STATE_DIR'))
assert.deepEqual([...HOMES], ['durable', 'config', 'cache', 'state', 'logs', 'runtime'])
assert.deepEqual([...CONVENTIONS], ['native', 'xdg'])
assert.deepEqual([...TIER_KINDS], ['vendor', 'suite', 'standalone'])

const dirs = TieredDirs.fromEnv('com.example', vars, {
  platform: 'linux',
  env: { HOME: '/home/ada' },
})
assert.equal(
  normalize(dirs.suite('notes').cache().app('search').path),
  normalize('/home/ada/.cache/com.example.notes/search'),
)
assert.equal(dirs.standalone('tool').kind, 'standalone')

const rooted = new TieredDirs('com.example', rootedBaseDirs('/stub'))
assert.equal(rooted.vendor().state().relative, 'com.example')
assert.equal(normalize(xdgBaseDirs('/h', {}).state), normalize('/h/.local/state'))
assert.equal(
  normalize(systemBaseDirs(vars, { platform: 'darwin', env: { HOME: '/Users/ada' } }).logs),
  normalize('/Users/ada/Library/Logs'),
)

assert.equal(isValidSegment('notes'), true)
assert.equal(isValidSegment('state'), false)
assert.throws(() => rooted.suite('../etc'), TieredDirsError)

console.log('tiered-dirs smoke: OK')
