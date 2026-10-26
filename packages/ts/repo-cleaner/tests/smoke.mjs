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
//
// Also runs the installed binary: `repo-cleaner --help` must exit 0.

import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { sweepRepo } from '@osdlc/repo-cleaner'

// A branch already merged into the default branch is proposed for deletion.
const root = realpathSync(mkdtempSync(join(tmpdir(), 'repo-cleaner-smoke-')))
try {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  }
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: root, env, encoding: 'utf8' })
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
  }
  git('init', '-q', '-b', 'main')
  git('commit', '--allow-empty', '-q', '-m', 'initial')
  git('branch', 'fix/done')

  const sweep = sweepRepo(root, { noGh: true, cwd: root })
  const item = sweep.items.find((i) => i.id === 'fix/done')
  assert.ok(item, 'the merged branch is inventoried')
  assert.equal(item.classification, 'safe-to-delete')
} finally {
  rmSync(root, { recursive: true, force: true })
}

// The binary sits beside dist/ in the package, installed or not.
const dist = dirname(fileURLToPath(import.meta.resolve('@osdlc/repo-cleaner')))
const bin = join(dist, '..', 'bin', 'repo-cleaner.js')
const help = spawnSync(process.execPath, [bin, '--help'], { encoding: 'utf8' })
assert.equal(help.status, 0, `repo-cleaner --help exited ${help.status}: ${help.stderr}`)
assert.match(help.stdout, /repo-cleaner/)

console.log('repo-cleaner smoke: OK')
