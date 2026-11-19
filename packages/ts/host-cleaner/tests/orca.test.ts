import { existsSync, mkdirSync, realpathSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

import { fakeRunner, type FakeRunner } from '@osdlc/command-seam/testing'
import type { CommandRunner } from '@osdlc/command-seam'
import { Git } from '@osdlc/typed-git'

import { hostCheck, hostRun } from '../src/clean.ts'
import { ORCA_BUNDLE_CLI, ORCA_UNREACHABLE, createOrcaAdapter } from '../src/orca.ts'
import { hostPlan } from '../src/plan.ts'
import { hostSweep } from '../src/sweep.ts'
import { buildFixture, sh, type Fixture } from './fixture.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})
function fixture(): Fixture {
  const fx = buildFixture()
  cleanups.push(fx.cleanup)
  return fx
}

/** `orca worktree list --json`, cut to the fields the adapter reads. */
const listJson = (worktrees: { path: string; main?: boolean }[], truncated = false): string =>
  JSON.stringify({
    id: 'a',
    ok: true,
    result: {
      worktrees: worktrees.map((w, i) => ({
        id: `repo-1::${w.path}`,
        path: w.path,
        isMainWorktree: w.main === true,
        displayName: `wt${i}`,
        branch: 'refs/heads/x',
      })),
      hostScope: { hostIds: ['local'] },
      totalCount: worktrees.length,
      truncated,
    },
  })

const terminalsJson = (paths: string[]): string =>
  JSON.stringify({
    id: 'b',
    ok: true,
    result: {
      terminals: paths.map((worktreePath, i) => ({ handle: `term_${i}`, worktreePath })),
      truncated: false,
    },
  })

const reposJson = (repos: { path: string; kind: string }[]): string =>
  JSON.stringify({ id: 'c', ok: true, result: { repos } })

/** What `orca` prints with no runtime to talk to (recorded, exit 1). */
const UNAVAILABLE = {
  exitCode: 1,
  stdout: JSON.stringify({
    id: 'local',
    ok: false,
    error: {
      code: 'runtime_unavailable',
      message: 'Could not read Orca runtime metadata. Start the Orca app first.',
    },
  }),
}

interface Orca {
  fake: FakeRunner
  state: { worktrees: string; terminals: string; repos: string; down: boolean }
  /** Run before `worktree rm` answers, to make Orca do its part. */
  onRemove: { fn: (argv: string[]) => void }
}

function orca(over: Partial<Orca['state']> = {}): Orca {
  const state = {
    worktrees: listJson([]),
    terminals: terminalsJson([]),
    repos: reposJson([]),
    down: false,
    ...over,
  }
  const onRemove = { fn: (_argv: string[]): void => {} }
  const fake = fakeRunner((argv) => {
    const [a, b] = argv
    if (a === '--version') return { stdout: '1.4.262\n' }
    if (state.down) return UNAVAILABLE
    if (a === 'worktree' && b === 'list') return { stdout: state.worktrees }
    if (a === 'terminal' && b === 'list') return { stdout: state.terminals }
    if (a === 'repo' && b === 'list') return { stdout: state.repos }
    if (a === 'terminal' && b === 'close') return { stdout: '{"ok":true}' }
    if (a === 'worktree' && b === 'rm') {
      onRemove.fn(argv)
      return { stdout: '{"ok":true}' }
    }
    return undefined
  })
  return { fake, state, onRemove }
}

const adapterOver = (
  o: Orca,
  exists = (p: string): boolean => p === ORCA_BUNDLE_CLI || existsSync(p),
) => createOrcaAdapter({ command: () => o.fake.runner, exists })

/** The commands after `--version`, as `orca <argv>` lines. */
const calls = (o: Orca): string[] =>
  o.fake.calls.map((c) => c.argv.join(' ')).filter((c) => c !== '--version')

/** A linked worktree of the fixture, under an `orca/workspaces/` directory. */
function managedWorktree(fx: Fixture): string {
  const parent = join(fx.root, 'orca', 'workspaces', 'repo')
  mkdirSync(parent, { recursive: true })
  const wt = join(parent, 'feature')
  sh(fx.root, ['worktree', 'add', '-q', '-b', 'wt-branch', wt, 'main'])
  cleanups.push(() => rmSync(wt, { recursive: true, force: true }))
  return realpathSync(wt)
}

const worktreeRow = (swept: ReturnType<typeof hostSweep>, path: string) =>
  swept.repo.repos[0]!.rows.find((r) => r.id === `worktree:${path}`)!

describe('orca adapter: detection', () => {
  test('the bundle CLI is preferred, then orca on PATH, then nothing', () => {
    const seen: string[] = []
    const spawn = (binary: string): CommandRunner => ({
      run() {
        seen.push(binary)
        return { exitCode: binary === 'orca' ? 0 : 1, stdout: '', stderr: '' }
      },
    })
    const ctx = {} as never
    expect(createOrcaAdapter({ command: spawn, exists: () => true }).detect(ctx)).toBe(true)
    expect(seen).toEqual([ORCA_BUNDLE_CLI, 'orca'])
    seen.length = 0
    expect(createOrcaAdapter({ command: spawn, exists: () => false }).detect(ctx)).toBe(true)
    expect(seen).toEqual(['orca'])
    const none = (): CommandRunner => ({ run: () => ({ exitCode: 1, stdout: '', stderr: '' }) })
    expect(createOrcaAdapter({ command: none, exists: () => true }).detect(ctx)).toBe(false)
    const missing = (): CommandRunner => ({
      run() {
        throw new Error('spawn orca ENOENT')
      },
    })
    expect(createOrcaAdapter({ command: missing, exists: () => false }).detect(ctx)).toBe(false)
  })
})

describe('orca adapter: annotate', () => {
  test('a worktree Orca lists carries its id and terminal count; one it does not list is untouched', () => {
    const fx = fixture()
    const wt = managedWorktree(fx)
    const o = orca({
      worktrees: listJson([{ path: fx.root, main: true }, { path: wt }]),
      terminals: terminalsJson([wt, wt, fx.root]),
    })
    const swept = hostSweep([fx.root], { cwd: fx.root, adapters: [adapterOver(o)] })
    const note = worktreeRow(swept, wt).notes.find((n) => n.startsWith('Orca manages'))
    expect(note).toContain(`id repo-1::${wt}`)
    expect(note).toContain('has 2 open terminals')
    const primary = swept.repo.repos[0]!.rows.find((r) => r.id === `worktree:${fx.root}`)!
    expect(primary.notes.some((n) => n.startsWith('Orca manages'))).toBe(false)

    const other = orca({ worktrees: listJson([{ path: fx.root, main: true }]) })
    const plain = hostSweep([fx.root], { cwd: fx.root, adapters: [adapterOver(other)] })
    expect(worktreeRow(plain, wt).notes.some((n) => n.startsWith('Orca manages'))).toBe(false)
  })

  test('with the runtime unreachable, a removable worktree under orca/workspaces is blocked with the Orca blocker', () => {
    const fx = fixture()
    const wt = managedWorktree(fx)
    const elsewhere = join(fx.root, '..', `elsewhere-${Date.now()}`)
    sh(fx.root, ['worktree', 'add', '-q', '-b', 'plain-branch', elsewhere, 'main'])
    cleanups.push(() => rmSync(elsewhere, { recursive: true, force: true }))
    const o = orca({ down: true })
    const swept = hostSweep([fx.root], { cwd: fx.root, adapters: [adapterOver(o)] })
    expect(worktreeRow(swept, wt)).toMatchObject({
      verdict: 'blocked',
      blockers: [ORCA_UNREACHABLE],
      action: null,
      commands: [],
    })
    expect(worktreeRow(swept, realpathSync(elsewhere)).blockers).toEqual([])
  })

  test('a truncated listing counts as unreachable, never as a short list', () => {
    const fx = fixture()
    const wt = managedWorktree(fx)
    const o = orca({ worktrees: listJson([{ path: wt }], true) })
    const swept = hostSweep([fx.root], { cwd: fx.root, adapters: [adapterOver(o)] })
    expect(worktreeRow(swept, wt).blockers).toEqual([ORCA_UNREACHABLE])
  })
})

describe('orca adapter: removal', () => {
  /** Orca's `worktree rm` removes the directory and git's record, as the real one does. */
  function orcaThatRemoves(fx: Fixture, o: Orca): void {
    o.onRemove.fn = (argv) => {
      const path = argv[argv.indexOf('--worktree') + 1]!.slice('path:'.length)
      new Git(fx.root).worktreeRemove(path)
    }
  }

  test('closes the terminals, then removes through Orca, and repo-cleaner verifies it', () => {
    const fx = fixture()
    const wt = managedWorktree(fx)
    const o = orca({
      worktrees: listJson([{ path: fx.root, main: true }, { path: wt }]),
      terminals: terminalsJson([wt]),
    })
    orcaThatRemoves(fx, o)
    const opts = { cwd: fx.root, adapters: [adapterOver(o)] }
    const plan = hostPlan(hostSweep([fx.root], opts))
    const preview = hostCheck(plan, { pick: [`worktree:${wt}`] }, opts)
    expect(preview.repo.steps.map((s) => s.command)).toEqual([
      `${ORCA_BUNDLE_CLI} terminal close --worktree path:${wt} --all && ` +
        `${ORCA_BUNDLE_CLI} worktree rm --worktree path:${wt}`,
    ])
    const before = calls(o).length
    const receipt = hostRun(preview, opts)
    expect(receipt.status).toBe('complete')
    expect(existsSync(wt)).toBe(false)
    const ran = calls(o).slice(before)
    const mutating = ran.filter((c) => /^(terminal close|worktree rm)/.test(c))
    expect(mutating).toEqual([
      `terminal close --worktree path:${wt} --all`,
      `worktree rm --worktree path:${wt}`,
    ])
  })

  test('--force follows the force repo-cleaner decided on, not a fixed flag', () => {
    const fx = fixture()
    const wt = managedWorktree(fx)
    const o = orca({ worktrees: listJson([{ path: wt }]) })
    const removal = adapterOver(o).removeWorktree!({ evidence: { path: wt } } as never, {
      repo: fx.root,
      force: true,
    })
    expect(removal?.command).toMatch(/worktree rm --worktree path:.* --force$/)
  })

  test('a failed terminal close stops before the removal', () => {
    const fx = fixture()
    const wt = managedWorktree(fx)
    const o = orca({ worktrees: listJson([{ path: wt }]) })
    const base = o.fake.runner
    const failing: CommandRunner = {
      run: (argv, opts) =>
        argv[0] === 'terminal' && argv[1] === 'close'
          ? { exitCode: 1, stdout: '', stderr: 'terminal_busy\nmore' }
          : base.run(argv, opts),
    }
    const adapter = createOrcaAdapter({ command: () => failing, exists: () => true })
    const removal = adapter.removeWorktree!({ evidence: { path: wt } } as never, {
      repo: fx.root,
      force: false,
    })!
    expect(() => removal.run()).toThrow(/terminal close .* failed: terminal_busy$/)
    expect(calls(o).some((c) => c.startsWith('worktree rm'))).toBe(false)
  })

  test('if Orca goes away after the sweep, a worktree under orca/workspaces is not removed with git', () => {
    const fx = fixture()
    const wt = managedWorktree(fx)
    const o = orca({ down: true })
    const removal = adapterOver(o).removeWorktree!({ evidence: { path: wt } } as never, {
      repo: fx.root,
      force: false,
    })!
    expect(() => removal.run()).toThrow(/cannot be reached/)
    expect(
      adapterOver(o).removeWorktree!({ evidence: { path: '/x/y' } } as never, {
        repo: fx.root,
        force: false,
      }),
    ).toBeNull()
  })

  test('a worktree Orca does not list is removed with plain git, as before', () => {
    const fx = fixture()
    const wt = managedWorktree(fx)
    const o = orca({ worktrees: listJson([{ path: fx.root, main: true }]) })
    const opts = { cwd: fx.root, adapters: [adapterOver(o)] }
    const plan = hostPlan(hostSweep([fx.root], opts))
    const preview = hostCheck(plan, { pick: [`worktree:${wt}`] }, opts)
    expect(preview.repo.steps.map((s) => s.command)).toEqual([
      expect.stringMatching(/^git .*worktree remove /),
    ])
    expect(hostRun(preview, opts).status).toBe('complete')
    expect(existsSync(wt)).toBe(false)
    expect(calls(o).some((c) => /^(terminal close|worktree rm)/.test(c))).toBe(false)
  })

  test('with the runtime unreachable, no removal runs on the Orca-managed row', () => {
    const fx = fixture()
    const wt = managedWorktree(fx)
    const o = orca({ down: true })
    const opts = { cwd: fx.root, adapters: [adapterOver(o)] }
    const plan = hostPlan(hostSweep([fx.root], opts))
    const preview = hostCheck(plan, { pick: [`worktree:${wt}`] }, opts)
    expect(preview.repo.steps).toEqual([])
    expect(preview.repo.dropped.map((d) => [d.row, d.reason])).toContainEqual([
      `worktree:${wt}`,
      'blocked',
    ])
    expect(existsSync(wt)).toBe(true)
    expect(calls(o).some((c) => /^(terminal close|worktree rm)/.test(c))).toBe(false)
  })
})

describe('orca adapter: repositories', () => {
  test('repositories from orca repo list are swept without being named, git ones that exist only', () => {
    const fx = fixture()
    const other = fixture()
    const o = orca({
      repos: reposJson([
        { path: other.root, kind: 'git' },
        { path: other.root, kind: 'git' },
        { path: join(fx.root, 'no-such'), kind: 'git' },
        { path: '/Users/x/folder', kind: 'folder' },
      ]),
    })
    const swept = hostSweep([fx.root], { cwd: fx.root, adapters: [adapterOver(o)] })
    expect(swept.repo.repos.map((r) => r.path).sort()).toEqual([fx.root, other.root].sort())
  })

  test('with no targets, the current directory is still swept beside the discovered repositories', () => {
    const fx = fixture()
    const other = fixture()
    const o = orca({ repos: reposJson([{ path: other.root, kind: 'git' }]) })
    const swept = hostSweep([], { cwd: fx.root, adapters: [adapterOver(o)] })
    expect(swept.repo.repos.map((r) => r.path).sort()).toEqual([fx.root, other.root].sort())
  })

  test('discovery is off when the caller names its own targets', () => {
    const fx = fixture()
    const other = fixture()
    const o = orca({ repos: reposJson([{ path: other.root, kind: 'git' }]) })
    const swept = hostSweep([fx.root], {
      cwd: fx.root,
      adapters: [adapterOver(o)],
      discover: false,
    })
    expect(swept.repo.repos.map((r) => r.path)).toEqual([fx.root])
    expect(calls(o).some((c) => c.startsWith('repo list'))).toBe(false)
  })

  test('an unreachable Orca discovers nothing', () => {
    const fx = fixture()
    const o = orca({ down: true })
    const swept = hostSweep([fx.root], { cwd: fx.root, adapters: [adapterOver(o)] })
    expect(swept.repo.repos.map((r) => r.path)).toEqual([fx.root])
  })
})
