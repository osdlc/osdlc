/** The `vscode` and `cursor` plugins against storage folders laid out in a temporary home. */

import { afterEach, describe, expect, test } from 'vitest'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import type { ProcessProbe } from '@osdlc/repo-cleaner'

import {
  AGENT_WORKTREE,
  CURSOR_IN_USE,
  DISCARD_USER_DATA,
  VSCODE_IN_USE,
  VSCODE_STATE_UNREADABLE,
  VSCODE_UNKNOWN_WORKSPACE,
  clean,
  cursorPlugin,
  plan,
  survey,
  vscodePlugin,
  vscodeUserDir,
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

/** `d` as `ps -o lstart=` prints it under `TZ=UTC LC_ALL=C`. */
function lstart(d: Date): string {
  const [day, date, month, year, time] = d.toUTCString().replace(',', '').split(' ')
  return `${day} ${month} ${date} ${time} ${year}    `
}

/** A `ps` that says the processes it is asked about started at `at`, or that fails with that output. */
const psAt =
  (at: Date[], fails = false): NonNullable<VscodeOptions['runner']> =>
  (program) => ({
    run: async (args, opts) => {
      expect([program, ...args.slice(0, 2)]).toEqual(['ps', '-o', 'lstart='])
      expect(opts.env).toMatchObject({ TZ: 'UTC', LC_ALL: 'C' })
      const stdout = at.map((d) => `${lstart(d)}\n`).join('')
      return fails ? { exitCode: 1, stdout, stderr: 'no' } : { exitCode: 0, stdout, stderr: '' }
    },
  })

const minutesAgo = (n: number): Date => new Date(Date.now() - n * 60_000)

/** Sets the modification time of the storage folder `dir`, and of each entry in it, to `at`. */
function age(dir: string, at: Date): void {
  for (const name of readdirSync(dir)) utimesSync(join(dir, name), at, at)
  utimesSync(dir, at, at)
}

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
    // VS Code started after every storage folder a test writes.
    runner: psAt([minutesAgo(-60)]),
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

/** For each `[hash, make]`, a storage folder `hash` whose project is gone, then `make` on it. */
function deadStores(
  h: { storage: string; projects: string },
  shapes: Array<[string, (dir: string) => void]>,
): void {
  for (const [hash, make] of shapes)
    make(store(h.storage, hash, folder(join(h.projects, `dead-${hash}`))))
}

/** A folder `name` in the storage folder `dir`, with one file in it unless `empty`. */
function history(dir: string, name: string, empty = false): void {
  mkdirSync(join(dir, name), { recursive: true })
  if (!empty) writeFileSync(join(dir, name, 'f2c4.jsonl'), '{"kind":0}\n')
}

/** One request of a chat, as VS Code stores it. */
const REQUEST = { requestId: 'request_1', message: { text: 'fix the build' }, response: [] }

/** A chat's log line holding the whole chat, with `requests`. */
const whole = (requests: unknown[] = []) => ({
  kind: 0,
  v: { version: 3, sessionId: 'f2c4', requests },
})

/** A chat file `file` in the storage folder `dir`: `body` as it is when a string, else each item a line of a log. */
function chat(dir: string, body: string | unknown[], file = 'f2c4.jsonl'): void {
  mkdirSync(join(dir, 'chatSessions'), { recursive: true })
  writeFileSync(
    join(dir, 'chatSessions', file),
    typeof body === 'string' ? body : body.map((line) => `${JSON.stringify(line)}\n`).join(''),
  )
}

/**
 * A SQLite `state.vscdb` in the storage folder `dir`, as VS Code makes it, with
 * `keys` set (to `[]`, or to the value given) and `deleted` then deleted.
 */
function vscdbOf(
  dir: string,
  keys: Array<string | [string, string]>,
  deleted: string[] = [],
): void {
  const path = join(dir, 'state.vscdb')
  writeFileSync(path, '')
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite')
  const db = new DatabaseSync(path)
  db.exec('CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)')
  for (const entry of keys) {
    const [key, value] = typeof entry === 'string' ? [entry, '[]'] : entry
    db.prepare('INSERT INTO ItemTable VALUES (?, ?)').run(key, value)
  }
  for (const key of deleted) db.prepare('DELETE FROM ItemTable WHERE key = ?').run(key)
  db.close()
}

/** An editing session in the storage folder `dir`, with `files` in its `contents/` (none: no `contents/` at all). */
function editing(dir: string, files?: string[]): void {
  const session = join(dir, 'chatEditingSessions', '01109945-a276-4dcd-a5c9-9d6947717683')
  mkdirSync(session, { recursive: true })
  writeFileSync(join(session, 'state.json'), '{"version":2,"timeline":{}}')
  if (files === undefined) return
  mkdirSync(join(session, 'contents'))
  for (const f of files) writeFileSync(join(session, 'contents', f), 'before')
}

/** VS Code's `storage.json` under `user`: `body` as it is when a string, else as JSON. */
function windowState(user: string, body: unknown): void {
  mkdirSync(join(user, 'globalStorage'), { recursive: true })
  writeFileSync(
    join(user, 'globalStorage', 'storage.json'),
    typeof body === 'string' ? body : JSON.stringify(body),
  )
}

/** VS Code's window state naming `paths` as open windows. */
function windows(user: string, paths: string[]): void {
  const [first, ...rest] = paths.map(folder)
  windowState(user, { windowsState: { lastActiveWindow: first, openedWindows: rest } })
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

/** A `git` plugin that proposes git's worktrees at `paths`. */
const gitOf = (paths: string[]): Plugin => ({
  name: 'git',
  detect: () => true,
  discover: () => paths.map(worktree),
})

/** The core's `agent-worktree` refusals of a survey of `plugins` with `home` as the home folder. */
async function agentRefusals(plugins: Plugin[], home: string) {
  const s = await survey(plugins, { ...ctxOf(home), home })
  return s.objections.filter((o) => o.code === AGENT_WORKTREE)
}

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
        VSCODE_UNKNOWN_WORKSPACE,
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

  test('it finds the User folder as VS Code does: VSCODE_APPDATA, then XDG_CONFIG_HOME on Linux', () => {
    const user = (s: string) => join(s, 'Code', 'User')
    expect(vscodeUserDir({ HOME: '/h' }, 'linux')).toBe(user('/h/.config'))
    expect(vscodeUserDir({ HOME: '/h', XDG_CONFIG_HOME: '/x' }, 'linux')).toBe(user('/x'))
    expect(vscodeUserDir({ HOME: '/h', XDG_CONFIG_HOME: '' }, 'linux')).toBe(user('/h/.config'))
    expect(vscodeUserDir({ HOME: '/h', XDG_CONFIG_HOME: '/x' }, 'darwin')).toBe(
      user('/h/Library/Application Support'),
    )
    const both = { HOME: '/h', XDG_CONFIG_HOME: '/x', VSCODE_APPDATA: '/a' }
    expect(vscodeUserDir(both, 'linux')).toBe(user('/a'))
    expect(vscodeUserDir({ HOME: '/h', VSCODE_APPDATA: '/a' }, 'darwin')).toBe(user('/a'))
    expect(vscodeUserDir({ HOME: '/h', VSCODE_APPDATA: '/a' }, 'win32')).toBeUndefined()
    // An empty or relative HOME names no folder here: the plugin stays out of the run.
    expect(vscodeUserDir({ HOME: '' }, 'linux')).toBeUndefined()
    expect(vscodeUserDir({ HOME: '' }, 'darwin')).toBeUndefined()
    expect(vscodeUserDir({ HOME: 'h' }, 'darwin')).toBeUndefined()
    expect(vscodeUserDir({ HOME: '', XDG_CONFIG_HOME: '/x' }, 'linux')).toBe(user('/x'))
    expect(vscodeUserDir({ HOME: '', VSCODE_APPDATA: '/a' }, 'darwin')).toBe(user('/a'))
  })

  test('a stopped discover gives up between folders', async () => {
    const h = home()
    store(h.storage, 'a', folder(join(h.projects, 'dead')))
    const plugin = vscodePlugin(h.options())
    await expect(
      (async () => plugin.discover!(fakeContext({ signal: AbortSignal.abort() })))(),
    ).rejects.toThrow(/aborted/)
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
    chat(dead, [whole([REQUEST])])
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
    const shapes: Array<[string, (dir: string) => void]> = [
      ['a', (d) => editing(d, ['0.ts'])],
      ['b', (d) => history(d, 'GitHub.copilot-chat/transcripts')],
      ['c', (d) => history(d, 'GitHub.copilot-chat/memory-tool/memories')],
      [
        'd',
        (d) => {
          chat(d, [whole([REQUEST])])
          editing(d, ['0.ts'])
        },
      ],
      ['e', (d) => history(d, 'chatSessions', true)],
      ['f', (d) => history(d, 'GitHub.copilot-chat/chat-session-resources')],
    ]
    deadStores(h, shapes)

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

  test('a chat counts only with a request, and one that cannot be read counts', async () => {
    const h = home()
    const noise = { kind: 1, k: ['responderUsername'], v: 'GitHub Copilot' }
    const shapes: Array<[string, (dir: string) => void]> = [
      // An empty chat file, and a chat opened but never asked anything.
      ['a', (d) => chat(d, '')],
      ['b', (d) => chat(d, [whole(), noise, { kind: 1, k: ['inputState'], v: {} }])],
      ['c', (d) => chat(d, JSON.stringify(whole().v, null, 2), 'f2c4.json')],
      // A request pushed onto an empty chat, one in the whole chat, one in a `.json` chat.
      ['d', (d) => chat(d, [whole(), noise, { kind: 2, k: ['requests'], v: [REQUEST] }])],
      ['e', (d) => chat(d, [whole([REQUEST])])],
      ['f', (d) => chat(d, JSON.stringify(whole([REQUEST]).v, null, 2), 'f2c4.json')],
      // A request's response changed: that request is there.
      ['g', (d) => chat(d, [whole(), { kind: 1, k: ['requests', 0, 'response'], v: [] }])],
      // Requests pushed and then cut back to none.
      [
        'h',
        (d) =>
          chat(d, [
            whole(),
            { kind: 2, k: ['requests'], v: [REQUEST] },
            { kind: 2, k: ['requests'], i: 0 },
          ]),
      ],
      // Files that cannot be read as a chat: kept.
      ['i', (d) => chat(d, '{"kind":0,"v":{"requests":[]}}\n{ broken')],
      ['j', (d) => chat(d, '{ broken', 'f2c4.json')],
      ['k', (d) => chat(d, [{ kind: 0 }])],
      ['l', (d) => chat(d, [{ kind: 2, k: ['requests'], v: [REQUEST] }])],
      ['m', (d) => chat(d, [whole(), { kind: 9, k: ['requests'] }])],
      ['n', (d) => chat(d, [whole(), { kind: 3, k: ['requests'] }])],
      // A file VS Code does not read as a chat.
      ['o', (d) => chat(d, 'x', '.DS_Store')],
      // The whole chat replaced: by one with a request, and by one with none.
      ['p', (d) => chat(d, [whole(), { kind: 1, k: [], v: whole([REQUEST]).v }])],
      ['q', (d) => chat(d, [whole([REQUEST]), { kind: 1, k: [], v: whole().v }])],
      // The whole chat changed some other way: kept.
      ['r', (d) => chat(d, [whole(), { kind: 3, k: [] }])],
      // A chat with no requests that starts with a byte order mark, which VS Code reads.
      ['s', (d) => chat(d, `\uFEFF${JSON.stringify(whole().v)}`, 'f2c4.json')],
    ]
    const kept = new Set(['d', 'e', 'f', 'g', 'i', 'j', 'k', 'l', 'm', 'n', 'p', 'r'])
    deadStores(h, shapes)

    const s = await survey([vscodePlugin(h.options())], ctxOf(h.home))
    expect(s.warnings).toEqual([])
    expect(s.candidates.map((c) => [c.path, c.costDescription])).toEqual(
      shapes.map(([hash]) => [join(h.storage, hash), kept.has(hash) ? 'lost' : 're-download']),
    )
  })

  test('an editing session counts only when its contents/ has the files it changed', async () => {
    const h = home()
    const shapes: Array<[string, (dir: string) => void]> = [
      ['a', (d) => editing(d, [])],
      ['b', (d) => editing(d)],
      ['c', (d) => editing(d, ['0.ts', '1.ts'])],
      ['d', (d) => history(d, 'chatEditingSessions')],
    ]
    deadStores(h, shapes)

    const s = await survey([vscodePlugin(h.options())], ctxOf(h.home))
    expect(s.candidates.map((c) => [c.path, c.costDescription])).toEqual([
      [join(h.storage, 'a'), 're-download'],
      [join(h.storage, 'b'), 're-download'],
      [join(h.storage, 'c'), 'lost'],
      [join(h.storage, 'd'), 're-download'],
    ])
  })

  test('chats kept in state.vscdb from before chatSessions/ are history', async () => {
    const h = home()
    const vscdb = (body: string) => (d: string) => writeFileSync(join(d, 'state.vscdb'), body)
    deadStores(h, [
      ['a', vscdb('SQLite format 3\0...interactive.sessions[{"requests":[]}]')],
      ['b', () => {}],
      // The key across the seam between two chunks of the file as it is read.
      ['c', vscdb(`${'x'.repeat((1 << 20) - 5)}interactive.sessions`)],
      ['d', (d) => vscdbOf(d, ['interactive.sessions', 'other'])],
      // The row deleted, its bytes still in the file.
      ['e', (d) => vscdbOf(d, ['interactive.sessions', 'other'], ['interactive.sessions'])],
      // The same, with a write-ahead log beside it that may hold the row again.
      [
        'f',
        (d) => {
          vscdbOf(d, ['interactive.sessions'], ['interactive.sessions'])
          writeFileSync(join(d, 'state.vscdb-wal'), 'x')
        },
      ],
      // A chat with a request; chats with none; a value that is not a list of chats.
      [
        'g',
        (d) => vscdbOf(d, [['interactive.sessions', JSON.stringify([{ requests: [REQUEST] }])]]),
      ],
      ['h', (d) => vscdbOf(d, [['interactive.sessions', '[{"requests":[]},{"requests":[]}]']])],
      ['i', (d) => vscdbOf(d, [['interactive.sessions', '{}']])],
    ])
    expect(readFileSync(join(h.storage, 'e', 'state.vscdb')).includes('interactive.sessions')).toBe(
      true,
    )

    const s = await survey([vscodePlugin(h.options())], ctxOf(h.home))
    const unread = [expect.stringMatching(/^state\.vscdb \(it could not be read: .+\)$/)]
    expect(s.candidates.map((c) => [c.path, c.costDescription, c.evidence.history])).toEqual([
      [join(h.storage, 'a'), 'lost', unread],
      [join(h.storage, 'b'), 're-download', undefined],
      [join(h.storage, 'c'), 'lost', unread],
      // The row holds `[]`: no chat.
      [join(h.storage, 'd'), 're-download', undefined],
      [join(h.storage, 'e'), 're-download', undefined],
      [join(h.storage, 'f'), 'lost', ['state.vscdb (a log beside it is not read)']],
      [join(h.storage, 'g'), 'lost', ['state.vscdb']],
      [join(h.storage, 'h'), 're-download', undefined],
      [join(h.storage, 'i'), 'lost', unread],
    ])
    expect(readdirSync(join(h.storage, 'e')).sort()).toEqual(['state.vscdb', 'workspace.json'])
  })

  test('delete refuses a storage folder planned as re-download that now holds chats', async () => {
    const h = home()
    const dead = store(h.storage, 'bbb', folder(join(h.projects, 'dead')))
    const plugin = vscodePlugin(h.options())
    const c = (await survey([plugin], ctxOf(h.home))).candidates[0]!
    expect(c.costDescription).toBe('re-download')
    chat(dead, [whole([REQUEST])])
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
        code: VSCODE_IN_USE,
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
      expect.objectContaining({
        candidate: `worktree:${wt}`,
        level: 'refuse',
        code: VSCODE_IN_USE,
      }),
    ])
    const unreadable = vscodePlugin(h.options({ probe: probeOf(new Error('no lsof')) }))
    expect(await unreadable.object!(all, fakeContext())).toEqual([
      expect.objectContaining({ candidate: `worktree:${wt}`, code: VSCODE_IN_USE }),
      expect.objectContaining({
        candidate: `worktree:${other}`,
        level: 'note',
        code: 'vscode-unchecked',
      }),
    ])
    const quit = vscodePlugin(
      h.options({ probe: probeOf([{ pid: 12, command: 'codex', cwd: '/' }]) }),
    )
    expect(await quit.object!(all, fakeContext())).toEqual([])
  })

  test("refuses git's worktree a window has open when git spells it in another case than the disk does", async ({
    skip,
  }) => {
    const h = home()
    const wt = join(h.projects, 'wt')
    mkdirSync(wt)
    const spelled = join(h.projects, 'WT')
    // Only where the filesystem ignores case, as macOS's and Windows' do by default.
    if (!existsSync(spelled)) skip()
    windows(h.user, [wt])
    const plugin = vscodePlugin(h.options({ probe: probeOf([CODE]) }))
    expect(await plugin.object!([worktree(spelled)], fakeContext())).toEqual([
      expect.objectContaining({ candidate: `worktree:${spelled}`, code: VSCODE_IN_USE }),
    ])
  })

  test('refuses a worktree inside a folder a window has open, or storage written since names', async () => {
    const h = home()
    const repo = join(h.projects, 'repo')
    const feat = join(repo, '.worktrees', 'feat')
    const built = join(h.projects, 'built')
    const fix = join(built, '.worktrees', 'fix')
    const beside = join(h.projects, 'repo2', '.worktrees', 'feat')
    for (const d of [feat, fix, beside]) mkdirSync(d, { recursive: true })
    windows(h.user, [repo])
    store(h.storage, 'b', folder(built))
    const plugin = vscodePlugin(
      h.options({ probe: probeOf([{ ...CODE, cwd: repo }]), runner: psAt([minutesAgo(10)]) }),
    )
    expect(
      await plugin.object!([worktree(feat), worktree(fix), worktree(beside)], fakeContext()),
    ).toEqual([
      expect.objectContaining({
        candidate: `worktree:${feat}`,
        level: 'refuse',
        code: VSCODE_IN_USE,
        reason: expect.stringMatching(/a VS Code window has it open/),
      }),
      expect.objectContaining({
        candidate: `worktree:${fix}`,
        level: 'refuse',
        code: VSCODE_IN_USE,
        reason: expect.stringMatching(/written since VS Code started/),
      }),
    ])
  })

  test('a window state it cannot read refuses while VS Code runs, and not after', async () => {
    const h = home()
    const wt = join(h.projects, 'wt')
    mkdirSync(wt)
    windowState(h.user, '{ broken')
    const running = vscodePlugin(h.options({ probe: probeOf([CODE]) }))
    expect(await running.object!([worktree(wt)], fakeContext())).toEqual([
      expect.objectContaining({ level: 'refuse', code: VSCODE_STATE_UNREADABLE }),
    ])
    const quit = vscodePlugin(h.options())
    expect(await quit.object!([worktree(wt)], fakeContext())).toEqual([])
  })

  test('refuses a worktree whose storage was written since VS Code started, or any time when that is not known', async () => {
    const h = home()
    const recent = join(h.projects, 'recent')
    const older = join(h.projects, 'older')
    const never = join(h.projects, 'never')
    for (const d of [recent, older, never]) mkdirSync(d)
    age(store(h.storage, 'r', folder(recent)), minutesAgo(1))
    age(store(h.storage, 'o', folder(older)), minutesAgo(60))
    const all = [worktree(recent), worktree(older), worktree(never)]

    // Counted from the first VS Code process, and a little before it.
    const started = vscodePlugin(
      h.options({ probe: probeOf([CODE]), runner: psAt([minutesAgo(0.1), minutesAgo(10)]) }),
    )
    expect(await started.object!(all, fakeContext())).toEqual([
      expect.objectContaining({
        candidate: `worktree:${recent}`,
        level: 'refuse',
        code: VSCODE_IN_USE,
        reason: expect.stringMatching(/written since VS Code started/),
      }),
    ])
    const atStart = vscodePlugin(
      h.options({ probe: probeOf([CODE]), runner: psAt([minutesAgo(0.95)]) }),
    )
    expect(await atStart.object!(all, fakeContext())).toEqual([
      expect.objectContaining({ candidate: `worktree:${recent}`, code: VSCODE_IN_USE }),
    ])
    const unknown = vscodePlugin(
      h.options({ probe: probeOf([CODE]), runner: psAt([minutesAgo(10)], true) }),
    )
    expect(await unknown.object!(all, fakeContext())).toEqual([
      expect.objectContaining({ candidate: `worktree:${recent}`, code: VSCODE_IN_USE }),
      expect.objectContaining({
        candidate: `worktree:${older}`,
        code: VSCODE_IN_USE,
        reason: expect.stringMatching(/when it started is not known/),
      }),
    ])
    const quit = vscodePlugin(h.options({ runner: psAt([], true) }))
    expect(await quit.object!(all, fakeContext())).toEqual([])
  })

  test('refuses storage for a gone folder written since VS Code started', async () => {
    const h = home()
    const recent = store(h.storage, 'r', folder(join(h.projects, 'dead-r')))
    age(store(h.storage, 'o', folder(join(h.projects, 'dead-o'))), minutesAgo(60))
    const refusal = {
      candidate: `workspace-storage:${recent}`,
      level: 'refuse',
      code: VSCODE_IN_USE,
    }
    const started = h.options({ probe: probeOf([CODE]), runner: psAt([minutesAgo(10)]) })
    const s = await survey([vscodePlugin(started)], ctxOf(h.home))
    expect(s.objections).toEqual([expect.objectContaining(refusal)])
    const unknown = h.options({ probe: probeOf([CODE]), runner: psAt([], true) })
    expect((await survey([vscodePlugin(unknown)], ctxOf(h.home))).objections).toEqual([
      expect.objectContaining({ code: VSCODE_IN_USE }),
      expect.objectContaining(refusal),
    ])
    // One whose window state cannot be read is refused whatever its own folder says.
    windowState(h.user, '{ broken')
    const old = h.options({ probe: probeOf([CODE]) })
    expect((await survey([vscodePlugin(old)], ctxOf(h.home))).objections).toEqual([
      expect.objectContaining({ level: 'refuse', code: VSCODE_STATE_UNREADABLE }),
      expect.objectContaining({ level: 'refuse', code: VSCODE_STATE_UNREADABLE }),
    ])
  })

  test('a root of a workspace file whose storage was written since is refused, and recent storage it cannot read refuses every worktree', async () => {
    const h = home()
    const wt = join(h.projects, 'wt')
    const other = join(h.projects, 'other')
    for (const d of [wt, other]) mkdirSync(d)
    const file = join(h.projects, 'proj.code-workspace')
    writeFileSync(file, '{ "folders": [{ "path": "wt" }] }')
    store(h.storage, 'a', { workspace: pathToFileURL(file).href })
    const all = [worktree(wt), worktree(other)]
    const options = h.options({ probe: probeOf([CODE]), runner: psAt([minutesAgo(10)]) })
    const seen = async () =>
      (await vscodePlugin(options).object!(all, fakeContext())).map((o) => [o.candidate, o.code])
    expect(await seen()).toEqual([[`worktree:${wt}`, VSCODE_IN_USE]])

    const unread = all.map((c) => [c.id, VSCODE_STATE_UNREADABLE])
    writeFileSync(file, '{ broken')
    expect(await seen()).toEqual(unread)
    writeFileSync(file, '{ "folders": [] }')
    expect(await seen()).toEqual([])
    const broken = store(h.storage, 'b', 'not json')
    expect(await seen()).toEqual(unread)
    age(broken, minutesAgo(60))
    expect(await seen()).toEqual([])
  })

  test("refuses git's worktree that is a root of an open multi-root workspace", async () => {
    const h = home()
    const wt = join(h.projects, 'wt')
    const abs = join(h.projects, 'abs')
    const other = join(h.projects, 'other')
    for (const d of [wt, abs, other]) mkdirSync(d)
    const file = join(h.home, 'proj.code-workspace')
    // Saved with a byte order mark, as some editors do.
    writeFileSync(
      file,
      `\uFEFF{
  // Two roots, one relative and one absolute.
  "folders": [
    { "path": "dev/wt" },
    { "uri": "${pathToFileURL(abs).href}", }, /* trailing comma */
  ],
  "settings": { "x": "a // not a comment" },
}`,
    )
    windowState(h.user, {
      windowsState: {
        lastActiveWindow: {
          workspaceIdentifier: { id: 'x', configURIPath: pathToFileURL(file).href },
        },
      },
    })
    const plugin = vscodePlugin(h.options({ probe: probeOf([CODE]) }))
    const all = [worktree(wt), worktree(abs), worktree(other)]
    expect(await plugin.object!(all, fakeContext())).toEqual([
      expect.objectContaining({ candidate: `worktree:${wt}`, code: VSCODE_IN_USE }),
      expect.objectContaining({ candidate: `worktree:${abs}`, code: VSCODE_IN_USE }),
    ])
  })

  test('a worktree whose processes could not be listed carries a note', async () => {
    const h = home()
    const wt = join(h.projects, 'wt')
    mkdirSync(wt)
    const none = probeOf(new Error('no lsof'))
    let reads = 0
    const probe: ProcessProbe = {
      ...none,
      holders: (...args) => {
        reads++
        return none.holders(...args)
      },
    }
    const plugin = vscodePlugin(h.options({ probe }))
    const note = expect.objectContaining({
      level: 'note',
      code: 'vscode-unchecked',
      reason: expect.stringMatching(/could not be listed \(.*no lsof.*\)/),
    })
    expect(await plugin.object!([worktree(wt), worktree(h.projects)], fakeContext())).toEqual([
      note,
      note,
    ])
    // The table is not read again for each worktree.
    expect(reads).toBe(1)
  })

  test('prepare fails a worktree a window opened after object', async () => {
    const h = home()
    const wt = join(h.projects, 'wt')
    mkdirSync(wt)
    const plugin = vscodePlugin(h.options({ probe: probeOf([CODE]) }))
    expect(await plugin.object!([worktree(wt)], fakeContext())).toEqual([])
    await plugin.prepare!(worktree(wt), fakeContext())
    windows(h.user, [wt])
    await expect((async () => plugin.prepare!(worktree(wt), fakeContext()))()).rejects.toThrow(
      /a VS Code window has it open/,
    )
  })

  test('prepare fails its own storage for a gone folder a window opened after object', async () => {
    const h = home()
    const gone = join(h.projects, 'dead')
    store(h.storage, 'bbb', folder(gone))
    const plugin = vscodePlugin(h.options({ probe: probeOf([CODE]) }))
    const s = await survey([plugin], ctxOf(h.home))
    expect(s.objections).toEqual([])
    const c = s.candidates[0]!
    await plugin.prepare!(c, fakeContext())
    windows(h.user, [gone])
    await expect((async () => plugin.prepare!(c, fakeContext()))()).rejects.toThrow(
      /a VS Code window still has .* open/,
    )
  })

  test('clean keeps storage for a gone folder that VS Code writes to between the re-check and the delete', async () => {
    const h = home()
    const dead = store(h.storage, 'bbb', folder(join(h.projects, 'dead')))
    age(dead, minutesAgo(60))
    const plugin = vscodePlugin(
      h.options({ probe: probeOf([CODE]), runner: psAt([minutesAgo(10)]) }),
    )
    const planned = plan(await survey([plugin], ctxOf(h.home)))
    const opened: Plugin = {
      name: 'opened',
      detect: () => true,
      prepare: () => age(dead, new Date()),
    }
    const receipt = await clean(planned, [opened, plugin], ctxOf(h.home))
    expect(receipt.steps).toEqual([
      expect.objectContaining({
        result: 'failed',
        error: expect.stringMatching(/written since VS Code started/),
      }),
    ])
    expect(existsSync(dead)).toBe(true)
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
        code: VSCODE_IN_USE,
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
        why: `Cursor kept state for ${join(h.projects, 'dead')}, which no longer exists, in the storage where it keeps chat history`,
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

  test("refuses git's worktree while a Cursor process works in it, and while any other does", async () => {
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
        code: CURSOR_IN_USE,
        reason: 'Cursor works in it: Cursor Helper (Plugin) (pid 21)',
      },
    ])
    const vscode = { pid: 11, command: 'Code Helper (Plugin)', cwd: join(wt, 'src') }
    const other = cursorPlugin(h.options({ probe: probeOf([CODE, vscode]) }))
    expect(await other.object!([worktree(wt)], fakeContext())).toEqual([
      expect.objectContaining({
        code: CURSOR_IN_USE,
        reason:
          "Cursor's agent may work in it, under another program's name: Code Helper (Plugin) (pid 11)",
      }),
    ])
    expect(
      await cursorPlugin(h.options({ probe: probeOf([CODE]) })).object!(
        [worktree(wt)],
        fakeContext(),
      ),
    ).toEqual([])
  })

  test("refuses git's worktree a node process works in while Cursor's app does not run", async () => {
    const h = home('Cursor')
    const wt = join(h.projects, 'wt')
    mkdirSync(wt)
    // The cursor-agent CLI is a shim that execs a bundled `node`, which is the name lsof gives it.
    const agent = { pid: 24, command: 'node', cwd: wt }
    const plugin = cursorPlugin(h.options({ probe: probeOf([agent]) }))
    expect(await plugin.object!([worktree(wt)], fakeContext())).toEqual([
      expect.objectContaining({
        code: CURSOR_IN_USE,
        reason: expect.stringContaining('node (pid 24)'),
      }),
    ])
    await expect(plugin.prepare!(worktree(wt), fakeContext())).rejects.toThrow(/node \(pid 24\)/)
    // A process somewhere else is not.
    const elsewhere = cursorPlugin(
      h.options({ probe: probeOf([{ pid: 25, command: 'node', cwd: h.projects }]) }),
    )
    expect(await elsewhere.object!([worktree(wt)], fakeContext())).toEqual([])
  })

  test("git's worktree in Cursor's agent folder made after the plugin is refused, by a home that is a link", async () => {
    const h = home('Cursor')
    const link = join(h.projects, 'home-link')
    symlinkSync(h.home, link)
    const plugin = cursorPlugin(h.options({ env: { HOME: link } }))
    const wt = join(h.home, '.cursor', 'worktrees', 'repo', 'k3x')
    mkdirSync(wt, { recursive: true })
    // A prunable worktree, whose folder is gone, named through the link.
    const gone = join(link, '.cursor', 'worktrees', 'repo', 'gone')
    expect(await agentRefusals([gitOf([wt, gone]), plugin], link)).toEqual([
      expect.objectContaining({ by: 'host-cleaner', candidate: `worktree:${wt}` }),
      expect.objectContaining({ by: 'host-cleaner', candidate: `worktree:${gone}` }),
    ])
    // The plugin leaves them to the core.
    expect(await plugin.object!([worktree(wt), worktree(gone)], fakeContext())).toEqual([])
    // With the agents' folder gone too, in either spelling, and only links above it left to resolve.
    rmSync(join(h.home, '.cursor'), { recursive: true })
    const real = join(realpathSync(h.home), '.cursor', 'worktrees', 'repo', 'gone')
    expect(await agentRefusals([gitOf([real, gone])], link)).toEqual([
      expect.objectContaining({ candidate: `worktree:${real}` }),
      expect.objectContaining({ candidate: `worktree:${gone}` }),
    ])
    expect(await agentRefusals([gitOf([gone])], realpathSync(h.home))).toEqual([
      expect.objectContaining({ candidate: `worktree:${gone}` }),
    ])
  })

  test('a dead Cursor workspace with chats gives its reason once and keeps no history evidence', async () => {
    const h = home('Cursor')
    const dead = store(h.storage, 'bbb', folder(join(h.projects, 'dead')))
    chat(dead, [whole([REQUEST])])
    const s = await survey([cursorPlugin(h.options())], ctxOf(h.home))
    expect(s.candidates).toEqual([
      expect.objectContaining({
        why: `Cursor kept state for ${join(h.projects, 'dead')}, which no longer exists, in the storage where it keeps chat history`,
        costDescription: 'lost',
        evidence: {
          kind: 'workspace-storage',
          path: dead,
          workspace: folder(join(h.projects, 'dead')).folder,
        },
      }),
    ])
  })

  test("git's worktree in Cursor's agent worktrees is refused, even while Cursor does not run", async () => {
    const h = home('Cursor')
    const agents = join(h.home, '.cursor', 'worktrees')
    const wt = join(agents, 'repo', 'k3x')
    mkdirSync(wt, { recursive: true })
    const plugin = cursorPlugin(h.options())
    expect(await agentRefusals([gitOf([wt]), plugin], h.home)).toEqual([
      {
        by: 'host-cleaner',
        candidate: `worktree:${wt}`,
        level: 'refuse',
        code: AGENT_WORKTREE,
        reason: `it is in ${agents}, where a coding agent keeps its worktrees`,
      },
    ])
    // Every plugin, the vscode one too, leaves it to the core.
    expect(await plugin.object!([worktree(wt)], fakeContext())).toEqual([])
    expect(await vscodePlugin(h.options()).object!([worktree(wt)], fakeContext())).toEqual([])
  })

  test("knows a cursor-agent by its own name, whole or cut to lsof's 9 characters", async () => {
    const h = home('Cursor')
    const wt = join(h.projects, 'wt')
    mkdirSync(wt)
    for (const command of ['cursor-agent', 'cursor-ag']) {
      const agent = { pid: 22, command, cwd: wt }
      const plugin = cursorPlugin(h.options({ probe: probeOf([agent]) }))
      expect(await plugin.object!([worktree(wt)], fakeContext())).toEqual([
        expect.objectContaining({
          code: CURSOR_IN_USE,
          reason: `Cursor works in it: ${command} (pid 22)`,
        }),
      ])
    }
  })

  test('detects Cursor by its agent worktrees alone, where its storage is not', async () => {
    const h = home('Code')
    const plugin = (platform: NodeJS.Platform) => cursorPlugin(h.options({ platform }))
    expect(await plugin('darwin').detect(fakeContext())).toBe(false)
    const wt = join(h.home, '.cursor', 'worktrees', 'repo', 'k3x')
    mkdirSync(wt, { recursive: true })
    for (const platform of ['darwin', 'linux', 'win32'] as const) {
      expect(await plugin(platform).detect(fakeContext())).toBe(true)
      expect(await plugin(platform).object!([worktree(wt)], fakeContext())).toEqual([])
      expect(await agentRefusals([gitOf([wt]), plugin(platform)], h.home)).toEqual([
        expect.objectContaining({ candidate: `worktree:${wt}` }),
      ])
    }
  })

  test('only looks at where a worktree is on Windows, which has no lsof', async () => {
    const h = home('Cursor')
    const wt = join(h.projects, 'wt')
    const agent = join(h.home, '.cursor', 'worktrees', 'repo', 'k3x')
    for (const d of [wt, agent]) mkdirSync(d, { recursive: true })
    let reads = 0
    const probe: ProcessProbe = {
      alive: () => true,
      holders: () => {
        reads += 1
        throw new Error('no lsof')
      },
    }
    const onWindows = cursorPlugin(h.options({ probe, platform: 'win32' }))
    expect(await onWindows.object!([worktree(agent), worktree(wt)], fakeContext())).toEqual([])
    await onWindows.prepare!(worktree(wt), fakeContext())
    expect(reads).toBe(0)

    // Elsewhere a table that cannot be read leaves the worktree unchecked, and the note says so.
    const noLsof = cursorPlugin(h.options({ probe, platform: 'linux' }))
    expect(await noLsof.object!([worktree(wt)], fakeContext())).toEqual([
      expect.objectContaining({ level: 'note', code: 'cursor-unchecked' }),
    ])
    expect(reads).toBe(1)
  })

  test("reads no process table when every worktree is in an agent folder, the default or the run's", async () => {
    const h = home('Cursor')
    const wt = join(h.home, '.cursor', 'worktrees', 'repo', 'k3x')
    const mine = join(h.projects, 'agents', 'wt')
    for (const d of [wt, mine]) mkdirSync(d, { recursive: true })
    let reads = 0
    const probe: ProcessProbe = {
      alive: () => true,
      holders: () => {
        reads += 1
        return []
      },
    }
    const plugin = cursorPlugin(h.options({ probe }))
    const ctx = fakeContext({ agentFolders: [join(h.projects, 'agents')] })
    expect(await plugin.object!([worktree(wt), worktree(mine)], ctx)).toEqual([])
    expect(reads).toBe(0)
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
        code: CURSOR_IN_USE,
        reason: `a Cursor window has it open (${join(h.user, 'globalStorage', 'storage.json')})`,
      }),
    ])

    // A worktree that is gone, named through a link, as the window's folder is.
    const link = join(h.home, 'dev-link')
    symlinkSync(h.projects, link)
    const gone = join(link, 'gone')
    windows(h.user, [gone])
    expect(await plugin.object!([worktree(gone)], fakeContext())).toEqual([
      expect.objectContaining({ candidate: `worktree:${gone}`, code: CURSOR_IN_USE }),
    ])
  })
})

describe('the kit and the shared helpers are all it uses', () => {
  test('vscode imports nothing else of host-cleaner', () => {
    const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'vscode.ts')
    const own = [...readFileSync(src, 'utf8').matchAll(/^(?:import|\}) .*from '(\.[^']+)'$/gm)].map(
      (m) => m[1],
    )
    expect(own.sort()).toEqual(['./helpers.ts', './kit.ts', './types.ts'])
  })
})
