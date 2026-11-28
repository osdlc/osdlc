/** The core's refusal of candidates in, or holding, a folder where a coding agent keeps its worktrees. */

import { mkdirSync, renameSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import {
  AGENT_WORKTREE,
  DEFAULT_AGENT_FOLDERS,
  agentFoldersOf,
  clean,
  plan,
  survey,
  type Candidate,
  type Plugin,
  type RunCtx,
} from '../src/index.ts'
import { tempHome } from '../src/testing.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

/** A temporary home, with `dev`, a target, in it. */
function setUp() {
  const t = tempHome('host-cleaner-agent-folders-')
  cleanups.push(t.cleanup)
  const dev = join(t.home, 'dev')
  mkdirSync(dev)
  const ctx = (over: Partial<RunCtx> = {}): RunCtx => ({
    cwd: dev,
    targets: [dev],
    allow: [],
    home: t.home,
    ...over,
  })
  return { home: t.home, dev, ctx }
}

const at = (path: string, kind = 'artifact'): Candidate => ({
  id: `${kind}:${path}`,
  kind,
  owner: 'fake',
  why: 'idle',
  path,
  evidence: {},
})

/** A plugin named `fake` that proposes `items` and deletes nothing but notes it, calling `onDelete`. */
const fake = (items: Candidate[], onDelete: (c: Candidate) => void = () => {}): Plugin => ({
  name: 'fake',
  detect: () => true,
  discover: () => items,
  delete: (c) => {
    onDelete(c)
    return `removed ${c.id}`
  },
})

const refusals = async (items: Candidate[], ctx: RunCtx) =>
  (await survey([fake(items)], ctx)).objections.filter((o) => o.code === AGENT_WORKTREE)

describe('agent folders', () => {
  test('the defaults are Cursor’s and the Codex app’s worktree folders, under the run’s home', () => {
    expect(DEFAULT_AGENT_FOLDERS).toEqual(['~/.cursor/worktrees', '~/.codex/worktrees'])
    const { home, ctx } = setUp()
    expect(agentFoldersOf(ctx({ agentFolders: ['/srv/agents'] }))).toEqual([
      join(home, '.cursor', 'worktrees'),
      join(home, '.codex', 'worktrees'),
      '/srv/agents',
    ])
  })

  test('a candidate in a configured folder is refused, whatever plugin found it', async () => {
    const { dev, ctx } = setUp()
    const agents = join(dev, 'agents')
    const inside = join(agents, 'wt', 'node_modules')
    mkdirSync(inside, { recursive: true })
    expect(await refusals([at(inside)], ctx({ agentFolders: [agents] }))).toEqual([
      {
        by: 'host-cleaner',
        candidate: `artifact:${inside}`,
        level: 'refuse',
        code: AGENT_WORKTREE,
        reason: `it is in ${agents}, where a coding agent keeps its worktrees`,
      },
    ])
    // Not without the folder in the list.
    expect(await refusals([at(inside)], ctx())).toEqual([])
  })

  test('a candidate in a default folder is refused with no config', async () => {
    const { home, ctx } = setUp()
    const codex = join(home, '.codex', 'worktrees', 'a1b2', 'repo')
    const cursor = join(home, '.cursor', 'worktrees', 'repo', 'k3x')
    for (const d of [codex, cursor]) mkdirSync(d, { recursive: true })
    const found = await refusals([at(codex, 'worktree'), at(cursor, 'worktree')], ctx())
    expect(found.map((o) => [o.candidate, o.reason])).toEqual([
      [
        `worktree:${codex}`,
        `it is in ${join(home, '.codex', 'worktrees')}, where a coding agent keeps its worktrees`,
      ],
      [
        `worktree:${cursor}`,
        `it is in ${join(home, '.cursor', 'worktrees')}, where a coding agent keeps its worktrees`,
      ],
    ])
  })

  test('a candidate that holds an agent folder is refused, as deleting it takes the folder', async () => {
    const { home, ctx } = setUp()
    const dot = join(home, '.cursor')
    mkdirSync(join(dot, 'worktrees'), { recursive: true })
    expect(await refusals([at(dot)], ctx())).toEqual([
      expect.objectContaining({
        candidate: `artifact:${dot}`,
        reason: `it holds ${join(dot, 'worktrees')}, where a coding agent keeps its worktrees`,
      }),
    ])
  })

  test('a ref whose checkout is in an agent folder is refused', async () => {
    const { dev, ctx } = setUp()
    const agents = join(dev, 'agents')
    const ref: Candidate = {
      id: 'branch:x',
      kind: 'branch',
      owner: 'fake',
      why: 'merged',
      ref: 'x',
      at: join(agents, 'repo'),
      evidence: {},
    }
    expect(await refusals([ref], ctx({ agentFolders: [agents] }))).toEqual([
      expect.objectContaining({ candidate: 'branch:x', code: AGENT_WORKTREE }),
    ])
  })

  test('a candidate outside every agent folder is unaffected, beside one included', async () => {
    const { home, dev, ctx } = setUp()
    const agents = join(dev, 'agents')
    const beside = join(dev, 'agents-old', 'wt')
    const elsewhere = join(dev, 'repo', 'node_modules')
    const codexOther = join(home, '.codex', 'sessions')
    for (const d of [agents, beside, elsewhere, codexOther]) mkdirSync(d, { recursive: true })
    const s = await survey(
      [fake([at(beside), at(elsewhere), at(codexOther)])],
      ctx({ agentFolders: [agents] }),
    )
    expect(s.candidates).toHaveLength(3)
    expect(s.objections.filter((o) => o.code === AGENT_WORKTREE)).toEqual([])
  })

  test('a candidate a link puts in an agent folder is refused, by its real path', async () => {
    const { dev, ctx } = setUp()
    const agents = join(dev, 'agents')
    const wt = join(agents, 'wt')
    mkdirSync(wt, { recursive: true })
    const link = join(dev, 'link')
    symlinkSync(wt, link)
    expect(await refusals([at(join(link, 'gone'))], ctx({ agentFolders: [agents] }))).toEqual([
      expect.objectContaining({ candidate: `artifact:${join(link, 'gone')}` }),
    ])
  })

  test('clean refuses, before any prepare, a candidate that a link put in an agent folder after the survey', async () => {
    const { dev, ctx } = setUp()
    const agents = join(dev, 'agents')
    mkdirSync(join(agents, 'wt'), { recursive: true })
    const first = join(dev, 'first')
    const parent = join(dev, 'b')
    const second = join(parent, 'wt')
    for (const d of [first, second]) mkdirSync(d, { recursive: true })
    const deleted: string[] = []
    let prepared = 0
    // Deleting the first moves the second's folder aside and links its parent into the agents' folder.
    const plugin: Plugin = {
      ...fake([at(first), at(second)], (c) => {
        deleted.push(c.id)
        if (c.path === first) {
          renameSync(parent, join(dev, 'b-moved'))
          symlinkSync(agents, parent)
        }
      }),
      prepare: (c) => {
        if (c.path === second) prepared += 1
      },
    }
    const run = ctx({ agentFolders: [agents] })
    const s = await survey([plugin], run)
    expect(s.objections).toEqual([])
    const receipt = await clean(plan(s), [plugin], run)
    expect(deleted).toEqual([`artifact:${first}`])
    expect(prepared).toBe(0)
    expect(receipt.steps.find((x) => x.id === `artifact:${second}`)).toMatchObject({
      result: 'failed',
      error: `it is in ${agents}, where a coding agent keeps its worktrees`,
    })
  })
})
