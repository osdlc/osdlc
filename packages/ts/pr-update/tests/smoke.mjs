// Runs the BUILT package under Node. The unit tests run the TypeScript source
// (vitest.config.ts aliases the package name to it), so dist/ is compiled but
// never run anywhere else. A broken emit passes every other check and fails on
// the consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.mjs copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.
//
// Also runs the installed binary: `pr-update --help` must exit 0.

import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chooseStrategy, prUpdateConfigSchema, runSurvey, standalonePorts } from '@osdlc/pr-update'

// The config schema fills in every default.
const cfg = prUpdateConfigSchema.parse({})
assert.equal(typeof cfg, 'object')

// A branch with unpushed local commits is never rebased over.
const signals = {
  base: 'main',
  labels: [],
  ahead: 1,
  reviews: 0,
  unpushedLocal: false,
  crossRepo: false,
}
assert.equal(chooseStrategy(signals, cfg).strategy, 'rebase')
assert.notEqual(chooseStrategy({ ...signals, unpushedLocal: true }, cfg).strategy, 'rebase')

// The engine surveys a stack with a fake git and a fake code host.
const ok = (stdout) => ({ exitCode: 0, stdout, stderr: '' })
const git = {
  run(argv) {
    if (argv.join(' ') === 'remote get-url origin') return ok('git@github.com:acme/widgets.git\n')
    if (argv[0] === 'rev-list') return ok('2\t1\n')
    if (argv[0] === 'merge-tree') return ok('abc123\0')
    if (argv[0] === 'rev-parse') return ok(`${'b'.repeat(40)}\n`)
    return ok('')
  },
}
const detail = (number, headRef, baseRef) => ({
  number,
  title: `PR ${number}`,
  url: `https://github.com/acme/widgets/pull/${number}`,
  baseRef,
  headRef,
  headSha: null,
  isDraft: false,
  labels: [],
  reviewCount: 0,
  isCrossRepository: false,
})
const report = runSurvey(
  { repo: [], pr: [], noFetch: true, noDrafts: false, limit: 100, remote: 'origin' },
  {
    projectRoot: '/repo',
    dryRun: false,
    git,
    gh: git,
    codeHost: () => ({
      listPrDetails: () => [detail(2, 'task/b', 'task/a'), detail(1, 'task/a', 'main')],
    }),
    cfg,
    ports: { ...standalonePorts(), locate: () => '/repo' },
  },
)
assert.deepEqual(
  report.prs.map((row) => [row.number, row.status]),
  [
    [1, report.prs[0].status],
    [2, 'blocked'],
  ],
)

// The binary sits beside dist/ in the package, installed or not.
const dist = dirname(fileURLToPath(import.meta.resolve('@osdlc/pr-update')))
const bin = join(dist, '..', 'bin', 'pr-update.js')
const help = spawnSync(process.execPath, [bin, '--help'], { encoding: 'utf8' })
assert.equal(help.status, 0, `pr-update --help exited ${help.status}: ${help.stderr}`)
assert.match(help.stdout, /pr-update/)

console.log('pr-update smoke: OK')
