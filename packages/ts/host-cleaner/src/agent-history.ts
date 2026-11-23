/**
 * The `agent-history` plugin: Claude Code's history of projects whose folder
 * no longer exists, such as a removed worktree.
 *
 * Claude Code keeps each project's sessions in `<config>/projects/<name>/`,
 * where `<config>` is `CLAUDE_CONFIG_DIR`, else `~/.claude`, and `<name>` is
 * the project's path with every character but a letter or a digit turned into
 * `-` ({@link projectFolderName}). That cannot be reversed, so the path is read
 * from what the folder records: the first `cwd` of each transcript
 * (`<session>.jsonl`) and each `projectPath` in `sessions-index.json`. A
 * folder that records no path, or one that does not turn into its name, is
 * skipped, never guessed. A folder is a candidate when every path it records
 * is gone, unless one would be on a volume that is not mounted. It is `lost`:
 * held, and deleted only when picked and allowed `discard-user-data`.
 *
 * A folder is refused while a Claude Code session in it runs
 * (`<config>/sessions/<pid>.json` with a live pid), or a process still works
 * in the gone folder. Codex keeps its sessions by date
 * (`~/.codex/sessions/<yyyy>/<mm>/<dd>/`), not by project, so it is left out.
 * No settings.
 */

import { closeSync, lstatSync, openSync, readFileSync, readSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

import { z } from 'zod'

import type { Kit } from './kit.ts'
import {
  PLUGIN_API,
  definePlugin,
  type Candidate,
  type Ctx,
  type Objection,
  type Plugin,
} from './types.ts'

export const AGENT_HISTORY_PLUGIN = 'agent-history'

/** How much of a transcript is read for its first `cwd`. */
const HEAD_BYTES = 256 * 1024

/** It reads every project folder and sizes each candidate. */
const DISCOVER_LIMIT_MS = 10 * 60_000

/** Where removable volumes are mounted; the folder above a gone path being one of these means its volume may be away. */
const MOUNTS: ReadonlySet<string> = new Set(['/Volumes', '/mnt', '/media', '/run/media'])
/** Mount folders that hold one folder per user. */
const USER_MOUNTS: ReadonlySet<string> = new Set(['/media', '/run/media'])

/** The name Claude Code gives the project folder of `path`. */
export const projectFolderName = (path: string): string => path.replace(/[^A-Za-z0-9]/g, '-')

/** Claude Code's config folder: `CLAUDE_CONFIG_DIR`, else `.claude` in the home folder. */
export function claudeConfigDir(env: Readonly<Record<string, string | undefined>>): string {
  const set = env.CLAUDE_CONFIG_DIR
  return set !== undefined && set !== '' ? resolve(set) : join(env.HOME ?? homedir(), '.claude')
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/** True when `path` exists as itself, a link counted as present. */
const present = (path: string): boolean => lstatSync(path, { throwIfNoEntry: false }) !== undefined

/** Whether `path` is gone; false when it cannot be told. */
function gone(path: string): boolean {
  try {
    return !present(path)
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ENOTDIR'
  }
}

/** Whether `path` may be on a volume that is not mounted: the nearest folder above it that exists is where volumes are mounted. */
function unmounted(path: string): boolean {
  let dir = dirname(path)
  while (dirname(dir) !== dir && gone(dir)) dir = dirname(dir)
  return MOUNTS.has(dir) || USER_MOUNTS.has(dirname(dir))
}

/** The first `HEAD_BYTES` of `file`, and whether that is all of it. */
function head(file: string): { text: string; whole: boolean } {
  const fd = openSync(file, 'r')
  try {
    const buf = Buffer.alloc(HEAD_BYTES)
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
 * or one that is not absolute or does not turn into the folder's name. Links
 * inside it are not followed. Throws when it cannot be read.
 */
export function decodeFolder(dir: string): ProjectRecord | null {
  const name = basename(dir)
  const paths = new Set<string>()
  const sessions: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const file = join(dir, entry.name)
    if (entry.name.endsWith('.jsonl')) {
      sessions.push(entry.name)
      const cwd = firstCwd(file)
      if (cwd !== undefined) paths.add(cwd)
    } else if (entry.name === 'sessions-index.json') {
      for (const p of indexPaths(file)) paths.add(p)
    }
  }
  if (paths.size === 0) return null
  for (const p of paths) if (!isAbsolute(p) || projectFolderName(p) !== name) return null
  return { paths: [...paths].sort(), sessions: sessions.sort() }
}

/** A Claude Code session whose process is alive. */
interface Session {
  pid: number
  sessionId: string
  cwd: string
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
function liveSessions(config: string): { live: Session[]; unknown?: string } {
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
    const pid = Number(m?.[1])
    if (m === null || pid <= 0 || !alive(pid)) continue
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
    const str = (v: unknown): string => (typeof v === 'string' ? v : '')
    if (!isObject(body)) unknown ??= `${file} is not a session record`
    else live.push({ pid, sessionId: str(body.sessionId), cwd: str(body.cwd) })
  }
  return unknown === undefined ? { live } : { live, unknown }
}

/** A candidate and what a refusal of it rests on. */
interface Row {
  candidate: Candidate
  /** Each becomes a `refuse` objection by this plugin. */
  blockers: Array<{ code: string; reason: string }>
}

/** What a scan reads once for every folder. */
interface Seen {
  sessions: { live: Session[]; unknown?: string }
  ctx: Ctx
}

/** The row for the project folder `dir`, or null when it is not a candidate. */
function rowFor(kit: Kit, dir: string, seen: Seen): Row | null {
  const name = basename(dir)
  if (lstatSync(dir, { throwIfNoEntry: false })?.isDirectory() !== true) return null
  let record: ProjectRecord | null
  try {
    record = decodeFolder(dir)
  } catch {
    return null
  }
  if (record === null) return null
  if (!record.paths.every((p) => gone(p) && !unmounted(p))) return null

  const blockers: Row['blockers'] = []
  const { live, unknown } = seen.sessions
  const sessions = live.filter(
    (s) =>
      (s.cwd !== '' && projectFolderName(s.cwd) === name) ||
      record.sessions.includes(`${s.sessionId}.jsonl`),
  )
  if (sessions.length > 0) {
    blockers.push({
      code: 'live-session',
      reason: `a Claude Code session is running in it (pid ${sessions.map((s) => s.pid).join(', ')})`,
    })
  }
  if (unknown !== undefined) blockers.push({ code: 'session-state-unreadable', reason: unknown })
  for (const p of record.paths) {
    const held = kit.running({ in: p }, seen.ctx)
    if (held.names.length > 0) {
      blockers.push({
        code: 'live-process',
        reason: `running in ${p}: ${held.names.join(', ')}`,
      })
    }
    if (held.unknown !== undefined) {
      blockers.push({
        code: 'process-table-unreadable',
        reason: `process table unreadable: ${held.unknown}`,
      })
    }
  }
  const bytes = kit.size(dir)
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

  /** The rows of the folders `names` in `projects`, or of every folder there. */
  const scan = (ctx: Ctx, names?: readonly string[]): Row[] => {
    const all =
      names ??
      readdirSync(projects, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
    const seen: Seen = { sessions: liveSessions(config), ctx }
    return all.flatMap((name) => rowFor(kit, join(projects, name), seen) ?? [])
  }

  const objectionsTo = (row: Row): Objection[] =>
    row.blockers.map((b) => ({
      by: AGENT_HISTORY_PLUGIN,
      candidate: row.candidate.id,
      level: 'refuse',
      code: b.code,
      reason: b.reason,
    }))

  return {
    name: AGENT_HISTORY_PLUGIN,
    limits: { discover: DISCOVER_LIMIT_MS },
    detect: () => lstatSync(projects, { throwIfNoEntry: false })?.isDirectory() === true,
    roots: () => [projects],
    discover(ctx) {
      const found = scan(ctx)
      rows = new Map(found.map((r) => [r.candidate.id, r]))
      return found.map((r) => r.candidate)
    },
    object: (all) =>
      all.flatMap((c) => {
        const row = rows.get(c.id)
        return c.owner === AGENT_HISTORY_PLUGIN && row !== undefined ? objectionsTo(row) : []
      }),
    delete(c, ctx) {
      // Only a folder right inside `projects`, read again now: still gone, unchanged, and not in use.
      if (c.path === undefined || dirname(c.path) !== projects) {
        throw new Error(`${c.id} is not a Claude Code project folder in ${projects}`)
      }
      if (!present(c.path)) return `already gone: ${c.path}`
      const now = scan(ctx, [basename(c.path)]).find((r) => r.candidate.id === c.id)
      if (now === undefined) throw new Error(`${c.path} is no longer a candidate`)
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
