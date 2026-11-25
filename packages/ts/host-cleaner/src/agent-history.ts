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

import { nodeGuard } from '@osdlc/path-guard/node'
import { z } from 'zod'

import {
  DISCOVER_LIMIT_MS,
  checkAgain,
  errorText,
  isObject,
  objectionsTo,
  str,
  yieldToLimit,
  type Row,
} from './helpers.ts'
import { present, type Kit } from './kit.ts'
import { PLUGIN_API, definePlugin, type Ctx, type Plugin } from './types.ts'

export const AGENT_HISTORY_PLUGIN = 'agent-history'

/** The most of a transcript read for its first `cwd`. */
const HEAD_BYTES = 256 * 1024
/** How much more of a transcript is read each time its first `cwd` is not yet found. */
const CHUNK_BYTES = 16 * 1024

/** Where removable volumes are mounted; a gone path whose nearest existing folder is one of these or below one means its volume may be away. */
const MOUNTS: readonly string[] = ['/Volumes', '/mnt', '/media', '/run/media']

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
  // A Claude Code that did not shorten names wrote a long one whole.
  if (full === name) return true
  if (full.length <= NAME_LIMIT) return false
  const cut = `${full.slice(0, NAME_LIMIT)}-`
  return name.startsWith(cut) && /^-?[0-9a-z]+$/i.test(name.slice(cut.length))
}

/** The mount points `/etc/fstab` text names, but the root and swap. */
export function fstabMounts(text: string): string[] {
  return text.split('\n').flatMap((line) => {
    const [source, at] = line.trim().split(/\s+/)
    if (source === undefined || source.startsWith('#') || at === undefined) return []
    // fstab writes a space in a path as `\040`.
    const point = at.replace(/\\([0-7]{3})/g, (_, o: string) => String.fromCharCode(parseInt(o, 8)))
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
 * above it that exists is one of `mounts`, or is or is below one of
 * {@link MOUNTS} (such as an empty `/mnt/usb` left by a drive mounted by
 * hand), or no folder above it exists but the root, such as `/Volumes/x`
 * recorded on a Mac and read on Linux, or a Windows drive that is away.
 */
export function unmounted(path: string, mounts: ReadonlySet<string> = new Set(MOUNTS)): boolean {
  let dir = dirname(path)
  while (dirname(dir) !== dir && gone(dir)) dir = dirname(dir)
  return (
    dirname(dir) === dir || mounts.has(dir) || MOUNTS.some((m) => nodeGuard.contains(m, dir))
  )
}

/** Reused by every {@link firstCwd} read, which is synchronous. */
let headBuf: Buffer | undefined

/** The `cwd` of one transcript line, or undefined when it records none. */
function cwdOf(line: string): string | undefined {
  let row: unknown
  try {
    row = JSON.parse(line)
  } catch {
    return undefined
  }
  return isObject(row) && typeof row.cwd === 'string' ? row.cwd : undefined
}

/** {@link firstCwd}'s answer for a transcript whose first {@link HEAD_BYTES} hold no `cwd` but that goes on. */
const CUT = Symbol('cut')

/**
 * The first `cwd` a transcript records within its first {@link HEAD_BYTES},
 * read {@link CHUNK_BYTES} at a time until a whole line gives one; undefined
 * when the transcript ends with none, {@link CUT} when it goes on past them.
 */
function firstCwd(file: string): string | undefined | typeof CUT {
  const fd = openSync(file, 'r')
  try {
    const buf = (headBuf ??= Buffer.allocUnsafe(HEAD_BYTES))
    let n = 0
    // Where the first line not yet read starts.
    let from = 0
    while (n < HEAD_BYTES) {
      const got = readSync(fd, buf, n, Math.min(CHUNK_BYTES, HEAD_BYTES - n), n)
      n += got
      for (let nl = buf.indexOf(0x0a, from); nl !== -1 && nl < n; nl = buf.indexOf(0x0a, from)) {
        const cwd = cwdOf(buf.toString('utf8', from, nl))
        if (cwd !== undefined) return cwd
        from = nl + 1
      }
      if (got === 0) return cwdOf(buf.toString('utf8', from, n))
    }
    return CUT
  } finally {
    closeSync(fd)
  }
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
 * `keep`, or a transcript with no `cwd` in its first {@link HEAD_BYTES} that
 * goes on past them. It stops reading at the first such path. Links inside it are not
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
      // A transcript whose path is not within what is read could name another.
      if (cwd === CUT || (cwd !== undefined && !ok(cwd))) return null
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

/**
 * The live sessions in `<config>/sessions/<pid>.json`, by `kit.alive`: a
 * record with a `startedAt` is live only while its pid is the process that
 * started then, not one that reused the pid. `unknown` is set when the
 * folder cannot be read, or the file of a live pid cannot, since that session
 * could be in any project. No folder means no session is recorded.
 */
function liveSessions(kit: Kit, config: string): Sessions {
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
    if (pid <= 0 || !kit.alive(pid)) continue
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
    if (!isObject(body)) {
      unknown ??= `${file} is not a session record`
      continue
    }
    const started = body.startedAt
    if (typeof started === 'number' || (typeof started === 'string' && started !== '')) {
      if (!kit.alive(pid, String(started))) continue
    }
    live.push({ pid, sessionId: str(body.sessionId), cwd: str(body.cwd) })
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
function rowFor(kit: Kit, dir: string, seen: Seen, { sized = true } = {}): Row | null {
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
      (s.cwd !== '' && isFolderOf(s.cwd, name)) || record.sessions.includes(`${s.sessionId}.jsonl`),
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
    const held = kit.running({ in: p }, seen.ctx)
    unreadable ??= held.unknown
    if (held.names.length > 0) {
      blockers.push({ code: 'live-process', reason: `running in ${p}: ${held.names.join(', ')}` })
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
  const look = (ctx: Ctx): Seen => ({
    sessions: liveSessions(kit, config),
    mounts: mountPoints(),
    ctx,
  })

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
        await yieldToLimit(ctx)
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
      const now = rowFor(kit, c.path, look(ctx), { sized: false }) ?? undefined
      checkAgain(c, now)
      if (JSON.stringify(now.candidate.evidence) !== JSON.stringify(c.evidence)) {
        throw new Error(`${c.path} changed since it was proposed`)
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
