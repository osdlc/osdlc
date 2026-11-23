/** The `vscode` and `cursor` plugins against storage folders laid out in a temporary home. */

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
  DISCARD_USER_DATA,
  IN_USE,
  UNKNOWN_WORKSPACE,
  clean,
  cursorPlugin,
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

/** A temporary home with the macOS layout of the editor in `app` (VS Code's by default) and a folder for projects. */
function home(app = 'Code') {
  const t = tempHome('host-cleaner-vscode-')
  cleanups.push(t.cleanup)
  const user = join(t.home, 'Library', 'Application Support', app, 'User')
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

describe('cursor', () => {
  /** Cursor's main process, running somewhere unrelated. */
  const CURSOR: Proc = { pid: 20, command: 'Cursor', cwd: '/' }

  test('a dead Cursor workspace is listed as held and is deleted only with the allow', async () => {
    const h = home('Cursor')
    mkdirSync(join(h.projects, 'live'))
    const live = store(h.storage, 'aaa', folder(join(h.projects, 'live')))
    const dead = store(h.storage, 'bbb', folder(join(h.projects, 'dead')))
    const id = `workspace-storage:${dead}`
    const plugin = cursorPlugin(h.options())

    const s = await survey([plugin], ctxOf(h.home))
    expect(s.warnings).toEqual([])
    expect(s.candidates).toEqual([
      expect.objectContaining({
        id,
        owner: 'cursor',
        path: dead,
        why: `Cursor kept state and chat history for ${join(h.projects, 'dead')}, which no longer exists`,
        costDescription: 'lost',
        held: true,
      }),
    ])
    expect(s.objections).toEqual([
      expect.objectContaining({
        by: 'host-cleaner',
        candidate: id,
        level: 'protest',
        code: DISCARD_USER_DATA,
      }),
    ])
    expect(s.roots).toEqual({ cursor: [h.storage] })

    const byDefault = await clean(plan(s), [plugin], ctxOf(h.home))
    expect(byDefault.steps).toEqual([])
    const picked = await clean(plan(s, { pick: [id] }), [plugin], ctxOf(h.home))
    expect(picked.steps).toEqual([])
    expect(picked.dropped).toEqual([
      { id, reason: 'not-allowed', detail: `needs --allow ${DISCARD_USER_DATA}` },
    ])
    expect(existsSync(dead)).toBe(true)

    const allowed = await clean(
      plan(s, { pick: [id], allow: [DISCARD_USER_DATA] }),
      [plugin],
      ctxOf(h.home),
    )
    expect(allowed.status).toBe('complete')
    expect(allowed.steps).toEqual([expect.objectContaining({ id, result: 'ok' })])
    expect(existsSync(dead)).toBe(false)
    expect(existsSync(live)).toBe(true)
  })

  test("each plugin reads only its own editor's storage, on macOS and Linux", async () => {
    const h = home('Cursor')
    const code = join(h.home, 'Library', 'Application Support', 'Code', 'User', 'workspaceStorage')
    mkdirSync(code, { recursive: true })
    const ofCursor = store(h.storage, 'a', folder(join(h.projects, 'dead')))
    const ofCode = store(code, 'b', folder(join(h.projects, 'dead')))

    const both = await survey([vscodePlugin(h.options()), cursorPlugin(h.options())], ctxOf(h.home))
    expect(both.warnings).toEqual([])
    expect(both.candidates.map((c) => [c.owner, c.path])).toEqual([
      ['vscode', ofCode],
      ['cursor', ofCursor],
    ])

    const linuxStorage = join(h.home, '.config', 'Cursor', 'User', 'workspaceStorage')
    mkdirSync(linuxStorage, { recursive: true })
    const onLinux = store(linuxStorage, 'c', folder(join(h.projects, 'dead')))
    const linux = await survey([cursorPlugin(h.options({ platform: 'linux' }))], ctxOf(h.home))
    expect(linux.candidates.map((c) => c.path)).toEqual([onLinux])
    const windows = await survey([cursorPlugin(h.options({ platform: 'win32' }))], ctxOf(h.home))
    expect(windows.plugins).toEqual([])
  })

  test('cursor keeps the contract', async () => {
    const h = home('Cursor')
    const dead = store(h.storage, 'bbb', folder(join(h.projects, 'dead')))
    expect(await contractSuite(cursorPlugin(h.options()), { cwd: h.home })).toEqual([])
    expect(existsSync(join(dead, 'state.vscdb'))).toBe(true)
  })

  test("refuses a storage folder that now leads outside, or one not in Cursor's workspaceStorage", async () => {
    const h = home('Cursor')
    const dead = store(h.storage, 'bbb', folder(join(h.projects, 'dead')))
    const plugin = cursorPlugin(h.options())
    const c = (await survey([plugin], ctxOf(h.home))).candidates[0]!

    const elsewhere = store(h.projects, 'x', folder(join(h.projects, 'dead')))
    await expect(deleting(plugin, { ...c, path: elsewhere } as Candidate, h.home)).rejects.toThrow(
      /is not in Cursor's workspaceStorage/,
    )
    expect(existsSync(elsewhere)).toBe(true)

    const outside = tempHome('host-cleaner-cursor-out-')
    cleanups.push(outside.cleanup)
    const moved = join(outside.home, 'moved')
    renameSync(dead, moved)
    symlinkSync(moved, dead)
    await expect(deleting(plugin, c, h.home)).rejects.toThrow(
      /is no longer storage for a workspace that is gone/,
    )
    expect(readdirSync(moved).sort()).toEqual(['state.vscdb', 'workspace.json'])
  })

  test("refuses git's worktree while a Cursor process works in it, and not for a VS Code one", async () => {
    const h = home('Cursor')
    const wt = join(h.projects, 'wt')
    mkdirSync(join(wt, 'src'), { recursive: true })
    const helper = { pid: 21, command: 'Cursor Helper (Plugin)', cwd: join(wt, 'src') }
    const plugin = cursorPlugin(h.options({ probe: probeOf([CURSOR, helper]) }))
    expect(await plugin.object!([worktree(wt)], fakeContext())).toEqual([
      {
        by: 'cursor',
        candidate: `worktree:${wt}`,
        level: 'refuse',
        code: IN_USE,
        reason: 'Cursor works in it: Cursor Helper (Plugin) (pid 21)',
      },
    ])
    const vscode = { pid: 11, command: 'Code Helper (Plugin)', cwd: join(wt, 'src') }
    const other = cursorPlugin(h.options({ probe: probeOf([CODE, vscode]) }))
    expect(await other.object!([worktree(wt)], fakeContext())).toEqual([])
  })

  test("refuses git's worktree a Cursor window has open while Cursor runs", async () => {
    const h = home('Cursor')
    const wt = join(h.projects, 'wt')
    mkdirSync(wt)
    windows(h.user, [wt])
    const plugin = cursorPlugin(h.options({ probe: probeOf([CURSOR]) }))
    expect(await plugin.object!([worktree(wt)], fakeContext())).toEqual([
      expect.objectContaining({
        by: 'cursor',
        level: 'refuse',
        code: IN_USE,
        reason: `a Cursor window has it open (${join(h.user, 'globalStorage', 'storage.json')})`,
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
