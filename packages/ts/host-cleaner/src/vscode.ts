/**
 * The `vscode` plugin: VS Code's per-workspace storage
 * (`workspaceStorage/<hash>/`) for folders that no longer exist, and a
 * refusal of any `git` worktree a VS Code window has open.
 *
 * Each storage folder names its workspace in `workspace.json`, as a `folder`
 * or a `workspace` (a `.code-workspace` file) URI. One whose `file:` URI
 * names nothing on disk is a candidate; deleting it costs the window's
 * settings and state (`re-download`), or, when it holds chat or agent history
 * (see {@link historyIn}), that history (`lost`). A remote URI cannot be checked from
 * here and a folder with no `workspace.json` is an empty window's, so both are
 * left alone. A `workspace.json` of any other shape is never guessed at: the
 * folder is proposed and refused (`unknown-workspace`), which is how it shows
 * as a note. A path on a volume that is not mounted is not gone either.
 *
 * Built on the plugin kit alone, as a code plugin would be.
 */

import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

import { attachKit, pluginKit, type Kit, type KitOptions, type Running } from './kit.ts'
import {
  PLUGIN_API,
  definePlugin,
  type Candidate,
  type Ctx,
  type Objection,
  type PathCandidate,
  type Plugin,
} from './types.ts'

export const VSCODE_PLUGIN = 'vscode'

/** The refusal of a candidate a VS Code window has open. */
export const IN_USE = 'in-use'

/** The refusal of a storage folder whose `workspace.json` is a shape this plugin does not know. */
export const UNKNOWN_WORKSPACE = 'unknown-workspace'

const KIND = 'workspace-storage'

/** VS Code's process names: `Code` and its `Code Helper (…)` processes on macOS, `code` on Linux. */
const VSCODE_PROCESS = /^code(?:\s|\\x20|$)/i

/** The longest `discover` may take: it sizes every dead storage folder. */
const DISCOVER_LIMIT_MS = 5 * 60_000

/**
 * The folders in a storage folder that hold chat or agent history, which
 * nothing can fetch or build again: VS Code's chats (`chatSessions`, from
 * `chatSessionStore.ts`) and the edits its agents made, with the file contents
 * before and after (`chatEditingSessions`, from `chatEditingSessionStorage.ts`),
 * and the Copilot extension's agent transcripts and repository memories.
 */
const HISTORY_FOLDERS = [
  'chatSessions',
  'chatEditingSessions',
  'GitHub.copilot-chat/transcripts',
  'GitHub.copilot-chat/memory-tool/memories',
] as const

const LogPath = z.array(z.union([z.string(), z.number().int().nonnegative()]))

/** One line of a `.jsonl` chat: VS Code's object mutation log (`objectMutationLog.ts`). */
const LogEntry = z.discriminatedUnion('kind', [
  /** The whole chat. */
  z.object({ kind: z.literal(0), v: z.unknown() }),
  /** A property replaced. */
  z.object({ kind: z.literal(1), k: LogPath, v: z.unknown() }),
  /** An array cut to `i` when given, then `v` pushed on. */
  z.object({
    kind: z.literal(2),
    k: LogPath,
    v: z.array(z.unknown()).optional(),
    i: z.number().int().nonnegative().optional(),
  }),
  /** A property deleted. */
  z.object({ kind: z.literal(3), k: LogPath }),
])

/** The length of a chat's `requests`; throws when it is not an array. */
function requestsOf(chat: unknown): number {
  if (!isObject(chat) || !Array.isArray(chat.requests)) throw new Error('no requests array')
  return chat.requests.length
}

/**
 * How many requests the chat in `text` holds: a `.json` file is the chat, a
 * `.jsonl` file its mutation log, replayed for `requests` alone. Throws on
 * anything else, so a chat that cannot be read counts as holding some.
 */
function chatRequests(text: string, log: boolean): number {
  if (text.trim() === '') return 0
  if (!log) return requestsOf(JSON.parse(text))
  let count: number | undefined
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    const entry = LogEntry.parse(JSON.parse(line))
    if (entry.kind === 0) {
      count = requestsOf(entry.v)
      continue
    }
    if (count === undefined) throw new Error('the log does not start with the whole chat')
    const [key, index] = entry.k
    if (key === undefined) {
      // The whole chat replaced.
      if (entry.kind !== 1) throw new Error('the whole chat changed other than by replacing it')
      count = requestsOf(entry.v)
      continue
    }
    if (key !== 'requests') continue
    if (entry.k.length > 1) {
      // A change inside one request: that request is there.
      if (typeof index !== 'number') throw new Error('a request is not named by its index')
      count = Math.max(count, index + 1)
    } else if (entry.kind === 1) {
      if (!Array.isArray(entry.v)) throw new Error('requests set to something else')
      count = entry.v.length
    } else if (entry.kind === 2) {
      count = (entry.i ?? count) + (entry.v?.length ?? 0)
    } else {
      throw new Error('requests deleted')
    }
  }
  if (count === undefined) throw new Error('the log has no whole chat')
  return count
}

/**
 * The key under which VS Code kept a workspace's chats in its `state.vscdb`
 * before it moved them to `chatSessions/` (`chatServiceImpl.ts`); a storage
 * folder last used before then may hold its chats there alone.
 */
const LEGACY_CHAT_KEY = Buffer.from('interactive.sessions')

/** True when the `state.vscdb` at `path` names the old chat key; one that cannot be read does. */
function legacyChats(path: string): boolean {
  try {
    if (lstatSync(path, { throwIfNoEntry: false })?.isFile() !== true) return false
    return readFileSync(path).includes(LEGACY_CHAT_KEY)
  } catch {
    return true
  }
}

/** True when the folder `path` holds something; one that cannot be read does. */
function filled(path: string): boolean {
  try {
    return readdirSync(path).length > 0
  } catch {
    return true
  }
}

/** True when `dir` is a folder, not followed through a link. */
const isDir = (dir: string): boolean =>
  lstatSync(dir, { throwIfNoEntry: false })?.isDirectory() === true

/**
 * True when the history folder `name`, at `path`, holds history that cannot be
 * had again: a chat with at least one request (an empty file is a chat with
 * none), an editing session whose `contents/` has the files it changed, or
 * anything at all in Copilot's folders. Throws on a chat or session it cannot
 * read, which {@link historyIn} counts as history.
 */
function holdsHistory(name: (typeof HISTORY_FOLDERS)[number], path: string): boolean {
  if (name === 'chatSessions') {
    return readdirSync(path).some((file) => {
      const log = file.endsWith('.jsonl')
      // VS Code reads no other files there.
      if (!log && !file.endsWith('.json')) return false
      return chatRequests(readFileSync(join(path, file), 'utf8'), log) > 0
    })
  }
  if (name === 'chatEditingSessions') {
    return readdirSync(path).some((session) => {
      const contents = join(path, session, 'contents')
      return isDir(join(path, session)) && isDir(contents) && filled(contents)
    })
  }
  return filled(path)
}

/** A mount point and the folder a volume is mounted on; a path under one that is missing or empty is on a volume that is not mounted. */
const VOLUME =
  /^(\/Volumes\/[^/]+|\/run\/media\/[^/]+\/[^/]+|\/media\/[^/]+\/[^/]+|\/mnt\/[^/]+)(?:\/|$)/

export interface VscodeOptions extends KitOptions {
  /** VS Code's `User` folder. Default: under `HOME`, by platform. */
  userDir?: string | undefined
  /** Default: this process's. */
  platform?: NodeJS.Platform | undefined
}

/**
 * VS Code's `User` folder on `platform`, found as VS Code finds it: under
 * `VSCODE_APPDATA` when set, else `~/Library/Application Support` on macOS and
 * `XDG_CONFIG_HOME` or `~/.config` on Linux; undefined where the plugin does
 * not know it.
 */
export function vscodeUserDir(
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform,
): string | undefined {
  const home = env.HOME ?? homedir()
  const set = (v: string | undefined): string | undefined => (v === '' ? undefined : v)
  let appData: string
  if (platform === 'darwin') appData = join(home, 'Library', 'Application Support')
  else if (platform === 'linux') appData = set(env.XDG_CONFIG_HOME) ?? join(home, '.config')
  else return undefined
  return join(set(env.VSCODE_APPDATA) ?? appData, 'Code', 'User')
}

/** What one storage folder says about its workspace. */
type Entry =
  | { state: 'gone'; workspace: string; local: string; history: string[] }
  | { state: 'unknown'; problem: string }
  /** Live, remote, an empty window's, on a volume not mounted, or not a folder of VS Code's. */
  | { state: 'skip' }

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** A path with symlinks resolved, so two spellings of one place compare equal. */
function canon(path: string): string {
  try {
    return realpathSync.native(path)
  } catch {
    return path
  }
}

const within = (path: string, dir: string): boolean =>
  path === dir || path.startsWith(dir.endsWith(sep) ? dir : dir + sep)

/** True when `path` is under a mount folder that is missing or empty. */
function unmounted(path: string): boolean {
  const mount = VOLUME.exec(path)?.[1]
  if (mount === undefined) return false
  try {
    return readdirSync(mount).length === 0
  } catch {
    return true
  }
}

/**
 * The {@link HISTORY_FOLDERS} in `dir` that are folders holding history (see
 * {@link holdsHistory}), one that cannot be read counting, and `state.vscdb`
 * when it holds chats from before `chatSessions/` (see {@link legacyChats}).
 */
function historyIn(dir: string): string[] {
  const found: string[] = HISTORY_FOLDERS.filter((name) => {
    const path = join(dir, name)
    try {
      return isDir(path) && holdsHistory(name, path)
    } catch {
      return true
    }
  })
  if (legacyChats(join(dir, 'state.vscdb'))) found.push('state.vscdb')
  return found
}

/** The local path a `file:` URI names; null for another scheme; throws when it is not a URI. */
function localPath(uri: string): string | null {
  const url = new URL(uri)
  return url.protocol === 'file:' ? fileURLToPath(url) : null
}

/** What the storage folder `dir` says, read from its `workspace.json`. */
function entryOf(dir: string): Entry {
  // VS Code makes each one a folder; a link or a file is not one of its own and is never followed.
  if (!isDir(dir)) return { state: 'skip' }
  let text: string
  try {
    text = readFileSync(join(dir, 'workspace.json'), 'utf8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return { state: 'skip' }
    return { state: 'unknown', problem: `workspace.json could not be read (${code ?? 'error'})` }
  }
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return { state: 'unknown', problem: 'workspace.json is not JSON' }
  }
  if (!isObject(body)) return { state: 'unknown', problem: 'workspace.json is not an object' }
  const [key, extra] = (['folder', 'workspace'] as const).filter((k) => body[k] !== undefined)
  if (key === undefined || extra !== undefined) {
    return {
      state: 'unknown',
      problem: `workspace.json names ${key === undefined ? 'neither a folder nor a workspace' : 'both a folder and a workspace'}`,
    }
  }
  const workspace = body[key]
  if (typeof workspace !== 'string') {
    return { state: 'unknown', problem: `workspace.json's ${key} is not a string` }
  }
  let local: string | null
  try {
    local = localPath(workspace)
  } catch {
    return { state: 'unknown', problem: `workspace.json's ${key} is not a local file URI` }
  }
  if (local === null) return { state: 'skip' }
  try {
    if (lstatSync(local, { throwIfNoEntry: false }) !== undefined) return { state: 'skip' }
  } catch {
    // It cannot be told whether it is there.
    return { state: 'skip' }
  }
  if (unmounted(local)) return { state: 'skip' }
  return { state: 'gone', workspace, local, history: historyIn(dir) }
}

/** JSON's strings, and JSONC's comments and trailing commas. */
const JSONC_TOKEN = /("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|,(?=(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*[\]}])/g

/** `text` with JSONC's comments and trailing commas taken out; strings are left as they are. */
const stripJsonc = (text: string): string =>
  text.replace(JSONC_TOKEN, (token, quoted: string | undefined) =>
    quoted ?? (token.startsWith(',') ? '' : ' '),
  )

/** The local folders the `.code-workspace` file `file` lists as its roots; throws when it cannot be read as one. */
function workspaceRoots(file: string): string[] {
  const body: unknown = JSON.parse(stripJsonc(readFileSync(file, 'utf8')))
  if (!isObject(body) || !Array.isArray(body.folders)) throw new Error('no folders list')
  const roots: string[] = []
  for (const f of body.folders) {
    if (!isObject(f)) continue
    if (typeof f.path === 'string') {
      roots.push(isAbsolute(f.path) ? f.path : resolve(dirname(file), f.path))
      continue
    }
    if (typeof f.uri !== 'string') continue
    try {
      const local = localPath(f.uri)
      if (local !== null) roots.push(local)
    } catch {
      // Not a URI: names nothing that could be open here.
    }
  }
  return roots
}

/** The local folders, workspace files and those files' roots the window state names; `problem` when one is not a shape this plugin knows. */
function openWindows(stateFile: string): { paths: string[]; problem?: string } {
  let body: unknown
  try {
    body = JSON.parse(readFileSync(stateFile, 'utf8'))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { paths: [] }
    return { paths: [], problem: `${stateFile} could not be read` }
  }
  if (!isObject(body)) return { paths: [], problem: `${stateFile} is not an object` }
  const state = body.windowsState
  if (state === undefined) return { paths: [] }
  if (!isObject(state))
    return { paths: [], problem: `${stateFile}'s windowsState is not an object` }
  const windows = [
    state.lastActiveWindow,
    state.lastPluginDevelopmentHostWindow,
    ...(Array.isArray(state.openedWindows) ? state.openedWindows : []),
  ]
  const paths: string[] = []
  const problems: string[] = []
  for (const w of windows) {
    if (!isObject(w)) continue
    const id = isObject(w.workspaceIdentifier) ? w.workspaceIdentifier.configURIPath : undefined
    for (const uri of [w.folder, id]) {
      if (typeof uri !== 'string') continue
      let local: string | null
      try {
        local = localPath(uri)
      } catch {
        // Not a URI: names nothing that could be open here.
        continue
      }
      if (local === null) continue
      paths.push(canon(local))
      if (uri !== id) continue
      // A multi-root workspace: every folder it lists is open too.
      try {
        for (const r of workspaceRoots(local)) paths.push(canon(r))
      } catch (err) {
        // A workspace file that is gone has no window with its roots open.
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
          problems.push(`the workspace file ${local} could not be read`)
      }
    }
  }
  return problems.length === 0 ? { paths } : { paths, problem: problems.join('; ') }
}

/** What VS Code's windows have open, and whether VS Code runs, or may. */
type Windows = { paths: string[]; problem?: string; running: boolean }

/** A git plugin's worktree row. */
const isGitWorktree = (c: Candidate): c is PathCandidate =>
  c.kind === 'worktree' && c.owner === 'git' && c.path !== undefined

/** The VS Code processes among `kit.running`'s names (`<command> (pid <n>)`, which the pattern's trailing space accepts). */
const vscodeOf = (names: readonly string[]): string[] =>
  names.filter((n) => VSCODE_PROCESS.test(n))

function build(kit: Kit, opts: VscodeOptions): Plugin {
  const userDir =
    opts.userDir ?? vscodeUserDir(opts.env ?? process.env, opts.platform ?? process.platform)
  const root = userDir === undefined ? undefined : join(userDir, 'workspaceStorage')
  const stateFile =
    userDir === undefined ? undefined : join(userDir, 'globalStorage', 'storage.json')
  /** `root` when it exists. */
  const storage = (): string | undefined =>
    root !== undefined && lstatSync(root, { throwIfNoEntry: false }) !== undefined
      ? root
      : undefined

  /** The last discovery's entries by candidate id, kept for `object`. */
  let entries = new Map<string, Entry>()

  const own = (
    c: Candidate,
    level: Objection['level'],
    code: string,
    reason: string,
  ): Objection => ({
    by: VSCODE_PLUGIN,
    candidate: c.id,
    level,
    code,
    reason,
  })

  /** Whether VS Code runs, or may, and while it does, what its windows have open. */
  const look = (ctx: Pick<Ctx, 'signal'>): Windows => {
    // The window state outlives a quit, so it counts only while VS Code runs, or may.
    const anywhere = kit.running({ in: '/' }, ctx)
    const running = vscodeOf(anywhere.names).length > 0 || anywhere.unknown !== undefined
    const windows = running && stateFile !== undefined ? openWindows(stateFile) : { paths: [] }
    return { ...windows, running }
  }

  /** The objections to deleting git's worktree `c` while VS Code is as `w` says. */
  const worktreeCheck = (
    c: PathCandidate,
    w: Windows,
    ctx: Pick<Ctx, 'signal'>,
  ): Objection[] => {
    // With no VS Code process anywhere, none works in this worktree.
    const here: Running = w.running ? kit.running({ in: c.path }, ctx) : { names: [] }
    const procs = vscodeOf(here.names)
    if (procs.length > 0) {
      return [own(c, 'refuse', IN_USE, `VS Code works in it: ${procs.join(', ')}`)]
    }
    const dir = canon(c.path)
    if (w.paths.some((p) => within(p, dir))) {
      return [own(c, 'refuse', IN_USE, `a VS Code window has it open (${stateFile})`)]
    }
    const unchecked = [
      ...(here.unknown === undefined
        ? []
        : [`the processes working in it could not be listed (${here.unknown})`]),
      ...(w.problem === undefined ? [] : [w.problem]),
    ]
    if (unchecked.length === 0) return []
    const code = here.unknown === undefined ? 'vscode-state-unreadable' : 'vscode-unchecked'
    return [own(c, 'note', code, `${unchecked.join('; ')}; VS Code was not fully checked`)]
  }

  return {
    name: VSCODE_PLUGIN,
    limits: { discover: DISCOVER_LIMIT_MS },
    detect: () => storage() !== undefined,
    roots: () => {
      const dir = storage()
      return dir === undefined ? [] : [dir]
    },
    async discover(ctx) {
      const top = storage()
      if (top === undefined) return []
      const found = new Map<string, Entry>()
      const out: Candidate[] = []
      for (const name of readdirSync(top).sort()) {
        // Each folder is sized; give the time limit a turn to stop the hook between them.
        await new Promise((done) => setImmediate(done))
        if (ctx.signal.aborted) throw new Error('discover was stopped')
        const dir = join(top, name)
        const entry = entryOf(dir)
        if (entry.state === 'skip') continue
        const c =
          entry.state === 'gone'
            ? goneCandidate(kit, dir, entry)
            : kit.candidate({
                kind: KIND,
                path: dir,
                why: `its workspace.json is not a shape this plugin knows: ${entry.problem}`,
                held: true,
                evidence: { kind: KIND, path: dir, problem: entry.problem },
              })
        found.set(c.id, entry)
        out.push(c)
      }
      entries = found
      return out
    },
    object(all, ctx) {
      const out: Objection[] = []
      const gone: Array<{ c: Candidate; local: string }> = []
      for (const c of all) {
        const e = c.owner === VSCODE_PLUGIN ? entries.get(c.id) : undefined
        if (e?.state === 'unknown') out.push(own(c, 'refuse', UNKNOWN_WORKSPACE, e.problem))
        if (e?.state === 'gone') gone.push({ c, local: e.local })
      }
      const worktrees = all.filter(isGitWorktree)
      if (worktrees.length === 0 && gone.length === 0) return out

      const windows = look(ctx)
      for (const c of worktrees) out.push(...worktreeCheck(c, windows, ctx))
      const open = new Set(windows.paths)
      for (const { c, local } of open.size === 0 ? [] : gone) {
        if (open.has(canon(local))) {
          out.push(own(c, 'refuse', IN_USE, `a VS Code window still has ${local} open`))
        }
      }
      return out
    },
    prepare(c, ctx) {
      if (!isGitWorktree(c)) return
      // A window may have opened it since `object`.
      const refusal = worktreeCheck(c, look(ctx), ctx).find((o) => o.level === 'refuse')
      if (refusal !== undefined) throw new Error(refusal.reason)
    },
    delete(c, ctx) {
      if (c.path === undefined) throw new Error(`${c.id} is not a storage folder`)
      if (root === undefined || dirname(c.path) !== root) {
        throw new Error(`${c.path} is not in VS Code's workspaceStorage`)
      }
      if (lstatSync(c.path, { throwIfNoEntry: false }) === undefined) {
        return `already gone: ${c.path}`
      }
      // Read again: its workspace may be back, or the folder no longer VS Code's.
      const now = entryOf(c.path)
      if (now.state !== 'gone' || now.workspace !== c.evidence.workspace) {
        throw new Error(`${c.path} is no longer storage for a workspace that is gone`)
      }
      if (now.history.length > 0 && c.costDescription !== 'lost') {
        throw new Error(`${c.path} now holds chat or agent history (${now.history.join(', ')})`)
      }
      return kit.remove(c.path, ctx)
    },
  }
}

function goneCandidate(kit: Kit, dir: string, e: Extract<Entry, { state: 'gone' }>): Candidate {
  const bytes = kit.size(dir)
  const hasHistory = e.history.length > 0
  return kit.candidate({
    kind: KIND,
    path: dir,
    why: `VS Code kept state for ${e.local}, which no longer exists${hasHistory ? `, with chat or agent history in ${e.history.join(', ')}` : ''}`,
    ...(bytes === null ? {} : { bytes }),
    // A `lost` candidate is held, and runs only with `--allow discard-user-data`.
    costDescription: hasHistory ? 'lost' : 're-download',
    evidence: {
      kind: KIND,
      path: dir,
      workspace: e.workspace,
      ...(hasHistory ? { history: e.history } : {}),
    },
  })
}

/** The `vscode` plugin on `kit`, or on a kit built from `opts`; the kit is attached so the core binds it each run. */
export function vscodePlugin(
  opts: VscodeOptions = {},
  kit: Kit = pluginKit(VSCODE_PLUGIN, opts),
): Plugin {
  const plugin = build(kit, opts)
  attachKit(plugin, kit)
  return plugin
}

/** The `vscode` plugin as the command line builds it. No settings of its own. */
export const vscodeDefinition = definePlugin({
  name: VSCODE_PLUGIN,
  api: PLUGIN_API,
  settings: z.strictObject({}),
  create: ({ kit, env }) => vscodePlugin({ env }, kit),
})
