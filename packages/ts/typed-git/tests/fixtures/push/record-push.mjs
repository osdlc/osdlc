// Records git-<version>.json: what `git push --porcelain` reports for each
// case below, with the `git` on PATH. tests/push-fixtures.test.ts reads every
// git-*.json here; nothing runs this script in the test suite. Run it by hand,
// from this package's directory, once per git version worth keeping:
//
//   node tests/fixtures/push/record-push.mjs
//
// A new git release that changes a reason is one new fixture file and one
// line in `pushRejection` in src/verbs.ts. Review the diff of a re-recorded
// file before committing it.

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

// Fixed identity and dates, so every object id is the same on every machine.
const ENV = {
  ...process.env,
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 'fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.com',
  GIT_COMMITTER_NAME: 'fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.com',
  GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
  GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
}

function git(cwd, ...argv) {
  const r = spawnSync('git', argv, { cwd, env: ENV, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${argv.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}

function hook(remote, name, body) {
  const path = join(remote, 'hooks', name)
  writeFileSync(path, `#!/bin/sh\n${body}\n`)
  chmodSync(path, 0o755)
  return () => rmSync(path)
}

const version = git(process.cwd(), '--version')
  .replace(/^git version /, '')
  .split(' ')[0]
const root = mkdtempSync(join(tmpdir(), 'typed-git-push-'))
const remote = join(root, 'remote.git')
const work = join(root, 'work')

git(root, 'init', '--quiet', '--bare', '-b', 'main', remote)
mkdirSync(join(remote, 'hooks'), { recursive: true })
git(root, 'clone', '--quiet', remote, work)
git(work, 'commit', '--quiet', '--allow-empty', '-m', 'one')
const A = git(work, 'rev-parse', 'HEAD')
git(work, 'commit', '--quiet', '--allow-empty', '-m', 'two')
const B = git(work, 'rev-parse', 'HEAD')
git(work, 'commit', '--quiet', '--allow-empty', '-m', 'three')
const C = git(work, 'rev-parse', 'HEAD')
git(work, 'push', '--quiet', 'origin', `${A}:refs/heads/main`, `${A}:refs/heads/race`)
git(work, 'push', '--quiet', 'origin', `${B}:refs/heads/x/child`, `${C}:refs/heads/holder`)
git(work, 'tag', 'v1', A)
git(work, 'push', '--quiet', 'origin', 'refs/tags/v1')

// Each case runs in order against the same remote. `setup` returns a teardown.
const CASES = [
  { name: 'up-to-date', args: ['origin', `${A}:refs/heads/main`] },
  { name: 'fast-forward', args: ['origin', `${B}:refs/heads/main`] },
  { name: 'non-fast-forward', args: ['origin', `${A}:refs/heads/main`] },
  {
    name: 'stale-lease',
    args: [`--force-with-lease=refs/heads/main:${A}`, 'origin', `${C}:refs/heads/main`],
  },
  {
    name: 'forced-with-lease',
    args: [`--force-with-lease=refs/heads/main:${B}`, 'origin', `${A}:refs/heads/main`],
  },
  { name: 'new-branch', args: ['origin', `${A}:refs/heads/created`] },
  { name: 'deleted', args: ['origin', ':refs/heads/created'] },
  { name: 'tag-already-exists', args: ['origin', `${B}:refs/tags/v1`] },
  { name: 'ref-conflict', args: ['origin', `${A}:refs/heads/x`] },
  {
    // The update hook moves the ref after the client's lease check passed, so
    // the receiving git's own compare-and-swap fails.
    name: 'lease-race-moved',
    setup: () =>
      hook(remote, 'update', `[ "$1" = refs/heads/race ] && git update-ref "$1" ${C}\nexit 0`),
    args: [`--force-with-lease=refs/heads/race:${A}`, 'origin', `${B}:refs/heads/race`],
  },
  {
    name: 'lease-race-created',
    setup: () =>
      hook(remote, 'update', `[ "$1" = refs/heads/fresh ] && git update-ref "$1" ${C}\nexit 0`),
    args: ['--force-with-lease=refs/heads/fresh:', 'origin', `${B}:refs/heads/fresh`],
  },
  {
    name: 'pre-receive-declined',
    setup: () => hook(remote, 'pre-receive', 'echo declined by policy >&2\nexit 1'),
    args: ['origin', `${A}:refs/heads/hooked`],
  },
  {
    name: 'update-hook-declined',
    setup: () => hook(remote, 'update', 'exit 1'),
    args: ['origin', `${A}:refs/heads/hooked`],
  },
  { name: 'mixed', args: ['origin', `${A}:refs/heads/mixed`, `${B}:refs/heads/holder`] },
  { name: 'atomic', args: ['--atomic', 'origin', `${A}:refs/heads/atomic`, `${A}:refs/heads/x`] },
  { name: 'src-refspec-matches-nothing', args: ['origin', 'refs/heads/no-such-branch'] },
  { name: 'no-such-remote', args: ['no-such-remote', 'HEAD:refs/heads/main'] },
]

const cases = []
for (const c of CASES) {
  const teardown = c.setup?.()
  const r = spawnSync('git', ['push', '--porcelain', ...c.args], {
    cwd: work,
    env: ENV,
    encoding: 'utf8',
  })
  teardown?.()
  const scrub = (text) => text.replaceAll(root, '<root>').replace(/ +$/gm, '')
  cases.push({
    name: c.name,
    argv: ['push', '--porcelain', ...c.args],
    exitCode: r.status,
    stdout: scrub(r.stdout),
    stderr: scrub(r.stderr),
  })
}
rmSync(root, { recursive: true, force: true })

const out = join(HERE, `git-${version}.json`)
writeFileSync(
  out,
  `${JSON.stringify({ git: version, recorded: new Date().toISOString().slice(0, 10), cases }, null, 2)}\n`,
)
process.stdout.write(`wrote ${out}\n`)
