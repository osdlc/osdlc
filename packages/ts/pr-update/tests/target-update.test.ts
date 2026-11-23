/**
 * `runUpdate` on a `--repo` target found in a checkout of its own, with the standalone ports:
 * where its worktrees, kept worktrees, record and lease go, and when its PRs are skipped. Real
 * git, a fake `gh`, and every pr-update directory under a temporary root.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { EXIT, captureContext } from '@osdlc/cli-tool'
import { spawnRunner, type CommandResult, type CommandRunner } from '@osdlc/command-seam'
import { osdlcDirs } from '@osdlc/ecosystem'
import { Git } from '@osdlc/typed-git'
import { IDENTITY, makeBareAndWorker } from '@osdlc/typed-git/testing'

import { main } from '../src/cli.ts'
import { prUpdateStandaloneSchema, type PrUpdateStandaloneConfig } from '../src/config.ts'
import { standalonePorts } from '../src/defaults.ts'
import { prUpdatePaths, type PrUpdatePaths } from '../src/machine.ts'
import type { FoundCheckout, Ports, TargetCheckout } from '../src/ports.ts'
import { targetTrustGate } from '../src/trust.ts'
import { runUpdate, type UpdateArgs, type UpdateEnv } from '../src/update.ts'
import { checkoutKept, keepWorktree, type KeptPlace } from '../src/update/kept.ts'
import { refBranchLease } from '../src/update/lease.ts'
import { allToolsInstalled, isolatedEnv } from './support.ts'

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

const gh: CommandRunner = {
  run: (argv): CommandResult => {
    if (!argv.includes('acme/api')) return { exitCode: 0, stdout: '[]', stderr: '' }
    api.worker.git.fetch('origin')
    const pr = {
      number: 1,
      state: 'OPEN',
      title: 'topic',
      url: 'https://github.com/acme/api/pull/1',
      baseRefName: 'main',
      headRefName: 'topic',
      headRefOid: api.worker.git.resolveRef('origin/topic'),
    }
    return { exitCode: 0, stdout: JSON.stringify([pr]), stderr: '' }
  },
}

interface Run {
  args?: Partial<UpdateArgs>
  cfg?: Record<string, unknown>
  /** The checkout `locate` returns; the acme/api checkout by default. */
  checkout?: string
  source?: FoundCheckout['source']
  runner?: CommandRunner
  targetTrust?: UpdateEnv['targetTrust']
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
  }
  return runUpdate(
    { ...ARGS, ...run.args },
    {
      projectRoot: root.worker.dir,
      dryRun: false,
      git: runner,
      gh,
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
const ownGitDir = () => realpathSync(join(api.worker.dir, '.git'))

beforeEach(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'pr-update-target-')))
  api = makeBareAndWorker({ initialBranch: 'main', parent: join(scratch, 'api') })
  api.worker.commit('initial', { 'shared.txt': 'base\n' })
  api.worker.git.push('origin', 'main')
  api.worker.git.checkout('main', { branch: 'topic' })
  api.worker.commit('topic work', { 'topic.txt': 'topic\n' })
  api.worker.git.push('origin', 'topic')
  api.worker.git.checkout('main')
  api.worker.commit('main moves', { 'main.txt': 'main\n' })
  api.worker.git.push('origin', 'main')
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
    expect(verifiedIn[0]!.startsWith(`${runs}/`)).toBe(true)
    expect(basename(verifiedIn[0]!)).toMatch(new RegExp(`^${process.pid}\\.\\d+$`))
    expect(readdirSync(runs)).toEqual([])
    expect(worktreesOf(api.worker.dir)).toEqual([realpathSync(api.worker.dir)])
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
    expect(worktreesOf(api.worker.dir)).toContain(realpathSync(kept))
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
    expect(worktreesOf(api.worker.dir)).toContain(realpathSync(kept))
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
    expect(worktreesOf(api.worker.dir)).toEqual([realpathSync(api.worker.dir)])
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
    expect(worktreesOf(api.worker.dir)).toEqual([realpathSync(api.worker.dir)])

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
    expect(worktreesOf(api.worker.dir)).toEqual([realpathSync(api.worker.dir), realpathSync(kept)])
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
    expect(worktreesOf(api.worker.dir)).toEqual([realpathSync(api.worker.dir), run])
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
