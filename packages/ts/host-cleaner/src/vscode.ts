/**
 * The `vscode` plugin: VS Code's per-workspace storage
 * (`workspaceStorage/<hash>/`) for folders that no longer exist, and a
 * refusal of any `git` worktree a VS Code window has open. The `cursor`
 * plugin is the same code over Cursor's folders and processes; its storage
 * holds chat history, so deleting it is `lost`.
 *
 * Each storage folder names its workspace in `workspace.json`, as a `folder`
 * or a `workspace` (a `.code-workspace` file) URI. One whose `file:` URI
 * names nothing on disk is a candidate; deleting it costs the window's
 * settings and state (`re-download`), or, when it holds chat or agent history
 * (see {@link historyIn}), that history (`lost`). A remote URI cannot be checked from
 * here and a folder with no `workspace.json` is an empty window's, so both are
 * left alone. A `workspace.json` of any other shape is never guessed at: the
 * folder is proposed held and refused (`<plugin>-unknown-workspace`), so it shows under
 * `--all-rows`. A path on a volume that is not mounted is not gone either.
 *
 * Built on the plugin kit, as a code plugin would be, and the plugins' shared helpers.
 */

import {
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { PS_LSTART_ENV, startMs } from '@osdlc/repo-cleaner'
import { z } from 'zod'

import {
  DISCOVER_LIMIT_MS,
  isGitWorktree,
  isObject,
  objector,
  realAbove,
  realOr,
  yieldToLimit,
} from './helpers.ts'
import { attachKit, pluginKit, present, type Kit, type KitOptions, type Running } from './kit.ts'
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
export const CURSOR_PLUGIN = 'cursor'

/** The refusal of a candidate the editor has open, or may. */
export const VSCODE_IN_USE = 'vscode-in-use'
export const CURSOR_IN_USE = 'cursor-in-use'

/** The refusal of a storage folder whose `workspace.json` is a shape this plugin does not know. */
export const VSCODE_UNKNOWN_WORKSPACE = 'vscode-unknown-workspace'
export const CURSOR_UNKNOWN_WORKSPACE = 'cursor-unknown-workspace'

/** The refusal, while the editor runs, of what it may have open when what it has open cannot be read. */
export const VSCODE_STATE_UNREADABLE = 'vscode-state-unreadable'
export const CURSOR_STATE_UNREADABLE = 'cursor-state-unreadable'

/** The refusal of a `git` worktree in the folder where the editor's own agents keep theirs. */
export const AGENT_WORKTREE = 'agent-worktree'

const KIND = 'workspace-storage'

/** One editor of VS Code's family: where it keeps its state and what its processes are called. */
interface Editor {
  name: string
  /** Its name in reasons. */
  product: string
  /** Its folder in `Application Support` on macOS and in `.config` on Linux. */
  appDir: string
  /** Its process commands. `\x20` is the space as `lsof` writes it in a command name. */
  process: RegExp
  /** The codes of its refusals. */
  codes: { inUse: string; unknownWorkspace: string; stateUnreadable: string }
  /** True when its workspace storage always holds chat history, so deleting it is `lost`. */
  keepsChat: boolean
  /** The folder under `HOME` where its agents make and track their own worktrees. */
  agentWorktrees?: string
  /**
   * True when its agent may run under another program's name (the
   * `cursor-agent` CLI runs as `node`), so any busy process working in a
   * worktree may be it, whether or not the editor itself runs.
   */
  agentUnnamed: boolean
}

const VSCODE: Editor = {
  name: VSCODE_PLUGIN,
  product: 'VS Code',
  appDir: 'Code',
  // `Code` and its `Code Helper (…)` processes on macOS, `code` on Linux.
  process: /^code(?:\s|\\x20|$)/i,
  codes: {
    inUse: VSCODE_IN_USE,
    unknownWorkspace: VSCODE_UNKNOWN_WORKSPACE,
    stateUnreadable: VSCODE_STATE_UNREADABLE,
  },
  keepsChat: false,
  agentUnnamed: false,
}

const CURSOR: Editor = {
  name: CURSOR_PLUGIN,
  product: 'Cursor',
  appDir: 'Cursor',
  // `Cursor` and its `Cursor Helper (…)` processes on macOS, `cursor` on Linux, and `cursor-agent` (which
  // lsof cuts to 9 characters), should the CLI ever run by its own name; see `agentUnnamed`.
  process: /^cursor(?:-ag(?:ent)?)?(?:\s|\\x20|$)/i,
  codes: {
    inUse: CURSOR_IN_USE,
    unknownWorkspace: CURSOR_UNKNOWN_WORKSPACE,
    stateUnreadable: CURSOR_STATE_UNREADABLE,
  },
  keepsChat: true,
  agentWorktrees: join('.cursor', 'worktrees'),
  agentUnnamed: true,
}

/** A file's text, without the byte order mark VS Code accepts and `JSON.parse` does not. */
const readText = (file: string): string => readFileSync(file, 'utf8').replace(/^\uFEFF/, '')

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
const LEGACY_CHAT_KEY = 'interactive.sessions'

/** How much of a `state.vscdb` is read at a time while looking for {@link LEGACY_CHAT_KEY}. */
const SCAN_CHUNK = 1 << 20

/**
 * Whether the `state.vscdb` at `path` holds chats under the old chat key:
 * false, true, or why it could not be told, which counts as holding some.
 * SQLite is asked only when the key's bytes are in the file, which keeps
 * those of rows deleted since.
 */
const legacyChats = (path: string): boolean | string =>
  namesLegacyChats(path) && hasLegacyChats(path)

/**
 * True when the value of an old chat row holds a chat with a request: it is a
 * list of chats, each with its `requests` (`chatModel.ts`). Throws on any
 * other value, so one that cannot be read counts.
 */
function legacyValueHolds(value: unknown): boolean {
  const text = value instanceof Uint8Array ? Buffer.from(value).toString('utf8') : value
  if (typeof text !== 'string') throw new Error('the value is not text')
  const chats: unknown = JSON.parse(text)
  if (!Array.isArray(chats)) throw new Error('the value is not a list of chats')
  return chats.some((chat) => requestsOf(chat) > 0)
}

/**
 * Whether a row of the SQLite file `path` with the old chat key holds a chat
 * with a request: false, true, or why it could not be told.
 */
function hasLegacyChats(path: string): boolean | string {
  try {
    // Read as it lies (`immutable`), so that nothing is written beside it; what
    // SQLite keeps there is not read then, and may hold the row.
    if (['-wal', '-journal'].some((end) => present(path + end))) {
      return 'a log beside it is not read'
    }
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite')
    const url = pathToFileURL(path)
    url.searchParams.set('immutable', '1')
    const db = new DatabaseSync(url, { readOnly: true })
    try {
      const rows = db
        .prepare('SELECT value FROM ItemTable WHERE instr(key, ?) > 0')
        .all(LEGACY_CHAT_KEY)
      return rows.some((row) => legacyValueHolds(row.value))
    } finally {
      db.close()
    }
  } catch (err) {
    return `it could not be read: ${err instanceof Error ? err.message : String(err)}`
  }
}

/** True when the bytes of {@link LEGACY_CHAT_KEY} are in the file `path`; one that cannot be read holds them. */
function namesLegacyChats(path: string): boolean {
  let fd: number | undefined
  try {
    const st = lstatSync(path, { throwIfNoEntry: false })
    if (st?.isFile() !== true) return false
    // Read in chunks that overlap by the key's length less one, so the key is found across a seam.
    fd = openSync(path, 'r')
    const keep = LEGACY_CHAT_KEY.length - 1
    const chunk = Math.min(st.size, SCAN_CHUNK)
    // Only the bytes read are searched, so the buffer need not be zeroed.
    const buf = Buffer.allocUnsafe(chunk + keep)
    let held = 0
    for (;;) {
      const read = readSync(fd, buf, held, chunk, null)
      if (read === 0) return false
      const end = held + read
      if (buf.subarray(0, end).includes(LEGACY_CHAT_KEY)) return true
      held = Math.min(keep, end)
      buf.copy(buf, 0, end - held, end)
    }
  } catch {
    return true
  } finally {
    if (fd !== undefined) closeSync(fd)
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
      return chatRequests(readText(join(path, file)), log) > 0
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

/**
 * Group 1 is the folder a removable volume is mounted on, under the mount roots macOS and Linux
 * use; under `/media`, `<user>/<label>` or, on older Debian and Ubuntu, `<label>` (see {@link unmounted}).
 */
const VOLUME =
  /^(\/Volumes\/[^/]+|\/run\/media\/[^/]+\/[^/]+|\/media\/[^/]+(?:\/[^/]+)?|\/mnt\/[^/]+)(?:\/|$)/

export interface VscodeOptions extends KitOptions {
  /** The editor's `User` folder. Default: under `HOME`, by platform. */
  userDir?: string | undefined
  /** Default: this process's. */
  platform?: NodeJS.Platform | undefined
}

type Env = Readonly<Record<string, string | undefined>>

/** `HOME`, or the OS's home when it is unset or empty. */
const homeOf = (env: Env): string => env.HOME || homedir()

/**
 * `editor`'s `User` folder on `platform`, found as VS Code and its forks find
 * it: under `VSCODE_APPDATA` when set, else `~/Library/Application Support` on
 * macOS and `XDG_CONFIG_HOME` or `~/.config` on Linux; undefined where the
 * plugin does not know it, and when that is not an absolute path.
 */
function userDirOf(editor: Editor, env: Env, platform: NodeJS.Platform): string | undefined {
  const home = homeOf(env)
  let appData: string
  if (platform === 'darwin') appData = join(home, 'Library', 'Application Support')
  else if (platform === 'linux') appData = env.XDG_CONFIG_HOME || join(home, '.config')
  else return undefined
  const dir = join(env.VSCODE_APPDATA || appData, editor.appDir, 'User')
  // An empty or relative HOME names no folder of this machine's.
  return isAbsolute(dir) ? dir : undefined
}

/** VS Code's `User` folder on `platform`; undefined where the plugin does not know it. */
export const vscodeUserDir = (env: Env, platform: NodeJS.Platform): string | undefined =>
  userDirOf(VSCODE, env, platform)

/** Cursor's `User` folder on `platform`; undefined where the plugin does not know it. */
export const cursorUserDir = (env: Env, platform: NodeJS.Platform): string | undefined =>
  userDirOf(CURSOR, env, platform)

/** What one storage folder says about its workspace. */
type Entry =
  | { state: 'gone'; workspace: string; local: string }
  | { state: 'unknown'; problem: string }
  /** Live, remote, an empty window's, on a volume not mounted, or not a folder of the editor's. */
  | { state: 'skip' }

const within = (path: string, dir: string): boolean =>
  path === dir || path.startsWith(dir.endsWith(sep) ? dir : dir + sep)

/** True when `path` is under a mount folder that is missing or empty. */
function unmounted(path: string): boolean {
  let mount = VOLUME.exec(path)?.[1]
  if (mount === undefined) return false
  // Older Debian and Ubuntu mount at `/media/<label>`: a folder there on a device of its own is the mount.
  const label = /^\/media\/[^/]+/.exec(mount)?.[0]
  if (label !== undefined && label !== mount) {
    try {
      if (statSync(label).dev !== statSync('/media').dev) mount = label
    } catch {
      // Not readable: the mount stays the one under the user's folder.
    }
  }
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
  const legacy = legacyChats(join(dir, 'state.vscdb'))
  if (legacy === true) found.push('state.vscdb')
  else if (legacy !== false) found.push(`state.vscdb (${legacy})`)
  return found
}

/** The local path a `file:` URI names; null for another scheme; throws when it is not a URI. */
function localPath(uri: string): string | null {
  const url = new URL(uri)
  return url.protocol === 'file:' ? fileURLToPath(url) : null
}

/** What the storage folder `dir` says, read from its `workspace.json`. */
function entryOf(dir: string): Entry {
  // The editor makes each one a folder; a link or a file is not one of its own and is never followed.
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
  return { state: 'gone', workspace, local }
}

/** JSON's strings, and JSONC's comments and trailing commas. */
const JSONC_TOKEN =
  /("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|,(?=(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*[\]}])/g

/** `text` with JSONC's comments and trailing commas taken out; strings are left as they are. */
const stripJsonc = (text: string): string =>
  text.replace(
    JSONC_TOKEN,
    (token, quoted: string | undefined) => quoted ?? (token.startsWith(',') ? '' : ' '),
  )

/** The local folders the `.code-workspace` file `file` lists as its roots; throws when it cannot be read as one. */
function workspaceRoots(file: string): string[] {
  const body: unknown = JSON.parse(stripJsonc(readText(file)))
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

/** The local folders, workspace files and those files' roots a file names, and why any of it could not be read. */
interface Named {
  paths: string[]
  problems: string[]
}

/** Adds to `to` what `uri` names, when it is local: a folder, or (`isFile`) a workspace file and its roots. Throws when it is not a URI. */
function addNamed(to: Named, uri: string, isFile: boolean): void {
  const local = localPath(uri)
  if (local === null) return
  to.paths.push(realOr(local))
  if (!isFile) return
  // A multi-root workspace: every folder it lists is open too.
  try {
    for (const r of workspaceRoots(local)) to.paths.push(realOr(r))
  } catch (err) {
    // A workspace file that is gone has no window with its roots open.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
      to.problems.push(`the workspace file ${local} could not be read`)
  }
}

/** What the window state names as open. */
function openWindows(stateFile: string): Named {
  const problem = (what: string): Named => ({ paths: [], problems: [`${stateFile}${what}`] })
  const out: Named = { paths: [], problems: [] }
  let body: unknown
  try {
    body = JSON.parse(readText(stateFile))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return out
    return problem(' could not be read')
  }
  if (!isObject(body)) return problem(' is not an object')
  const state = body.windowsState
  if (state === undefined) return out
  if (!isObject(state)) return problem("'s windowsState is not an object")
  const windows = [
    state.lastActiveWindow,
    state.lastPluginDevelopmentHostWindow,
    ...(Array.isArray(state.openedWindows) ? state.openedWindows : []),
  ]
  // The last active window is usually among the opened ones too.
  const seen = new Set<string>()
  for (const w of windows) {
    if (!isObject(w)) continue
    const id = isObject(w.workspaceIdentifier) ? w.workspaceIdentifier.configURIPath : undefined
    for (const uri of [w.folder, id]) {
      if (typeof uri !== 'string' || seen.has(uri)) continue
      seen.add(uri)
      try {
        addNamed(out, uri, uri === id)
      } catch {
        // Not a URI: names nothing that could be open here.
      }
    }
  }
  return out
}

/**
 * True when `dir`, or an entry directly in it, was modified at or after
 * `since`; always when `since` is undefined, and when it cannot be read.
 */
function touchedSince(dir: string, since: number | undefined): boolean {
  if (since === undefined) return true
  const touched = (path: string): boolean =>
    (statSync(path, { throwIfNoEntry: false })?.mtimeMs ?? 0) >= since
  try {
    return touched(dir) || readdirSync(dir).some((name) => touched(join(dir, name)))
  } catch {
    return true
  }
}

/**
 * What the storage folders in `root` written at or after `since` (every one
 * when undefined) name: the editor writes there for a window it has open, so each
 * may be open.
 */
function usedSince(root: string, since: number | undefined): Named {
  const out: Named = { paths: [], problems: [] }
  let names: string[]
  try {
    names = readdirSync(root)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
      out.problems.push(`${root} could not be read`)
    return out
  }
  for (const name of names) {
    const dir = join(root, name)
    if (!touchedSince(dir, since)) continue
    const file = join(dir, 'workspace.json')
    let body: unknown
    try {
      body = JSON.parse(readText(file))
    } catch (err) {
      // No workspace.json: an empty window's, which has no folder open, or not a storage folder.
      if (!['ENOENT', 'ENOTDIR'].includes((err as NodeJS.ErrnoException).code ?? ''))
        out.problems.push(`${file} could not be read`)
      continue
    }
    const fields: Record<string, unknown> = isObject(body) ? body : {}
    let uris = 0
    for (const key of ['folder', 'workspace'] as const) {
      const uri = fields[key]
      if (typeof uri !== 'string') continue
      uris++
      try {
        addNamed(out, uri, key === 'workspace')
      } catch {
        out.problems.push(`${file}'s ${key} is not a local file URI`)
      }
    }
    if (uris === 0) out.problems.push(`${file} names no folder or workspace`)
  }
  return out
}

/** Taken off the editor's start time: `ps` gives it, and some filesystems a modification time, only to a second or two. */
const START_SLACK_MS = 10_000

/** When the first of the processes `pids` started, in milliseconds, by `ps`; undefined when it cannot be read. */
async function startedAt(
  kit: Kit,
  pids: readonly number[],
  ctx: Pick<Ctx, 'signal'>,
): Promise<number | undefined> {
  if (pids.length === 0) return undefined
  try {
    const r = await kit.run(['ps', '-o', 'lstart=', '-p', pids.join(',')], {
      signal: ctx.signal,
      cwd: '/',
      env: PS_LSTART_ENV,
    })
    if (!r.ok || r.outputIncomplete === true) return undefined
    const starts = r.stdout
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map(startMs)
    if (starts.length === 0 || starts.some((t) => Number.isNaN(t))) return undefined
    return Math.min(...starts)
  } catch {
    return undefined
  }
}

/** Whether the editor runs, or may, and while it does, what it may have open. */
interface Windows {
  running: boolean
  /** The time storage written at or after counts as used: the editor's start, less {@link START_SLACK_MS}; undefined when that is not known. */
  since: number | undefined
  /** What the window state names as open. */
  open: Named
  /** What storage written since names; see {@link usedSince}. Not read for a storage candidate, whose own folder tells. */
  used: Named
}

/** `editor`'s processes among `processes`; see {@link Editor.process}. */
const processesOf = (editor: Editor, processes: Running['processes']): Running['processes'] =>
  processes.filter((p) => editor.process.test(p.command))

function build(editor: Editor, kit: Kit, opts: VscodeOptions): Plugin {
  const env = opts.env ?? process.env
  const platform = opts.platform ?? process.platform
  const userDir = opts.userDir ?? userDirOf(editor, env, platform)
  const under = (...parts: string[]): string | undefined =>
    userDir === undefined ? undefined : join(userDir, ...parts)
  const root = under('workspaceStorage')
  const stateFile = under('globalStorage', 'storage.json')
  const agentDir =
    editor.agentWorktrees === undefined ? undefined : join(homeOf(env), editor.agentWorktrees)
  /**
   * Nothing can be told of a worktree but where it is: the editor's folders on
   * this platform are not known, and Windows has no `lsof` to list processes with.
   */
  const placeOnly = userDir === undefined && platform === 'win32'
  /** `root` when it exists. */
  const storage = (): string | undefined =>
    root !== undefined && lstatSync(root, { throwIfNoEntry: false }) !== undefined
      ? root
      : undefined

  /** The last discovery's entries by candidate id, kept for `object`. */
  let entries = new Map<string, Entry>()

  const own = objector(editor.name)

  /** Whether the editor runs, or may, and while it does, what it may have open; `used` is read when `worktrees` are asked about. */
  const look = async (ctx: Pick<Ctx, 'signal'>, worktrees: boolean): Promise<Windows> => {
    const none: Named = { paths: [], problems: [] }
    // What the editor wrote outlives a quit, so it counts only while the editor runs, or may.
    const anywhere = kit.running({ in: '/' }, ctx)
    const pids = processesOf(editor, anywhere.processes).map((p) => p.pid)
    const running = pids.length > 0 || anywhere.unknown !== undefined
    if (!running) return { running, since: undefined, open: none, used: none }
    // The window state can miss windows opened since the editor started, as the editor does not
    // write it for each; the storage written since then names those.
    const started = await startedAt(kit, pids, ctx)
    const since = started === undefined ? undefined : started - START_SLACK_MS
    const top = worktrees ? storage() : undefined
    return {
      running,
      since,
      open: stateFile === undefined ? none : openWindows(stateFile),
      used: top === undefined ? none : usedSince(top, since),
    }
  }

  /** The reason the editor may have something open by its storage, while it is as `w` says. */
  const usedReason = (w: Windows): string =>
    w.since === undefined
      ? `${editor.product} runs, or may; when it started is not known, and its storage names this (${root})`
      : `${editor.product}'s storage for this was written since ${editor.product} started (${root})`

  /** The refusal of `c` when what the editor has open could not be read because of `problems`. */
  const unreadable = (c: Candidate, problems: readonly string[]): Objection[] =>
    problems.length === 0
      ? []
      : [
          own(
            c,
            'refuse',
            editor.codes.stateUnreadable,
            `${problems.join('; ')}; ${editor.product} runs, or may, and a window may have this open`,
          ),
        ]

  /** The objections to deleting git's worktree `c`, whose real path is `dir`, while the editor is as `w` says. */
  const worktreeCheck = (
    c: PathCandidate,
    w: Windows,
    ctx: Pick<Ctx, 'signal'>,
    dir: string = realAbove(c.path),
  ): Objection[] => {
    // With no process of the editor's anywhere, none works in this worktree and no window has it open;
    // an agent under another program's name may.
    if (!w.running && !editor.agentUnnamed) return []
    const here = kit.running({ in: c.path }, ctx)
    // The kit names each process, in the order of `processes`.
    const names = here.names.filter((_, i) => editor.process.test(here.processes[i]?.command ?? ''))
    if (names.length > 0) {
      return [
        own(c, 'refuse', editor.codes.inUse, `${editor.product} works in it: ${names.join(', ')}`),
      ]
    }
    if (editor.agentUnnamed && here.processes.length > 0) {
      return [
        own(
          c,
          'refuse',
          editor.codes.inUse,
          `${editor.product}'s agent may work in it, under another program's name: ${here.names.join(', ')}`,
        ),
      ]
    }
    const unchecked = (): Objection[] =>
      here.unknown === undefined
        ? []
        : [
            own(
              c,
              'note',
              `${editor.name}-unchecked`,
              `the processes working in it could not be listed (${here.unknown}); ${editor.product} was not fully checked`,
            ),
          ]
    if (!w.running) return unchecked()
    // What is gone is named as the editor spelled it, so the worktree's own spelling counts too.
    const holds = (named: Named): boolean =>
      named.paths.some((p) => within(p, dir) || within(p, c.path))
    if (holds(w.open)) {
      return [
        own(
          c,
          'refuse',
          editor.codes.inUse,
          `a ${editor.product} window has it open (${stateFile})`,
        ),
      ]
    }
    if (holds(w.used)) return [own(c, 'refuse', editor.codes.inUse, usedReason(w))]
    const refused = unreadable(c, [...w.open.problems, ...w.used.problems])
    return refused.length > 0 ? refused : unchecked()
  }

  /** The objections to deleting `c`, storage for the gone folder `local`, while the editor is as `w` says. */
  const goneCheck = (c: Candidate, local: string, w: Windows): Objection[] => {
    if (!w.running) return []
    if (w.open.paths.includes(realOr(local))) {
      return [
        own(c, 'refuse', editor.codes.inUse, `a ${editor.product} window still has ${local} open`),
      ]
    }
    if (c.path !== undefined && touchedSince(c.path, w.since)) {
      return [own(c, 'refuse', editor.codes.inUse, usedReason(w))]
    }
    return unreadable(c, w.open.problems)
  }

  return {
    name: editor.name,
    limits: { discover: DISCOVER_LIMIT_MS },
    // Its agent worktrees are refused even where its storage is not, as on a host with only the CLI.
    detect: () => storage() !== undefined || (agentDir !== undefined && isDir(realOr(agentDir))),
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
        await yieldToLimit(ctx)
        const dir = join(top, name)
        const entry = entryOf(dir)
        if (entry.state === 'skip') continue
        const c =
          entry.state === 'gone'
            ? goneCandidate(editor, kit, dir, entry)
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
    async object(all, ctx) {
      const out: Objection[] = []
      const gone: Array<{ c: Candidate; local: string }> = []
      for (const c of all) {
        const e = c.owner === editor.name ? entries.get(c.id) : undefined
        if (e?.state === 'unknown')
          out.push(own(c, 'refuse', editor.codes.unknownWorkspace, e.problem))
        if (e?.state === 'gone') gone.push({ c, local: e.local })
      }
      // Resolved here, as the folder may be newer than this plugin. A worktree is looked for in it by
      // both spellings of each, so that neither a link nor a folder that is gone hides it.
      const agents = agentDir === undefined ? undefined : realAbove(agentDir)
      const worktrees: Array<{ c: PathCandidate; dir: string }> = []
      for (const c of all.filter(isGitWorktree)) {
        const dir = realAbove(c.path)
        const inside = (d: string | undefined): boolean =>
          d !== undefined && (within(c.path, d) || within(dir, d))
        if (inside(agentDir) || inside(agents)) {
          out.push(
            own(c, 'refuse', AGENT_WORKTREE, `${editor.product}'s agents keep it (${agents})`),
          )
        } else if (!placeOnly) {
          worktrees.push({ c, dir })
        }
      }
      if (worktrees.length === 0 && gone.length === 0) return out

      const windows = await look(ctx, worktrees.length > 0)
      for (const { c, dir } of worktrees) out.push(...worktreeCheck(c, windows, ctx, dir))
      for (const { c, local } of gone) out.push(...goneCheck(c, local, windows))
      return out
    },
    async prepare(c, ctx) {
      // A window may have opened it since `object`.
      let objections: Objection[] = []
      if (isGitWorktree(c)) {
        if (placeOnly) return
        objections = worktreeCheck(c, await look(ctx, true), ctx)
      } else if (c.owner === editor.name && typeof c.evidence.workspace === 'string') {
        // One with no workspace is of a shape this plugin does not know, which `object` refuses.
        const local = localPath(c.evidence.workspace)
        if (local !== null) objections = goneCheck(c, local, await look(ctx, false))
      }
      const refusal = objections.find((o) => o.level === 'refuse')
      if (refusal !== undefined) throw new Error(refusal.reason)
    },
    delete(c, ctx) {
      if (c.path === undefined) throw new Error(`${c.id} is not a storage folder`)
      if (root === undefined || dirname(c.path) !== root) {
        throw new Error(`${c.path} is not in ${editor.product}'s workspaceStorage`)
      }
      if (lstatSync(c.path, { throwIfNoEntry: false }) === undefined) {
        return `already gone: ${c.path}`
      }
      // Read again: its workspace may be back, or the folder no longer the editor's.
      const now = entryOf(c.path)
      if (now.state !== 'gone' || now.workspace !== c.evidence.workspace) {
        throw new Error(`${c.path} is no longer storage for a workspace that is gone`)
      }
      const history = c.costDescription === 'lost' ? [] : historyIn(c.path)
      if (history.length > 0) {
        throw new Error(`${c.path} now holds chat or agent history (${history.join(', ')})`)
      }
      return kit.remove(c.path, ctx)
    },
  }
}

function goneCandidate(
  editor: Editor,
  kit: Kit,
  dir: string,
  e: Extract<Entry, { state: 'gone' }>,
): Candidate {
  const bytes = kit.size(dir)
  // Storage that always holds chat is `lost` anyway, so its history folders are not read.
  const history = editor.keepsChat ? [] : historyIn(dir)
  const hasHistory = history.length > 0
  const historyNote = editor.keepsChat
    ? ', in the storage where it keeps chat history'
    : hasHistory
      ? `, with chat or agent history in ${history.join(', ')}`
      : ''
  return kit.candidate({
    kind: KIND,
    path: dir,
    why: `${editor.product} kept state for ${e.local}, which no longer exists${historyNote}`,
    ...(bytes === null ? {} : { bytes }),
    // `lost` alone holds it; see Candidate.costDescription in types.ts.
    costDescription: hasHistory || editor.keepsChat ? 'lost' : 're-download',
    evidence: {
      kind: KIND,
      path: dir,
      workspace: e.workspace,
      ...(hasHistory ? { history } : {}),
    },
  })
}

/** `editor`'s plugin on `kit`, or on a kit built from `opts`; the kit is attached so the core binds it each run. */
function pluginOf(
  editor: Editor,
  opts: VscodeOptions = {},
  kit: Kit = pluginKit(editor.name, opts),
): Plugin {
  const plugin = build(editor, kit, opts)
  attachKit(plugin, kit)
  return plugin
}

/** `editor`'s plugin as the command line builds it. No settings of its own. */
const definitionOf = (editor: Editor) =>
  definePlugin({
    name: editor.name,
    api: PLUGIN_API,
    settings: z.strictObject({}),
    create: ({ kit, env }) => pluginOf(editor, { env }, kit),
  })

/** The `vscode` plugin on `kit`, or on a kit built from `opts`. */
export const vscodePlugin = (opts?: VscodeOptions, kit?: Kit): Plugin => pluginOf(VSCODE, opts, kit)

/** The `cursor` plugin's options, the same as the `vscode` plugin's. */
export type CursorOptions = VscodeOptions

/** The `cursor` plugin on `kit`, or on a kit built from `opts`. */
export const cursorPlugin = (opts?: CursorOptions, kit?: Kit): Plugin => pluginOf(CURSOR, opts, kit)

/** The `vscode` plugin as the command line builds it. No settings of its own. */
export const vscodeDefinition = definitionOf(VSCODE)

/** The `cursor` plugin as the command line builds it. No settings of its own. */
export const cursorDefinition = definitionOf(CURSOR)
