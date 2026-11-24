/** The `orca` plugin over a fake `orca` CLI shaped like the recorded `--json` output, with the real `git` plugin beside it. */

import { afterEach, describe, expect, test } from 'vitest'
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { fakeRunner } from '@osdlc/command-seam/testing'
import { Git } from '@osdlc/typed-git'
import { IDENTITY, makeBareAndWorker } from '@osdlc/typed-git/testing'

import {
  CLOSE_TERMINALS,
  clean,
  gitPlugin,
  orcaPlugin,
  plan,
  survey,
  type Ctx,
  type Survey,
} from '../src/index.ts'
import { parseRecords } from '../src/orca.ts'
import { contractSuite, fakeContext } from '../src/testing.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

const sh = (cwd: string, args: string[]): string =>
  new Git(cwd, { env: { ...IDENTITY } }).rawChecked(args).stdout.trim()

const idle = { alive: () => false, holders: () => [] }

interface Row {
  path: string
  terminals?: number
  unverifiable?: number
  agents?: string[]
  status?: string
  main?: boolean
}

/** An Orca that lists `rows`, as `orca worktree ps --json` does, and records every call. */
function fakeOrca(
  rows: Row[],
  over: {
    running?: boolean
    failPs?: boolean
    truncated?: boolean
    failRm?: boolean
    repos?: string[]
  } = {},
) {
  const live = [...rows]
  const closed: string[] = []
  const removed: string[] = []
  const ok = (result: unknown) => ({ stdout: JSON.stringify({ id: 'x', ok: true, result }) })
  const fake = fakeRunner((argv) => {
    const [a, b] = argv
    if (a === 'status') return ok({ runtime: { reachable: over.running !== false } })
    if (a === 'repo')
      return ok({ repos: (over.repos ?? []).map((path) => ({ path, kind: 'git' })) })
    if (a === 'worktree' && b === 'ps') {
      if (over.failPs === true) return { exitCode: 1, stderr: 'runtime_unavailable' }
      return ok({
        truncated: over.truncated === true,
        worktrees: live.map((r) => ({
          workspaceKind: 'git',
          worktreeId: `repo1::${r.path}`,
          path: r.path,
          displayName: r.path.split('/').at(-1),
          isMainWorktree: r.main ?? false,
          liveTerminalCount: r.terminals ?? 0,
          unverifiableTerminalCount: r.unverifiable ?? 0,
          status: r.status ?? 'inactive',
          agents: (r.agents ?? []).map((state) => ({ state, agentType: 'claude' })),
        })),
      })
    }
    if (a === 'terminal' && b === 'close') {
      closed.push(argv[argv.indexOf('--worktree') + 1]!)
      return ok({})
    }
    if (a === 'worktree' && b === 'rm') {
      if (over.failRm === true) return { exitCode: 1, stderr: 'archive hook failed' }
      const id = argv[argv.indexOf('--worktree') + 1]!
      removed.push(id)
      const i = live.findIndex((r) => `id:repo1::${r.path}` === id)
      if (i >= 0) live.splice(i, 1)
      return ok({ removed: true })
    }
    return undefined
  })
  const calls = () => fake.calls.map((c) => c.argv.slice(0, 2).join(' '))
  return { orca: fake.runner, closed, removed, calls }
}

/** A repository whose `wt-branch` is merged and checked out in a clean worktree. */
function fixture() {
  const pair = makeBareAndWorker()
  cleanups.push(pair.cleanup)
  const root = pair.worker.dir
  sh(root, ['commit', '--allow-empty', '-m', 'initial'])
  sh(root, ['push', '-q', '-u', 'origin', 'main'])
  const worktree = join(pair.parent, 'wt-a')
  sh(root, ['worktree', 'add', '-q', '-b', 'wt-branch', worktree, 'main'])
  sh(worktree, ['commit', '--allow-empty', '-m', 'feat'])
  sh(root, ['merge', '-q', '--no-ff', '-m', 'Merge wt-branch', 'wt-branch'])
  sh(root, ['push', '-q', 'origin', 'main'])
  const ctx: Ctx = fakeContext({ cwd: root, targets: [root] })
  const git = gitPlugin({ probe: idle, sweep: { remotes: [''], offline: true, provider: 'none' } })
  return { root, worktree: realpathSync(worktree), ctx, git }
}

const withOrca = (rows: (wt: string) => Row[], over?: Parameters<typeof fakeOrca>[1]) => {
  const fx = fixture()
  const orca = fakeOrca(rows(fx.worktree), over)
  const plugin = orcaPlugin({ orca: orca.orca })
  return { fx, orca, plugin, plugins: [fx.git, plugin] }
}

const objections = (s: Survey, by = 'orca') =>
  s.objections.filter((o) => o.by === by).map((o) => [o.level, o.code])

describe('detection and scope', () => {
  const ctx: Ctx = fakeContext({ cwd: tmpdir(), targets: [] })

  test('an orca CLI that cannot answer `status` makes detect throw, which a survey reports as a warning', async () => {
    const none = fakeRunner(() => undefined)
    const s = await survey([orcaPlugin({ orca: none.runner })], ctx)
    expect(s.plugins).toEqual([])
    expect(s.warnings).toEqual([expect.stringContaining('orca status failed')])
  })

  test('installed but not running: detect throws a note, and a survey carries it as a warning without failing', async () => {
    const o = fakeOrca([], { running: false })
    const s = await survey([orcaPlugin({ orca: o.orca })], ctx)
    expect(s.plugins).toEqual([])
    expect(s.warnings).toEqual([expect.stringContaining('Orca is installed but not running')])
  })

  test('running: active, and scope names the repositories Orca lists that exist', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'orca-scope-')))
    const o = fakeOrca([], { repos: [dir, '/nonexistent/repo'] })
    const plugin = orcaPlugin({ orca: o.orca })
    expect(plugin.detect(ctx)).toBe(true)
    expect(plugin.scope!(ctx)).toEqual([dir])
    expect(orcaPlugin({ orca: o.orca, repos: false }).scope!(ctx)).toEqual([])
  })

  test('with no runner given, the CLI is found on the PATH in `env` and run with that env', () => {
    const bin = realpathSync(mkdtempSync(join(tmpdir(), 'orca-env-')))
    cleanups.push(() => rmSync(bin, { recursive: true, force: true }))
    // Answers as a running Orca only when it sees the variable from `env`.
    const script = [
      '#!/bin/sh',
      'if [ "$ORCA_ENV_MARK" = seen ]; then',
      `  echo '${JSON.stringify({ ok: true, result: { runtime: { reachable: true } } })}'`,
      'else',
      `  echo '${JSON.stringify({ ok: false, error: { message: 'no mark' } })}'`,
      'fi',
    ].join('\n')
    writeFileSync(join(bin, 'orca'), `${script}\n`, { mode: 0o755 })
    const plugin = orcaPlugin({ env: { PATH: bin, ORCA_ENV_MARK: 'seen' } })
    expect(plugin.detect(ctx)).toBe(true)
  })
})

describe('objections to the git plugin worktrees', () => {
  test('a worktree Orca lists with nothing open gets a note only', async () => {
    const { fx, plugins } = withOrca((wt) => [{ path: wt }])
    const s = await survey(plugins, fx.ctx)
    expect(objections(s)).toEqual([['note', 'orca-managed']])
  })

  test('a worktree Orca does not list gets no objection, and git removes it as before', async () => {
    const { fx, orca, plugins } = withOrca(() => [{ path: '/elsewhere/other' }])
    const s = await survey(plugins, fx.ctx)
    expect(objections(s)).toEqual([])
    const receipt = await clean(plan(s, { select: [`worktree:${fx.worktree}`] }), plugins, fx.ctx)
    expect(receipt.steps[0]).toMatchObject({ result: 'ok' })
    expect(orca.closed).toEqual([])
    expect(orca.removed).toEqual([])
  })

  test('open terminals protest close-terminals; an agent at work or an uninspectable terminal refuses', async () => {
    const t = withOrca((wt) => [{ path: wt, terminals: 2 }])
    expect(objections(await survey(t.plugins, t.fx.ctx))).toContainEqual([
      'protest',
      CLOSE_TERMINALS,
    ])

    const a = withOrca((wt) => [{ path: wt, terminals: 1, agents: ['working'], status: 'working' }])
    expect(objections(await survey(a.plugins, a.fx.ctx))).toContainEqual([
      'refuse',
      'orca-agent-active',
    ])

    const q = withOrca((wt) => [{ path: wt, agents: ['done'] }])
    expect(objections(await survey(q.plugins, q.fx.ctx))).toEqual([['note', 'orca-managed']])

    const u = withOrca((wt) => [{ path: wt, unverifiable: 1 }])
    expect(objections(await survey(u.plugins, u.fx.ctx))).toContainEqual([
      'refuse',
      'orca-terminal-unverifiable',
    ])
  })

  test('an agent state Orca reports that is not known to be quiet counts as at work', async () => {
    const { fx, plugins } = withOrca((wt) => [{ path: wt, agents: ['waiting'] }])
    expect(objections(await survey(plugins, fx.ctx))).toContainEqual([
      'refuse',
      'orca-agent-active',
    ])
  })

  test("a truncated listing refuses, since a worktree past the cap would read as not Orca's", async () => {
    const { fx, plugins } = withOrca((wt) => [{ path: wt }], { truncated: true })
    expect(objections(await survey(plugins, fx.ctx))).toEqual([['refuse', 'orca-unreachable']])
  })

  test('a worktree status that is not known to be quiet counts as at work', async () => {
    const { fx, plugins } = withOrca((wt) => [{ path: wt, status: 'permission' }])
    expect(objections(await survey(plugins, fx.ctx))).toContainEqual([
      'refuse',
      'orca-agent-active',
    ])
  })

  test('when Orca cannot be read after detection, git worktrees are refused', async () => {
    const { fx, plugins } = withOrca((wt) => [{ path: wt }], { failPs: true })
    const s = await survey(plugins, fx.ctx)
    expect(objections(s)).toEqual([['refuse', 'orca-unreachable']])
  })
})

describe('cleaning', () => {
  test('closes the terminals, lets git remove the worktree, then has Orca forget the record', async () => {
    const { fx, orca, plugins } = withOrca((wt) => [{ path: wt, terminals: 2 }])
    const id = `worktree:${fx.worktree}`
    const p = plan(await survey(plugins, fx.ctx), { select: [id], allow: [CLOSE_TERMINALS] })
    const receipt = await clean(p, plugins, { ...fx.ctx, allow: [CLOSE_TERMINALS] })
    expect(receipt.steps[0]).toMatchObject({
      id,
      result: 'ok',
      preparedBy: expect.arrayContaining(['orca']),
    })
    expect(receipt.steps[0]!.notified).toContainEqual({ plugin: 'orca', error: null })
    expect(existsSync(fx.worktree)).toBe(false)
    expect(orca.calls().filter((c) => c.startsWith('terminal') || c.includes('rm'))).toEqual([
      'terminal close',
      'worktree rm',
    ])
    expect(orca.closed).toEqual([`id:repo1::${fx.worktree}`])
    expect(orca.removed).toEqual([`id:repo1::${fx.worktree}`])
  })

  test('open terminals are not closed unless close-terminals is granted', async () => {
    const { fx, orca, plugins } = withOrca((wt) => [{ path: wt, terminals: 1 }])
    const id = `worktree:${fx.worktree}`
    const receipt = await clean(
      plan(await survey(plugins, fx.ctx), { select: [id] }),
      plugins,
      fx.ctx,
    )
    expect(receipt.dropped[0]).toMatchObject({ reason: 'not-allowed' })
    expect(existsSync(fx.worktree)).toBe(true)
    expect(orca.closed).toEqual([])
  })

  test('an agent that starts after the plan stops the worktree before git touches it', async () => {
    const { fx, plugins } = withOrca((wt) => [{ path: wt }])
    const id = `worktree:${fx.worktree}`
    const p = plan(await survey(plugins, fx.ctx), { select: [id] })
    const busy = fakeOrca([{ path: fx.worktree, agents: ['working'] }])
    const receipt = await clean(p, [fx.git, orcaPlugin({ orca: busy.orca })], fx.ctx)
    expect(receipt.steps).toEqual([])
    expect(receipt.dropped[0]).toMatchObject({ id, reason: 'blocked' })
    expect(existsSync(fx.worktree)).toBe(true)
    expect(busy.removed).toEqual([])
  })

  test('a failed forget is recorded in the receipt and does not undo the removal', async () => {
    const { fx, plugins } = withOrca((wt) => [{ path: wt }], { failRm: true })
    const id = `worktree:${fx.worktree}`
    const receipt = await clean(
      plan(await survey(plugins, fx.ctx), { select: [id] }),
      plugins,
      fx.ctx,
    )
    expect(receipt.steps[0]).toMatchObject({ result: 'ok' })
    expect(receipt.steps[0]!.notified[0]!.error).toMatch(/archive hook failed/)
    expect(existsSync(fx.worktree)).toBe(false)
  })

  test('never asks Orca to remove a record whose directory still exists', async () => {
    const fx = fixture()
    const orca = fakeOrca([{ path: fx.worktree }])
    const plugin = orcaPlugin({ orca: orca.orca })
    const c = (await survey([fx.git], fx.ctx)).candidates.find(
      (x) => x.id === `worktree:${fx.worktree}`,
    )!
    plugin.prepare!(c, fx.ctx)
    expect(() => plugin.deleted!(c, fx.ctx)).toThrow(/still exists/)
    expect(orca.removed).toEqual([])
  })
})

describe('records whose directory is gone', () => {
  test('the plugin keeps the contract over them', async () => {
    const gone = join(tmpdir(), 'orca-gone-worktree')
    const o = fakeOrca([{ path: gone }, { path: tmpdir(), main: true }])
    expect(await contractSuite(orcaPlugin({ orca: o.orca }), { cwd: tmpdir() })).toEqual([])
    expect(o.removed).toEqual([])
  })

  test('are their own ref candidates, held for a pick, and deleted through orca worktree rm', async () => {
    const gone = join(tmpdir(), 'orca-gone-worktree')
    const o = fakeOrca([{ path: gone }, { path: tmpdir(), main: true }])
    const plugin = orcaPlugin({ orca: o.orca })
    const ctx: Ctx = fakeContext({ cwd: tmpdir(), targets: [] })
    const s = await survey([plugin], ctx)
    expect(s.candidates.map((c) => [c.id, c.kind, c.held, c.ref, c.at, c.path])).toEqual([
      [`orca-record:${gone}`, 'orca-record', true, `repo1::${gone}`, gone, undefined],
    ])
    // A ref has no folder for the core to check, so no target holds it and none needs to.
    expect(s.objections).toEqual([])
    const receipt = await clean(plan(s, { pick: [`orca-record:${gone}`] }), [plugin], ctx)
    expect(receipt.steps[0]).toMatchObject({ result: 'ok' })
    expect(o.removed).toEqual([`id:repo1::${gone}`])
  })
})

describe('parseRecords', () => {
  test('keeps git workspaces with a path and an id, and reads counts and agent states', () => {
    const rows = parseRecords({
      worktrees: [
        { workspaceKind: 'folder', worktreeId: 'f', path: '/f' },
        { worktreeId: 'r::/a', path: '/a', liveTerminalCount: 3, agents: [{ state: 'idle' }, {}] },
        { path: '/no-id' },
        'junk',
      ],
    })
    expect(rows).toEqual([
      expect.objectContaining({
        id: 'r::/a',
        path: '/a',
        terminals: 3,
        agents: ['idle', 'unknown'],
      }),
    ])
    expect(parseRecords(null)).toEqual([])
  })
})
