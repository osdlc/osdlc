/**
 * `runUpdate` on a `--repo` target found in a checkout of its own, with the standalone ports:
 * where its worktrees, kept worktrees, record and lease go, and when its PRs are skipped. Real
 * git, a fake `gh`, and every pr-update directory under a temporary root.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, normalize, sep } from 'node:path'

import { EXIT, captureContext } from '@osdlc/cli-tool'
import { spawnRunner, type CommandResult, type CommandRunner } from '@osdlc/command-seam'
import { osdlcDirs } from '@osdlc/ecosystem'
import { Git } from '@osdlc/typed-git'
import { IDENTITY, makeBareAndWorker } from '@osdlc/typed-git/testing'

import { main } from '../src/cli.ts'
import { prUpdateStandaloneSchema, type PrUpdateStandaloneConfig } from '../src/config.ts'
import { touchedCache } from '../src/commands.ts'
import { standalonePorts } from '../src/defaults.ts'
import { prUpdatePaths, type PrUpdatePaths } from '../src/machine.ts'
import type { AttemptStore, FoundCheckout, Ports, TargetCheckout } from '../src/ports.ts'
import { targetTrustGate } from '../src/trust.ts'
import {
  output,
  renderUpdateText,
  runUpdate,
  type UpdateArgs,
  type UpdateEnv,
} from '../src/update.ts'
import {
  checkoutKept,
  findKept,
  keepWorktree,
  keptIsTouched,
  listKept,
  type KeptPlace,
} from '../src/update/kept.ts'
import { refBranchLease } from '../src/update/lease.ts'
import { refAttemptStore } from '../src/update/ref-attempts.ts'
import { allToolsInstalled, isolatedEnv, worktreePaths } from './support.ts'

const ARGS: UpdateArgs = {
  repo: ['acme/api'],
  noFetch: true,
  noDrafts: false,
  limit: 100,
  remote: 'origin',
  apply: true,
  pr: [],
  trust: false,
  retryFailed: false,
  restack: false,
}

const real = spawnRunner('git')
/** git with the fixtures' identity. */
const git: CommandRunner = {
  run: (argv, opts) => real.run(argv, { ...opts, env: { ...IDENTITY, ...opts?.env } }),
}

/** A git that fails every `worktree move` the way git does across filesystems. */
const crossDevice: CommandRunner = {
  run: (argv, opts) =>
    argv[0] === 'worktree' && argv[1] === 'move'
      ? {
          exitCode: 128,
          stdout: '',
          stderr: `fatal: failed to move '${argv[2]}' to '${argv[3]}': Invalid cross-device link\n`,
        }
      : git.run(argv, opts),
}

let scratch: string
/** acme/api: a bare origin and a checkout of it, the checkout `locate` finds. */
let api: ReturnType<typeof makeBareAndWorker>
/** The project root: a checkout whose remote names no repository, so it is not a target. */
let root: ReturnType<typeof makeBareAndWorker>
let env: Record<string, string>
let paths: PrUpdatePaths
let verifyOk: boolean
/** The directory each verify ran in. */
let verifiedIn: string[]
/** The repositories `resolveVerifyVerbs` was asked about. */
let verbsAskedFor: string[]

/** acme/web, a second located target, for the runs that need one. */
let web: ReturnType<typeof makeBareAndWorker> | undefined
/** Whether the project root is acme/root, with a PR of its own. */
let rootIsTarget: boolean
/** Whether acme/api also has PR 2, `topic2` into `main`. */
let apiPr2: boolean

/** PR 1 of `repo`, `topic` into `main`, as `gh` lists it, after a fetch of its checkout. */
function prOf(fx: ReturnType<typeof makeBareAndWorker>, repo: string, fetch = true) {
  if (fetch) fx.worker.git.fetch('origin')
  return {
    number: 1,
    state: 'OPEN',
    title: 'topic',
    url: `https://github.com/${repo}/pull/1`,
    baseRefName: 'main',
    headRefName: 'topic',
    headRefOid: fx.worker.git.resolveRef('origin/topic'),
  }
}

const gh: CommandRunner = {
  run: (argv): CommandResult => {
    const prs = argv.includes('acme/api')
      ? [
          prOf(api, 'acme/api'),
          ...(apiPr2
            ? [
                {
                  ...prOf(api, 'acme/api', false),
                  number: 2,
                  url: 'https://github.com/acme/api/pull/2',
                  headRefName: 'topic2',
                  headRefOid: api.worker.git.resolveRef('origin/topic2'),
                },
              ]
            : []),
        ]
      : argv.includes('acme/web')
        ? web === undefined
          ? []
          : [prOf(web, 'acme/web')]
        : rootIsTarget
          ? [prOf(root, 'acme/root', false)]
          : []
    return { exitCode: 0, stdout: JSON.stringify(prs), stderr: '' }
  },
}

/** A bare origin and a checkout of it, whose `topic` is one commit behind `main`. */
function behindRepo(name: string): ReturnType<typeof makeBareAndWorker> {
  const fx = makeBareAndWorker({ initialBranch: 'main', parent: join(scratch, name) })
  fx.worker.commit('initial', { 'shared.txt': 'base\n' })
  fx.worker.git.push('origin', 'main')
  fx.worker.git.checkout('main', { branch: 'topic' })
  fx.worker.commit('topic work', { 'topic.txt': 'topic\n' })
  fx.worker.git.push('origin', 'topic')
  fx.worker.git.checkout('main')
  fx.worker.commit('main moves', { 'main.txt': 'main\n' })
  fx.worker.git.push('origin', 'main')
  return fx
}

/** A `locate` that finds acme/api and acme/web in their checkouts. */
const locateBoth: Ports['locate'] = (repo) =>
  repo === 'acme/api' || repo === 'acme/web'
    ? {
        path: repo === 'acme/web' ? web!.worker.dir : api.worker.dir,
        source: 'located',
        remote: 'origin',
      }
    : null

interface Run {
  args?: Partial<UpdateArgs>
  cfg?: Record<string, unknown>
  /** The checkout `locate` returns; the acme/api checkout by default. */
  checkout?: string
  source?: FoundCheckout['source']
  runner?: CommandRunner
  targetTrust?: UpdateEnv['targetTrust']
  /** Ports put over the standalone ones and the test's own. */
  ports?: Partial<Ports>
  /** The `gh` the run lists PRs through; the fake above by default. */
  gh?: CommandRunner
}

async function update(run: Run = {}) {
  // A kept worktree, not a recorded failure, is what skips a PR in most of these runs.
  const cfg = prUpdateStandaloneSchema.parse({
    verify: 'check',
    max_failed_attempts: 0,
    ...run.cfg,
  }) as PrUpdateStandaloneConfig
  const runner = run.runner ?? git
  const ports: Ports = {
    ...standalonePorts(cfg, root.worker.dir, 'origin', () => {}, { git: runner, env }),
    locate: () => ({
      path: run.checkout ?? api.worker.dir,
      source: run.source ?? 'located',
      remote: 'origin',
    }),
    runVerb: (_verb, cwd) => {
      verifiedIn.push(cwd)
      return verifyOk
        ? { exitCode: 0, stdout: '', stderr: '' }
        : { exitCode: 3, stdout: '', stderr: 'FAIL widget\n' }
    },
    resolveVerifyVerbs: async ({ repo }) => {
      verbsAskedFor.push(repo)
      return ['check']
    },
    ...run.ports,
  }
  return runUpdate(
    { ...ARGS, ...run.args },
    {
      projectRoot: root.worker.dir,
      dryRun: false,
      git: runner,
      gh: run.gh ?? gh,
      cfg,
      ports,
      ...(run.targetTrust === undefined ? {} : { targetTrust: run.targetTrust }),
    },
  )
}

/** Run git in `dir`, and fail the test when it fails. */
function sh(dir: string, ...argv: string[]): string {
  const res = git.run(argv, { cwd: dir })
  if (res.exitCode !== 0) throw new Error(`git ${argv.join(' ')}: ${res.stderr}`)
  return res.stdout.trim()
}

const worktreesOf = (dir: string): string[] =>
  new Git(dir, { runner: git }).worktrees().map((w) => w.path)
const keptDir = () => join(paths.kept, 'github.com', 'acme', 'api')
const ownGitDir = () => realpathSync.native(join(api.worker.dir, '.git'))

beforeEach(() => {
  scratch = realpathSync.native(mkdtempSync(join(tmpdir(), 'pr-update-target-')))
  web = undefined
  rootIsTarget = false
  apiPr2 = false
  api = behindRepo('api')
  root = makeBareAndWorker({ initialBranch: 'main', parent: join(scratch, 'root') })
  root.worker.commit('init', { 'r.txt': 'r\n' })
  root.worker.git.push('origin', 'main')
  env = isolatedEnv(join(scratch, 'env'))
  paths = prUpdatePaths(osdlcDirs({ env }))
  verifyOk = true
  verifiedIn = []
  verbsAskedFor = []
})
afterEach(() => rmSync(scratch, { recursive: true, force: true }))

describe('a located target', () => {
  test('is updated from a run worktree under the cache, which is removed after', async () => {
    const out = await update()
    expect(out.results.map((r) => [r.repo, r.number, r.status, r.pushed])).toEqual([
      ['acme/api', 1, 'updated', true],
    ])
    const runs = join(paths.worktrees, 'github.com', 'acme', 'api')
    expect(verifiedIn).toHaveLength(1)
    expect(verifiedIn[0]!.startsWith(`${runs}${sep}`)).toBe(true)
    expect(basename(verifiedIn[0]!)).toMatch(new RegExp(`^${process.pid}\\.\\d+$`))
    expect(readdirSync(runs)).toEqual([])
    expect(worktreesOf(api.worker.dir)).toEqual([realpathSync.native(api.worker.dir)])
    expect(existsSync(join(api.worker.dir, '.pr-update'))).toBe(false)
    expect(existsSync(join(root.worker.dir, '.pr-update'))).toBe(false)
  })

  test('records a failure in the state store, one file per head and base under host/owner/name', async () => {
    verifyOk = false
    const counted = { cfg: { max_failed_attempts: 1 } }
    const out = await update(counted)
    expect(out.results.map((r) => r.status)).toEqual(['failed'])
    const dir = join(paths.attempts, 'github.com', 'acme', 'api')
    const files = readdirSync(dir)
    expect(files).toHaveLength(1)
    expect(JSON.parse(readFileSync(join(dir, files[0]!), 'utf8')).entries).toMatchObject([
      { repo: 'acme/api', head: 'topic', base: 'main', failures: 1 },
    ])
    expect(existsSync(join(root.worker.dir, '.pr-update'))).toBe(false)

    const again = await update(counted)
    expect(again.results).toEqual([])
    expect(again.skipped.map((s) => s.reason)).toEqual([
      'failed 1 time(s) at this head and base; waiting for either to move',
    ])
    // An update clears it.
    verifyOk = true
    expect((await update({ ...counted, args: { retryFailed: true } })).results[0]!.status).toBe(
      'updated',
    )
    expect(readdirSync(dir)).toEqual([])
  })

  test("with git-ref, its record and lease are refs on its own origin, not the project root's", async () => {
    verifyOk = false
    const gitRef = { attempts: { store: 'git-ref' } }
    const out = await update({ cfg: gitRef })
    expect(out.results.map((r) => r.status)).toEqual(['failed'])
    expect(sh(api.bare.dir, 'for-each-ref', '--format=%(refname)', 'refs/pr-update/')).toMatch(
      /^refs\/pr-update\/attempts\//,
    )
    expect(sh(root.bare.dir, 'for-each-ref', 'refs/pr-update/')).toBe('')
    expect(existsSync(paths.attempts)).toBe(false)

    // Another run holds the branch's lease on the target's origin: this run leaves the PR.
    const held = refBranchLease({
      remote: 'origin',
      cwd: api.worker.dir,
      ttlMs: 600_000,
      holder: 'elsewhere',
    })
    expect(held.acquire({ head: 'topic', pr: 1 }).ok).toBe(true)
    const busy = await update({ cfg: gitRef, args: { retryFailed: true } })
    expect(busy.results).toEqual([])
    expect(busy.skipped.map((s) => s.reason)).toEqual([
      'another pr-update run is updating this branch (elsewhere)',
    ])
  })

  test('--branch leaves it alone: it names a branch of the project root', async () => {
    const out = await update({ args: { branch: 'topic' } })
    expect(out.results).toEqual([])
    expect(out.skipped).toEqual([
      {
        repo: 'acme/api',
        number: 1,
        head: 'topic',
        reason: `--branch names a branch of the project root; not updated in ${api.worker.dir}`,
      },
    ])
  })
})

describe('the trust gate for a located target', () => {
  test('skips it as untrusted, before its verify list is asked for, and the run goes on', async () => {
    const out = await update({
      targetTrust: async (t) => (t.path === api.worker.dir ? 'untrusted: not this one' : null),
    })
    expect(out.results).toEqual([])
    expect(out.skipped).toEqual([
      { repo: 'acme/api', number: 1, head: 'topic', reason: 'untrusted: not this one' },
    ])
    expect(verbsAskedFor).toEqual([])
    expect(verifiedIn).toEqual([])
  })

  test('is asked about the target, its host without the port', async () => {
    const asked: TargetCheckout[] = []
    await update({
      args: { repo: ['ghe.example:8443/acme/api'] },
      targetTrust: async (t) => {
        asked.push(t)
        return null
      },
    })
    expect(asked).toEqual([
      {
        host: 'ghe.example',
        owner: 'acme',
        name: 'api',
        path: api.worker.dir,
        source: 'located',
        remote: 'origin',
      },
    ])
  })

  test('--trust, or a grant on its path, lets it run', async () => {
    const gate = (trust: boolean) =>
      targetTrustGate({ cfg: prUpdateStandaloneSchema.parse({ verify: 'check' }), trust, env })
    const refused = await update({ targetTrust: gate(false) })
    expect(refused.skipped[0]!.reason).toMatch(/^untrusted: /)
    expect((await update({ targetTrust: gate(true) })).results[0]!.status).toBe('updated')

    const ctx = captureContext({ cwd: api.worker.dir, env })
    expect(await main(['trust'], ctx, { which: allToolsInstalled })).toBe(EXIT.ok)
    api.worker.commit('main again', { 'n.txt': 'n\n' })
    api.worker.git.push('origin', 'main')
    expect((await update({ targetTrust: gate(false) })).results[0]!.status).toBe('updated')
  })

  test('a clone is trusted by host/owner/name: --repo host:3000/x/y by `pr-update trust host/x/y`', async () => {
    const gate = targetTrustGate({
      cfg: prUpdateStandaloneSchema.parse({ verify: 'check' }),
      trust: false,
      env,
    })
    const clone = {
      args: { repo: ['host:3000/acme/api'] },
      source: 'clone' as const,
      targetTrust: gate,
    }
    expect((await update(clone)).skipped[0]!.reason).toMatch(/^untrusted: host\/acme\/api /)

    const ctx = captureContext({ cwd: root.worker.dir, env })
    expect(await main(['trust', 'host:3000/acme/api'], ctx, { which: allToolsInstalled })).toBe(
      EXIT.usage,
    )
    expect(await main(['trust', 'host/acme/api'], ctx, { which: allToolsInstalled })).toBe(EXIT.ok)
    expect((await update(clone)).results[0]!.status).toBe('updated')
  })
})

describe('a located target kept worktree', () => {
  test('is kept in the state directory, recording the git directory that owns it', async () => {
    verifyOk = false
    const out = await update({ args: { keepFailed: true } })
    const kept = join(keptDir(), '1')
    expect(out.results[0]!.keptWorktree).toBe(kept)
    const record = JSON.parse(readFileSync(`${kept}.json`, 'utf8'))
    expect(record).toMatchObject({ repo: 'acme/api', number: 1, path: kept, gitDir: ownGitDir() })
    expect(worktreesOf(api.worker.dir)).toContain(realpathSync.native(kept))
    expect(sh(kept, 'branch', '--show-current')).toBe('pr-update/failed-acme-api-1')
    expect(readFileSync(join(kept, '.pr-update-verify.log'), 'utf8')).toContain('FAIL widget')
    expect(existsSync(join(api.worker.dir, '.pr-update'))).toBe(false)

    // A later run skips it while the PR has not moved.
    const later = await update()
    expect(later.skipped.map((s) => s.reason)).toEqual([`failed worktree kept at ${kept}`])
  })

  test('another checkout serving the run skips the PR as kept elsewhere, and leaves it', async () => {
    verifyOk = false
    await update({ args: { keepFailed: true } })
    const kept = join(keptDir(), '1')
    const other = join(scratch, 'other')
    sh(scratch, 'clone', '-q', api.bare.dir, other)

    for (const args of [{}, { retryFailed: true }]) {
      const out = await update({ checkout: other, args })
      expect(out.results).toEqual([])
      expect(out.skipped.map((s) => s.reason)).toEqual([
        `kept elsewhere: ${kept} is a worktree of ${ownGitDir()}`,
      ])
    }
    expect(existsSync(kept)).toBe(true)
    expect(worktreesOf(api.worker.dir)).toContain(realpathSync.native(kept))
  })

  test('a PR that moved discards it through the git directory that owns it', async () => {
    verifyOk = false
    await update({ args: { keepFailed: true } })
    const kept = join(keptDir(), '1')
    api.worker.commit('main again', { 'n.txt': 'n\n' })
    api.worker.git.push('origin', 'main')
    // Cloned after main moved, so it measures the PR's new base.
    const other = join(scratch, 'other')
    sh(scratch, 'clone', '-q', api.bare.dir, other)

    verifyOk = true
    const out = await update({ checkout: other, args: { keepFailed: true } })
    expect(out.discarded).toEqual([kept])
    expect(out.results.map((r) => r.status)).toEqual(['updated'])
    expect(existsSync(kept)).toBe(false)
    expect(worktreesOf(api.worker.dir)).toEqual([realpathSync.native(api.worker.dir)])
    expect(sh(api.worker.dir, 'branch', '--list', 'pr-update/*')).toBe('')
  })

  test('--discard-kept removes it through its owner; with the owner gone, only the tree and record', async () => {
    verifyOk = false
    await update({ args: { keepFailed: true } })
    const kept = join(keptDir(), '1')
    const other = join(scratch, 'other')
    sh(scratch, 'clone', '-q', api.bare.dir, other)
    const out = await update({ checkout: other, args: { discardKept: true } })
    expect(out.discarded).toEqual([kept])
    expect(existsSync(kept)).toBe(false)
    expect(existsSync(`${kept}.json`)).toBe(false)
    expect(worktreesOf(api.worker.dir)).toEqual([realpathSync.native(api.worker.dir)])

    await update({ args: { keepFailed: true, retryFailed: true } })
    const record = JSON.parse(readFileSync(`${kept}.json`, 'utf8'))
    writeFileSync(`${kept}.json`, JSON.stringify({ ...record, gitDir: join(scratch, 'gone') }))
    expect((await update({ checkout: other, args: { discardKept: true } })).discarded).toEqual([
      kept,
    ])
    expect(existsSync(kept)).toBe(false)
    expect(existsSync(`${kept}.json`)).toBe(false)
  })

  test('across filesystems is made with worktree add at the same commit, with the log', async () => {
    verifyOk = false
    const out = await update({ args: { keepFailed: true }, runner: crossDevice })
    const kept = join(keptDir(), '1')
    expect(out.results[0]).toMatchObject({ status: 'failed', keptWorktree: kept })
    expect(out.results[0]!.keepError).toBeUndefined()
    expect(worktreesOf(api.worker.dir)).toEqual([
      realpathSync.native(api.worker.dir),
      realpathSync.native(kept),
    ])
    expect(sh(kept, 'branch', '--show-current')).toBe('pr-update/failed-acme-api-1')
    // The built result: the topic work on top of main.
    expect(existsSync(join(kept, 'topic.txt'))).toBe(true)
    expect(existsSync(join(kept, 'main.txt'))).toBe(true)
    expect(readFileSync(join(kept, '.pr-update-verify.log'), 'utf8')).toContain('FAIL widget')
    expect(readdirSync(join(paths.worktrees, 'github.com', 'acme', 'api'))).toEqual([])
  })
})

describe('keepWorktree across filesystems', () => {
  /** A run worktree of the acme/api checkout at `topic`, with an untracked build output. */
  function runWorktree(): { run: string; place: KeptPlace; tip: string } {
    const run = join(scratch, 'cache', `${process.pid}.1`)
    sh(api.worker.dir, 'worktree', 'add', '-q', '--detach', run, 'origin/topic')
    writeFileSync(join(run, 'build.out'), 'built\n')
    const place = { dir: join(scratch, 'state', 'kept'), naming: 'repository' as const }
    return { run, place, tip: sh(run, 'rev-parse', 'HEAD') }
  }
  const target = {
    repo: 'acme/api',
    number: 1,
    head: 'topic',
    base: 'main',
    headOid: null,
    baseOid: null,
  }

  test('keeps the commit and the log, drops untracked output, and removes the run worktree', () => {
    const { run, place, tip } = runWorktree()
    const record = keepWorktree(
      new Git(api.worker.dir, { runner: crossDevice }),
      place,
      run,
      target,
      'log\n',
    )
    expect(record.path).toBe(join(place.dir, '1'))
    expect(sh(record.path, 'rev-parse', 'HEAD')).toBe(tip)
    expect(readFileSync(join(record.path, '.pr-update-verify.log'), 'utf8')).toBe('log\n')
    expect(existsSync(join(record.path, 'build.out'))).toBe(false)
    expect(existsSync(run)).toBe(false)
    expect(worktreesOf(api.worker.dir)).not.toContain(run)
  })

  test('a later step that fails removes the added tree and its branch, and leaves the run worktree', () => {
    const { run, place } = runWorktree()
    // The record cannot be written: a directory is in its place.
    mkdirSync(join(place.dir, '1.json'), { recursive: true })
    expect(() =>
      keepWorktree(new Git(api.worker.dir, { runner: crossDevice }), place, run, target, 'log\n'),
    ).toThrow()
    expect(existsSync(join(place.dir, '1'))).toBe(false)
    expect(sh(api.worker.dir, 'branch', '--list', 'pr-update/*')).toBe('')
    expect(existsSync(join(run, 'build.out'))).toBe(true)
    expect(worktreesOf(api.worker.dir)).toEqual([realpathSync.native(api.worker.dir), run])
  })

  test('a move that fails for another reason is not retried another way', () => {
    const { run } = runWorktree()
    const refusing: CommandRunner = {
      run: (argv, opts) =>
        argv[0] === 'worktree' && argv[1] === 'move'
          ? {
              exitCode: 128,
              stdout: '',
              stderr: 'fatal: working trees containing submodules cannot be moved\n',
            }
          : git.run(argv, opts),
    }
    const place = checkoutKept(api.worker.dir)
    expect(() =>
      keepWorktree(new Git(api.worker.dir, { runner: refusing }), place, run, target, undefined),
    ).toThrow(/submodules/)
    expect(existsSync(join(place.dir, 'acme-api-1'))).toBe(false)
    expect(existsSync(run)).toBe(true)
  })
})

describe('git in a located checkout', () => {
  test('runs no hook, even one the PR commits under a relative core.hooksPath', async () => {
    const markers = join(scratch, 'markers')
    mkdirSync(markers)
    const hooks = ['post-checkout', 'pre-merge-commit', 'pre-push']
    // The PR's head commits the hooks; the checkout then points core.hooksPath at `.husky`.
    sh(api.worker.dir, 'checkout', '-q', 'topic')
    mkdirSync(join(api.worker.dir, '.husky'))
    for (const hook of hooks) {
      const file = join(api.worker.dir, '.husky', hook)
      // A redirection, not `touch`: it needs no PATH.
      writeFileSync(file, `#!/bin/sh\n: > '${join(markers, hook)}'\n`)
      chmodSync(file, 0o755)
    }
    sh(api.worker.dir, 'add', '.husky')
    sh(api.worker.dir, 'commit', '-q', '-m', 'hooks')
    sh(api.worker.dir, 'push', '-q', 'origin', 'topic')
    sh(api.worker.dir, 'checkout', '-q', 'main')
    sh(api.worker.dir, 'config', 'core.hooksPath', '.husky')

    // Without the guard they run: checking the PR's head out in a worktree fires its post-checkout.
    const control = join(scratch, 'control')
    sh(api.worker.dir, 'worktree', 'add', '-q', '--detach', control, 'origin/main')
    sh(control, 'checkout', '-q', '--detach', 'origin/topic')
    expect(existsSync(join(markers, 'post-checkout'))).toBe(true)
    sh(api.worker.dir, 'worktree', 'remove', '--force', control)
    rmSync(markers, { recursive: true, force: true })
    mkdirSync(markers)

    const out = await update({ args: { strategy: 'merge' } })
    expect(out.results.map((r) => [r.status, r.strategy, r.pushed])).toEqual([
      ['updated', 'merge', true],
    ])
    // A merge commit was made and pushed, so pre-merge-commit and pre-push had their chance.
    expect(sh(api.bare.dir, 'rev-list', '--parents', '-n', '1', 'topic').split(' ')).toHaveLength(3)
    expect(readdirSync(markers)).toEqual([])
  })
})

describe("the person's own checkout", () => {
  const stateOf = (dir: string) => ({
    head: sh(dir, 'rev-parse', 'HEAD'),
    branch: sh(dir, 'branch', '--show-current'),
    topic: sh(dir, 'rev-parse', 'refs/heads/topic'),
    status: sh(dir, 'status', '--porcelain=v1', '--untracked-files=all'),
    unstaged: sh(dir, 'diff'),
    staged: sh(dir, 'diff', '--cached'),
  })

  test('keeps its working tree, index and HEAD when it is dirty', async () => {
    const dir = api.worker.dir
    writeFileSync(join(dir, 'shared.txt'), 'edited\n')
    writeFileSync(join(dir, 'staged.txt'), 'staged\n')
    sh(dir, 'add', 'staged.txt')
    writeFileSync(join(dir, 'untracked.txt'), 'mine\n')
    const before = stateOf(dir)
    expect((await update()).results.map((r) => r.status)).toEqual(['updated'])
    expect(stateOf(dir)).toEqual(before)
  })

  test("keeps its working tree, index and HEAD when it is on the PR's head branch", async () => {
    const dir = api.worker.dir
    sh(dir, 'checkout', '-q', 'topic')
    const before = stateOf(dir)
    const out = await update()
    expect(out.results.map((r) => [r.status, r.pushed])).toEqual([['updated', true]])
    expect(sh(api.bare.dir, 'rev-parse', 'topic')).not.toBe(before.topic)
    expect(stateOf(dir)).toEqual(before)
  })

  test('keeps a worktree of its own whose folder is missing registered', async () => {
    const mine = join(scratch, 'mine')
    sh(api.worker.dir, 'worktree', 'add', '-q', '--detach', mine, 'main')
    rmSync(mine, { recursive: true, force: true })
    expect((await update()).results.map((r) => r.status)).toEqual(['updated'])
    expect(worktreePaths(sh(api.worker.dir, 'worktree', 'list', '--porcelain'))).toContain(mine)
  })

  test('when removing the run worktree fails, only its record goes, and nothing is pruned', async () => {
    const mine = join(scratch, 'mine')
    sh(api.worker.dir, 'worktree', 'add', '-q', '--detach', mine, 'main')
    rmSync(mine, { recursive: true, force: true })
    const calls: string[][] = []
    const failingRemove: CommandRunner = {
      run: (argv, opts) => {
        calls.push([...argv])
        return argv[0] === 'worktree' && argv[1] === 'remove'
          ? { exitCode: 128, stdout: '', stderr: 'fatal: cannot remove\n' }
          : git.run(argv, opts)
      },
    }
    expect((await update({ runner: failingRemove })).results.map((r) => r.status)).toEqual([
      'updated',
    ])
    expect(calls.some((c) => c[0] === 'worktree' && c[1] === 'prune')).toBe(false)
    const runs = join(paths.worktrees, 'github.com', 'acme', 'api')
    expect(readdirSync(runs)).toEqual([])
    const listed = worktreePaths(sh(api.worker.dir, 'worktree', 'list', '--porcelain'))
    expect(listed).toContain(mine)
    expect(listed.filter((p) => p.startsWith(runs))).toEqual([])
    expect(sh(api.worker.dir, 'branch', '--list', 'pr-update/*')).toBe('')
  })
})

describe('a located target kept worktree, when something is off', () => {
  test('whose git directory is gone is left with its edits, even when the PR moved', async () => {
    verifyOk = false
    await update({ args: { keepFailed: true } })
    const kept = join(keptDir(), '1')
    writeFileSync(join(kept, 'fix.txt'), 'half a fix\n')
    const record = JSON.parse(readFileSync(`${kept}.json`, 'utf8'))
    const gone = join(scratch, 'gone')
    writeFileSync(`${kept}.json`, JSON.stringify({ ...record, gitDir: gone }))
    api.worker.commit('main again', { 'n.txt': 'n\n' })
    api.worker.git.push('origin', 'main')

    for (const args of [{ keepFailed: true }, { keepFailed: true, retryFailed: true }]) {
      const out = await update({ args })
      expect(out.results).toEqual([])
      expect(out.discarded ?? []).toEqual([])
      expect(out.skipped.map((s) => s.reason)).toEqual([
        `kept worktree ${kept}: its git directory ${gone} is gone; pass --discard-kept to remove the kept tree`,
      ])
    }
    expect(readFileSync(join(kept, 'fix.txt'), 'utf8')).toBe('half a fix\n')
  })

  test('a tree git cannot read counts as changed', () => {
    const plain = join(scratch, 'plain')
    mkdirSync(plain)
    const record = {
      repo: 'acme/api',
      number: 1,
      head: 'topic',
      base: 'main',
      headOid: null,
      baseOid: null,
      path: plain,
      branch: 'pr-update/failed-acme-api-1',
    }
    expect(keptIsTouched(new Git(api.worker.dir, { runner: git }), record)).toBe(true)
  })

  test('a folder in the kept path with no record is not moved into, and is named', async () => {
    verifyOk = false
    const kept = join(keptDir(), '1')
    mkdirSync(kept, { recursive: true })
    writeFileSync(join(kept, 'work.txt'), 'mine\n')
    const out = await update({ args: { keepFailed: true } })
    expect(out.results[0]!.keptWorktree).toBeUndefined()
    expect(out.results[0]!.keepError).toBe(
      `${kept} is in the way and has no record (a run stopped part-way); ` +
        `remove it with \`git worktree remove --force ${kept}\` in its checkout, then run again`,
    )
    expect(readdirSync(kept)).toEqual(['work.txt'])
    expect(readdirSync(join(paths.worktrees, 'github.com', 'acme', 'api'))).toEqual([])
  })

  test('a record whose path is not its own kept path is ignored, and deletes nothing', async () => {
    const victim = join(scratch, 'victim')
    mkdirSync(victim)
    writeFileSync(join(victim, 'keep.txt'), 'keep\n')
    mkdirSync(keptDir(), { recursive: true })
    const forged = {
      repo: 'acme/api',
      number: 1,
      head: 'topic',
      base: 'main',
      headOid: null,
      baseOid: null,
      path: victim,
      branch: 'main',
    }
    writeFileSync(join(keptDir(), '1.json'), JSON.stringify(forged))
    expect((await update({ args: { discardKept: true } })).discarded ?? []).toEqual([])
    verifyOk = false
    expect((await update({ args: { keepFailed: true } })).discarded ?? []).toEqual([])
    expect(readFileSync(join(victim, 'keep.txt'), 'utf8')).toBe('keep\n')

    // The project root's place reads records the same way.
    const place = checkoutKept(root.worker.dir)
    mkdirSync(place.dir, { recursive: true })
    writeFileSync(join(place.dir, 'acme-api-1.json'), JSON.stringify(forged))
    writeFileSync(
      join(place.dir, 'acme-api-2.json'),
      JSON.stringify({ ...forged, number: 1, path: join(place.dir, 'acme-api-1') }),
    )
    writeFileSync(
      join(place.dir, 'acme-api-1.5.json'),
      JSON.stringify({ ...forged, number: 1.5, path: join(place.dir, 'acme-api-1.5') }),
    )
    mkdirSync(join(place.dir, 'acme-api-1'))
    mkdirSync(join(place.dir, 'acme-api-1.5'))
    expect(listKept(place)).toEqual([])
    expect(findKept(place, 'acme/api', 1)).toBeNull()
  })
})

describe('keepWorktree, telling filesystems apart', () => {
  function runWorktree(repo = 'acme/api'): { run: string; place: KeptPlace; tip: string } {
    const run = join(scratch, 'cache', `${process.pid}.1`)
    sh(api.worker.dir, 'worktree', 'add', '-q', '--detach', run, 'origin/topic')
    writeFileSync(join(run, 'build.out'), 'built\n')
    const place =
      repo === 'acme/api'
        ? { dir: join(scratch, 'state', 'kept'), naming: 'repository' as const }
        : checkoutKept(api.worker.dir)
    return { run, place, tip: sh(run, 'rev-parse', 'HEAD') }
  }
  const target = (repo: string) => ({
    repo,
    number: 1,
    head: 'topic',
    base: 'main',
    headOid: null,
    baseOid: null,
  })
  const exdev = (): never => {
    throw Object.assign(new Error('EXDEV: cross-device link not permitted'), { code: 'EXDEV' })
  }

  test('a probe rename that fails with EXDEV makes the tree with worktree add, never a move', () => {
    const { run, place, tip } = runWorktree()
    const calls: string[][] = []
    const logged: CommandRunner = {
      run: (argv, opts) => {
        calls.push([...argv])
        return git.run(argv, opts)
      },
    }
    const record = keepWorktree(
      new Git(api.worker.dir, { runner: logged }),
      place,
      run,
      target('acme/api'),
      'log\n',
      { rename: exdev },
    )
    expect(calls.some((c) => c[0] === 'worktree' && c[1] === 'move')).toBe(false)
    expect(sh(record.path, 'rev-parse', 'HEAD')).toBe(tip)
    expect(existsSync(join(record.path, 'build.out'))).toBe(false)
    expect(existsSync(run)).toBe(false)
    // The probe leaves nothing behind.
    for (const dir of [join(scratch, 'cache'), place.dir]) {
      expect(readdirSync(dir).filter((n) => n.startsWith('.pr-update-probe-'))).toEqual([])
    }
  })

  test('on one filesystem the move runs in the C locale, and keeps untracked output', () => {
    const { run, place } = runWorktree()
    let moveEnv: Record<string, string | undefined> | undefined
    const logged: CommandRunner = {
      run: (argv, opts) => {
        if (argv[0] === 'worktree' && argv[1] === 'move') moveEnv = opts?.env
        return git.run(argv, opts)
      },
    }
    const record = keepWorktree(
      new Git(api.worker.dir, { runner: logged }),
      place,
      run,
      target('acme/api'),
      undefined,
    )
    expect(moveEnv?.['LC_ALL']).toBe('C')
    expect(readFileSync(join(record.path, 'build.out'), 'utf8')).toBe('built\n')
  })

  test('a repository named exdev whose move fails for another reason is not retried', () => {
    const { run, place } = runWorktree('acme/exdev')
    const refusing: CommandRunner = {
      run: (argv, opts) =>
        argv[0] === 'worktree' && argv[1] === 'move'
          ? {
              exitCode: 128,
              stdout: '',
              stderr: `fatal: failed to move '${argv[2]}' to '${argv[3]}': Permission denied\n`,
            }
          : git.run(argv, opts),
    }
    expect(() =>
      keepWorktree(
        new Git(api.worker.dir, { runner: refusing }),
        place,
        run,
        target('acme/exdev'),
        undefined,
      ),
    ).toThrow(/Permission denied/)
    expect(existsSync(join(place.dir, 'acme-exdev-1'))).toBe(false)
    expect(existsSync(join(run, 'build.out'))).toBe(true)
  })
})

describe('the attempt record of each target', () => {
  /** A store that logs each call as `[name, call, repo?]`. */
  function spyStore(
    name: string,
    log: unknown[][],
    opts: { get?: () => never } = {},
  ): AttemptStore {
    return {
      get: opts.get ?? (() => null),
      recordFailure: (key) => void log.push([name, 'record', key.repo]),
      clear: (repo) => void log.push([name, 'clear', repo]),
      prune: () => void log.push([name, 'prune']),
    }
  }
  const homeWith =
    (stores: Record<string, AttemptStore | undefined>): Ports['targetHome'] =>
    (t) => ({
      worktrees: join(paths.worktrees, t.name),
      kept: join(paths.kept, t.name),
      ...(stores[t.name] === undefined ? {} : { attempts: stores[t.name] }),
    })
  const both = { repo: ['acme/api', 'acme/web'] }

  test("prune reaches the project root's store and each updated target's own, not a refused one's", async () => {
    web = behindRepo('web')
    const log: unknown[][] = []
    const out = await update({
      args: both,
      ports: {
        locate: locateBoth,
        attempts: spyStore('root', log),
        targetHome: homeWith({ api: spyStore('api', log), web: spyStore('web', log) }),
      },
      targetTrust: async (t) => (t.name === 'web' ? 'untrusted: not web' : null),
    })
    expect(out.results.map((r) => [r.repo, r.status])).toEqual([['acme/api', 'updated']])
    expect(log.filter((l) => l[1] === 'prune')).toEqual([
      ['root', 'prune'],
      ['api', 'prune'],
    ])
    expect(log).toContainEqual(['api', 'clear', 'acme/api'])
    expect(
      log.filter((l) => l[0] === 'web' || l[0] === 'root').filter((l) => l[1] !== 'prune'),
    ).toEqual([])
  })

  test('a target with no store of its own records into Ports.attempts', async () => {
    verifyOk = false
    const log: unknown[][] = []
    const out = await update({
      ports: { attempts: spyStore('root', log), targetHome: homeWith({}) },
    })
    expect(out.results.map((r) => r.status)).toEqual(['failed'])
    expect(log).toContainEqual(['root', 'record', 'acme/api'])
  })

  test('a target whose own store fails is skipped with the error, and the others are updated', async () => {
    web = behindRepo('web')
    const log: unknown[][] = []
    const boom = (): never => {
      throw new Error('boom')
    }
    const out = await update({
      args: both,
      cfg: { max_failed_attempts: 1 },
      ports: {
        locate: locateBoth,
        targetHome: homeWith({
          api: spyStore('api', log, { get: boom }),
          web: spyStore('web', log),
        }),
      },
    })
    expect(out.results.map((r) => [r.repo, r.status])).toEqual([['acme/web', 'updated']])
    expect(out.skipped).toContainEqual({
      repo: 'acme/api',
      number: 1,
      head: 'topic',
      reason: 'attempt record: boom',
    })
  })

  test('with git-ref, a target whose origin refuses refs/pr-update/* is skipped; the root and the other target are updated', async () => {
    web = behindRepo('web')
    rootIsTarget = true
    sh(root.worker.dir, 'checkout', '-q', '-b', 'topic')
    root.worker.commit('root topic', { 't.txt': 't\n' })
    sh(root.worker.dir, 'push', '-q', 'origin', 'topic')
    sh(root.worker.dir, 'checkout', '-q', 'main')
    root.worker.commit('root main moves', { 'm.txt': 'm\n' })
    sh(root.worker.dir, 'push', '-q', 'origin', 'main')
    // The project root is acme/root on GitHub; its pushes go to its bare repository, and so do
    // its record and lease.
    const rootUrl = 'https://github.com/acme/root.git'
    sh(root.worker.dir, 'remote', 'set-url', 'origin', rootUrl)
    const viaBare: CommandRunner = {
      run: (argv, opts) =>
        git.run(
          argv[0] === 'fetch' || argv[0] === 'push'
            ? ['-c', `url.file://${root.bare.dir}.insteadOf=${rootUrl}`, ...argv]
            : argv,
          opts,
        ),
    }
    const onRootBare = { remote: root.bare.dir, cwd: root.worker.dir }
    // A file where the namespace's folder would go: every ref under it is refused.
    writeFileSync(join(api.bare.dir, 'refs', 'pr-update'), '')

    const out = await update({
      args: { repo: ['acme/root', 'acme/api', 'acme/web'] },
      cfg: { attempts: { store: 'git-ref' } },
      runner: viaBare,
      ports: {
        locate: locateBoth,
        attempts: refAttemptStore(onRootBare),
        lease: refBranchLease({ ...onRootBare, ttlMs: 600_000 }),
      },
    })
    expect(out.results.map((r) => [r.repo, r.status, r.pushed]).sort()).toEqual([
      ['acme/root', 'updated', true],
      ['acme/web', 'updated', true],
    ])
    const api1 = out.skipped.find((s) => s.repo === 'acme/api')
    expect(api1?.reason).toContain('set `attempts.store: file`')
    expect(sh(root.bare.dir, 'rev-parse', 'topic')).not.toBe(
      sh(root.worker.dir, 'rev-parse', 'topic'),
    )
  })
})

describe("a run started with GIT_DIR set to the project root's .git", () => {
  /** A `gh` that lists what `gh` above lists now, without running git while the run goes on. */
  function listedNow(): CommandRunner {
    const api = gh.run(['pr', 'list', '--repo', 'acme/api'], { cwd: scratch }).stdout
    // The project root is listed without `--repo`.
    const own = gh.run(['pr', 'list'], { cwd: scratch }).stdout
    return {
      run: (argv) => ({ exitCode: 0, stderr: '', stdout: argv.includes('acme/api') ? api : own }),
    }
  }

  /** The verify command: what GIT_DIR it saw, and the repository git found from its directory. */
  const probe = (out: string): string =>
    `printf '%s\\n' "\${GIT_DIR-unset}" > '${out}'; git rev-parse --show-toplevel >> '${out}'`

  /** The project root's checked-out branch and its local branches, as git reports them. */
  const rootState = () => ({
    head: sh(root.worker.dir, 'symbolic-ref', 'HEAD'),
    branches: sh(
      root.worker.dir,
      'for-each-ref',
      '--format=%(refname) %(objectname)',
      'refs/heads/',
    ),
    worktrees: worktreesOf(root.worker.dir),
  })

  /** Runs `update` with GIT_DIR exported to the project root's .git, and restores it after. */
  async function withRootGitDir(run: Run) {
    vi.stubEnv('GIT_DIR', join(root.worker.dir, '.git'))
    try {
      return await update(run)
    } finally {
      vi.unstubAllEnvs()
    }
  }

  test("a verify command in the project root's run worktree sees no GIT_DIR, and the root's branch does not move", async () => {
    rootIsTarget = true
    sh(root.worker.dir, 'checkout', '-q', '-b', 'topic')
    root.worker.commit('root topic', { 't.txt': 't\n' })
    sh(root.worker.dir, 'push', '-q', 'origin', 'topic')
    sh(root.worker.dir, 'checkout', '-q', 'main')
    root.worker.commit('root main moves', { 'm.txt': 'm\n' })
    sh(root.worker.dir, 'push', '-q', 'origin', 'main')
    const rootUrl = 'https://github.com/acme/root.git'
    sh(root.worker.dir, 'remote', 'set-url', 'origin', rootUrl)
    const viaBare: CommandRunner = {
      run: (argv, opts) =>
        git.run(
          argv[0] === 'fetch' || argv[0] === 'push'
            ? ['-c', `url.file://${root.bare.dir}.insteadOf=${rootUrl}`, ...argv]
            : argv,
          opts,
        ),
    }
    sh(root.worker.dir, 'fetch', '-q', root.bare.dir, '+refs/heads/*:refs/remotes/origin/*')
    const listed = listedNow()
    const before = rootState()
    const seen = join(scratch, 'seen.txt')
    const standalone = standalonePorts(undefined, root.worker.dir, 'origin', () => {}, { env })

    const out = await withRootGitDir({
      args: { repo: ['acme/root'] },
      runner: viaBare,
      gh: listed,
      ports: {
        locate: () => null,
        runVerb: standalone.runVerb,
        resolveVerifyVerbs: async () => [probe(seen)],
      },
    })

    expect(out.results.map((r) => [r.repo, r.status, r.pushed])).toEqual([
      ['acme/root', 'updated', true],
    ])
    const [gitDir, printed] = readFileSync(seen, 'utf8').trim().split('\n')
    // Printed by git, which writes `C:/x` on Windows.
    const top = normalize(printed!)
    expect(gitDir).toBe('unset')
    expect(top.startsWith(join(root.worker.dir, '.pr-update'))).toBe(true)
    expect(rootState()).toEqual(before)
  })

  test("a verify command in a located target's run worktree sees no GIT_DIR, and no branch moves", async () => {
    const listed = listedNow()
    const before = rootState()
    const apiHead = sh(api.worker.dir, 'symbolic-ref', 'HEAD')
    const apiBranches = sh(
      api.worker.dir,
      'for-each-ref',
      '--format=%(refname) %(objectname)',
      'refs/heads/',
    )
    const seen = join(scratch, 'seen.txt')
    const standalone = standalonePorts(undefined, root.worker.dir, 'origin', () => {}, { env })

    const out = await withRootGitDir({
      gh: listed,
      ports: { runVerb: standalone.runVerb, resolveVerifyVerbs: async () => [probe(seen)] },
    })

    expect(out.results.map((r) => [r.repo, r.status, r.pushed])).toEqual([
      ['acme/api', 'updated', true],
    ])
    const [gitDir, printed] = readFileSync(seen, 'utf8').trim().split('\n')
    // Printed by git, which writes `C:/x` on Windows.
    const top = normalize(printed!)
    expect(gitDir).toBe('unset')
    expect(top.startsWith(join(paths.worktrees, 'github.com', 'acme', 'api'))).toBe(true)
    expect(rootState()).toEqual(before)
    expect(sh(api.worker.dir, 'symbolic-ref', 'HEAD')).toBe(apiHead)
    expect(
      sh(api.worker.dir, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads/'),
    ).toBe(apiBranches)
  })

  test("with git-ref, a located target's record lands on its own origin", async () => {
    verifyOk = false
    const listed = listedNow()
    const out = await withRootGitDir({ cfg: { attempts: { store: 'git-ref' } }, gh: listed })
    expect(out.results.map((r) => r.status)).toEqual(['failed'])
    expect(sh(api.bare.dir, 'for-each-ref', '--format=%(refname)', 'refs/pr-update/')).toMatch(
      /^refs\/pr-update\/attempts\//,
    )
    expect(sh(root.bare.dir, 'for-each-ref', 'refs/pr-update/')).toBe('')
    expect(sh(root.worker.dir, 'for-each-ref', 'refs/pr-update/')).toBe('')
  })
})

describe("errors from a target's own record and lease, during the run", () => {
  /** A store whose `call` throws `message`; the rest do nothing. */
  function throwing(call: 'recordFailure' | 'clear', message: string): AttemptStore {
    const fail = (): never => {
      throw new Error(message)
    }
    return {
      get: () => null,
      recordFailure: call === 'recordFailure' ? fail : () => {},
      clear: call === 'clear' ? fail : () => {},
      prune: () => {},
    }
  }
  const homeWith =
    (attempts: Record<string, AttemptStore>, lease?: Ports['lease']): Ports['targetHome'] =>
    (t) => ({
      worktrees: join(paths.worktrees, t.name),
      kept: join(paths.kept, t.name),
      ...(attempts[t.name] === undefined ? {} : { attempts: attempts[t.name] }),
      ...(lease === undefined || t.name !== 'api' ? {} : { lease }),
    })
  const both = { repo: ['acme/api', 'acme/web'] }

  test("recordFailure throwing on a target's last PR is reported on it, in JSON and text", async () => {
    verifyOk = false
    const out = await update({
      ports: { targetHome: homeWith({ api: throwing('recordFailure', 'refused') }) },
    })
    expect(out.results.map((r) => [r.repo, r.status, r.recordError])).toEqual([
      ['acme/api', 'failed', 'attempt record: refused'],
    ])
    expect(output.parse(out).results[0]!.recordError).toBe('attempt record: refused')
    expect(out.recordErrors).toBeUndefined()
    expect(renderUpdateText(out)).toContain('    record not saved: attempt record: refused\n')
  })

  test("recordFailure throwing mid-run skips the target's later PRs, and the next target is updated", async () => {
    web = behindRepo('web')
    apiPr2 = true
    sh(api.worker.dir, 'checkout', '-q', '-b', 'topic2', 'origin/main~1')
    api.worker.commit('topic2 work', { 'two.txt': '2\n' })
    sh(api.worker.dir, 'push', '-q', 'origin', 'topic2')
    sh(api.worker.dir, 'checkout', '-q', 'main')
    verifyOk = false
    const out = await update({
      args: both,
      ports: {
        locate: locateBoth,
        targetHome: homeWith({ api: throwing('recordFailure', 'refused') }),
      },
    })
    expect(out.results.map((r) => [r.repo, r.number, r.recordError])).toEqual([
      ['acme/api', 1, 'attempt record: refused'],
      ['acme/web', 1, undefined],
    ])
    expect(out.skipped).toContainEqual({
      repo: 'acme/api',
      number: 2,
      head: 'topic2',
      reason: 'attempt record: refused',
    })
  })

  test("a store that throws on a restack child's new key skips the child, before it runs (second review)", async () => {
    // PR 2, `topic2`, stacked on PR 1's `topic`.
    sh(api.worker.dir, 'checkout', '-q', '-b', 'topic2', 'origin/topic')
    api.worker.commit('topic2 work', { 'two.txt': '2\n' })
    sh(api.worker.dir, 'push', '-q', 'origin', 'topic2')
    sh(api.worker.dir, 'checkout', '-q', 'main')
    const stacked: CommandRunner = {
      run: (argv, opts) => {
        const listed = gh.run(argv, opts)
        if (!argv.includes('acme/api')) return listed
        const child = {
          ...prOf(api, 'acme/api', false),
          number: 2,
          url: 'https://github.com/acme/api/pull/2',
          baseRefName: 'topic',
          headRefName: 'topic2',
          headRefOid: api.worker.git.resolveRef('origin/topic2'),
        }
        return { ...listed, stdout: JSON.stringify([...JSON.parse(listed.stdout), child]) }
      },
    }
    const topic = api.worker.git.resolveRef('origin/topic')
    // Only the child's key on its parent's new head fails.
    const attempts: AttemptStore = {
      get: (key) => {
        if (key.head === 'topic2' && key.baseOid !== topic) throw new Error('refused')
        return null
      },
      recordFailure: () => {},
      clear: () => {},
      prune: () => {},
    }
    const out = await update({
      args: { restack: true },
      cfg: { max_failed_attempts: 2 },
      gh: stacked,
      ports: { targetHome: homeWith({ api: attempts }) },
    })
    expect(out.results.map((r) => [r.number, r.status])).toEqual([[1, 'updated']])
    expect(out.skipped).toContainEqual({
      repo: 'acme/api',
      number: 2,
      head: 'topic2',
      reason: 'attempt record: refused',
    })
    // Shown once: as the skip's reason.
    expect(out.recordErrors).toBeUndefined()
    // Nothing was pushed to it.
    expect(sh(api.bare.dir, 'rev-parse', 'topic2')).toBe(sh(api.worker.dir, 'rev-parse', 'topic2'))
  })

  test('clear throwing mid-run is reported on the PR, and the next target is updated', async () => {
    web = behindRepo('web')
    const out = await update({
      args: both,
      ports: { locate: locateBoth, targetHome: homeWith({ api: throwing('clear', 'gone') }) },
    })
    expect(out.results.map((r) => [r.repo, r.status, r.recordError])).toEqual([
      ['acme/api', 'updated', 'attempt record: gone'],
      ['acme/web', 'updated', undefined],
    ])
  })

  test('a prune error no PR or skip shows is listed in recordErrors, in JSON and text', async () => {
    verifyOk = false
    const keep = { args: { keepFailed: true } }
    await update({ ...keep, ports: { targetHome: homeWith({}) } })
    const kept = join(paths.kept, 'api', '1')
    // Its only PR is skipped for its kept tree, but its store is still pruned, and that fails.
    const pruning: AttemptStore = {
      get: () => null,
      recordFailure: () => {},
      clear: () => {},
      prune: () => {
        throw new Error('prune refused')
      },
    }
    const out = await update({ ...keep, ports: { targetHome: homeWith({ api: pruning }) } })
    expect(out.results).toEqual([])
    expect(out.skipped.map((s) => s.reason)).toEqual([`failed worktree kept at ${kept}`])
    expect(out.recordErrors).toEqual([{ repo: 'acme/api', error: 'attempt record: prune refused' }])
    expect(output.parse(out).recordErrors).toEqual(out.recordErrors)
    expect(renderUpdateText(out)).toContain('! acme/api  attempt record: prune refused\n')
  })

  test("a target's own lease that throws skips its PR with the error, and the other target is updated", async () => {
    web = behindRepo('web')
    const refusing: Ports['lease'] = {
      acquire: () => {
        throw new Error('lease refused')
      },
    }
    const out = await update({
      args: both,
      ports: { locate: locateBoth, targetHome: homeWith({}, refusing) },
    })
    expect(out.results.map((r) => [r.repo, r.status])).toEqual([['acme/web', 'updated']])
    expect(out.skipped).toEqual([
      { repo: 'acme/api', number: 1, head: 'topic', reason: 'lease refused' },
    ])
  })
})

describe('whether a run made a worktree under the cache (second review)', () => {
  test('a located target whose every lease is refused still made its run worktree', async () => {
    const refusing: Ports['lease'] = {
      acquire: () => {
        throw new Error('lease refused')
      },
    }
    const out = await update({
      ports: {
        targetHome: (t) => ({
          worktrees: join(paths.worktrees, t.name),
          kept: join(paths.kept, t.name),
          lease: refusing,
        }),
      },
    })
    expect(out.results).toEqual([])
    expect(out.madeTargetWorktree).toBe(true)
    expect(output.parse(out).madeTargetWorktree).toBe(true)
    expect(touchedCache(out)).toBe(true)
  })

  test('a located target whose every PR is held back by a kept tree made none', async () => {
    verifyOk = false
    await update({ args: { keepFailed: true } })
    const out = await update({})
    expect(out.skipped.map((s) => s.reason)).toEqual([
      `failed worktree kept at ${join(keptDir(), '1')}`,
    ])
    expect(out.madeTargetWorktree).toBeUndefined()
    expect(touchedCache(out)).toBe(false)
  })

  test('without targetHome a located target works in its own .pr-update/, not the cache', async () => {
    const out = await update({ ports: { targetHome: undefined } })
    expect(out.results.map((r) => r.status)).toEqual(['updated'])
    expect(out.madeTargetWorktree).toBeUndefined()
    expect(touchedCache(out)).toBe(false)
  })
})

describe.skipIf(process.platform === 'win32')(
  'a kept tree in a folder others can write to (second review)',
  () => {
    test('is not discarded, by --discard-kept or because its PR moved', async () => {
      verifyOk = false
      await update({ args: { keepFailed: true } })
      const kept = join(keptDir(), '1')
      const owner = join(paths.kept, 'github.com', 'acme')
      chmodSync(owner, 0o777)
      const why = `${owner} can be written by anyone; run \`chmod -R go-w ${paths.kept}\``
      try {
        const out = await update({ args: { discardKept: true } })
        expect(out.discarded ?? []).toEqual([])
        expect(out.keptRefused).toEqual([{ record: `${kept}.json`, reason: why }])
        expect(existsSync(kept)).toBe(true)
        const retried = await update({ args: { retryFailed: true } })
        expect(retried.results).toEqual([])
        expect(retried.skipped.map((s) => s.reason)).toEqual([
          `kept worktree ${kept} stays: ${why}`,
        ])
        expect(existsSync(kept)).toBe(true)
      } finally {
        chmodSync(owner, 0o755)
      }
    })
  },
)

describe('a kept tree, round 2', () => {
  test('--retry-failed leaves a kept tree with local changes, as only --discard-kept removes it', async () => {
    verifyOk = false
    await update({ args: { keepFailed: true } })
    const kept = join(keptDir(), '1')
    writeFileSync(join(kept, 'fix.txt'), 'half a fix\n')
    const out = await update({ args: { keepFailed: true, retryFailed: true } })
    expect(out.results).toEqual([])
    expect(out.skipped.map((s) => s.reason)).toEqual([
      `kept worktree ${kept} has local changes; push them or pass --discard-kept`,
    ])
    expect(readFileSync(join(kept, 'fix.txt'), 'utf8')).toBe('half a fix\n')
    expect((await update({ args: { discardKept: true } })).discarded).toEqual([kept])
  })

  test('a record whose path names its folder another way is still its own', async () => {
    verifyOk = false
    await update({ args: { keepFailed: true } })
    const kept = join(keptDir(), '1')
    const link = join(scratch, 'kept-link')
    symlinkSync(keptDir(), link)
    const record = JSON.parse(readFileSync(`${kept}.json`, 'utf8'))
    writeFileSync(`${kept}.json`, JSON.stringify({ ...record, path: join(link, '1') }))
    expect((await update()).skipped.map((s) => s.reason)).toEqual([
      `failed worktree kept at ${join(link, '1')}`,
    ])
    // The right name in another folder is not.
    const elsewhere = join(scratch, 'elsewhere', '1')
    mkdirSync(elsewhere, { recursive: true })
    writeFileSync(`${kept}.json`, JSON.stringify({ ...record, path: elsewhere }))
    expect((await update({ args: { discardKept: true } })).discarded ?? []).toEqual([])
    expect(existsSync(elsewhere)).toBe(true)
  })

  test("a probe left by a killed run is skipped by the run's own walks and left alone", async () => {
    const probes = [
      join(paths.worktrees, 'github.com', 'acme', 'api', '.pr-update-probe-abc'),
      join(keptDir(), '.pr-update-probe-abc'),
    ]
    for (const p of probes) mkdirSync(p, { recursive: true })
    writeFileSync(join(keptDir(), '.pr-update-probe-abc.json'), '{}')
    verifyOk = false
    const kept = join(keptDir(), '1')
    expect((await update({ args: { keepFailed: true } })).results[0]!.keptWorktree).toBe(kept)
    const place = { dir: keptDir(), naming: 'repository' as const, gitDir: ownGitDir() }
    expect(listKept(place).map((r) => r.path)).toEqual([kept])
    expect((await update({ args: { discardKept: true } })).discarded).toEqual([kept])
    for (const p of probes) expect(existsSync(p)).toBe(true)
  })
})
