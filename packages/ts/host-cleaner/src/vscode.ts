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
 * settings and state (`re-download`). A remote URI cannot be checked from
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
  type CostDescription,
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
  /** What deleting a dead workspace's storage costs. */
  costDescription: CostDescription
  /** What that storage holds, as `why` says it. */
  holds: string
}

const VSCODE: Editor = {
  name: VSCODE_PLUGIN,
  product: 'VS Code',
  appDir: 'Code',
  // `Code` and its `Code Helper (…)` processes on macOS, `code` on Linux.
  process: /^code(?:\s|\\x20|$)/i,
  costDescription: 're-download',
  holds: 'state',
}

const CURSOR: Editor = {
  name: CURSOR_PLUGIN,
  product: 'Cursor',
  appDir: 'Cursor',
  // `Cursor` and its `Cursor Helper (…)` processes on macOS, `cursor` on Linux.
  process: /^cursor(?:\s|\\x20|$)/i,
  // Its chat history is kept there, and nothing brings it back.
  costDescription: 'lost',
  holds: 'state and chat history',
}

/** The longest `discover` may take: it sizes every dead storage folder. */
const DISCOVER_LIMIT_MS = 5 * 60_000

/** A mount point and the folder a volume is mounted on; a path under one that is missing or empty is on a volume that is not mounted. */
const VOLUME =
  /^(\/Volumes\/[^/]+|\/run\/media\/[^/]+\/[^/]+|\/media\/[^/]+\/[^/]+|\/mnt\/[^/]+)(?:\/|$)/

export interface VscodeOptions extends KitOptions {
  /** The editor's `User` folder. Default: under `HOME`, by platform. */
  userDir?: string | undefined
  /** Default: this process's. */
  platform?: NodeJS.Platform | undefined
}

/** `editor`'s `User` folder on `platform`; undefined where the plugin does not know it. */
function userDirOf(
  editor: Editor,
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform,
): string | undefined {
  const home = env.HOME ?? homedir()
  if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', editor.appDir, 'User')
  }
  if (platform === 'linux') return join(home, '.config', editor.appDir, 'User')
  return undefined
}

/** VS Code's `User` folder on `platform`; undefined where the plugin does not know it. */
export const vscodeUserDir = (
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform,
): string | undefined => userDirOf(VSCODE, env, platform)

/** Cursor's `User` folder on `platform`; undefined where the plugin does not know it. */
export const cursorUserDir = (
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform,
): string | undefined => userDirOf(CURSOR, env, platform)

/** What one storage folder says about its workspace. */
type Entry =
  | { state: 'gone'; workspace: string; local: string }
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

/** The local path a `file:` URI names; null for another scheme; throws when it is not a URI. */
function localPath(uri: string): string | null {
  const url = new URL(uri)
  return url.protocol === 'file:' ? fileURLToPath(url) : null
}

/** What the storage folder `dir` says, read from its `workspace.json`. */
function entryOf(dir: string): Entry {
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
  return unmounted(local) ? { state: 'skip' } : { state: 'gone', workspace, local }
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
  const { product } = editor
  const userDir =
    opts.userDir ?? userDirOf(editor, opts.env ?? process.env, opts.platform ?? process.platform)
  const root = userDir === undefined ? undefined : join(userDir, 'workspaceStorage')
  const stateFile =
    userDir === undefined ? undefined : join(userDir, 'globalStorage', 'storage.json')
  const present = (): boolean =>
    root !== undefined && lstatSync(root, { throwIfNoEntry: false }) !== undefined

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
    detect: present,
    roots: () => (root !== undefined && present() ? [root] : []),
    discover() {
      if (root === undefined || !present()) return []
      const found = new Map<string, Entry>()
      const out: Candidate[] = []
      for (const name of readdirSync(root).sort()) {
        const dir = join(root, name)
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
    object(all, ctx) {
      const out: Objection[] = []
      const gone: Array<{ c: Candidate; local: string }> = []
      for (const c of all) {
        const e = c.owner === editor.name ? entries.get(c.id) : undefined
        if (e?.state === 'unknown') out.push(own(c, 'refuse', UNKNOWN_WORKSPACE, e.problem))
        if (e?.state === 'gone') gone.push({ c, local: e.local })
      }
      const worktrees = all.filter(isGitWorktree)
      if (worktrees.length === 0 && gone.length === 0) return out

      // The window state outlives a quit, so it counts only while the editor runs, or may.
      const anywhere = kit.running({ in: '/' }, ctx)
      const running =
        processesOf(editor, anywhere.names).length > 0 || anywhere.unknown !== undefined
      const windows = running && stateFile !== undefined ? openWindows(stateFile) : { paths: [] }
      const opened = (path: string): boolean => windows.paths.some((p) => within(p, canon(path)))

      for (const c of worktrees) {
        const procs = processesOf(editor, kit.running({ in: c.path }, ctx).names)
        if (procs.length > 0) {
          out.push(own(c, 'refuse', IN_USE, `${product} works in it: ${procs.join(', ')}`))
        } else if (opened(c.path)) {
          out.push(own(c, 'refuse', IN_USE, `a ${product} window has it open (${stateFile})`))
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
          out.push(own(c, 'refuse', IN_USE, `a ${product} window still has ${local} open`))
        }
      }
      return out
    },
    delete(c, ctx) {
      if (c.path === undefined) throw new Error(`${c.id} is not a storage folder`)
      if (root === undefined || dirname(c.path) !== root) {
        throw new Error(`${c.path} is not in ${product}'s workspaceStorage`)
      }
      if (lstatSync(c.path, { throwIfNoEntry: false }) === undefined) {
        return `already gone: ${c.path}`
      }
      // Read again: its workspace may be back, or the folder no longer the editor's.
      const now = entryOf(c.path)
      if (now.state !== 'gone' || now.workspace !== c.evidence.workspace) {
        throw new Error(`${c.path} is no longer storage for a workspace that is gone`)
      }
      return kit.remove(c.path, ctx)
    },
  }
}

function goneCandidate(
  editor: Editor,
  kit: Kit,
  dir: string,
  e: { workspace: string; local: string },
): Candidate {
  const bytes = kit.size(dir)
  return kit.candidate({
    kind: KIND,
    path: dir,
    why: `${editor.product} kept ${editor.holds} for ${e.local}, which no longer exists`,
    ...(bytes === null ? {} : { bytes }),
    costDescription: editor.costDescription,
    evidence: { kind: KIND, path: dir, workspace: e.workspace },
  })
}

/** `editor`'s plugin as the command line builds it. No settings of its own. */
const definitionOf = (editor: Editor) =>
  definePlugin({
    name: editor.name,
    api: PLUGIN_API,
    settings: z.strictObject({}),
    create: ({ kit, env }) => build(editor, kit, { env }),
  })

/** `editor`'s plugin on a kit built from `opts`, made through `definePlugin` so the core binds that kit each run. */
function pluginOf(editor: Editor, opts: VscodeOptions): Plugin {
  return definePlugin({
    name: editor.name,
    api: PLUGIN_API,
    settings: z.strictObject({}),
    create: ({ kit }) => build(editor, kit, opts),
  }).create({
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

/** The `cursor` plugin on a kit built from `opts`; `userDir` is Cursor's `User` folder. */
export const cursorPlugin = (opts: VscodeOptions = {}): Plugin => pluginOf(CURSOR, opts)
