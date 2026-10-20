// Runs the BUILT package under Node, which no other check does: `bun test`
// resolves the `bun` export condition to the TypeScript sources, so dist/ is
// compiled and never executed. A broken emit — an unrewritten `.ts` import, a
// dependency with no dist/ of its own — passes every other gate and fails on
// the consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.mjs copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.
//
// Exercises all three subpaths, because each is a separate entry point that
// can break on its own, and the contract itself: a declared absence returns a
// value, anything else throws, `try` inspects.

import { strict as assert } from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Git, AsyncGit, CommandFailed, parseGitUrl } from '@osdlc/typed-git'
import { Git as ClientGit } from '@osdlc/typed-git/client'
import { makeGitFixture } from '@osdlc/typed-git/testing'

assert.equal(Git, ClientGit, 'the ./client subpath must export the same Git as the entry')

const fx = makeGitFixture({ initialBranch: 'main' })
try {
  fx.commit('init', { 'a.txt': 'hello', 'b/c.txt': 'nested' })
  const git = fx.git

  // Queries return parsed values.
  assert.equal(git.currentBranch(), 'main')
  assert.equal(git.headRef(), 'main')
  assert.equal(git.hasHistory(), true)
  assert.deepEqual(git.lsFiles({ cached: true }).sort(), ['a.txt', 'b/c.txt'])
  assert.deepEqual(git.remote(), [])
  assert.equal(git.statusPorcelain().length, 0)
  assert.match(git.resolveRef('HEAD') ?? '', /^[0-9a-f]{40}$/)

  // A declared absence is a value, not a throw.
  assert.equal(git.resolveRef('refs/heads/no-such-branch'), null)
  assert.equal(git.configGet('no.such.key'), null)
  assert.equal(git.objectExists('deadbeef'), false)

  // Mutations throw on failure.
  assert.throws(
    () => git.deleteBranch('no-such-branch'),
    (e) => e instanceof CommandFailed,
  )

  const async = new AsyncGit(fx.dir)
  assert.equal(await async.currentBranch(), 'main')
  assert.equal((await async.try.currentBranch()).ok, true)
} finally {
  fx.cleanup()
}

// Outside a repository: topLevel declares 128 absent and answers null; a verb
// that declares no absence throws there, and `try` reports it without throwing.
const bare = mkdtempSync(join(tmpdir(), 'typed-git-smoke-'))
try {
  const outside = new Git(bare)
  assert.equal(outside.topLevel(), null)
  assert.throws(
    () => outside.statusPorcelain(),
    (e) => e instanceof CommandFailed,
  )

  const tried = outside.try.statusPorcelain()
  assert.equal(tried.ok, false)
  assert.ok(tried.error instanceof CommandFailed)
  assert.equal(typeof tried.error.detail, 'string')
  assert.ok(tried.error.detail.length > 0, "detail must carry git's own message")
} finally {
  rmSync(bare, { recursive: true, force: true })
}

// git-url ships on the entry, not on ./client — that split is why ./client exists.
assert.equal(parseGitUrl('git@github.com:owner/repo.git')?.project, 'repo')

console.log('typed-git smoke: OK')
