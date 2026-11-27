/**
 * `pr-update mirror prune` and `mirror list` over pr-update's cache: run worktrees under
 * `worktrees/`, managed clones, and the leftovers a killed run can leave. Every clone and checkout
 * is a local repository, and every run is under `isolatedEnv`: nothing reaches the network or
 * the real home.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'

import { EXIT, captureContext } from '@osdlc/cli-tool'
import { spawnRunner, type CommandRunner } from '@osdlc/command-seam'
import { osdlcDirs } from '@osdlc/ecosystem'
import { processStartedAt, releaseLock } from '@osdlc/file-lock'
import { makeGitFixture } from '@osdlc/typed-git/testing'

import { main } from '../src/cli.ts'
import { machineFile, prUpdatePaths } from '../src/machine.ts'
import {
  CLONE_MARKER,
  CLONE_STAMP,
  claimCloneLock,
  cloneLockPath,
  markMirrorDir,
} from '../src/mirror.ts'
import {
  RUN_START_MARGIN_MS,
  listMirror,
  pruneMirror,
  runAliveWith,
  type PruneOptions,
} from '../src/prune.ts'
import { allToolsInstalled, isolatedEnv, literal, worktreePaths } from './support.ts'

/** No process has this pid, so a run named for it is dead. */
const DEAD = '2147483646.1'
/** When this file loaded: after this process started, so a run named `<pid>.<STARTED + n>` for it is alive. */
const STARTED = Date.now()
/** A run worktree name for this process, which is alive; `n` makes two names differ. */
const liveRun = (n = 0): string => `${process.pid}.${STARTED + n}`
const DAY = 24 * 60 * 60 * 1000

let scratch: string
let env: Record<string, string>
let paths: ReturnType<typeof prUpdatePaths>
/** A repository with a `main` branch the clones and checkouts are made from. */
let source: string
/** Locks a test took, released after it. */
let held: { path: string; token: string }[]

function git(dir: string, ...argv: string[]): string {
  const res = spawnRunner('git').run(argv, { cwd: dir })
  if (res.exitCode !== 0) throw new Error(`git ${argv.join(' ')}: ${res.stderr}`)
  return res.stdout.trim()
}

beforeEach(() => {
  scratch = realpathSync.native(mkdtempSync(join(tmpdir(), 'pr-update-prune-')))
  env = isolatedEnv(join(scratch, 'env'))
  paths = prUpdatePaths(osdlcDirs({ env }))
  const work = makeGitFixture({ dir: join(scratch, 'source') })
  work.commit('base', { 'a.txt': 'a' })
  source = work.dir
  held = []
})
afterEach(() => {
  for (const { path, token } of held) releaseLock(path, token)
  rmSync(scratch, { recursive: true, force: true })
})

/** A managed clone of `repo` (`owner/name` on github.com) in `dir`, last used `daysAgo` days ago. */
function makeClone(repo: string, daysAgo: number, dir = paths.repos): string {
  markMirrorDir(dir)
  const path = join(dir, 'github.com', ...repo.split('/')) + '.git'
  mkdirSync(dirname(path), { recursive: true })
  git(scratch, 'clone', '-q', '--bare', source, path)
  // The layout pr-update's clones keep: no branches of their own, the remote's under origin/*.
  git(path, 'update-ref', 'refs/remotes/origin/main', 'refs/heads/main')
  git(path, 'update-ref', '-d', 'refs/heads/main')
  writeFileSync(join(path, CLONE_MARKER), `${JSON.stringify({ tool: 'pr-update', repo })}\n`)
  writeFileSync(join(path, CLONE_STAMP), `${new Date(Date.now() - daysAgo * DAY).toISOString()}\n`)
  return path
}

/** A run worktree of `owner` (a clone or a checkout) for `repo`, named `run`, on its scratch branch. */
function runWorktree(owner: string, repo: string, run = DEAD): string {
  const path = join(paths.worktrees, 'github.com', ...repo.split('/'), run)
  mkdirSync(dirname(path), { recursive: true })
  git(owner, 'worktree', 'add', '-q', '-b', `pr-update/scratch-${run}`, path, startOf(owner))
  return path
}

/** Where a worktree of `owner` starts: a clone's `origin/main`, or a checkout's `main`. */
const startOf = (owner: string): string =>
  existsSync(join(owner, CLONE_MARKER)) ? 'origin/main' : 'main'

/** A kept worktree of the clone `clone` for `repo#number`, with its record. */
function keptWorktree(clone: string, repo: string, number: number): string {
  const dir = join(paths.kept, 'github.com', ...repo.split('/'))
  const path = join(dir, String(number))
  mkdirSync(dir, { recursive: true })
  const branch = `pr-update/failed-${repo.replace('/', '-')}-${number}`
  git(clone, 'worktree', 'add', '-q', '-b', branch, path, startOf(clone))
  const record = {
    repo,
    number,
    head: 'topic',
    base: 'main',
    headOid: null,
    baseOid: null,
    path,
    branch,
    gitDir: realpathSync.native(clone),
  }
  writeFileSync(join(dir, `${number}.json`), JSON.stringify(record))
  return path
}

/** The paths of the worktrees git lists for `gitDir`, other than the bare entry. */
function listed(gitDir: string): string[] {
  return worktreePaths(git(gitDir, 'worktree', 'list', '--porcelain')).filter(
    (p) => p !== realpathSync.native(gitDir) && p !== dirname(realpathSync.native(gitDir)),
  )
}

function branches(gitDir: string): string[] {
  return git(gitDir, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/')
    .split('\n')
    .filter(Boolean)
}

/** Hold the lock of `clone` as another live run would. */
function holdLock(clone: string): string {
  const path = cloneLockPath(clone)
  const token = claimCloneLock(path, 0)
  if (token === null) throw new Error('lock busy')
  held.push({ path, token })
  return path
}

/** Set the mtime of `path` to `ms` ago. */
function age(path: string, ms: number): void {
  const t = new Date(Date.now() - ms)
  utimesSync(path, t, t)
}

/** A git runner that records each call's argv and env. */
function recordingGit(): {
  runner: CommandRunner
  calls: { argv: string[]; env: Record<string, string | undefined> }[]
} {
  const real = spawnRunner('git')
  const calls: { argv: string[]; env: Record<string, string | undefined> }[] = []
  return {
    calls,
    runner: {
      run: (argv, opts) => {
        calls.push({ argv: [...argv], env: { ...opts?.env } })
        return real.run(argv, opts)
      },
    },
  }
}

const prune = (opts: Partial<PruneOptions> = {}) => pruneMirror({ env, ...opts })

describe('dead run worktrees under worktrees/', () => {
  test('one of a located checkout is removed through its owner; the person’s own worktrees stay, even one whose folder is missing', () => {
    const checkout = makeGitFixture({ dir: join(scratch, 'dev', 'web') })
    checkout.commit('init', { 'w.txt': 'w' })
    const dead = runWorktree(checkout.dir, 'acme/web')
    const live = runWorktree(checkout.dir, 'acme/web', liveRun())
    // The person's own worktree, on a drive that is not mounted: a bare prune would drop it.
    const theirs = join(scratch, 'elsewhere', 'feature')
    git(checkout.dir, 'worktree', 'add', '-q', '-b', 'feature', theirs, 'main')
    rmSync(theirs, { recursive: true, force: true })

    const r = prune()

    expect(r.removed).toEqual([
      expect.objectContaining({ kind: 'worktree', path: dead, repo: 'github.com/acme/web' }),
    ])
    expect(existsSync(dead)).toBe(false)
    expect(existsSync(live)).toBe(true)
    expect(listed(checkout.dir).sort()).toEqual([live, theirs].sort())
    expect(branches(checkout.dir)).not.toContain(`pr-update/scratch-${DEAD}`)
    expect(branches(checkout.dir)).toContain('feature')
  })

  test('one of a located checkout is removed through its owner with GIT_DIR set to another repository', () => {
    const checkout = makeGitFixture({ dir: join(scratch, 'dev', 'web') })
    checkout.commit('init', { 'w.txt': 'w' })
    const dead = runWorktree(checkout.dir, 'acme/web')
    // A git hook in another checkout exports its GIT_DIR.
    const hook = makeGitFixture({ dir: join(scratch, 'dev', 'hook') })
    hook.commit('hook', { 'h.txt': 'h' })
    const hookRefs = git(hook.dir, 'for-each-ref')

    vi.stubEnv('GIT_DIR', join(hook.dir, '.git'))
    let r: ReturnType<typeof prune>
    try {
      r = prune()
    } finally {
      vi.unstubAllEnvs()
    }

    expect(r.removed.map((e) => e.path)).toEqual([dead])
    expect(existsSync(dead)).toBe(false)
    expect(listed(checkout.dir)).toEqual([])
    expect(branches(checkout.dir)).not.toContain(`pr-update/scratch-${DEAD}`)
    expect(git(hook.dir, 'for-each-ref')).toBe(hookRefs)
  })

  // Windows has no search bit for chmod to take away, and root searches any folder.
  test.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'one holding a folder that cannot be searched fails on its own; the other is still removed (final review round 1)',
    () => {
      const checkout = makeGitFixture({ dir: join(scratch, 'dev', 'web') })
      checkout.commit('init', { 'w.txt': 'w' })
      const stuck = runWorktree(checkout.dir, 'acme/web')
      const other = runWorktree(checkout.dir, 'acme/web', '2147483645.1')
      // Readable but not searchable, as a PR's test run there can leave a folder.
      const shut = join(stuck, 'shut')
      mkdirSync(shut)
      writeFileSync(join(shut, 'inside'), 'x')
      chmodSync(shut, 0o600)
      try {
        const r = prune()
        expect(r.removed.map((e) => e.path)).toEqual([other])
        expect(existsSync(other)).toBe(false)
        expect(r.failed.map((e) => e.path)).toEqual([stuck])
      } finally {
        chmodSync(shut, 0o700)
      }
    },
  )

  // Windows has no search bit for chmod to take away, and root searches any folder.
  test.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'an owner folder that cannot be searched fails on its own; a sibling repository is still pruned (final review round 2)',
    () => {
      const web = makeGitFixture({ dir: join(scratch, 'dev', 'web') })
      web.commit('init', { 'w.txt': 'w' })
      const api = makeGitFixture({ dir: join(scratch, 'dev', 'api') })
      api.commit('init', { 'a.txt': 'a' })
      const sibling = runWorktree(web.dir, 'other/web')
      runWorktree(api.dir, 'acme/api')
      // Readable but not searchable: its names list, but nothing under it can be looked at.
      const shut = join(paths.worktrees, 'github.com', 'acme')
      chmodSync(shut, 0o600)
      try {
        for (const dryRun of [true, false]) {
          const r = prune({ dryRun })
          expect(r.removed.map((e) => e.path)).toEqual([sibling])
          expect(r.failed).toEqual([
            expect.objectContaining({
              kind: 'worktree',
              path: join(shut, 'api'),
              reason: expect.stringContaining('could not be read: EACCES'),
            }),
          ])
        }
        expect(existsSync(sibling)).toBe(false)
      } finally {
        chmodSync(shut, 0o700)
      }
    },
  )

  test.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'a clone owner folder that cannot be searched fails on its own; a sibling clone is still pruned (final review round 2)',
    () => {
      makeClone('acme/api', 400)
      const sibling = makeClone('other/web', 400)
      const shut = join(paths.repos, 'github.com', 'acme')
      chmodSync(shut, 0o600)
      try {
        const r = prune({ allClones: true })
        expect(r.removed.map((e) => e.path)).toEqual([sibling])
        expect(r.failed).toEqual([
          expect.objectContaining({
            kind: 'clone',
            path: join(shut, 'api.git'),
            reason: expect.stringContaining('could not be read: EACCES'),
          }),
        ])
        expect(existsSync(sibling)).toBe(false)
      } finally {
        chmodSync(shut, 0o700)
      }
    },
  )

  test
    .skipIf(process.platform === 'win32' || process.getuid?.() === 0)
    .each(['owner folder', 'clone'])(
    'one whose clone cannot be read for its %s is left and reported, not removed without the clone’s lock (final review round 2)',
    (what) => {
      const clone = makeClone('acme/api', 1)
      const dead = runWorktree(clone, 'acme/api')
      const shut = what === 'clone' ? clone : dirname(clone)
      chmodSync(shut, 0o600)
      try {
        for (const dryRun of [true, false]) {
          const r = prune({ dryRun })
          expect(r.removed).toEqual([])
          expect(r.failed).toContainEqual(
            expect.objectContaining({
              kind: 'worktree',
              path: dead,
              reason: expect.stringContaining('EACCES'),
            }),
          )
        }
        expect(existsSync(dead)).toBe(true)
        // A listing notes it, and shows the worktree with no owner.
        const notes: string[] = []
        const l = listMirror({ env, notice: (n) => notes.push(n) })
        expect(l.worktrees).toEqual([expect.objectContaining({ path: dead, owner: null })])
        expect(notes.join('\n')).toContain(`${dead} could not be read: EACCES`)
      } finally {
        chmodSync(shut, 0o700)
      }
    },
  )

  test.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'a kept folder that cannot be listed keeps its tree and its clone under --discard-kept, in a dry run too (final review round 2)',
    () => {
      const clone = makeClone('acme/api', 400)
      const path = keptWorktree(clone, 'acme/api', 7)
      // Searchable but not listable: the records in it cannot be found.
      chmodSync(dirname(path), 0o300)
      try {
        for (const dryRun of [true, false]) {
          const r = prune({ allClones: true, discardKept: true, dryRun })
          expect(r.removed).toEqual([])
          expect(r.failed.map((e) => e.path)).toEqual([dirname(path), clone])
        }
        expect(existsSync(path)).toBe(true)
        expect(existsSync(clone)).toBe(true)
      } finally {
        chmodSync(dirname(path), 0o700)
      }
    },
  )

  test('one registered in a managed clone is removed while holding the clone’s lock, without waiting', () => {
    const clone = makeClone('acme/api', 1)
    const dead = runWorktree(clone, 'acme/api')
    const claims: { path: string; waitMs: number }[] = []

    const r = prune({
      claim: (path, waitMs) => {
        claims.push({ path, waitMs })
        // The lock is held while the worktree goes.
        const token = claimCloneLock(path, waitMs)
        expect(existsSync(dead)).toBe(true)
        return token
      },
    })

    expect(claims).toEqual([{ path: cloneLockPath(clone), waitMs: 0 }])
    expect(r.removed.map((e) => e.path)).toEqual([dead])
    expect(existsSync(dead)).toBe(false)
    expect(listed(clone)).toEqual([])
    expect(branches(clone)).toEqual([])
    // Released, and so removed: the lock file goes with the release.
    expect(existsSync(cloneLockPath(clone))).toBe(false)
  })

  test('one in a clone another run holds is left, as mirror busy', () => {
    const clone = makeClone('acme/api', 1)
    const dead = runWorktree(clone, 'acme/api')
    const lock = holdLock(clone)

    const r = prune()

    expect(r.skipped).toEqual([
      expect.objectContaining({
        kind: 'worktree',
        path: dead,
        reason: `mirror busy: another pr-update run holds ${lock}`,
      }),
    ])
    expect(existsSync(dead)).toBe(true)
    expect(listed(clone)).toEqual([dead])
  })

  test('one whose owner is gone has only its folder removed', () => {
    const checkout = makeGitFixture({ dir: join(scratch, 'dev', 'gone') })
    checkout.commit('init', { 'g.txt': 'g' })
    const dead = runWorktree(checkout.dir, 'acme/gone')
    rmSync(checkout.dir, { recursive: true, force: true })

    const r = prune()

    expect(r.removed.map((e) => e.path)).toEqual([dead])
    expect(r.failed).toEqual([])
    expect(existsSync(dead)).toBe(false)
  })

  test('the .git file and commondir are read first: a record that names another tree is not touched', () => {
    const checkout = makeGitFixture({ dir: join(scratch, 'dev', 'web') })
    checkout.commit('init', { 'w.txt': 'w' })
    const other = runWorktree(checkout.dir, 'acme/web', liveRun(1))
    // A dead run's folder whose .git names the live run's record.
    const dead = join(dirname(other), DEAD)
    mkdirSync(dead)
    writeFileSync(join(dead, '.git'), readFileSync(join(other, '.git'), 'utf8'))
    const { runner, calls } = recordingGit()

    prune({ git: runner })

    // Its records do not name it, so its owner is not asked to do anything.
    expect(calls).toEqual([])

    expect(existsSync(dead)).toBe(false)
    expect(existsSync(other)).toBe(true)
    expect(listed(checkout.dir)).toEqual([other])
  })

  test('a live run’s worktree is left alone, and so is a folder that is not named for a run', () => {
    const clone = makeClone('acme/api', 1)
    const live = runWorktree(clone, 'acme/api', liveRun())
    const odd = join(dirname(live), 'notes')
    mkdirSync(odd)

    const r = prune()

    expect(r.removed).toEqual([])
    expect(existsSync(live)).toBe(true)
    expect(existsSync(odd)).toBe(true)
  })

  test('a symbolic link is never followed out of the cache', () => {
    const outside = join(scratch, 'outside')
    mkdirSync(outside)
    writeFileSync(join(outside, 'keep.txt'), 'keep')
    // A link where a run worktree would be, and a link where a repository's folder would be.
    const repoDir = join(paths.worktrees, 'github.com', 'acme', 'api')
    mkdirSync(repoDir, { recursive: true })
    symlinkSync(outside, join(repoDir, DEAD))
    symlinkSync(outside, join(paths.worktrees, 'github.com', 'acme', 'web'))
    // A dead run's folder holding a link out.
    const clone = makeClone('acme/api', 1)
    const dead = runWorktree(clone, 'acme/api', '2147483645.1')
    symlinkSync(outside, join(dead, 'out'))
    // A clone directory whose host folder is a link.
    symlinkSync(outside, join(paths.repos, 'example.com'))

    const r = prune({ allClones: true })

    expect(readdirSync(outside)).toEqual(['keep.txt'])
    expect(existsSync(join(repoDir, DEAD))).toBe(true)
    expect(existsSync(dead)).toBe(false)
    expect(r.removed.map((e) => e.path)).toEqual([dead, clone])
  })
})

describe('managed clones', () => {
  test('one unused past mirror_max_age_days (30 by default) is removed under its lock, and the lock file goes last', () => {
    const old = makeClone('acme/old', 40)
    const fresh = makeClone('acme/fresh', 10)
    const order: string[] = []

    const r = prune({
      claim: (path, wait) => {
        order.push(`claim ${path}`)
        return claimCloneLock(path, wait)
      },
    })

    expect(r.olderThanDays).toBe(30)
    expect(r.removed).toEqual([
      expect.objectContaining({ kind: 'clone', path: old, repo: 'github.com/acme/old' }),
    ])
    expect(r.removed[0]!.bytes).toBeGreaterThan(0)
    expect(r.freedBytes).toBe(r.removed[0]!.bytes)
    expect(order).toEqual([`claim ${cloneLockPath(old)}`])
    expect(existsSync(old)).toBe(false)
    expect(existsSync(cloneLockPath(old))).toBe(false)
    expect(existsSync(fresh)).toBe(true)
  })

  test('at mirror_max_age_days: 0 no clone is removed, unless --older-than or --all-clones is given; dead run worktrees still are', () => {
    const file = machineFile({ env })
    mkdirSync(dirname(file.path()), { recursive: true })
    writeFileSync(file.path(), 'mirror_max_age_days: 0\n')
    const clone = makeClone('acme/api', 400)
    const other = makeClone('acme/web', 3)
    const dead = runWorktree(clone, 'acme/api')

    const none = prune()
    expect(none.olderThanDays).toBeNull()
    expect(none.removed.map((e) => e.path)).toEqual([dead])
    expect(existsSync(clone)).toBe(true)

    expect(prune({ olderThanDays: 7 }).removed.map((e) => e.path)).toEqual([clone])
    expect(existsSync(other)).toBe(true)
    expect(prune({ allClones: true }).removed.map((e) => e.path)).toEqual([other])
  })

  test('one another run holds is never removed, even with --all-clones', () => {
    const clone = makeClone('acme/api', 400)
    const lock = holdLock(clone)

    const r = prune({ allClones: true })

    expect(r.skipped).toEqual([
      expect.objectContaining({
        path: clone,
        reason: `mirror busy: another pr-update run holds ${lock}`,
      }),
    ])
    expect(existsSync(clone)).toBe(true)
  })

  test('one with a kept worktree stays, even with --all-clones; --discard-kept removes the kept tree, its branch and record, then the clone', () => {
    const clone = makeClone('acme/api', 400)
    const kept = keptWorktree(clone, 'acme/api', 7)

    const stays = prune({ allClones: true })
    expect(stays.skipped).toEqual([
      expect.objectContaining({
        path: clone,
        reason: `has kept worktrees (${kept}); pass --discard-kept to remove them and the clone`,
      }),
    ])
    expect(existsSync(clone)).toBe(true)
    expect(existsSync(kept)).toBe(true)

    const goes = prune({ allClones: true, discardKept: true })
    expect(goes.removed.map((e) => [e.kind, e.path])).toEqual([
      ['kept', kept],
      ['clone', clone],
    ])
    expect(existsSync(kept)).toBe(false)
    expect(existsSync(`${kept}.json`)).toBe(false)
    expect(existsSync(clone)).toBe(false)
  })

  test('a kept worktree with no record stays without --discard-kept, and with it goes with its branch', () => {
    const clone = makeClone('acme/api', 400)
    const path = join(paths.kept, 'github.com', 'acme', 'api', '9')
    mkdirSync(dirname(path), { recursive: true })
    git(clone, 'worktree', 'add', '-q', '-b', 'pr-update/failed-acme-api-9', path, 'origin/main')

    expect(prune({ allClones: true }).skipped).toEqual([
      expect.objectContaining({
        path: clone,
        reason: expect.stringContaining('has kept worktrees'),
      }),
    ])
    expect(existsSync(path)).toBe(true)

    const r = prune({ allClones: true, discardKept: true })
    expect(r.removed.map((e) => [e.kind, e.path])).toEqual([
      ['kept', path],
      ['clone', clone],
    ])
    expect(existsSync(path)).toBe(false)
    expect(existsSync(clone)).toBe(false)
  })

  test.each([
    ['with no record, switched to another branch', false, ['switch', '-q', '-c', 'my-work']],
    ['with no record, detached', false, ['switch', '-q', '--detach']],
    ['with a record, switched to another branch', true, ['switch', '-q', '-c', 'my-work']],
  ] as const)(
    'a kept worktree %s, with a new file, goes with its clone under --discard-kept, in a dry run too (ownership contract)',
    (_, recorded, move) => {
      const clone = makeClone('acme/api', 400)
      let path = join(paths.kept, 'github.com', 'acme', 'api', '9')
      if (recorded) path = keptWorktree(clone, 'acme/api', 9)
      else {
        mkdirSync(dirname(path), { recursive: true })
        git(
          clone,
          'worktree',
          'add',
          '-q',
          '-b',
          'pr-update/failed-acme-api-9',
          path,
          'origin/main',
        )
      }
      git(path, ...move)
      writeFileSync(join(path, 'new.txt'), 'x\n')

      for (const dryRun of [true, false]) {
        const r = prune({ allClones: true, discardKept: true, dryRun })
        expect(r.failed).toEqual([])
        expect(r.removed.map((e) => [e.kind, e.path])).toEqual([
          ['kept', path],
          ['clone', clone],
        ])
        expect(existsSync(path)).toBe(dryRun)
      }
      expect(existsSync(`${path}.json`)).toBe(false)
      expect(existsSync(clone)).toBe(false)
    },
  )

  test('a kept worktree whose record names another repository goes through its clone, and that repository is not touched (ownership contract)', () => {
    const clone = makeClone('acme/api', 400)
    const path = keptWorktree(clone, 'acme/api', 7)
    const other = makeGitFixture({ dir: join(scratch, 'dev', 'other') })
    other.commit('init', { 'o.txt': 'o' })
    const recordFile = join(dirname(path), '7.json')
    const record = JSON.parse(readFileSync(recordFile, 'utf8')) as Record<string, unknown>
    const otherGitDir = realpathSync.native(join(other.dir, '.git'))
    writeFileSync(recordFile, JSON.stringify({ ...record, gitDir: otherGitDir }))
    const before = git(other.dir, 'for-each-ref')

    const r = prune({ allClones: true, discardKept: true })
    expect(r.failed).toEqual([])
    expect(r.removed.map((e) => [e.kind, e.path])).toEqual([
      ['kept', path],
      ['clone', clone],
    ])
    expect(existsSync(recordFile)).toBe(false)
    expect(git(other.dir, 'for-each-ref')).toBe(before)
    expect(listed(join(other.dir, '.git'))).toEqual([])
  })

  test('one with a live run’s worktree in it stays', () => {
    const clone = makeClone('acme/api', 400)
    const live = runWorktree(clone, 'acme/api', liveRun())

    const r = prune({ allClones: true })

    expect(r.skipped).toEqual([
      expect.objectContaining({ path: clone, reason: `in use by the worktree ${live}` }),
    ])
    expect(existsSync(clone)).toBe(true)
  })

  test('a folder without the clone marker is never removed, and a clone directory without its marker is not walked', () => {
    const clone = makeClone('acme/api', 400)
    unlinkSync(join(clone, CLONE_MARKER))
    const unmarked = join(scratch, 'unmarked')
    mkdirSync(join(unmarked, 'github.com', 'acme'), { recursive: true })
    git(scratch, 'clone', '-q', '--bare', source, join(unmarked, 'github.com', 'acme', 'web.git'))
    writeFileSync(join(unmarked, 'github.com', 'acme', 'web.git', CLONE_MARKER), '{}\n')

    const r = prune({ allClones: true })
    expect(r.removed).toEqual([])
    expect(r.skipped).toEqual([
      expect.objectContaining({
        path: clone,
        reason: expect.stringContaining('pr-update did not make it'),
      }),
    ])
    expect(existsSync(clone)).toBe(true)

    expect(prune({ allClones: true, dir: unmarked }).removed).toEqual([])
    expect(existsSync(join(unmarked, 'github.com', 'acme', 'web.git'))).toBe(true)
  })

  test('a removal that fails part-way leaves a .tmp-* leftover, not a broken clone, and a later prune removes it', () => {
    const clone = makeClone('acme/api', 400)
    const aside = join(dirname(clone), `.tmp-api.git-${process.pid}`)
    let first = true
    const failing = (path: string): void => {
      if (first) {
        first = false
        rmSync(join(path, 'HEAD'))
        throw new Error('EACCES: permission denied')
      }
      rmSync(path, { recursive: true, force: true })
    }

    const r = prune({ allClones: true, remove: failing })

    expect(r.removed).toEqual([])
    expect(r.failed).toEqual([
      expect.objectContaining({
        kind: 'clone',
        path: clone,
        reason: `EACCES: permission denied; what is left, ${aside}, is removed by a later prune`,
      }),
    ])
    // Nothing is left at the clone path, so the next run clones afresh; the lock was let go.
    expect(existsSync(clone)).toBe(false)
    expect(existsSync(aside)).toBe(true)
    expect(existsSync(cloneLockPath(clone))).toBe(false)

    // Under an hour old: left.
    expect(prune().removed).toEqual([])
    age(aside, 2 * 60 * 60 * 1000)
    expect(prune().removed).toEqual([expect.objectContaining({ kind: 'leftover', path: aside })])
    expect(existsSync(aside)).toBe(false)
  })

  test('a clone git cannot read is left with the error, and the other clones are still removed', () => {
    const broken = makeClone('acme/api', 400)
    const other = makeClone('acme/web', 400)
    rmSync(join(broken, 'HEAD'))

    const r = prune({ allClones: true })

    expect(r.failed).toEqual([expect.objectContaining({ kind: 'clone', path: broken })])
    expect(r.removed.map((e) => e.path)).toEqual([other])
    expect(existsSync(broken)).toBe(true)
    expect(existsSync(cloneLockPath(broken))).toBe(false)
  })

  test('a dry run says what would go, takes no lock and changes nothing', () => {
    const clone = makeClone('acme/api', 400)
    const dead = runWorktree(clone, 'acme/api')
    let claimed = 0

    const r = prune({
      dryRun: true,
      claim: () => {
        claimed += 1
        return null
      },
    })

    expect(r.dryRun).toBe(true)
    expect(r.removed.map((e) => [e.kind, e.path])).toEqual([
      ['worktree', dead],
      ['clone', clone],
    ])
    expect(claimed).toBe(0)
    expect(existsSync(dead)).toBe(true)
    expect(existsSync(clone)).toBe(true)
    expect(existsSync(cloneLockPath(clone))).toBe(false)
  })

  test('every git call runs with hooks off', () => {
    const clone = makeClone('acme/api', 400)
    runWorktree(clone, 'acme/api')
    keptWorktree(clone, 'acme/api', 7)
    const { runner, calls } = recordingGit()

    prune({ allClones: true, discardKept: true, git: runner })

    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      // The last word on each key is git's, read from GIT_CONFIG_PARAMETERS after the pairs.
      expect(call.env.GIT_CONFIG_PARAMETERS).toMatch(/'core\.hooksPath'='\/dev\/null'/)
      expect(call.env.GIT_CONFIG_PARAMETERS).toMatch(/'gc\.auto'='0'$/)
    }
    expect(existsSync(clone)).toBe(false)
  })
})

describe('leftovers', () => {
  test('a .tmp-* clone folder and a probe older than an hour are removed; younger ones, and other names starting with ., stay', () => {
    makeClone('acme/api', 1)
    const parent = join(paths.repos, 'github.com', 'acme')
    const oldTmp = join(parent, '.tmp-web.git-2147483646')
    const newTmp = join(parent, '.tmp-cli.git-2147483646')
    const other = join(parent, '.keep')
    const oldProbe = join(paths.worktrees, 'github.com', 'acme', 'api', '.pr-update-probe-abc')
    const keptProbe = join(paths.kept, 'github.com', 'acme', 'api', '.pr-update-probe-def')
    const newProbe = join(paths.worktrees, 'github.com', 'acme', 'api', '.pr-update-probe-ghi')
    const dotDir = join(paths.worktrees, 'github.com', 'acme', 'api', '.other')
    for (const d of [oldTmp, newTmp, other, oldProbe, keptProbe, newProbe, dotDir]) {
      mkdirSync(d, { recursive: true })
    }
    for (const d of [oldTmp, other, oldProbe, keptProbe, dotDir]) age(d, 2 * 60 * 60 * 1000)

    const r = prune()

    expect(r.removed.map((e) => e.path).sort()).toEqual([keptProbe, oldProbe, oldTmp].sort())
    for (const d of [newTmp, other, newProbe, dotDir]) expect(existsSync(d)).toBe(true)
  })

  test('a .tmp-* folder whose clone’s lock another run holds is left', () => {
    const clone = makeClone('acme/api', 1)
    const tmp = join(dirname(clone), '.tmp-api.git-2147483646')
    mkdirSync(tmp)
    age(tmp, 2 * 60 * 60 * 1000)
    const lock = holdLock(clone)

    const r = prune()

    expect(r.skipped).toEqual([
      expect.objectContaining({
        path: tmp,
        reason: `mirror busy: another pr-update run holds ${lock}`,
      }),
    ])
    expect(existsSync(tmp)).toBe(true)
  })
})

describe('mirror list', () => {
  test('shows each clone’s repository, size, last use and kept worktrees, and the run worktrees; it takes no lock', () => {
    const clone = makeClone('acme/api', 3)
    const kept = keptWorktree(clone, 'acme/api', 7)
    const dead = runWorktree(clone, 'acme/api')
    const live = runWorktree(clone, 'acme/api', liveRun())
    const other = makeClone('acme/web', 1)
    const lock = holdLock(other)
    const lockText = readFileSync(lock, 'utf8')
    const stamp = readFileSync(join(clone, CLONE_STAMP), 'utf8').trim()

    const l = listMirror({ env })

    expect(l.mirrorDir).toBe(paths.repos)
    expect(l.clones).toEqual([
      {
        repo: 'github.com/acme/api',
        path: clone,
        bytes: expect.any(Number),
        lastUsed: stamp,
        kept: [kept],
      },
      {
        repo: 'github.com/acme/web',
        path: other,
        bytes: expect.any(Number),
        lastUsed: expect.any(String),
        kept: [],
      },
    ])
    expect(l.clones[0]!.bytes).toBeGreaterThan(0)
    // Sorted by name, so the order depends on this process's pid: compare without it.
    expect([...l.worktrees].sort((a, b) => Number(a.running) - Number(b.running))).toEqual([
      {
        path: dead,
        repo: 'github.com/acme/api',
        running: false,
        owner: realpathSync.native(clone),
      },
      { path: live, repo: 'github.com/acme/api', running: true, owner: realpathSync.native(clone) },
    ])
    expect(readFileSync(lock, 'utf8')).toBe(lockText)
    expect(existsSync(cloneLockPath(clone))).toBe(false)
  })
})

describe('pr-update mirror list and prune, on the command line', () => {
  async function run(...argv: string[]): Promise<{ code: number; out: string; err: string }> {
    const ctx = captureContext({ cwd: scratch, env })
    const code = await main(argv, ctx, { which: allToolsInstalled })
    return { code, out: ctx.io.out, err: ctx.io.err }
  }

  test('list prints text and --json', async () => {
    const clone = makeClone('acme/api', 3)
    const dead = runWorktree(clone, 'acme/api')

    const text = await run('mirror', 'list')
    expect(text.code).toBe(EXIT.ok)
    expect(text.out).toContain(`managed clones in ${paths.repos}:`)
    expect(text.out).toMatch(/ {2}github\.com\/acme\/api {2}[\d.]+ (KB|MB) {2}last used /)
    expect(text.out).toContain(
      `  github.com/acme/api  ${dead}  (left by a run that is gone; a worktree of `,
    )

    const json = await run('mirror', 'list', '--json')
    expect(json.code).toBe(EXIT.ok)
    expect(JSON.parse(json.out)).toMatchObject({
      kind: 'mirror-list',
      clones: [{ repo: 'github.com/acme/api', path: clone, kept: [] }],
      worktrees: [{ path: dead, running: false }],
    })
  })

  test('prune --older-than, --all-clones, --dry-run and --mirror-dir', async () => {
    const elsewhere = join(scratch, 'moved')
    const left = makeClone('acme/api', 5, elsewhere)
    const clone = makeClone('acme/web', 5)

    const dry = await run('mirror', 'prune', '--older-than', '1', '--dry-run', '--json')
    expect(dry.code).toBe(EXIT.ok)
    expect(JSON.parse(dry.out)).toMatchObject({
      kind: 'mirror-prune',
      dryRun: true,
      allClones: false,
      olderThanDays: 1,
    })
    expect(existsSync(clone)).toBe(true)

    const text = await run('mirror', 'prune', '--older-than', '1')
    expect(text.code).toBe(EXIT.ok)
    expect(text.out).toMatch(new RegExp(`^removed clone ${literal(clone)} \\(`, 'm'))
    expect(text.out).toMatch(/^freed /m)
    expect(existsSync(clone)).toBe(false)

    const moved = await run('mirror', 'prune', '--all-clones', '--mirror-dir', elsewhere, '--json')
    expect(JSON.parse(moved.out).removed).toEqual([expect.objectContaining({ path: left })])
  })

  test.each([
    [['--older-than', 'ten'], "--older-than must be a whole number of days, 0 or more, got 'ten'"],
    [['--older-than', '-1'], '--older-than must be a whole number'],
    // `Number` reads each of these as a number.
    [['--older-than', ''], "--older-than must be a whole number of days, 0 or more, got ''"],
    [['--older-than', ' '], "--older-than must be a whole number of days, 0 or more, got ' '"],
    [['--older-than', '1e1'], "got '1e1'"],
    [['--older-than', '0x7'], "got '0x7'"],
    [
      ['--older-than', '3', '--all-clones'],
      '--older-than and --all-clones cannot be used together',
    ],
    [['--mirror-dir', 'clones'], '--mirror-dir must be an absolute path'],
  ])('prune %j is a usage error', async (flags, message) => {
    const r = await run('mirror', 'prune', ...flags)
    expect(r.code).toBe(EXIT.usage)
    expect(r.err).toContain(message)
  })

  test('a prune with nothing to do says so', async () => {
    const r = await run('mirror', 'prune')
    expect(r.code).toBe(EXIT.ok)
    expect(r.out).toBe('nothing to prune\n')
  })
})

// Mode bits mean nothing on Windows; the owner check is POSIX only too.
describe.skipIf(process.platform === 'win32')('folders someone else could write to', () => {
  test('nothing is removed from a folder anyone, another group or another user can write to', () => {
    const clone = makeClone('acme/api', 400)
    const dead = runWorktree(clone, 'acme/api')
    const probe = join(paths.kept, 'github.com', 'acme', 'web', '.pr-update-probe-x')
    mkdirSync(probe, { recursive: true })
    age(probe, 2 * 60 * 60 * 1000)
    const tmp = join(dirname(clone), '.tmp-web.git-2147483646')
    mkdirSync(tmp)
    age(tmp, 2 * 60 * 60 * 1000)
    const keptOwner = join(paths.kept, 'github.com', 'acme')
    chmodSync(join(paths.worktrees, 'github.com'), 0o777)
    chmodSync(keptOwner, 0o775)
    chmodSync(dirname(clone), 0o757)
    // The folder's group as a private group of the person's, on Linux; then the same group
    // shared with others (its number is not the uid).
    const g = statSync(keptOwner).gid
    const privateGroup = { platform: 'linux' as const, uid: g, gid: g }

    const r = prune({ allClones: true, group: { ...privateGroup, uid: g + 1 } })

    expect(r.removed).toEqual([])
    expect(r.skipped.map((e) => [e.path, e.skip, e.reason])).toEqual(
      expect.arrayContaining([
        [
          dead,
          'folder',
          `${join(paths.worktrees, 'github.com')} can be written by anyone; run \`chmod -R go-w ${paths.worktrees}\``,
        ],
        [
          probe,
          'folder',
          `${keptOwner} can be written by its group, which is not a private group of yours; run \`chmod -R go-w ${paths.kept}\``,
        ],
        [
          tmp,
          'folder',
          expect.stringContaining(
            `${dirname(clone)} can be written by anyone; run \`chmod go-w ${dirname(clone)}\`, or choose a clone directory`,
          ),
        ],
        [clone, 'foreign', expect.stringContaining(`${dirname(clone)} can be written by anyone`)],
      ]),
    )
    for (const p of [clone, dead, probe, tmp]) expect(existsSync(p)).toBe(true)

    // With a private group, the group-writable kept folder is the person's own.
    expect(prune({ allClones: true, group: privateGroup }).removed).toEqual([
      expect.objectContaining({ kind: 'leftover', path: probe }),
    ])

    // A run worktree in a sound folder whose owner, a clone, fails the clone checks, is left too.
    chmodSync(join(paths.worktrees, 'github.com'), 0o755)
    const owned = prune({ allClones: true })
    expect(owned.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: dead,
          skip: 'foreign',
          reason: expect.stringContaining(
            `its owner ${realpathSync.native(clone)} is not a clone pr-update may change:`,
          ),
        }),
      ]),
    )
    expect(existsSync(dead)).toBe(true)
    expect(listed(clone)).toEqual([dead])

    // Another user's folders and files, through the injected check.
    chmodSync(dirname(clone), 0o755)
    const notMine = prune({ allClones: true, owned: () => false })
    expect(notMine.removed).toEqual([])
    for (const p of [clone, dead, tmp]) expect(existsSync(p)).toBe(true)
  })

  test('a kept tree in a folder others can write to is not discarded, and its clone stays (second review)', () => {
    const clone = makeClone('acme/api', 400)
    const kept = keptWorktree(clone, 'acme/api', 7)
    const keptOwner = join(paths.kept, 'github.com', 'acme')
    for (const dir of [keptOwner, dirname(kept)]) chmodSync(dir, 0o777)
    const why = `${keptOwner} can be written by anyone; run \`chmod -R go-w ${paths.kept}\``
    try {
      for (const dryRun of [true, false]) {
        const r = prune({ allClones: true, discardKept: true, dryRun })
        expect(r.removed).toEqual([])
        expect(r.skipped).toEqual([
          expect.objectContaining({ kind: 'clone', path: clone, skip: 'folder', reason: why }),
        ])
        expect(existsSync(kept)).toBe(true)
        expect(existsSync(clone)).toBe(true)
      }
    } finally {
      for (const dir of [keptOwner, dirname(kept)]) chmodSync(dir, 0o755)
    }
  })

  test.skipIf(process.platform === 'win32')(
    'a kept tree in a folder others can write to, under a state directory reached through a symbolic link, is not discarded (review round 1)',
    () => {
      // git names the kept tree by its real path; the state directory is configured through a link.
      const realState = join(scratch, 'real-state')
      mkdirSync(realState)
      symlinkSync(realState, join(scratch, 'state-link'), 'dir')
      env = { ...env, OSDLC_STATE_DIR: join(scratch, 'state-link') }
      paths = prUpdatePaths(osdlcDirs({ env }))
      expect(paths.kept.startsWith(join(scratch, 'state-link'))).toBe(true)
      const clone = makeClone('acme/api', 400)
      const kept = keptWorktree(clone, 'acme/api', 7)
      const keptOwner = join(
        realState,
        relative(join(scratch, 'state-link'), paths.kept),
        'github.com',
        'acme',
      )
      chmodSync(keptOwner, 0o777)
      try {
        const r = prune({ allClones: true, discardKept: true })
        expect(r.removed).toEqual([])
        expect(r.skipped).toEqual([
          expect.objectContaining({
            kind: 'clone',
            path: clone,
            skip: 'folder',
            reason: `${keptOwner} can be written by anyone; run \`chmod -R go-w ${paths.kept}\``,
          }),
        ])
        expect(existsSync(kept)).toBe(true)
      } finally {
        chmodSync(keptOwner, 0o755)
      }
    },
  )

  test('a dead run worktree the walk left for its folder keeps its clone: the clone’s own list does not remove it', () => {
    const clone = makeClone('acme/api', 400)
    const dead = runWorktree(clone, 'acme/api')
    chmodSync(join(paths.worktrees, 'github.com'), 0o777)

    const r = prune({ allClones: true })

    expect(r.removed).toEqual([])
    expect(r.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'worktree', path: dead, skip: 'folder' }),
        expect.objectContaining({
          kind: 'clone',
          path: clone,
          skip: 'in-use',
          reason: `its run worktree ${dead} was left, so the clone stays with it`,
        }),
      ]),
    )
    expect(existsSync(dead)).toBe(true)
    expect(listed(clone)).toEqual([dead])
  })

  test('under umask 002 with a user private group, a run worktree made through git is pruned; on macOS, or under a sticky folder anyone can write to, it is left', () => {
    const old = process.umask(0o002)
    try {
      const checkout = makeGitFixture({ dir: join(scratch, 'dev', 'web') })
      checkout.commit('init', { 'w.txt': 'w' })
      const dead = runWorktree(checkout.dir, 'acme/web')
      const clone = makeClone('acme/api', 0)
      const inClone = runWorktree(clone, 'acme/api')
      // The folders git and mkdir made are writable by the group.
      expect(statSync(dirname(dead)).mode & 0o777).toBe(0o775)
      expect(statSync(dirname(clone)).mode & 0o777).toBe(0o775)
      // Their group as the person's private group: Linux, the group's number is the uid.
      const g = statSync(dirname(dead)).gid
      const privateGroup = { platform: 'linux' as const, uid: g, gid: g }

      // macOS: the group (`staff`) is every user's, so the folders are refused.
      const mac = prune({ group: { ...privateGroup, platform: 'darwin' } })
      expect(mac.removed).toEqual([])
      expect(mac.skipped.map((e) => [e.kind, e.skip])).toEqual([
        ['worktree', 'folder'],
        ['worktree', 'folder'],
        ['clone', 'foreign'],
      ])

      const r = prune({ group: privateGroup })

      expect(r.skipped).toEqual([])
      expect(r.removed.map((e) => [e.kind, e.path]).sort()).toEqual(
        [
          ['worktree', dead],
          ['worktree', inClone],
        ].sort(),
      )
      expect(existsSync(dead)).toBe(false)
      expect(listed(clone)).toEqual([])

      // Writable by anyone is refused, sticky bit or not.
      const again = runWorktree(checkout.dir, 'acme/web', '2147483645.1')
      for (const mode of [0o1777, 0o777]) {
        chmodSync(join(paths.worktrees, 'github.com'), mode)
        expect(prune({ group: privateGroup }).skipped).toEqual([
          expect.objectContaining({
            kind: 'worktree',
            path: again,
            skip: 'folder',
            reason: expect.stringContaining('can be written by anyone'),
          }),
        ])
      }
      expect(existsSync(again)).toBe(true)
    } finally {
      process.umask(old)
    }
  })
})

describe('a run is judged by its pid and its start time', () => {
  // The real probes: Windows, or a platform whose start times cannot be read, answers alive.
  test.skipIf(process.platform === 'win32' || processStartedAt(process.pid) === null)(
    'a folder named for this live process with a time a day before it started counts as dead',
    () => {
      const checkout = makeGitFixture({ dir: join(scratch, 'dev', 'web') })
      checkout.commit('init', { 'w.txt': 'w' })
      // The pid of a live process, as when an unrelated later process reuses a dead run's pid.
      const reused = runWorktree(checkout.dir, 'acme/web', `${process.pid}.${STARTED - DAY}`)
      const running = runWorktree(checkout.dir, 'acme/web', liveRun())

      expect(
        listMirror({ env })
          .worktrees.map((w) => [w.path, w.running])
          .sort(),
      ).toEqual(
        [
          [reused, false],
          [running, true],
        ].sort(),
      )
      const r = prune()

      expect(r.removed).toEqual([expect.objectContaining({ kind: 'worktree', path: reused })])
      expect(existsSync(reused)).toBe(false)
      expect(existsSync(running)).toBe(true)
    },
  )

  test('a start up to 10 minutes after the recorded time is the run (a clock step); later, or no process, is not; an unreadable start is alive', () => {
    const recorded = 1_700_000_000_000
    const check = (start: number | null, alive = true) =>
      runAliveWith({ alive: () => alive, startedAt: () => start })(41, recorded)
    expect(check(recorded - 60_000)).toBe(true)
    expect(check(recorded + 5_000)).toBe(true)
    expect(check(recorded + RUN_START_MARGIN_MS)).toBe(true)
    expect(check(recorded + 11 * 60_000)).toBe(false)
    expect(check(null)).toBe(true)
    expect(check(recorded, false)).toBe(false)
    expect(RUN_START_MARGIN_MS).toBe(10 * 60_000)
  })

  test('the default check is the pid with the start time the folder name carries', () => {
    const checkout = makeGitFixture({ dir: join(scratch, 'dev', 'web') })
    checkout.commit('init', { 'w.txt': 'w' })
    const dead = runWorktree(checkout.dir, 'acme/web', '41.1700000000000')
    const asked: [number, number][] = []

    prune({
      alive: (pid, startedAt) => {
        asked.push([pid, startedAt])
        return false
      },
    })

    expect(asked).toEqual([[41, 1700000000000]])
    expect(existsSync(dead)).toBe(false)
  })
})

describe('a clone’s own dead run worktrees', () => {
  test('one whose folder is gone is reported with the clone, and a dry run removes neither', () => {
    const clone = makeClone('acme/api', 400)
    const dead = runWorktree(clone, 'acme/api')
    rmSync(dead, { recursive: true, force: true })

    const dry = prune({ dryRun: true })
    expect(dry.removed.map((e) => [e.kind, e.path])).toEqual([
      ['worktree', dead],
      ['clone', clone],
    ])
    expect(dry.freedBytes).toBe(dry.removed.reduce((n, e) => n + e.bytes, 0))
    expect(listed(clone)).toEqual([dead])
    expect(existsSync(clone)).toBe(true)

    const r = prune()
    expect(r.removed.map((e) => [e.kind, e.path])).toEqual([
      ['worktree', dead],
      ['clone', clone],
    ])
    expect(existsSync(clone)).toBe(false)
  })
})

describe('pr-update mirror prune on the command line (review round 1)', () => {
  async function run(...argv: string[]): Promise<{ code: number; out: string; err: string }> {
    const ctx = captureContext({ cwd: scratch, env })
    const code = await main(argv, ctx, { which: allToolsInstalled })
    return { code, out: ctx.io.out, err: ctx.io.err }
  }

  test('exits 1 and prints ! could not remove when something could not be removed', async () => {
    const broken = makeClone('acme/api', 400)
    rmSync(join(broken, 'HEAD'))

    const r = await run('mirror', 'prune', '--all-clones')

    expect(r.code).toBe(EXIT.error)
    expect(r.out).toMatch(new RegExp(`^! could not remove clone ${literal(broken)}: `, 'm'))
    expect(existsSync(broken)).toBe(true)
  })

  test('--all is refused, and the help names --all-clones', async () => {
    const all = await run('mirror', 'prune', '--all')
    expect(all.code).toBe(EXIT.usage)
    // cli-tool's own message: `--all` belongs to `--help`.
    expect(all.err).toContain('--all goes with --help: "--help --all"')

    const help = await run('mirror', 'prune', '--help')
    expect(help.out).toContain('(every clone with --all-clones)')
    expect(help.out).toContain('--all-clones')
    expect(help.out).toMatch(/Not --all, which\s+goes with --help\./)
  })

  test('the full help lists exit 1 once, and the description says when prune exits 1', async () => {
    const help = await run('mirror', 'prune', '--help', '--all')
    expect(help.code).toBe(EXIT.ok)
    expect(help.out.match(/^\s+1\s/gm)).toHaveLength(1)
    expect(help.out).toMatch(/It\s+exits\s+1\s+when\s+something\s+could\s+not\s+be\s+removed\./)
  })

  test('the JSON names allClones', async () => {
    const plain = JSON.parse((await run('mirror', 'prune', '--json')).out)
    expect(plain).toMatchObject({ allClones: false })
    expect(plain).not.toHaveProperty('all')
    const every = JSON.parse((await run('mirror', 'prune', '--all-clones', '--json')).out)
    expect(every).toMatchObject({ allClones: true, olderThanDays: null })
  })
})

// Windows has no mode bits for chmod to take away, and root reads any folder.
const unreadableTest = test.skipIf(process.platform === 'win32' || process.getuid?.() === 0)

describe('every removal passes one check, the same in a dry run (final review round 3)', () => {
  /** Run `act` while `path` has `mode`, and put its mode back. */
  function withMode(path: string, mode: number, act: () => void): void {
    const was = statSync(path).mode & 0o7777
    chmodSync(path, mode)
    try {
      act()
    } finally {
      chmodSync(path, was)
    }
  }

  /** A dry run and then a real one with the same options, which must report the same, sizes aside. */
  function bothModes(opts: Partial<PruneOptions>): ReturnType<typeof prune> {
    const [dry, real] = [true, false].map((dryRun) => {
      const r = prune({ ...opts, dryRun })
      const plain = (es: typeof r.removed) => es.map((e) => [e.kind, e.path, e.skip])
      return { r, said: [plain(r.removed), plain(r.skipped), plain(r.failed)] }
    })
    expect(dry!.said).toEqual(real!.said)
    return real!.r
  }

  const everything = { allClones: true, discardKept: true }

  /** The kept tree `path`, switched to a person's branch with an uncommitted file in it. */
  function takeOver(path: string): string {
    git(path, 'switch', '-q', '-c', 'my-work')
    const mine = join(path, 'mine.txt')
    writeFileSync(mine, 'mine\n')
    return mine
  }

  describe('a kept tree', () => {
    test('switched to another branch, with a new file, in a clones folder that was moved, goes once the clone is repaired (ownership contract)', () => {
      const before = join(scratch, 'clones-a')
      const after = join(scratch, 'clones-b')
      const clone = makeClone('acme/api', 400, before)
      const path = keptWorktree(clone, 'acme/api', 7)
      takeOver(path)
      renameSync(before, after)
      const moved = join(after, 'github.com', 'acme', 'api.git')

      const stays = bothModes({ ...everything, dir: after })
      expect(stays.removed).toEqual([])
      expect(stays.skipped).toEqual([
        expect.objectContaining({
          path: moved,
          skip: 'kept',
          reason: expect.stringContaining(`git -C ${moved} worktree repair ${path}`),
        }),
      ])

      git(moved, 'worktree', 'repair', path)
      const r = bothModes({ ...everything, dir: after })
      expect(r.failed).toEqual([])
      expect(r.removed.map((e) => [e.kind, e.path])).toEqual([
        ['kept', path],
        ['clone', moved],
      ])
      expect(existsSync(path)).toBe(false)
    })

    test('on its own branch, in a clones folder that was moved, goes once the clone is repaired, and not before', () => {
      const before = join(scratch, 'clones-a')
      const after = join(scratch, 'clones-b')
      const path = keptWorktree(makeClone('acme/api', 400, before), 'acme/api', 7)
      renameSync(before, after)
      const moved = join(after, 'github.com', 'acme', 'api.git')

      // Its `.git` file names the old place, so nothing says the tree is this clone's.
      const r = bothModes({ ...everything, dir: after })
      expect(r.removed).toEqual([])
      expect(r.skipped).toEqual([
        expect.objectContaining({
          path: moved,
          skip: 'kept',
          reason: expect.stringContaining(`git -C ${moved} worktree repair ${path}`),
        }),
      ])
      expect(existsSync(path)).toBe(true)

      git(moved, 'worktree', 'repair', path)
      expect(prune({ ...everything, dir: after }).removed.map((e) => e.path)).toEqual([path, moved])
      expect(existsSync(path)).toBe(false)
      expect(existsSync(`${path}.json`)).toBe(false)
    })

    test.each([
      ['with no record', false],
      ['whose record names an owner that is gone', true],
    ])(
      '%s is not removed through a copy of its clone, which lists it on the branch it was on when copied',
      (_, record) => {
        const clone = makeClone('acme/api', 400)
        const path = keptWorktree(clone, 'acme/api', 7)
        const file = `${path}.json`
        if (record) {
          const text = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
          writeFileSync(file, JSON.stringify({ ...text, gitDir: join(scratch, 'gone.git') }))
        } else unlinkSync(file)
        const copies = join(scratch, 'copies')
        cpSync(paths.repos, copies, { recursive: true })
        const mine = takeOver(path)

        const r = bothModes({ ...everything, dir: copies })

        expect(r.removed).toEqual([])
        expect(r.skipped.map((e) => [e.kind, e.skip])).toEqual([['clone', 'kept']])
        expect(readFileSync(mine, 'utf8')).toBe('mine\n')
        expect(git(path, 'branch', '--show-current')).toBe('my-work')
        expect(existsSync(join(copies, 'github.com', 'acme', 'api.git'))).toBe(true)
      },
    )

    unreadableTest(
      'whose record names a repository that cannot be reached goes through its clone all the same (ownership contract)',
      () => {
        const clone = makeClone('acme/api', 400)
        const path = keptWorktree(clone, 'acme/api', 7)
        const other = makeGitFixture({ dir: join(scratch, 'dev', 'other') })
        other.commit('init', { 'o.txt': 'o' })
        const file = `${path}.json`
        const record = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
        const gitDir = realpathSync.native(join(other.dir, '.git'))
        writeFileSync(file, JSON.stringify({ ...record, gitDir }))
        writeFileSync(join(path, 'new.txt'), 'x\n')

        withMode(dirname(other.dir), 0o000, () => {
          const r = bothModes(everything)
          expect(r.failed).toEqual([])
          expect(r.removed.map((e) => [e.kind, e.path])).toEqual([
            ['kept', path],
            ['clone', clone],
          ])
        })
        expect(existsSync(path)).toBe(false)
        expect(existsSync(file)).toBe(false)
        expect(existsSync(join(other.dir, 'o.txt'))).toBe(true)
      },
    )

    test('one git will not remove (locked) fails, its clone stays, and the prune exits 1 (ownership contract)', async () => {
      const clone = makeClone('acme/api', 400)
      const path = keptWorktree(clone, 'acme/api', 7)
      git(clone, 'worktree', 'lock', '--reason', 'held', path)

      const r = prune(everything)
      expect(r.removed).toEqual([])
      expect(r.failed).toEqual([
        expect.objectContaining({
          kind: 'kept',
          path,
          reason: expect.stringContaining(`${path} stays: git would not remove it`),
        }),
      ])
      expect(r.skipped.map((e) => [e.kind, e.path, e.skip])).toEqual([['clone', clone, 'kept']])

      const ctx = captureContext({ cwd: scratch, env })
      const argv = ['mirror', 'prune', '--all-clones', '--discard-kept']
      expect(await main(argv, ctx, { which: allToolsInstalled })).toBe(EXIT.error)
      expect(ctx.io.out).toContain(`! could not remove kept worktree ${path}`)
      expect(existsSync(path)).toBe(true)
      expect(existsSync(`${path}.json`)).toBe(true)
      expect(existsSync(clone)).toBe(true)
    })

    unreadableTest('whose record file cannot be read stays, and so does its clone', () => {
      const clone = makeClone('acme/api', 400)
      const path = keptWorktree(clone, 'acme/api', 7)
      withMode(`${path}.json`, 0o000, () => {
        const r = bothModes(everything)
        expect(r.removed).toEqual([])
        expect(r.failed).toEqual([
          expect.objectContaining({
            kind: 'clone',
            path: clone,
            reason: expect.stringContaining(`${path}.json`),
          }),
        ])
      })
      expect(existsSync(path)).toBe(true)
      expect(existsSync(clone)).toBe(true)
    })

    unreadableTest('that holds a folder that cannot be listed stays, and so does its clone', () => {
      const clone = makeClone('acme/api', 400)
      const path = keptWorktree(clone, 'acme/api', 7)
      const shut = join(path, 'shut')
      mkdirSync(shut)
      writeFileSync(join(shut, 'inside'), 'x')
      withMode(shut, 0o000, () => {
        const r = bothModes(everything)
        expect(r.removed).toEqual([])
        expect(r.failed.map((e) => [e.kind, e.path])).toEqual([['clone', clone]])
      })
      expect(listed(clone)).toEqual([path])
      expect(existsSync(join(path, 'a.txt'))).toBe(true)
    })

    test.each(['outside kept/', 'inside kept/'])(
      'that is a symbolic link to where a person moved it, %s, is not removed through',
      (where) => {
        const clone = makeClone('acme/api', 400)
        const path = keptWorktree(clone, 'acme/api', 7)
        const theirs = where === 'outside kept/' ? join(scratch, 'theirs') : `${path}-mine`
        renameSync(path, theirs)
        symlinkSync(theirs, path, 'junction')

        const r = bothModes(everything)

        expect(r.removed).toEqual([])
        expect(r.skipped.map((e) => [e.kind, e.path])).toEqual([['clone', clone]])
        expect(existsSync(join(theirs, 'a.txt'))).toBe(true)
        expect(existsSync(clone)).toBe(true)
      },
    )

    unreadableTest('folder `mirror list` cannot list is noted', () => {
      const path = keptWorktree(makeClone('acme/api', 400), 'acme/api', 7)
      const notes: string[] = []
      withMode(dirname(path), 0o300, () => {
        const l = listMirror({ env, notice: (n) => notes.push(n) })
        expect(l.clones).toEqual([expect.objectContaining({ kept: [] })])
      })
      expect(notes.join('\n')).toContain(`${dirname(path)} could not be read: EACCES`)
    })

    unreadableTest('record `mirror list` cannot read is noted', () => {
      const path = keptWorktree(makeClone('acme/api', 400), 'acme/api', 7)
      const notes: string[] = []
      withMode(`${path}.json`, 0o000, () => {
        listMirror({ env, notice: (n) => notes.push(n) })
      })
      expect(notes.join('\n')).toContain(`${path}.json could not be read: EACCES`)
    })
  })

  describe('a clone’s dead run worktree', () => {
    for (const link of [false, true]) {
      unreadableTest.each([
        ['owner folder', 'acme', 0o600],
        ['owner folder', 'acme', 0o000],
        ['owner folder', 'acme', 0o300],
        ['repository folder', join('acme', 'api'), 0o600],
        ['repository folder', join('acme', 'api'), 0o300],
        ['repository folder, which others can write to,', join('acme', 'api'), 0o333],
      ])(
        `under an unreadable %s stays, and so does the clone (%s, mode %o${link ? ', symlinked root' : ''})`,
        (_, below, mode) => {
          if (link) {
            mkdirSync(join(scratch, 'real'))
            symlinkSync(join(scratch, 'real'), join(scratch, 'linked'))
            env = { ...env, OSDLC_ROOT: join(scratch, 'linked') }
            paths = prUpdatePaths(osdlcDirs({ env }))
          }
          const clone = makeClone('acme/api', 400)
          const dead = runWorktree(clone, 'acme/api')
          const sibling = makeClone('other/web', 400)

          withMode(join(paths.worktrees, 'github.com', below), mode, () => {
            const r = bothModes({ allClones: true })
            expect(r.removed.map((e) => e.path)).toEqual([sibling])
            expect(r.failed.map((e) => e.kind)).toContain('worktree')
            expect([...r.failed, ...r.skipped].map((e) => e.path)).toContain(clone)
          })

          expect(existsSync(join(dead, 'a.txt'))).toBe(true)
          expect(listed(clone)).toHaveLength(1)
        },
      )
    }

    test('whose folder is gone, with the whole cache folder, goes with the clone under a symlinked root too', () => {
      mkdirSync(join(scratch, 'real'))
      symlinkSync(join(scratch, 'real'), join(scratch, 'linked'), 'junction')
      env = { ...env, OSDLC_ROOT: join(scratch, 'linked') }
      paths = prUpdatePaths(osdlcDirs({ env }))
      const clone = makeClone('acme/api', 400)
      runWorktree(clone, 'acme/api')
      rmSync(paths.worktrees, { recursive: true, force: true })

      const r = bothModes({ allClones: true })

      expect(r.removed.map((e) => e.kind)).toEqual(['worktree', 'clone'])
      expect(existsSync(clone)).toBe(false)
    })

    test('whose folder is gone, below one others can write to, stays with the clone', () => {
      if (process.platform === 'win32') return
      const clone = makeClone('acme/api', 400)
      const dead = runWorktree(clone, 'acme/api')
      rmSync(dead, { recursive: true, force: true })
      withMode(dirname(dead), 0o777, () => {
        const r = bothModes({ allClones: true })
        expect(r.removed).toEqual([])
        expect(r.skipped.map((e) => [e.kind, e.path, e.skip])).toEqual([['clone', clone, 'in-use']])
      })
      expect(listed(clone)).toEqual([dead])
    })

    unreadableTest(
      'holding a folder that cannot be listed is left whole, and so is the clone',
      () => {
        const clone = makeClone('acme/api', 400)
        const dead = runWorktree(clone, 'acme/api')
        const shut = join(dead, 'shut')
        mkdirSync(shut)
        writeFileSync(join(shut, 'inside'), 'x')
        withMode(shut, 0o000, () => {
          const r = bothModes({ allClones: true })
          expect(r.removed).toEqual([])
          expect(r.failed.map((e) => e.path)).toEqual([dead, clone])
        })
        expect(existsSync(join(dead, 'a.txt'))).toBe(true)
        expect(listed(clone)).toEqual([dead])
      },
    )

    unreadableTest.each(['a folder in it', 'the folder it is in'])(
      'that could be removed only in part, for %s that cannot be written to, is left whole, and so is the clone',
      (what) => {
        const clone = makeClone('acme/api', 400)
        const dead = runWorktree(clone, 'acme/api')
        const inside = join(dead, 'shut')
        mkdirSync(inside)
        writeFileSync(join(inside, 'inside'), 'x')
        withMode(what === 'a folder in it' ? inside : dirname(dead), 0o500, () => {
          const r = bothModes({ allClones: true })
          expect(r.removed).toEqual([])
          expect(r.failed.map((e) => e.path)).toEqual([dead, clone])
        })
        expect(existsSync(join(dead, 'a.txt'))).toBe(true)
        expect(listed(clone)).toEqual([dead])
      },
    )

    unreadableTest('whose clone’s lock cannot be taken is left', () => {
      const clone = makeClone('acme/api', 1)
      const dead = runWorktree(clone, 'acme/api')
      withMode(dirname(clone), 0o500, () => {
        const r = bothModes({})
        expect(r.removed).toEqual([])
        expect(r.failed.map((e) => e.path)).toEqual([dead])
      })
      expect(listed(clone)).toEqual([dead])
    })

    test('that a copy of the clone lists keeps the copy while another run holds the clone’s lock', () => {
      const clone = makeClone('acme/api', 400)
      const dead = runWorktree(clone, 'acme/api')
      const copies = join(scratch, 'copies')
      cpSync(paths.repos, copies, { recursive: true })
      holdLock(clone)

      const r = bothModes({ allClones: true, dir: copies })

      expect(r.removed).toEqual([])
      expect(r.skipped.map((e) => [e.path, e.skip])).toEqual([
        [dead, 'busy'],
        [join(copies, 'github.com', 'acme', 'api.git'), 'in-use'],
      ])
      expect(listed(clone)).toEqual([dead])
    })

    test.skipIf(process.platform === 'win32').each(['EISDIR', 'ELOOP'])(
      'whose record cannot be read (%s) is left for the clone’s lock, which another run holds',
      (code) => {
        const clone = makeClone('acme/api', 1)
        const dead = runWorktree(clone, 'acme/api')
        holdLock(clone)
        const commondir = join(clone, 'worktrees', DEAD, 'commondir')
        unlinkSync(commondir)
        if (code === 'EISDIR') mkdirSync(commondir)
        else symlinkSync(commondir, commondir)

        const r = bothModes({})

        expect(r.removed).toEqual([])
        expect(r.failed).toEqual([
          expect.objectContaining({
            kind: 'worktree',
            path: dead,
            reason: expect.stringContaining(code),
          }),
        ])
        expect(existsSync(dead)).toBe(true)
      },
    )
  })

  test('a dead run worktree whose owner git cannot read stays, and a sibling’s goes', () => {
    const broken = makeGitFixture({ dir: join(scratch, 'dev', 'api') })
    broken.commit('init', { 'a.txt': 'a' })
    const dead = runWorktree(broken.dir, 'acme/api')
    const web = makeGitFixture({ dir: join(scratch, 'dev', 'web') })
    web.commit('init', { 'w.txt': 'w' })
    const sibling = runWorktree(web.dir, 'other/web')
    rmSync(join(broken.dir, '.git', 'HEAD'))

    const r = bothModes({})

    expect(r.removed.map((e) => e.path)).toEqual([sibling])
    expect(r.failed.map((e) => e.path)).toEqual([dead])
    expect(existsSync(join(dead, 'a.txt'))).toBe(true)
  })

  describe('a clone', () => {
    unreadableTest.each([
      ['worktrees', 0o000],
      ['worktrees', 0o600],
      ['worktrees', 0o300],
      [join('worktrees', '7'), 0o000],
    ])(
      'stays while a worktree record of it cannot be read, which git leaves out of its list (%s, mode %o)',
      (below, mode) => {
        const clone = makeClone('acme/api', 400)
        const path = keptWorktree(clone, 'acme/api', 7)
        const sibling = makeClone('other/web', 400)
        git(path, 'commit', '-q', '--allow-empty', '-m', 'mine')
        const tip = git(path, 'rev-parse', 'HEAD')

        withMode(join(clone, below), mode, () => {
          for (const opts of [{}, everything]) {
            for (const dryRun of [true, false]) {
              const r = prune({ ...opts, dryRun })
              expect(r.removed.map((e) => e.path).filter((p) => p !== sibling)).toEqual([])
              expect(r.failed).toContainEqual(
                expect.objectContaining({
                  kind: 'clone',
                  path: clone,
                  reason: expect.stringContaining('EACCES'),
                }),
              )
            }
          }
        })
        expect(existsSync(sibling)).toBe(false)
        expect(git(path, 'rev-parse', 'HEAD')).toBe(tip)
      },
    )

    test('git cannot read stays, when git answers for a bare repository it is inside', () => {
      const outer = join(scratch, 'outer.git')
      git(scratch, 'clone', '-q', '--bare', source, outer)
      const dir = join(outer, 'clones')
      const clone = makeClone('acme/api', 400, dir)
      const path = keptWorktree(clone, 'acme/api', 7)
      rmSync(join(clone, 'HEAD'))

      const r = bothModes({ ...everything, dir })

      expect(r.removed).toEqual([])
      expect(r.failed.map((e) => [e.kind, e.path])).toEqual([['clone', clone]])
      expect(existsSync(path)).toBe(true)
      expect(existsSync(clone)).toBe(true)
    })

    unreadableTest('whose lock cannot be taken fails alone; a sibling is still pruned', () => {
      const clone = makeClone('acme/api', 400)
      const sibling = makeClone('other/web', 400)
      withMode(dirname(clone), 0o500, () => {
        const r = bothModes({ allClones: true })
        expect(r.removed.map((e) => e.path)).toEqual([sibling])
        expect(r.failed).toEqual([
          expect.objectContaining({
            kind: 'clone',
            path: clone,
            reason: expect.stringContaining('EACCES'),
          }),
        ])
      })
      expect(existsSync(clone)).toBe(true)
      expect(existsSync(sibling)).toBe(false)
    })

    test('whose lock another run holds is left in a dry run too, with its run worktree and leftover', () => {
      const clone = makeClone('acme/api', 400)
      const dead = runWorktree(clone, 'acme/api')
      const tmp = join(dirname(clone), '.tmp-api.git-2147483646')
      mkdirSync(tmp)
      age(tmp, 2 * 60 * 60 * 1000)
      const lock = holdLock(clone)
      const text = readFileSync(lock, 'utf8')

      const r = bothModes({ allClones: true })

      expect(r.removed).toEqual([])
      expect(r.skipped.map((e) => [e.path, e.skip])).toEqual([
        [dead, 'busy'],
        [tmp, 'busy'],
        [clone, 'busy'],
      ])
      expect(readFileSync(lock, 'utf8')).toBe(text)
    })

    test('whose lock a dead run left is not busy, in a dry run either', () => {
      const clone = makeClone('acme/api', 400)
      const lock = { tool: 'pr-update', holder: { pid: 2147483646 }, token: 'x' }
      writeFileSync(cloneLockPath(clone), JSON.stringify(lock))
      expect(bothModes({ allClones: true }).removed.map((e) => e.path)).toEqual([clone])
    })

    unreadableTest('whose lock file cannot be read fails alone', () => {
      const clone = makeClone('acme/api', 400)
      const sibling = makeClone('other/web', 400)
      const lock = holdLock(clone)
      withMode(lock, 0o000, () => {
        const r = bothModes({ allClones: true })
        expect(r.removed.map((e) => e.path)).toEqual([sibling])
        expect(r.failed.map((e) => e.path)).toEqual([clone])
      })
      expect(existsSync(clone)).toBe(true)
    })

    test.each(['a folder', 'a link to a lock a dead run left'])(
      'whose lock path holds %s fails alone',
      (what) => {
        const clone = makeClone('acme/api', 400)
        const sibling = makeClone('other/web', 400)
        const lock = cloneLockPath(clone)
        if (what === 'a folder') mkdirSync(lock)
        else {
          const other = join(scratch, 'other.lock')
          const text = { tool: 'pr-update', holder: { pid: 2147483646 }, token: 'x' }
          writeFileSync(other, JSON.stringify(text))
          symlinkSync(other, lock)
        }
        const r = bothModes({ allClones: true })
        expect(r.removed.map((e) => e.path)).toEqual([sibling])
        expect(r.failed.map((e) => [e.path, e.reason])).toEqual([
          [clone, expect.stringContaining('not a lock file')],
        ])
        expect(existsSync(clone)).toBe(true)
      },
    )

    unreadableTest('whose last-used stamp cannot be read is not taken for an old one', () => {
      const clone = makeClone('acme/api', 1)
      age(join(clone, CLONE_MARKER), 400 * DAY)
      withMode(join(clone, CLONE_STAMP), 0o000, () => {
        const r = bothModes({})
        expect(r.removed).toEqual([])
        expect(r.failed.map((e) => [e.kind, e.path])).toEqual([['clone', clone]])
        const notes: string[] = []
        expect(listMirror({ env, notice: (n) => notes.push(n) }).clones).toHaveLength(1)
        expect(notes.join('\n')).toContain(`${join(clone, CLONE_STAMP)} could not be read: EACCES`)
      })
      expect(existsSync(clone)).toBe(true)
    })

    unreadableTest.each(['file', 'folder'])(
      'is not aged by the default when the machine file cannot be read for its %s',
      (what) => {
        const clone = makeClone('acme/api', 400)
        const file = machineFile({ env }).path()
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, 'mirror_max_age_days: 0\n')
        withMode(what === 'file' ? file : dirname(file), 0o000, () => {
          const r = bothModes({ machine: machineFile({ env }) })
          expect(r.removed).toEqual([])
          expect(r.failed).toEqual([
            expect.objectContaining({
              kind: 'clone',
              path: paths.repos,
              reason: expect.stringContaining('mirror_max_age_days could not be read: EACCES'),
            }),
          ])
          expect(existsSync(clone)).toBe(true)
          // An age on the command line does not need the file.
          const asked = prune({ machine: machineFile({ env }), olderThanDays: 30 })
          expect(asked.removed.map((e) => e.path)).toEqual([clone])
        })
      },
    )

    unreadableTest(
      'with an earlier removal’s leftover at its name that cannot be read stays',
      () => {
        const clone = makeClone('acme/api', 400)
        const aside = join(dirname(clone), `.tmp-api.git-${process.pid}`)
        mkdirSync(aside)
        withMode(aside, 0o000, () => {
          const r = bothModes({ allClones: true })
          expect(r.removed).toEqual([])
          expect(r.failed.map((e) => e.path)).toEqual([clone])
        })
        expect(existsSync(clone)).toBe(true)
        expect(existsSync(aside)).toBe(true)
      },
    )
  })

  describe('a leftover', () => {
    const oldFolder = (path: string): string => {
      mkdirSync(path, { recursive: true })
      age(path, 2 * 60 * 60 * 1000)
      return path
    }

    unreadableTest('`.tmp-*` folder whose clone’s lock cannot be taken fails alone', () => {
      const clone = makeClone('acme/api', 1)
      const tmp = oldFolder(join(dirname(clone), '.tmp-api.git-2147483646'))
      const sibling = makeClone('other/web', 400)
      withMode(dirname(tmp), 0o500, () => {
        const r = bothModes({})
        expect(r.removed.map((e) => e.path)).toEqual([sibling])
        expect(r.failed.map((e) => [e.kind, e.path])).toEqual([['leftover', tmp]])
      })
      expect(existsSync(tmp)).toBe(true)
    })

    test('whose own check throws fails alone, a probe and a `.tmp-*` folder alike', () => {
      const clone = makeClone('acme/api', 1)
      const tmp = oldFolder(join(dirname(clone), '.tmp-api.git-2147483646'))
      const probe = oldFolder(join(paths.kept, 'github.com', 'acme', 'api', '.pr-update-probe-abc'))
      const sibling = oldFolder(join(paths.kept, 'github.com', 'acme', 'api', '.pr-update-probe-d'))
      const bad = new Set([statSync(tmp).mtimeMs, statSync(probe).mtimeMs])
      utimesSync(sibling, new Date(0), new Date(0))

      const r = bothModes({
        owned: (st) => {
          if (bad.has(st.mtimeMs)) throw new Error('the owner cannot be read')
          return true
        },
      })

      expect(r.removed.map((e) => e.path)).toEqual([sibling])
      expect(r.failed.map((e) => [e.path, e.reason])).toEqual([
        [probe, 'the owner cannot be read'],
        [tmp, 'the owner cannot be read'],
      ])
    })

    unreadableTest('that holds a folder that cannot be listed is left, in a dry run too', () => {
      const clone = makeClone('acme/api', 1)
      const tmp = join(dirname(clone), '.tmp-api.git-2147483646')
      const probe = join(paths.worktrees, 'github.com', 'acme', 'api', '.pr-update-probe-abc')
      for (const p of [tmp, probe]) mkdirSync(join(p, 'shut'), { recursive: true })
      for (const p of [tmp, probe]) age(p, 2 * 60 * 60 * 1000)
      withMode(join(tmp, 'shut'), 0o000, () =>
        withMode(join(probe, 'shut'), 0o000, () => {
          const r = bothModes({})
          expect(r.removed).toEqual([])
          expect(r.failed.map((e) => e.path)).toEqual([probe, tmp])
        }),
      )
    })
  })

  describe('what git does not list, or will not remove (ownership contract)', () => {
    /** A commit made in `tree`, which only the clone holds. */
    function commitIn(tree: string): string {
      git(tree, 'commit', '-q', '--allow-empty', '-m', 'mine')
      return git(tree, 'rev-parse', 'HEAD')
    }

    test.each(['empty', 'missing', 'gone with its folder'])(
      'a kept tree whose record in the clone is %s, so git does not list it, keeps the clone; --discard-kept removes both',
      (what) => {
        const clone = makeClone('acme/api', 400)
        const path = keptWorktree(clone, 'acme/api', 7)
        commitIn(path)
        const record = join(clone, 'worktrees', '7')
        if (what === 'empty') writeFileSync(join(record, 'gitdir'), '')
        else if (what === 'missing') unlinkSync(join(record, 'gitdir'))
        else rmSync(record, { recursive: true, force: true })

        const plain = bothModes({ allClones: true })
        expect(plain.removed).toEqual([])
        expect(plain.failed).toEqual([])
        expect(plain.skipped).toEqual([
          expect.objectContaining({
            kind: 'clone',
            path: clone,
            skip: 'kept',
            reason: expect.stringContaining(path),
          }),
        ])

        const r = bothModes(everything)
        expect(r.failed).toEqual([])
        expect(r.removed.map((e) => [e.kind, e.path])).toEqual([
          ['kept', path],
          ['clone', clone],
        ])
        expect(existsSync(path)).toBe(false)
        expect(existsSync(`${path}.json`)).toBe(false)
      },
    )

    test('a kept tree whose record names another clone goes through the clone its .git file names', () => {
      const clone = makeClone('acme/api', 400)
      const path = keptWorktree(clone, 'acme/api', 7)
      const copies = join(scratch, 'copies')
      cpSync(paths.repos, copies, { recursive: true })
      const copy = join(copies, 'github.com', 'acme', 'api.git')
      // The command the prune names for a tree whose .git does not name the clone.
      git(copy, 'worktree', 'repair', path)
      holdLock(clone)

      const r = bothModes({ ...everything, dir: copies })

      expect(r.failed).toEqual([])
      expect(r.removed.map((e) => [e.kind, e.path])).toEqual([
        ['kept', path],
        ['clone', copy],
      ])
      expect(existsSync(path)).toBe(false)
      expect(existsSync(clone)).toBe(true)
    })

    test.each([
      ['a reason', ['--reason', 'my build']],
      ['no reason', []],
    ])('a dead run worktree locked with %s fails, and its clone stays', (_, reason) => {
      const clone = makeClone('acme/api', 400)
      const dead = runWorktree(clone, 'acme/api')
      git(clone, 'worktree', 'lock', ...reason, dead)

      const r = prune({ allClones: true })

      expect(r.removed).toEqual([])
      expect(r.failed).toEqual([
        expect.objectContaining({
          kind: 'worktree',
          path: dead,
          reason: expect.stringContaining(`${dead} stays: git would not remove it`),
        }),
      ])
      expect(r.skipped.map((e) => [e.kind, e.path, e.skip])).toEqual([['clone', clone, 'in-use']])
      expect(listed(clone)).toEqual([dead])
      // A dry run cannot know git will refuse.
      expect(prune({ allClones: true, dryRun: true }).removed.map((e) => e.path)).toEqual([
        dead,
        clone,
      ])
    })

    test('a dead run worktree locked with its folder gone fails the clone, which stays', () => {
      const clone = makeClone('acme/api', 400)
      const dead = runWorktree(clone, 'acme/api')
      git(clone, 'worktree', 'lock', '--reason', 'on my usb drive', dead)
      rmSync(dead, { recursive: true, force: true })

      const r = prune({ allClones: true })

      expect(r.removed).toEqual([])
      expect(r.failed).toEqual([
        expect.objectContaining({
          kind: 'clone',
          path: clone,
          reason: expect.stringContaining(`${dead} stays: git would not remove it`),
        }),
      ])
      expect(listed(clone)).toEqual([dead])
      expect(existsSync(clone)).toBe(true)
    })

    test('a dead run worktree of a located checkout that is locked fails, record and all', () => {
      const checkout = makeGitFixture({ dir: join(scratch, 'dev', 'web') })
      checkout.commit('init', { 'w.txt': 'w' })
      const dead = runWorktree(checkout.dir, 'acme/web')
      git(checkout.dir, 'worktree', 'lock', '--reason', 'my build', dead)

      const r = prune({})

      expect(r.removed).toEqual([])
      expect(r.failed.map((e) => [e.kind, e.path])).toEqual([['worktree', dead]])
      expect(listed(checkout.dir)).toEqual([dead])
    })

    test.each(['with', 'without'])(
      'a kept tree that is locked fails, and its clone stays, %s a record',
      (record) => {
        const clone = makeClone('acme/api', 400)
        const path = keptWorktree(clone, 'acme/api', 7)
        if (record === 'without') unlinkSync(`${path}.json`)
        git(clone, 'worktree', 'lock', '--reason', 'held', path)

        const r = prune(everything)

        expect(r.removed).toEqual([])
        expect(r.failed.map((e) => [e.kind, e.path])).toEqual([['kept', path]])
        expect(r.skipped.map((e) => [e.kind, e.path, e.skip])).toEqual([['clone', clone, 'kept']])
        expect(listed(clone)).toEqual([path])
      },
    )

    test('a dead run worktree git itself left locked (a killed `git worktree add`) fails too: pr-update reads no locks', () => {
      const clone = makeClone('acme/api', 400)
      const dead = runWorktree(clone, 'acme/api')
      git(clone, 'worktree', 'lock', '--reason', 'initializing', dead)

      const r = prune({ allClones: true })

      expect(r.removed).toEqual([])
      expect(r.failed.map((e) => [e.kind, e.path])).toEqual([['worktree', dead]])
      expect(existsSync(dead)).toBe(true)
    })

    test('a clone whose lock holds a token that is not a string is busy, as a claim finds it, in a dry run too', () => {
      const clone = makeClone('acme/api', 400)
      const lock = { tool: 'pr-update', holder: { pid: 2147483646 }, token: 123 }
      writeFileSync(cloneLockPath(clone), JSON.stringify(lock))

      const r = bothModes({ allClones: true })

      expect(r.removed).toEqual([])
      expect(r.skipped.map((e) => [e.path, e.skip])).toEqual([[clone, 'busy']])
      expect(existsSync(clone)).toBe(true)
    })

    unreadableTest(
      'a clone holding a folder that cannot be listed stays at its own path, in a dry run too',
      () => {
        const clone = makeClone('acme/api', 400)
        const shut = join(clone, 'shut')
        mkdirSync(shut)
        writeFileSync(join(shut, 'inside'), 'x')
        withMode(shut, 0o000, () => {
          const r = bothModes({ allClones: true })
          expect(r.removed).toEqual([])
          expect(r.failed.map((e) => [e.kind, e.path])).toEqual([['clone', clone]])
        })
        expect(existsSync(join(clone, CLONE_MARKER))).toBe(true)
        expect(readdirSync(dirname(clone))).toEqual(['api.git'])
      },
    )

    test('a clone’s dead run worktree whose folder is gone, with the folders above it, goes with the clone', () => {
      const clone = makeClone('acme/api', 400)
      runWorktree(clone, 'acme/api')
      rmSync(join(paths.worktrees, 'github.com'), { recursive: true, force: true })

      const r = bothModes({ allClones: true })

      expect(r.removed.map((e) => e.kind)).toEqual(['worktree', 'clone'])
      expect(existsSync(clone)).toBe(false)
    })

    unreadableTest(
      'a dead run worktree goes when only a folder above the one it is in cannot be written to',
      () => {
        const checkout = makeGitFixture({ dir: join(scratch, 'dev', 'web') })
        checkout.commit('init', { 'w.txt': 'w' })
        const dead = runWorktree(checkout.dir, 'acme/web')
        withMode(join(paths.worktrees, 'github.com', 'acme'), 0o500, () => {
          expect(bothModes({}).removed.map((e) => e.path)).toEqual([dead])
        })
        expect(existsSync(dead)).toBe(false)
      },
    )

    unreadableTest(
      'a dead run worktree holding an empty folder that cannot be written to goes',
      () => {
        const checkout = makeGitFixture({ dir: join(scratch, 'dev', 'web') })
        checkout.commit('init', { 'w.txt': 'w' })
        const dead = runWorktree(checkout.dir, 'acme/web')
        const empty = join(dead, 'empty')
        mkdirSync(empty)
        chmodSync(empty, 0o500)

        expect(bothModes({}).removed.map((e) => e.path)).toEqual([dead])
        expect(existsSync(dead)).toBe(false)
      },
    )

    unreadableTest(
      'a dead run worktree holding a folder that cannot be listed names the fix',
      () => {
        const checkout = makeGitFixture({ dir: join(scratch, 'dev', 'web') })
        checkout.commit('init', { 'w.txt': 'w' })
        const dead = runWorktree(checkout.dir, 'acme/web')
        const shut = join(dead, 'shut')
        mkdirSync(shut)
        withMode(shut, 0o000, () => {
          expect(bothModes({}).failed).toEqual([
            expect.objectContaining({
              path: dead,
              reason: expect.stringContaining(`chmod -R u+rwX ${dead}`),
            }),
          ])
        })
      },
    )

    test('a kept tree whose folder is gone goes with its clone under --discard-kept', () => {
      const clone = makeClone('acme/api', 400)
      const path = keptWorktree(clone, 'acme/api', 7)
      rmSync(path, { recursive: true, force: true })

      const r = bothModes(everything)

      expect(r.removed.map((e) => [e.kind, e.path])).toEqual([
        ['kept', path],
        ['clone', clone],
      ])
      expect(existsSync(clone)).toBe(false)
    })

    unreadableTest(
      'a machine file that cannot be read fails nothing when there is no clone directory',
      () => {
        const file = machineFile({ env }).path()
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, 'mirror_max_age_days: 0\n')
        withMode(file, 0o000, () => {
          expect(bothModes({ machine: machineFile({ env }) }).failed).toEqual([])
        })
      },
    )

    test.each([
      ['a YAML error', 'mirror_max_age_days: [\n'],
      ['a value the schema refuses', 'mirror_max_age_days: -5\n'],
    ])('a clone is not aged by the default when the machine file holds %s', (_, text) => {
      const clone = makeClone('acme/api', 400)
      const file = machineFile({ env }).path()
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, text)

      const r = bothModes({ machine: machineFile({ env }) })

      expect(r.removed).toEqual([])
      expect(r.failed).toEqual([
        expect.objectContaining({
          kind: 'clone',
          path: paths.repos,
          reason: expect.stringContaining('mirror_max_age_days could not be read'),
        }),
      ])
      expect(existsSync(clone)).toBe(true)
      // An age on the command line does not need the file.
      const asked = prune({ machine: machineFile({ env }), olderThanDays: 30 })
      expect(asked.removed.map((e) => e.path)).toEqual([clone])
    })
  })
})
