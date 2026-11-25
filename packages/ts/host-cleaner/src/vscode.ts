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
 * folder is proposed and refused (`unknown-workspace`), which is how it shows
 * as a note. A path on a volume that is not mounted is not gone either.
 *
 * Built on the plugin kit alone, as a code plugin would be.
 */

import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

import { pluginKit, type Kit, type KitOptions } from './kit.ts'
import {
  PLUGIN_API,
  definePlugin,
  type Candidate,
  type Objection,
  type PathCandidate,
  type Plugin,
} from './types.ts'

export const VSCODE_PLUGIN = 'vscode'
export const CURSOR_PLUGIN = 'cursor'

/** The refusal of a candidate an editor window has open. */
export const IN_USE = 'in-use'

/** The refusal of a storage folder whose `workspace.json` is a shape this plugin does not know. */
export const UNKNOWN_WORKSPACE = 'unknown-workspace'

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
  /** Its process names, as `kit.running` gives them without the pid. */
  process: RegExp
  /** True when its workspace storage always holds chat history, so deleting it is `lost`. */
  keepsChat: boolean
  /** The folder under `HOME` where its agents make and track their own worktrees. */
  agentWorktrees?: string
}

const VSCODE: Editor = {
  name: VSCODE_PLUGIN,
  product: 'VS Code',
  appDir: 'Code',
  // `Code` and its `Code Helper (…)` processes on macOS, `code` on Linux.
  process: /^code(?:\s|\\x20|$)/i,
  keepsChat: false,
}

const CURSOR: Editor = {
  name: CURSOR_PLUGIN,
  product: 'Cursor',
  appDir: 'Cursor',
  // `Cursor` and its `Cursor Helper (…)` processes on macOS, `cursor` on Linux, and the `cursor-agent` CLI,
  // which lsof cuts to its first 9 characters, `cursor-ag`.
  process: /^cursor(?:-ag(?:ent)?)?(?:\s|\\x20|$)/i,
  keepsChat: true,
  agentWorktrees: join('.cursor', 'worktrees'),
}

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
 * had again: a chat with at least one request (one that cannot be read counts,
 * an empty file is a chat with none), an editing session whose `contents/`
 * has the files it changed, or anything at all in Copilot's folders.
 */
function holdsHistory(name: (typeof HISTORY_FOLDERS)[number], path: string): boolean {
  if (name === 'chatSessions') {
    return readdirSync(path).some((file) => {
      const log = file.endsWith('.jsonl')
      // VS Code reads no other files there.
      if (!log && !file.endsWith('.json')) return false
      try {
        return chatRequests(readFileSync(join(path, file), 'utf8'), log) > 0
      } catch {
        return true
      }
    })
  }
  if (name === 'chatEditingSessions') {
    return readdirSync(path).some((session) => {
      const contents = join(path, session, 'contents')
      try {
        return isDir(join(path, session)) && isDir(contents) && filled(contents)
      } catch {
        return true
      }
    })
  }
  return filled(path)
}

/** A mount point and the folder a volume is mounted on; a path under one that is missing or empty is on a volume that is not mounted. */
const VOLUME =
  /^(\/Volumes\/[^/]+|\/run\/media\/[^/]+\/[^/]+|\/media\/[^/]+\/[^/]+|\/mnt\/[^/]+)(?:\/|$)/

export interface VscodeOptions extends KitOptions {
  /** The editor's `User` folder. Default: under `HOME`, by platform. */
  userDir?: string | undefined
  /** Default: this process's. */
  platform?: NodeJS.Platform | undefined
}

type Env = Readonly<Record<string, string | undefined>>

/** `HOME`, or the OS's home when it is unset or empty. */
const homeOf = (env: Env): string => env.HOME || homedir()

/** `editor`'s `User` folder under `home` on `platform`; undefined where the plugin does not know it. */
function userDirOf(editor: Editor, home: string, platform: NodeJS.Platform): string | undefined {
  if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', editor.appDir, 'User')
  }
  if (platform === 'linux') return join(home, '.config', editor.appDir, 'User')
  return undefined
}

/** VS Code's `User` folder on `platform`; undefined where the plugin does not know it. */
export const vscodeUserDir = (env: Env, platform: NodeJS.Platform): string | undefined =>
  userDirOf(VSCODE, homeOf(env), platform)

/** Cursor's `User` folder on `platform`; undefined where the plugin does not know it. */
export const cursorUserDir = (env: Env, platform: NodeJS.Platform): string | undefined =>
  userDirOf(CURSOR, homeOf(env), platform)

/** What one storage folder says about its workspace. */
type Entry =
  | { state: 'gone'; workspace: string; local: string; history: string[] }
  | { state: 'unknown'; problem: string }
  /** Live, remote, an empty window's, on a volume not mounted, or not a folder of the editor's. */
  | { state: 'skip' }

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** A path with symlinks resolved, so two spellings of one place compare equal. */
function canon(path: string): string {
  try {
    return realpathSync(path)
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

/** The {@link HISTORY_FOLDERS} in `dir` that are folders holding history (see {@link holdsHistory}); one that cannot be read counts. */
function historyIn(dir: string): string[] {
  return HISTORY_FOLDERS.filter((name) => {
    const path = join(dir, name)
    try {
      return isDir(path) && holdsHistory(name, path)
    } catch {
      return true
    }
  })
}

/** The local path a `file:` URI names; null for another scheme; throws when it is not a URI. */
function localPath(uri: string): string | null {
  const url = new URL(uri)
  return url.protocol === 'file:' ? fileURLToPath(url) : null
}

/** What the storage folder `dir` says, read from its `workspace.json`. */
function entryOf(dir: string, withHistory: boolean): Entry {
  // The editor makes each one a folder; a link or a file is not one of its own and is never followed.
  if (lstatSync(dir, { throwIfNoEntry: false })?.isDirectory() !== true) return { state: 'skip' }
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
  const named = (['folder', 'workspace'] as const).filter((k) => body[k] !== undefined)
  const key = named[0]
  if (named.length !== 1 || key === undefined) {
    return {
      state: 'unknown',
      problem: `workspace.json names ${named.length === 0 ? 'neither a folder nor a workspace' : 'both a folder and a workspace'}`,
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
  return { state: 'gone', workspace, local, history: withHistory ? historyIn(dir) : [] }
}

/** The local folders and workspace files the window state names; `problem` when it is not a shape this plugin knows. */
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
  for (const w of windows) {
    if (!isObject(w)) continue
    const id = isObject(w.workspaceIdentifier) ? w.workspaceIdentifier.configURIPath : undefined
    for (const uri of [w.folder, id]) {
      if (typeof uri !== 'string') continue
      try {
        const local = localPath(uri)
        if (local !== null) paths.push(canon(local))
      } catch {
        // Not a URI: names nothing that could be open here.
      }
    }
  }
  return { paths }
}

/** A git plugin's worktree row. */
const isGitWorktree = (c: Candidate): c is PathCandidate =>
  c.kind === 'worktree' && c.owner === 'git' && c.path !== undefined

/** `editor`'s processes among `kit.running`'s names. */
const processesOf = (editor: Editor, names: readonly string[]): string[] =>
  names.filter((n) => editor.process.test(n.replace(/ \(pid \d+\)$/, '')))

function build(editor: Editor, kit: Kit, opts: VscodeOptions): Plugin {
  const home = homeOf(opts.env ?? process.env)
  const userDir = opts.userDir ?? userDirOf(editor, home, opts.platform ?? process.platform)
  const root = userDir === undefined ? undefined : join(userDir, 'workspaceStorage')
  const stateFile =
    userDir === undefined ? undefined : join(userDir, 'globalStorage', 'storage.json')
  const agentDir =
    editor.agentWorktrees === undefined ? undefined : canon(join(home, editor.agentWorktrees))
  // Storage that always holds chat is `lost` whatever its history folders hold.
  const withHistory = !editor.keepsChat
  const present = (): boolean =>
    root !== undefined && lstatSync(root, { throwIfNoEntry: false }) !== undefined
  // Its agent worktrees are refused even where its storage is not, as on a host with only the CLI.
  const detect = (): boolean => present() || (agentDir !== undefined && isDir(agentDir))

  /** The last discovery's entries by candidate id, kept for `object`. */
  let entries = new Map<string, Entry>()

  const own = (
    c: Candidate,
    level: Objection['level'],
    code: string,
    reason: string,
  ): Objection => ({
    by: editor.name,
    candidate: c.id,
    level,
    code,
    reason,
  })

  return {
    name: editor.name,
    limits: { discover: DISCOVER_LIMIT_MS },
    detect,
    roots: () => (root !== undefined && present() ? [root] : []),
    discover() {
      if (root === undefined || !present()) return []
      const found = new Map<string, Entry>()
      const out: Candidate[] = []
      for (const name of readdirSync(root).sort()) {
        const dir = join(root, name)
        const entry = entryOf(dir, withHistory)
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
    object(all, ctx) {
      const out: Objection[] = []
      const gone: Array<{ c: Candidate; local: string }> = []
      for (const c of all) {
        const e = c.owner === editor.name ? entries.get(c.id) : undefined
        if (e?.state === 'unknown') out.push(own(c, 'refuse', UNKNOWN_WORKSPACE, e.problem))
        if (e?.state === 'gone') gone.push({ c, local: e.local })
      }
      const worktrees: PathCandidate[] = []
      for (const c of all.filter(isGitWorktree)) {
        if (agentDir !== undefined && within(canon(c.path), agentDir)) {
          out.push(
            own(c, 'refuse', AGENT_WORKTREE, `${editor.product}'s agents keep it (${agentDir})`),
          )
        } else {
          worktrees.push(c)
        }
      }
      if (worktrees.length === 0 && gone.length === 0) return out

      // The window state outlives a quit, so it counts only while the editor runs, or may.
      const anywhere = kit.running({ in: '/' }, ctx)
      const running =
        processesOf(editor, anywhere.names).length > 0 || anywhere.unknown !== undefined
      const windows = running && stateFile !== undefined ? openWindows(stateFile) : { paths: [] }
      for (const c of worktrees) {
        const real = canon(c.path)
        const procs = processesOf(editor, kit.running({ in: c.path }, ctx).names)
        if (procs.length > 0) {
          out.push(own(c, 'refuse', IN_USE, `${editor.product} works in it: ${procs.join(', ')}`))
        } else if (windows.paths.some((p) => within(p, real))) {
          out.push(own(c, 'refuse', IN_USE, `a ${editor.product} window has it open (${stateFile})`))
        } else if (windows.problem !== undefined) {
          out.push(
            own(
              c,
              'note',
              `${editor.name}-state-unreadable`,
              `${windows.problem}; only processes were checked`,
            ),
          )
        }
      }
      for (const { c, local } of gone) {
        if (windows.paths.includes(canon(local))) {
          out.push(own(c, 'refuse', IN_USE, `a ${editor.product} window still has ${local} open`))
        }
      }
      return out
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
      const now = entryOf(c.path, withHistory)
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

function goneCandidate(
  editor: Editor,
  kit: Kit,
  dir: string,
  e: { workspace: string; local: string; history: string[] },
): Candidate {
  const bytes = kit.size(dir)
  const hasHistory = e.history.length > 0
  return kit.candidate({
    kind: KIND,
    path: dir,
    why: editor.keepsChat
      ? `${editor.product} kept state for ${e.local}, which no longer exists, in the storage where it keeps chat history`
      : `${editor.product} kept state for ${e.local}, which no longer exists${hasHistory ? `, with chat or agent history in ${e.history.join(', ')}` : ''}`,
    ...(bytes === null ? {} : { bytes }),
    // A `lost` candidate is held, and runs only with `--allow discard-user-data`.
    costDescription: hasHistory || editor.keepsChat ? 'lost' : 're-download',
    evidence: {
      kind: KIND,
      path: dir,
      workspace: e.workspace,
      ...(hasHistory ? { history: e.history } : {}),
    },
  })
}

/** `editor`'s plugin definition, built over `opts` and the `env` it is created with. No settings of its own. */
const definitionOf = (editor: Editor, opts?: VscodeOptions) =>
  definePlugin({
    name: editor.name,
    api: PLUGIN_API,
    settings: z.strictObject({}),
    create: ({ kit, env }) => build(editor, kit, { ...opts, env }),
  })

/** `editor`'s plugin on a kit built from `opts`, made through `definePlugin` so the core binds that kit each run. */
function pluginOf(editor: Editor, opts: VscodeOptions): Plugin {
  return definitionOf(editor, opts).create({
    settings: {},
    only: [],
    env: opts.env ?? process.env,
    kit: pluginKit(editor.name, opts),
  })
}

/** The `vscode` plugin as the command line builds it. No settings of its own. */
export const vscodeDefinition = definitionOf(VSCODE)

/** The `cursor` plugin as the command line builds it. No settings of its own. */
export const cursorDefinition = definitionOf(CURSOR)

/** The `vscode` plugin on a kit built from `opts`. */
export const vscodePlugin = (opts: VscodeOptions = {}): Plugin => pluginOf(VSCODE, opts)

/** The `cursor` plugin on a kit built from `opts`. */
export const cursorPlugin = (opts: VscodeOptions = {}): Plugin => pluginOf(CURSOR, opts)
