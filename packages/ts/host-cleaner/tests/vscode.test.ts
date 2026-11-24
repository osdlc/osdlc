/** The `vscode` plugin against VS Code storage folders laid out in a temporary home. */

import { afterEach, describe, expect, test } from 'vitest'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import type { ProcessProbe } from '@osdlc/repo-cleaner'

import {
  IN_USE,
  UNKNOWN_WORKSPACE,
  clean,
  plan,
  survey,
  vscodePlugin,
  type Candidate,
  type Plugin,
  type RunCtx,
  type VscodeOptions,
} from '../src/index.ts'
import { contractSuite, fakeContext, tempHome } from '../src/testing.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

/** A process and the folder it works in. */
interface Proc {
  pid: number
  command: string
  cwd: string
}

/** A process table of `procs`, or one that cannot be read. */
const probeOf = (procs: Proc[] | Error = []): ProcessProbe => ({
  alive: () => true,
  holders: (path) => {
    if (procs instanceof Error) throw procs
    return procs
      .filter((p) => p.cwd === path || p.cwd.startsWith(path.endsWith('/') ? path : `${path}/`))
      .map(({ pid, command }) => ({ pid, command }))
  },
})

/** VS Code's main process, running somewhere unrelated. */
const CODE: Proc = { pid: 10, command: 'Code', cwd: '/' }

/** A temporary home with VS Code's macOS layout and a folder for projects. */
function home() {
  const t = tempHome('host-cleaner-vscode-')
  cleanups.push(t.cleanup)
  const user = join(t.home, 'Library', 'Application Support', 'Code', 'User')
  const storage = join(user, 'workspaceStorage')
  const projects = join(t.home, 'dev')
  mkdirSync(storage, { recursive: true })
  mkdirSync(projects)
  const options = (over: VscodeOptions = {}): VscodeOptions => ({
    env: t.env,
    platform: 'darwin',
    probe: probeOf(),
    ...over,
  })
  return { home: t.home, user, storage, projects, options }
}

/** A storage folder `hash` with a `workspace.json` of `body` (a string as it is, else as JSON; none when undefined). */
function store(storage: string, hash: string, body?: unknown): string {
  const dir = join(storage, hash)
  mkdirSync(dir)
  writeFileSync(join(dir, 'state.vscdb'), 'x'.repeat(100))
  if (body !== undefined) {
    writeFileSync(
      join(dir, 'workspace.json'),
      typeof body === 'string' ? body : JSON.stringify(body),
    )
  }
  return dir
}

const folder = (path: string) => ({ folder: pathToFileURL(path).href })

/** A folder `name` in the storage folder `dir`, with one file in it unless `empty`. */
function history(dir: string, name: string, empty = false): void {
  mkdirSync(join(dir, name), { recursive: true })
  if (!empty) writeFileSync(join(dir, name, 'f2c4.jsonl'), '{"kind":0}\n')
}

/** VS Code's window state naming `paths` as open windows. */
function windows(user: string, paths: string[]): void {
  mkdirSync(join(user, 'globalStorage'), { recursive: true })
  const [first, ...rest] = paths.map((p) => ({ folder: pathToFileURL(p).href }))
  writeFileSync(
    join(user, 'globalStorage', 'storage.json'),
    JSON.stringify({ windowsState: { lastActiveWindow: first, openedWindows: rest } }),
  )
}

const ctxOf = (cwd: string): RunCtx => ({ cwd, targets: [], allow: [] })

/** `plugin.delete` on `c`, as a promise whether it answers now or later. */
const deleting = async (plugin: Plugin, c: Candidate, cwd: string): Promise<string> =>
  plugin.delete!(c, fakeContext({ cwd }))

const worktree = (path: string): Candidate => ({
  id: `worktree:${path}`,
  kind: 'worktree',
  owner: 'git',
  why: 'merged',
  path,
  evidence: {},
})

describe('discover', () => {
  test('a fixture with one live and one dead workspace proposes only the dead one', async () => {
    const h = home()
    mkdirSync(join(h.projects, 'live'))
    store(h.storage, 'aaa', folder(join(h.projects, 'live')))
    const dead = store(h.storage, 'bbb', folder(join(h.projects, 'dead')))

    const s = await survey([vscodePlugin(h.options())], ctxOf(h.home))
    expect(s.warnings).toEqual([])
    expect(s.candidates).toEqual([
      expect.objectContaining({
        id: `workspace-storage:${dead}`,
        kind: 'workspace-storage',
        owner: 'vscode',
        path: dead,
        costDescription: 're-download',
        why: `VS Code kept state for ${join(h.projects, 'dead')}, which no longer exists`,
        evidence: {
          kind: 'workspace-storage',
          path: dead,
          workspace: pathToFileURL(join(h.projects, 'dead')).href,
        },
      }),
    ])
    expect(s.candidates[0]!.bytes).toBeGreaterThan(0)
    expect(s.candidates[0]!.held).toBeUndefined()
    expect(s.objections).toEqual([])
    expect(s.roots).toEqual({ vscode: [h.storage] })
  })

  test('a workspace file that is gone is dead; a remote, an empty window, a link and an unmounted volume are left alone', async () => {
    const h = home()
    const outside = tempHome('host-cleaner-vscode-out-')
    cleanups.push(outside.cleanup)
    writeFileSync(join(h.projects, 'here.code-workspace'), '{}')
    store(h.storage, 'a', {
      workspace: pathToFileURL(join(h.projects, 'here.code-workspace')).href,
    })
    const goneFile = store(h.storage, 'b', {
      workspace: pathToFileURL(join(h.projects, 'gone.code-workspace')).href,
    })
    store(h.storage, 'c', { folder: 'vscode-remote://ssh-remote+box/home/me/gone' })
    store(h.storage, '1795403335582')
    mkdirSync(join(outside.home, 'linked'))
    writeFileSync(
      join(outside.home, 'linked', 'workspace.json'),
      JSON.stringify(folder(join(h.projects, 'gone'))),
    )
    symlinkSync(join(outside.home, 'linked'), join(h.storage, 'd'))
    store(h.storage, 'e', folder('/Volumes/host-cleaner-no-such-disk/project'))

    const s = await survey([vscodePlugin(h.options())], ctxOf(h.home))
    expect(s.warnings).toEqual([])
    expect(s.candidates.map((c) => c.path)).toEqual([goneFile])
  })

  test('a workspace.json of an unknown shape is proposed and refused, never guessed at', async () => {
    const h = home()
    const shapes: Array<[string, unknown, string]> = [
      ['a', 'not json', 'workspace.json is not JSON'],
      ['b', ['file:///x'], 'workspace.json is not an object'],
      [
        'c',
        { configuration: 'file:///x' },
        'workspace.json names neither a folder nor a workspace',
      ],
      [
        'd',
        { folder: 'file:///x', workspace: 'file:///y' },
        'workspace.json names both a folder and a workspace',
      ],
      ['e', { folder: 7 }, "workspace.json's folder is not a string"],
      ['f', { folder: 'not a uri' }, "workspace.json's folder is not a local file URI"],
    ]
    for (const [hash, body] of shapes) store(h.storage, hash, body)

    const s = await survey([vscodePlugin(h.options())], ctxOf(h.home))
    expect(s.warnings).toEqual([])
    expect(s.candidates.map((c) => [c.path, c.held])).toEqual(
      shapes.map(([hash]) => [join(h.storage, hash), true]),
    )
    expect(s.objections.map((o) => [o.candidate, o.level, o.code, o.reason])).toEqual(
      shapes.map(([hash, , problem]) => [
        `workspace-storage:${join(h.storage, hash)}`,
        'refuse',
        UNKNOWN_WORKSPACE,
        problem,
      ]),
    )
  })

  test('on Linux it reads ~/.config/Code, and on other systems it stays out of the run', async () => {
    const h = home()
    const storage = join(h.home, '.config', 'Code', 'User', 'workspaceStorage')
    mkdirSync(storage, { recursive: true })
    const dead = store(storage, 'a', folder(join(h.projects, 'dead')))

    const linux = await survey([vscodePlugin(h.options({ platform: 'linux' }))], ctxOf(h.home))
    expect(linux.candidates.map((c) => c.path)).toEqual([dead])
    const windows = await survey([vscodePlugin(h.options({ platform: 'win32' }))], ctxOf(h.home))
    expect(windows.plugins).toEqual([])
  })

  test('without a workspaceStorage folder it is not detected', async () => {
    const t = tempHome()
    cleanups.push(t.cleanup)
    const s = await survey(
      [vscodePlugin({ env: t.env, platform: 'darwin', probe: probeOf() })],
      ctxOf(t.home),
    )
    expect(s.plugins).toEqual([])
  })
})

describe('chat and agent history', () => {
  test('a dead workspace with chats is lost: held, and run only when picked with discard-user-data', async () => {
    const h = home()
    const dead = store(h.storage, 'bbb', folder(join(h.projects, 'dead')))
    history(dead, 'chatSessions')
    const id = `workspace-storage:${dead}`
    const plugin = vscodePlugin(h.options())

    const s = await survey([plugin], ctxOf(h.home))
    expect(s.warnings).toEqual([])
    expect(s.candidates).toEqual([
      expect.objectContaining({
        id,
        costDescription: 'lost',
        held: true,
        why: `VS Code kept state for ${join(h.projects, 'dead')}, which no longer exists, with chat or agent history in chatSessions`,
        evidence: expect.objectContaining({ history: ['chatSessions'] }),
      }),
    ])
    expect(s.objections).toEqual([
      expect.objectContaining({
        by: 'host-cleaner',
        candidate: id,
        level: 'protest',
        code: 'discard-user-data',
      }),
    ])

    const kept = await clean(plan(s), [plugin], ctxOf(h.home))
    expect(kept.steps).toEqual([])
    expect(existsSync(dead)).toBe(true)
    const picked = await clean(plan(s, { pick: [id], allow: ['discard-user-data'] }), [plugin], {
      ...ctxOf(h.home),
      allow: ['discard-user-data'],
    })
    expect(picked.steps).toEqual([expect.objectContaining({ id, result: 'ok' })])
    expect(existsSync(dead)).toBe(false)
  })

  test('agent edits, Copilot transcripts and memories are history too; an empty chatSessions is not', async () => {
    const h = home()
    const shapes: Array<[string, string[], boolean]> = [
      ['a', ['chatEditingSessions'], false],
      ['b', ['GitHub.copilot-chat/transcripts'], false],
      ['c', ['GitHub.copilot-chat/memory-tool/memories'], false],
      ['d', ['chatSessions', 'chatEditingSessions'], false],
      ['e', ['chatSessions'], true],
      ['f', ['GitHub.copilot-chat/chat-session-resources'], false],
    ]
    for (const [hash, names, empty] of shapes) {
      const dir = store(h.storage, hash, folder(join(h.projects, `dead-${hash}`)))
      for (const name of names) history(dir, name, empty)
    }

    const s = await survey([vscodePlugin(h.options())], ctxOf(h.home))
    expect(s.candidates.map((c) => [c.path, c.costDescription, c.evidence.history])).toEqual([
      [join(h.storage, 'a'), 'lost', ['chatEditingSessions']],
      [join(h.storage, 'b'), 'lost', ['GitHub.copilot-chat/transcripts']],
      [join(h.storage, 'c'), 'lost', ['GitHub.copilot-chat/memory-tool/memories']],
      [join(h.storage, 'd'), 'lost', ['chatSessions', 'chatEditingSessions']],
      [join(h.storage, 'e'), 're-download', undefined],
      [join(h.storage, 'f'), 're-download', undefined],
    ])
  })

  test('delete refuses a storage folder planned as re-download that now holds chats', async () => {
    const h = home()
    const dead = store(h.storage, 'bbb', folder(join(h.projects, 'dead')))
    const plugin = vscodePlugin(h.options())
    const c = (await survey([plugin], ctxOf(h.home))).candidates[0]!
    expect(c.costDescription).toBe('re-download')
    history(dead, 'chatSessions')
    await expect(deleting(plugin, c, h.home)).rejects.toThrow(
      /now holds chat or agent history \(chatSessions\)/,
    )
    expect(existsSync(join(dead, 'chatSessions'))).toBe(true)
  })
})

describe('the contract suite', () => {
  test('vscode keeps the contract', async () => {
    const h = home()
    mkdirSync(join(h.projects, 'live'))
    store(h.storage, 'aaa', folder(join(h.projects, 'live')))
    const dead = store(h.storage, 'bbb', folder(join(h.projects, 'dead')))
    expect(await contractSuite(vscodePlugin(h.options()), { cwd: h.home })).toEqual([])
    expect(existsSync(join(dead, 'state.vscdb'))).toBe(true)
  })
})

describe('clean', () => {
  test('removes the dead workspace’s storage and keeps the live one', async () => {
    const h = home()
    mkdirSync(join(h.projects, 'live'))
    const live = store(h.storage, 'aaa', folder(join(h.projects, 'live')))
    const dead = store(h.storage, 'bbb', folder(join(h.projects, 'dead')))
    const plugin = vscodePlugin(h.options())
    const receipt = await clean(
      plan(await survey([plugin], ctxOf(h.home))),
      [plugin],
      ctxOf(h.home),
    )
    expect(receipt.status).toBe('complete')
    expect(receipt.steps).toEqual([
      expect.objectContaining({ id: `workspace-storage:${dead}`, result: 'ok' }),
    ])
    expect(existsSync(dead)).toBe(false)
    expect(existsSync(live)).toBe(true)
  })

  test('a workspace that is back by the clean is left alone', async () => {
    const h = home()
    const dead = store(h.storage, 'bbb', folder(join(h.projects, 'dead')))
    const plugin = vscodePlugin(h.options())
    const planned = plan(await survey([plugin], ctxOf(h.home)))
    mkdirSync(join(h.projects, 'dead'))
    const receipt = await clean(planned, [plugin], ctxOf(h.home))
    expect(receipt.steps).toEqual([])
    expect(existsSync(dead)).toBe(true)
  })
})

describe('delete', () => {
  test('refuses a storage folder that now leads outside, and leaves what it leads to', async () => {
    const h = home()
    const dead = store(h.storage, 'bbb', folder(join(h.projects, 'dead')))
    const plugin = vscodePlugin(h.options())
    const s = await survey([plugin], ctxOf(h.home))
    const c = s.candidates[0]!

    const outside = tempHome('host-cleaner-vscode-out-')
    cleanups.push(outside.cleanup)
    const moved = join(outside.home, 'moved')
    renameSync(dead, moved)
    symlinkSync(moved, dead)
    await expect(deleting(plugin, c, h.home)).rejects.toThrow(
      /is no longer storage for a workspace that is gone/,
    )
    expect(readdirSync(moved).sort()).toEqual(['state.vscdb', 'workspace.json'])
  })

  test('refuses a path that is not in workspaceStorage', async () => {
    const h = home()
    store(h.storage, 'bbb', folder(join(h.projects, 'dead')))
    const plugin = vscodePlugin(h.options())
    const s = await survey([plugin], ctxOf(h.home))
    const elsewhere = store(h.projects, 'x', folder(join(h.projects, 'dead')))
    const c = { ...s.candidates[0]!, path: elsewhere } as Candidate
    await expect(deleting(plugin, c, h.home)).rejects.toThrow(
      /is not in VS Code's workspaceStorage/,
    )
    expect(existsSync(elsewhere)).toBe(true)
  })
})

describe('object', () => {
  test("refuses git's worktree while a VS Code process works in it", async () => {
    const h = home()
    const wt = join(h.projects, 'wt')
    mkdirSync(join(wt, 'src'), { recursive: true })
    const plugin = vscodePlugin(
      h.options({
        probe: probeOf([CODE, { pid: 11, command: 'Code Helper (Plugin)', cwd: join(wt, 'src') }]),
      }),
    )
    expect(await plugin.object!([worktree(wt)], fakeContext())).toEqual([
      {
        by: 'vscode',
        candidate: `worktree:${wt}`,
        level: 'refuse',
        code: IN_USE,
        reason: 'VS Code works in it: Code Helper (Plugin) (pid 11)',
      },
    ])
  })

  test("refuses git's worktree a window has open, only while VS Code runs", async () => {
    const h = home()
    const wt = join(h.projects, 'wt')
    const other = join(h.projects, 'other')
    mkdirSync(join(wt, 'pkg'), { recursive: true })
    mkdirSync(other)
    windows(h.user, [join(h.projects, 'unrelated'), join(wt, 'pkg')])
    const all = [worktree(wt), worktree(other)]

    const running = vscodePlugin(h.options({ probe: probeOf([CODE]) }))
    expect(await running.object!(all, fakeContext())).toEqual([
      expect.objectContaining({ candidate: `worktree:${wt}`, level: 'refuse', code: IN_USE }),
    ])
    const unreadable = vscodePlugin(h.options({ probe: probeOf(new Error('no lsof')) }))
    expect(await unreadable.object!(all, fakeContext())).toEqual([
      expect.objectContaining({ candidate: `worktree:${wt}`, code: IN_USE }),
    ])
    const quit = vscodePlugin(
      h.options({ probe: probeOf([{ pid: 12, command: 'codex', cwd: '/' }]) }),
    )
    expect(await quit.object!(all, fakeContext())).toEqual([])
  })

  test('a window state it cannot read is a note, and processes are still checked', async () => {
    const h = home()
    const wt = join(h.projects, 'wt')
    mkdirSync(wt)
    mkdirSync(join(h.user, 'globalStorage'))
    writeFileSync(join(h.user, 'globalStorage', 'storage.json'), '{ broken')
    const plugin = vscodePlugin(h.options({ probe: probeOf([CODE]) }))
    expect(await plugin.object!([worktree(wt)], fakeContext())).toEqual([
      expect.objectContaining({ level: 'note', code: 'vscode-state-unreadable' }),
    ])
  })

  test('refuses its own storage for a gone folder a window still has open', async () => {
    const h = home()
    const gone = join(h.projects, 'dead')
    const dead = store(h.storage, 'bbb', folder(gone))
    windows(h.user, [gone])
    const s = await survey([vscodePlugin(h.options({ probe: probeOf([CODE]) }))], ctxOf(h.home))
    expect(s.objections).toEqual([
      expect.objectContaining({
        candidate: `workspace-storage:${dead}`,
        level: 'refuse',
        code: IN_USE,
        reason: `a VS Code window still has ${gone} open`,
      }),
    ])
  })
})

describe('the kit is all it uses', () => {
  test('vscode imports nothing of host-cleaner a plugin author could not', () => {
    const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'vscode.ts')
    const own = [...readFileSync(src, 'utf8').matchAll(/^(?:import|\}) .*from '(\.[^']+)'$/gm)].map(
      (m) => m[1],
    )
    expect(own.sort()).toEqual(['./kit.ts', './types.ts'])
  })
})
