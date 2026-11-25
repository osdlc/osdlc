/**
 * The `agent-history` plugin: Claude Code's history of projects whose folder
 * no longer exists, such as a removed worktree.
 *
 * A project folder's name ({@link projectFolderName}) cannot be reversed, so
 * the path is read from what the folder records ({@link decodeFolder}); a
 * folder whose records do not match its name is skipped, never guessed. The
 * candidates, refusals and why Codex is left out: "The `agent-history` plugin"
 * in the package README.
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
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

import { z } from 'zod'

import { objectionsTo, present, type Row } from './artifacts.ts'
import type { Kit } from './kit.ts'
import { PLUGIN_API, definePlugin, type Ctx, type Plugin } from './types.ts'

export const AGENT_HISTORY_PLUGIN = 'agent-history'

/** How much of a transcript is read for its first `cwd`. */
const HEAD_BYTES = 256 * 1024

/** Long, since `discover` reads every project folder and sizes each candidate. */
const DISCOVER_LIMIT_MS = 10 * 60_000

/** Where removable volumes are mounted; the folder above a gone path being one of these means its volume may be away. */
const MOUNTS: readonly string[] = ['/Volumes', '/mnt', '/media', '/run/media']
/** Mount folders that hold one folder per user. */
const USER_MOUNTS: ReadonlySet<string> = new Set(['/media', '/run/media'])

/** The name Claude Code gives the project folder of `path`, before it shortens a long one. */
export const projectFolderName = (path: string): string => path.replace(/[^A-Za-z0-9]/g, '-')

/** The longest name Claude Code keeps whole; a longer one is cut to this and a hash added. */
const NAME_LIMIT = 200

/**
 * Whether `name` is the project folder of `path`: its name, or, past
 * {@link NAME_LIMIT} characters, its first {@link NAME_LIMIT} and a hash.
 */
export function isFolderOf(path: string, name: string): boolean {
  const full = projectFolderName(path)
  if (full.length <= NAME_LIMIT) return full === name
  const cut = `${full.slice(0, NAME_LIMIT)}-`
  return name.startsWith(cut) && /^-?[0-9a-z]+$/i.test(name.slice(cut.length))
}

/** The mount points `/etc/fstab` text names, but the root and swap. */
export function fstabMounts(text: string): string[] {
  return text.split('\n').flatMap((line) => {
    const [source, at] = line.trim().split(/\s+/)
    if (source === undefined || source.startsWith('#') || at === undefined) return []
    // fstab writes a space in a path as `\040`.
    const point = at.replace(/\\([0-7]{3})/g, (_, o: string) =>
      String.fromCharCode(parseInt(o, 8)),
    )
    return point.startsWith('/') && point !== '/' ? [point] : []
  })
}

/** Where volumes are mounted on this host: {@link MOUNTS} and the mount points in `/etc/fstab`. */
function mountPoints(): ReadonlySet<string> {
  let listed: string[] = []
  try {
    listed = fstabMounts(readFileSync('/etc/fstab', 'utf8'))
  } catch {
    // No fstab: only the usual places.
  }
  return new Set([...MOUNTS, ...listed])
}

/** Claude Code's config folder: `CLAUDE_CONFIG_DIR`, else `.claude` in the home folder. */
export function claudeConfigDir(env: Readonly<Record<string, string | undefined>>): string {
  const set = env.CLAUDE_CONFIG_DIR
  return set !== undefined && set !== '' ? resolve(set) : join(env.HOME || homedir(), '.claude')
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err))

const isDir = (path: string): boolean =>
  lstatSync(path, { throwIfNoEntry: false })?.isDirectory() === true

/** Whether `path` is gone; false when it cannot be told. */
function gone(path: string): boolean {
  try {
    return !present(path)
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ENOTDIR'
  }
}

/**
 * Whether `path` may be on a volume that is not mounted: the nearest folder
 * above it that exists is one of `mounts` or a user's folder in one of
 * {@link USER_MOUNTS}, or no folder above it exists but the root, such as
 * `/Volumes/x` recorded on a Mac and read on Linux, or a Windows drive that is away.
 */
export function unmounted(path: string, mounts: ReadonlySet<string> = new Set(MOUNTS)): boolean {
  let dir = dirname(path)
  while (dirname(dir) !== dir && gone(dir)) dir = dirname(dir)
  return dirname(dir) === dir || mounts.has(dir) || USER_MOUNTS.has(dirname(dir))
}

/** Reused by every `head` read, which is synchronous. */
let headBuf: Buffer | undefined

/** The first `HEAD_BYTES` of `file`, and whether that is all of it. */
function head(file: string): { text: string; whole: boolean } {
  const fd = openSync(file, 'r')
  try {
    const buf = (headBuf ??= Buffer.allocUnsafe(HEAD_BYTES))
    const n = readSync(fd, buf, 0, HEAD_BYTES, 0)
    return { text: buf.toString('utf8', 0, n), whole: n < HEAD_BYTES }
  } finally {
    closeSync(fd)
  }
}

/** The first `cwd` a transcript records, within its head; undefined when there is none. */
function firstCwd(file: string): string | undefined {
  const { text, whole } = head(file)
  const lines = text.split('\n')
  // The last line may be cut off at the read limit.
  if (!whole) lines.pop()
  for (const line of lines) {
    let row: unknown
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    if (isObject(row) && typeof row.cwd === 'string') return row.cwd
  }
  return undefined
}

/** The `projectPath` of each entry in a `sessions-index.json`; a file that does not parse names none. */
function indexPaths(file: string): string[] {
  let body: unknown
  try {
    body = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return []
  }
  const entries = isObject(body) && Array.isArray(body.entries) ? body.entries : []
  return entries.flatMap((e) =>
    isObject(e) && typeof e.projectPath === 'string' ? [e.projectPath] : [],
  )
}

/** What one project folder records: the paths it names, sorted, and its transcripts' file names. */
export interface ProjectRecord {
  paths: string[]
  sessions: string[]
}

/**
 * The paths the project folder `dir` records, or null when it records none,
 * or one that is not absolute, does not turn into the folder's name, or fails
 * `keep`. It stops reading at the first such path. Links inside it are not
 * followed. Throws when it cannot be read.
 */
export function decodeFolder(
  dir: string,
  keep: (path: string) => boolean = () => true,
): ProjectRecord | null {
  const name = basename(dir)
  const paths = new Set<string>()
  const sessions: string[] = []
  const ok = (p: string): boolean => {
    if (paths.has(p)) return true
    paths.add(p)
    return isAbsolute(p) && isFolderOf(p, name) && keep(p)
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const file = join(dir, entry.name)
    if (entry.name.endsWith('.jsonl')) {
      sessions.push(entry.name)
      const cwd = firstCwd(file)
      if (cwd !== undefined && !ok(cwd)) return null
    } else if (entry.name === 'sessions-index.json') {
      if (!indexPaths(file).every(ok)) return null
    }
  }
  if (paths.size === 0) return null
  return { paths: [...paths].sort(), sessions: sessions.sort() }
}

/** A Claude Code session whose process is alive. */
interface Session {
  pid: number
  sessionId: string
  cwd: string
}

/** The live sessions, and why they may be incomplete. */
interface Sessions {
  live: Session[]
  unknown?: string | undefined
}

/** Whether a process `pid` exists; true when it cannot be told. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

/**
 * The live sessions in `<config>/sessions/<pid>.json`. `unknown` is set when
 * the folder cannot be read, or the file of a live pid cannot, since that
 * session could be in any project. No folder means no session is recorded.
 */
function liveSessions(config: string): Sessions {
  const dir = join(config, 'sessions')
  let names: string[]
  try {
    if (!present(dir)) return { live: [] }
    names = readdirSync(dir)
  } catch (err) {
    return { live: [], unknown: `${dir} cannot be read: ${errorText(err)}` }
  }
  const live: Session[] = []
  let unknown: string | undefined
  for (const name of names.sort()) {
    const m = /^(\d+)\.json$/.exec(name)
    if (m === null) continue
    const pid = Number(m[1])
    if (pid <= 0 || !alive(pid)) continue
    const file = join(dir, name)
    let body: unknown
    try {
      body = JSON.parse(readFileSync(file, 'utf8'))
    } catch (err) {
      // The session ended between the listing and the read.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue
      unknown ??= `${file} cannot be read: ${errorText(err)}`
      continue
    }
    if (!isObject(body)) unknown ??= `${file} is not a session record`
    else live.push({ pid, sessionId: str(body.sessionId), cwd: str(body.cwd) })
  }
  return { live, unknown }
}

/** What a scan reads once for every folder. */
interface Seen {
  sessions: Sessions
  mounts: ReadonlySet<string>
  ctx: Ctx
}

/** The row for the project folder `dir`, or null when it is not a candidate; `sized: false` leaves out its bytes. */
function rowFor(kit: Kit, dir: string, seen: Seen, sized = true): Row | null {
  const name = basename(dir)
  if (!isDir(dir)) return null
  let record: ProjectRecord | null
  try {
    record = decodeFolder(dir, (p) => gone(p) && !unmounted(p, seen.mounts))
  } catch {
    return null
  }
  if (record === null) return null

  const blockers: Row['blockers'] = []
  const { live, unknown } = seen.sessions
  const sessions = live.filter(
    (s) =>
      (s.cwd !== '' && isFolderOf(s.cwd, name)) ||
      record.sessions.includes(`${s.sessionId}.jsonl`),
  )
  if (sessions.length > 0) {
    blockers.push({
      code: 'live-session',
      reason: `a Claude Code session is running in it (pid ${sessions.map((s) => s.pid).join(', ')})`,
    })
  }
  if (unknown !== undefined) blockers.push({ code: 'session-state-unreadable', reason: unknown })
  let unreadable: string | undefined
  for (const p of record.paths) {
    // Linux names the working folder of a process whose folder was removed `<path> (deleted)`.
    const names: string[] = []
    for (const where of [p, `${p} (deleted)`]) {
      const held = kit.running({ in: where }, seen.ctx)
      names.push(...held.names)
      unreadable ??= held.unknown
    }
    if (names.length > 0) {
      blockers.push({
        code: 'live-process',
        reason: `running in ${p}: ${[...new Set(names)].join(', ')}`,
      })
    }
  }
  if (unreadable !== undefined) {
    blockers.push({
      code: 'process-table-unreadable',
      reason: `process table unreadable: ${unreadable}`,
    })
  }
  const bytes = sized ? kit.size(dir) : null
  return {
    blockers,
    candidate: kit.candidate({
      kind: 'claude-history',
      path: dir,
      why: `Claude Code's history of ${record.paths.join(', ')}, which no longer ${record.paths.length === 1 ? 'exists' : 'exist'}`,
      costDescription: 'lost',
      ...(bytes === null ? {} : { bytes }),
      evidence: {
        kind: 'claude-history',
        path: dir,
        project: record.paths,
        sessions: record.sessions,
      },
    }),
  }
}

/** The plugin on `kit`, reading Claude Code's folders under `env`. */
function agentHistoryPlugin(kit: Kit, env: Readonly<Record<string, string | undefined>>): Plugin {
  const config = claudeConfigDir(env)
  const projects = join(config, 'projects')
  let rows = new Map<string, Row>()
  const look = (ctx: Ctx): Seen => ({ sessions: liveSessions(config), mounts: mountPoints(), ctx })

  return {
    name: AGENT_HISTORY_PLUGIN,
    limits: { discover: DISCOVER_LIMIT_MS },
    // `projects` may be a link, such as to a synced folder; the folders in it may not.
    detect: () => statSync(projects, { throwIfNoEntry: false })?.isDirectory() === true,
    roots: () => [projects],
    async discover(ctx) {
      const seen = look(ctx)
      const names = readdirSync(projects, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
      const found: Row[] = []
      for (const name of names) {
        // Lets the hook's time limit fire, and stops once it has.
        await new Promise((done) => setImmediate(done))
        if (ctx.signal.aborted) throw new Error(`stopped after ${found.length} candidates`)
        const row = rowFor(kit, join(projects, name), seen)
        if (row !== null) found.push(row)
      }
      rows = new Map(found.map((r) => [r.candidate.id, r]))
      return found.map((r) => r.candidate)
    },
    object: (all) =>
      all.flatMap((c) => {
        const row = rows.get(c.id)
        return c.owner === AGENT_HISTORY_PLUGIN && row !== undefined
          ? objectionsTo(AGENT_HISTORY_PLUGIN, row)
          : []
      }),
    delete(c, ctx) {
      if (c.path === undefined || dirname(c.path) !== projects) {
        throw new Error(`${c.id} is not a Claude Code project folder in ${projects}`)
      }
      if (!present(c.path)) return `already gone: ${c.path}`
      // Not sized again: `kit.remove` sizes it.
      const now = rowFor(kit, c.path, look(ctx), false)
      if (now === null || now.candidate.id !== c.id) {
        throw new Error(`${c.path} is no longer a candidate`)
      }
      if (JSON.stringify(now.candidate.evidence) !== JSON.stringify(c.evidence)) {
        throw new Error(`${c.path} changed since it was proposed`)
      }
      if (now.blockers.length > 0) {
        throw new Error(`${c.path} is refused: ${now.blockers.map((b) => b.reason).join(', ')}`)
      }
      return kit.remove(c.path, ctx)
    },
  }
}

/** The `agent-history` plugin as the command line builds it. */
export const agentHistoryDefinition = definePlugin({
  name: AGENT_HISTORY_PLUGIN,
  api: PLUGIN_API,
  settings: z.strictObject({}),
  create: ({ kit, env }) => agentHistoryPlugin(kit, env),
})
