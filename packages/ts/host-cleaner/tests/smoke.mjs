// Runs the built package under Node. The unit tests run the TypeScript source,
// so a broken emit could pass them and fail on the consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. `package-checks ts` copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BUILT_IN_PLUGINS,
  FatalRun,
  VERSION,
  clean,
  gitPlugin,
  plan,
  survey,
} from '@osdlc/host-cleaner'

assert.match(VERSION, /^\d+\.\d+\.\d+/)
assert.equal(typeof gitPlugin().discover, 'function')
assert.deepEqual(
  BUILT_IN_PLUGINS.map((d) => d.name),
  ['git', 'cargo', 'node', 'orca'],
)

const log = []
const cache = {
  name: 'cache',
  detect: () => true,
  discover: () => [
    {
      id: 'artifact:c',
      kind: 'artifact',
      path: 'c',
      owner: 'cache',
      why: 'idle',
      evidence: { n: 1 },
    },
  ],
  delete: (c) => (log.push(c.id), 'removed'),
}
const ctx = { cwd: process.cwd(), targets: [], allow: [] }
const receipt = await clean(plan(await survey([cache], ctx)), [cache], ctx)
assert.equal(receipt.status, 'complete')
assert.deepEqual(log, ['artifact:c'])
assert.ok(new FatalRun('x') instanceof Error)

// The binary sits beside dist/ in the package, installed or not.
const dist = dirname(fileURLToPath(import.meta.resolve('@osdlc/host-cleaner')))
const bin = join(dist, '..', 'bin', 'host-cleaner.js')
for (const args of [['--help'], ['--version']]) {
  const r = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' })
  assert.equal(r.status, 0, `host-cleaner ${args.join(' ')}: ${r.stderr}`)
}

console.log('host-cleaner smoke: OK')
