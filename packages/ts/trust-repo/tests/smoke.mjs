// Runs the built package under Node. The unit tests run the TypeScript source
// (vitest.config.ts aliases the package name to it), so dist/ is compiled but
// never run anywhere else. A broken emit passes every other check and fails on
// the consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.ts copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  pathGlobToRegExp,
  resolveExecGate,
  trustStore,
  trustStoreDir,
  withheldHint,
} from '@osdlc/trust-repo'
import { originOwner } from '@osdlc/trust-repo/git'

// A throwaway home and env, so the smoke never touches a real trust store.
const home = realpathSync.native(mkdtempSync(join(tmpdir(), 'trust-repo-smoke-')))
try {
  const repo = join(home, 'work', 'app')
  mkdirSync(repo, { recursive: true })

  const store = trustStore({ tool: 'tooly', env: {}, home })
  assert.equal(store.dir(), trustStoreDir('tooly', {}, home))
  assert.equal(await store.isTrusted(repo), false)

  const first = await store.trust(repo)
  assert.equal(first.alreadyTrusted, false)
  assert.equal(first.root, repo)
  assert.equal((await store.trust(repo)).alreadyTrusted, true)
  assert.equal(await store.isTrusted(repo), true)
  assert.deepEqual(await store.list(), [repo])

  // A trusted root allows execution the config asks for; an untrusted one withholds it.
  const gate = await resolveExecGate(store, { root: repo, configured: true })
  assert.deepEqual([gate.allowExec, gate.reason], [true, 'allowed'])
  assert.match(withheldHint('tooly', { verb: 'repo trust', flag: '--trust' }), /tooly/)

  assert.equal(await store.untrust(repo), true)
  assert.equal(await store.untrust(repo), false)
  assert.deepEqual(await store.list(), [])
  const withheld = await resolveExecGate(store, { root: repo, configured: true })
  assert.deepEqual([withheld.allowExec, withheld.reason], [false, 'untrusted'])

  // A grant for one tool, and a gate over two.
  await store.trust(repo, 'just')
  const scoped = await resolveExecGate(store, {
    root: repo,
    configured: true,
    scopes: ['just', 'mise'],
  })
  assert.deepEqual(scoped.missing, ['mise'])
  assert.deepEqual(
    (await store.listGrants()).map((g) => g.scope),
    ['just'],
  )
  assert.equal(originOwner(repo), null)

  assert.equal(pathGlobToRegExp('src/**/*.ts').test('src/a/b.ts'), true)
  assert.equal(pathGlobToRegExp('src/*.ts').test('src/a/b.ts'), false)
} finally {
  rmSync(home, { recursive: true, force: true })
}

console.log('trust-repo smoke: OK')
