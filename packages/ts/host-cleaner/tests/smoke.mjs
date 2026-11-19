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
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { hostCheck, hostPlan, hostRun, hostSweep } from '@osdlc/host-cleaner'

const root = realpathSync(mkdtempSync(join(tmpdir(), 'host-cleaner-smoke-')))
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

  // A fake adapter's own row goes through plan, check and run.
  const removed = []
  const adapter = {
    name: 'fake',
    detect: () => true,
    gather: () => [
      {
        id: 'artifact:cache',
        adapter: 'fake',
        kind: 'artifact',
        name: 'cache',
        verdict: 'delete',
        action: 'remove',
        why: 'idle',
        risks: [],
        blockers: [],
        commands: ['rm cache'],
        notes: [],
        evidence: { bytes: 1 },
      },
    ],
    execute: (step) => {
      removed.push(step.row.id)
      return 'removed'
    },
  }
  const opts = { cwd: root, adapters: [adapter] }
  const swept = hostSweep([root], opts)
  assert.deepEqual(swept.adapters, [{ name: 'fake', status: 'active' }])
  const item = swept.repo.repos[0].rows.find((r) => r.id === 'branch:fix/done')
  assert.equal(item?.verdict, 'delete')
  const receipt = hostRun(hostCheck(hostPlan(swept), {}, opts), opts)
  assert.equal(receipt.status, 'complete')
  assert.deepEqual(removed, ['artifact:cache'])
  assert.deepEqual(
    receipt.repo.steps.map((s) => s.row),
    ['branch:fix/done'],
  )
} finally {
  rmSync(root, { recursive: true, force: true })
}

console.log('host-cleaner smoke: OK')
