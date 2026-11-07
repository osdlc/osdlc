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
// Also runs the installed binary: `--help`, `--version`, a dry run and
// `checks --dry-run` must work.

import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DEFAULT_CONFIG, reviewChanges } from '@osdlc/rule-review'

const dist = dirname(fileURLToPath(import.meta.resolve('@osdlc/rule-review')))
const bin = join(dist, '..', 'bin', 'rule-review.js')
const pkg = JSON.parse(readFileSync(join(dist, '..', 'package.json'), 'utf8'))

const root = realpathSync(mkdtempSync(join(tmpdir(), 'rule-review-smoke-')))
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
  writeFileSync(join(root, 'CLAUDE.md'), 'Never use the any type.\n')
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src', 'a.ts'), 'export const a = 1\n')
  git('add', '.')
  git('commit', '-q', '-m', 'initial')
  writeFileSync(join(root, 'src', 'a.ts'), 'export const a: any = 1\n')

  // The library plans one judgement for the root CLAUDE.md and starts no agent.
  const run = await reviewChanges({ cwd: root, dryRun: true })
  assert.deepEqual(run.changedFiles, ['src/a.ts'])
  assert.deepEqual(
    run.jobs.map((j) => j.source.id),
    ['instruction:CLAUDE.md'],
  )
  assert.equal(Object.isFrozen(DEFAULT_CONFIG), true)

  const cli = (...args) =>
    spawnSync(process.execPath, [bin, ...args], { cwd: root, env, encoding: 'utf8' })

  const help = cli('--help')
  assert.equal(help.status, 0, `rule-review --help exited ${help.status}: ${help.stderr}`)
  assert.match(help.stdout, /rule-review/)

  const version = cli('--version')
  assert.equal(
    version.status,
    0,
    `rule-review --version exited ${version.status}: ${version.stderr}`,
  )
  assert.equal(version.stdout, `rule-review ${pkg.version}\n`)

  const dry = cli('--dry-run')
  assert.equal(dry.status, 0, `rule-review --dry-run exited ${dry.status}: ${dry.stderr}`)
  assert.match(dry.stderr, /would judge 1 changed file/)

  mkdirSync(join(root, 'checks.d'))
  writeFileSync(join(root, 'checks.d', '10-ok'), '#!/bin/sh\nexit 0\n')
  chmodSync(join(root, 'checks.d', '10-ok'), 0o755)
  const checks = cli('checks', 'checks.d')
  assert.equal(
    checks.status,
    0,
    `rule-review checks exited ${checks.status}: ${checks.stdout}${checks.stderr}`,
  )
  assert.match(checks.stdout, /PASS\s+10-ok/)
} finally {
  rmSync(root, { recursive: true, force: true })
}

console.log('rule-review smoke: OK')
