/**
 * The `claude-code` adapter: Claude Code sessions that are still running,
 * and closing one on approval.
 *
 * Detected when detect-harness reports Claude Code, or, with no report given,
 * when its config folder exists. The transcript folder is
 * `<config>/projects`, with the config folder from detect-harness, so
 * `CLAUDE_CONFIG_DIR` moves it.
 *
 * A session is a process whose executable is `claude` or `claude.exe` (or
 * `node` running a `claude` script). `ps -axo pid=,lstart=,command=` lists
 * them and `lsof -a -d cwd` reads each working directory. A shell wrapper such
 * as `/bin/sh .../node_modules/.bin/claude` is not one: its child is. Claude
 * Code puts no session id on its command line unless it was started with
 * `--resume <id>`, so `resumeId` is often null; the transcript is then the
 * newest in the project folder for the working directory, which is that
 * path with every character that is not a letter or digit turned into `-`.
 *
 * Every row is `review` with the `close-session` risk and an `unattended` of
 * false. `execute` checks the process is the same (start time and command),
 * sends SIGTERM through `kill`, and waits for it to exit. It never sends
 * SIGKILL: a session that ignores SIGTERM is reported as failed.
 */

import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { resolveConfigDir } from '@osdlc/detect-harness'
import { nodeGuard } from '@osdlc/path-guard/node'

import type { HostAdapter, HostContext, HostRow, HostStep } from './adapter.ts'
import { checkoutsOf } from './artifacts.ts'

export const CLAUDE_ADAPTER = 'claude-code'

/** The risk a person grants by name before a session is closed. */
export const CLOSE_SESSION = 'close-session'

/** How long `execute` waits for a session to exit after SIGTERM. */
const DEFAULT_WAIT_MS = 10_000
const POLL_MS = 200

/** `<pid> <lstart: Wed Nov 18 23:37:21 2026> <command>` */
const PS_LINE =
  /^\s*(\d+)\s+([A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.+?)\s*$/
const SESSION_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

export interface ClaudeOptions {
  env?: Readonly<Record<string, string | undefined>> | undefined
  home?: string | undefined
  /** The OS temp directory a session's working directory counts as orphaned under. */
  tmp?: string | undefined
  /** How long to wait for a process to exit after SIGTERM, in ms. */
  waitMs?: number | undefined
  sleep?: ((ms: number) => void) | undefined
}

interface Proc {
  pid: number
  startedAt: string
  command: string
  resumeId: string | null
}

/** Evidence of a session row: what the verdict rests on. */
export interface SessionEvidence {
  kind: 'claude-session'
  pid: number
  startedAt: string
  command: string
  cwd: string | null
  resumeId: string | null
  lastWrite: string | null
  duplicateOf: number[]
  orphan: boolean
  worktree: string | null
  unattended: false
}

const canon = (path: string): string => {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

const pause = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** The folder name Claude Code gives a working directory under `projects/`. */
export const projectSlug = (cwd: string): string => cwd.replace(/[^A-Za-z0-9]/g, '-')

/** The session id after `--resume`, `--resume=` or `-r`, when it is a UUID. */
export function resumeIdOf(args: readonly string[]): string | null {
  for (const [i, arg] of args.entries()) {
    const value = arg.startsWith('--resume=')
      ? arg.slice('--resume='.length)
      : arg === '--resume' || arg === '-r'
        ? args[i + 1]
        : undefined
    if (value !== undefined && SESSION_ID.test(value)) return value.toLowerCase()
  }
  return null
}

/** The process a `ps` line names, when it is a Claude Code session. */
export function parseSession(line: string): Proc | null {
  const m = PS_LINE.exec(line)
  if (m === null) return null
  const command = m[3]!
  const argv = command.split(/\s+/)
  const exe = basename(argv[0]!)
  const direct = exe === 'claude' || exe === 'claude.exe'
  const viaNode = exe === 'node' && basename(argv[1] ?? '') === 'claude'
  if (!direct && !viaNode) return null
  return {
    pid: Number(m[1]),
    startedAt: m[2]!.replace(/\s+/g, ' '),
    command,
    resumeId: resumeIdOf(argv.slice(1)),
  }
}

/** `lsof -Fpn` output as pid to working directory. */
function parseCwds(output: string): Map<number, string> {
  const cwds = new Map<number, string>()
  let pid = 0
  for (const line of output.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1))
    else if (line.startsWith('n') && pid > 0) cwds.set(pid, line.slice(1))
  }
  return cwds
}

const mtimeOf = (path: string): number | null => {
  try {
    return statSync(path).mtimeMs
  } catch {
    return null
  }
}

/** The transcript folder and whether detect-harness found Claude Code. */
function locate(
  ctx: HostContext,
  opts: ClaudeOptions,
): { projects: string | null; installed: boolean } {
  const report = ctx.harnesses?.reports.find((r) => r.harness === 'claude')
  if (report !== undefined) {
    const config = report.configDirs.find((d) => d.name === 'config')?.path ?? null
    return {
      projects: config === null ? null : join(config, 'projects'),
      installed: report.status !== 'absent',
    }
  }
  const config = resolveConfigDir('claude', {
    home: opts.home ?? homedir(),
    env: opts.env ?? process.env,
  })
  return {
    projects: config === null ? null : join(config, 'projects'),
    installed: config !== null && existsSync(config),
  }
}

/** The mtime of the transcript of a session: by id anywhere under `projects`, else the newest in the cwd's folder. */
function lastWriteMs(projects: string, cwd: string | null, resumeId: string | null): number | null {
  try {
    if (resumeId !== null) {
      const own = cwd === null ? [] : [join(projects, projectSlug(cwd))]
      const all = readdirSync(projects, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => join(projects, e.name))
      for (const dir of [...own, ...all]) {
        const m = mtimeOf(join(dir, `${resumeId}.jsonl`))
        if (m !== null) return m
      }
      return null
    }
    if (cwd === null) return null
    const dir = join(projects, projectSlug(cwd))
    const times = readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl'))
      .flatMap((f) => mtimeOf(join(dir, f)) ?? [])
    return times.length > 0 ? Math.max(...times) : null
  } catch {
    return null
  }
}

const sameInstant = (a: string, b: string): boolean =>
  a.replace(/\s+/g, ' ') === b.replace(/\s+/g, ' ')

export function createClaudeAdapter(options: ClaudeOptions = {}): HostAdapter {
  const tmp = canon(options.tmp ?? tmpdir())
  const waitMs = options.waitMs ?? DEFAULT_WAIT_MS
  const sleep = options.sleep ?? pause

  /** Every session now, or throws when the process table cannot be read. */
  const sessions = (ctx: HostContext): Proc[] => {
    const ps = ctx.command('ps').run(['-axo', 'pid=,lstart=,command='], { cwd: '/' })
    if (ps.exitCode !== 0 || ps.stdout.trim() === '') {
      throw new Error(`ps failed (exit ${ps.exitCode}): ${ps.stderr.trim() || 'no output'}`)
    }
    return ps.stdout.split('\n').flatMap((l) => parseSession(l) ?? [])
  }

  const cwdsOf = (ctx: HostContext, pids: readonly number[]): Map<number, string> => {
    if (pids.length === 0) return new Map()
    const lsof = ctx
      .command('lsof')
      .run(['-n', '-P', '-a', '-d', 'cwd', '-Fpn', '-p', pids.join(',')], { cwd: '/' })
    // lsof exits 1 when some pid is gone yet lists the rest.
    return parseCwds(lsof.stdout)
  }

  const gather = (ctx: HostContext): HostRow[] => {
    const { projects } = locate(ctx, options)
    const procs = sessions(ctx)
    const cwds = cwdsOf(
      ctx,
      procs.map((p) => p.pid),
    )
    const checkouts = checkoutsOf(ctx).map((c) => c.path)
    return procs.map((p): HostRow => {
      const cwd = cwds.get(p.pid) ?? null
      const real = cwd === null ? null : canon(cwd)
      const orphan =
        cwd !== null && (!existsSync(cwd) || (real !== null && nodeGuard.contains(tmp, real)))
      const written = projects === null ? null : lastWriteMs(projects, cwd, p.resumeId)
      const duplicateOf =
        p.resumeId === null
          ? []
          : procs.filter((q) => q.pid !== p.pid && q.resumeId === p.resumeId).map((q) => q.pid)
      const worktree =
        real === null
          ? null
          : (checkouts
              .filter((c) => nodeGuard.contains(canon(c), real))
              .sort((a, b) => b.length - a.length)[0] ?? null)
      const evidence: SessionEvidence = {
        kind: 'claude-session',
        pid: p.pid,
        startedAt: p.startedAt,
        command: p.command,
        cwd,
        resumeId: p.resumeId,
        lastWrite: written === null ? null : new Date(written).toISOString(),
        duplicateOf,
        orphan,
        worktree,
        unattended: false,
      }
      const facts = [
        cwd === null ? 'working directory unreadable' : `in ${cwd}`,
        ...(orphan ? ['its directory is gone or temporary'] : []),
        ...(duplicateOf.length > 0 ? [`also resumed by pid ${duplicateOf.join(', ')}`] : []),
        evidence.lastWrite === null ? 'no transcript found' : `last wrote ${evidence.lastWrite}`,
      ]
      return {
        id: `session:${p.pid}`,
        adapter: CLAUDE_ADAPTER,
        kind: 'session',
        name: String(p.pid),
        verdict: 'review',
        action: 'close',
        why: `Claude Code session started ${p.startedAt}, ${facts.join('; ')}`,
        risks: [CLOSE_SESSION],
        blockers: [],
        commands: [`kill -TERM ${p.pid}`],
        notes: worktree === null ? [] : [`works in the worktree ${worktree}`],
        evidence: evidence as unknown as Record<string, unknown>,
      }
    })
  }

  const execute = (step: HostStep, ctx: HostContext): string => {
    const ev = step.row.evidence as unknown as SessionEvidence
    const { pid, startedAt } = ev
    if (!ctx.probe.alive(pid, startedAt)) throw new Error(`pid ${pid} is no longer running`)
    const now = ctx.command('ps').run(['-o', 'lstart=,command=', '-p', String(pid)], { cwd: '/' })
    const line = now.stdout.trim()
    const m = /^([A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.+)$/.exec(
      line,
    )
    if (m === null)
      throw new Error(`pid ${pid} cannot be read: ${now.stderr.trim() || 'no output'}`)
    if (!sameInstant(m[1]!, startedAt) || m[2] !== ev.command) {
      throw new Error(`pid ${pid} is not the session that was planned: it is now ${m[2]}`)
    }
    const kill = ctx.command('kill').run(['-TERM', String(pid)], { cwd: '/' })
    if (kill.exitCode !== 0) {
      throw new Error(`kill -TERM ${pid} failed: ${kill.stderr.trim() || kill.stdout.trim()}`)
    }
    for (let waited = 0; waited <= waitMs; waited += POLL_MS) {
      if (!ctx.probe.alive(pid, startedAt)) return `sent SIGTERM to pid ${pid}; it exited`
      sleep(POLL_MS)
    }
    throw new Error(`pid ${pid} is still running ${waitMs} ms after SIGTERM; it was not killed`)
  }

  return {
    name: CLAUDE_ADAPTER,
    detect: (ctx) => locate(ctx, options).installed,
    gather,
    execute,
  }
}

export const claudeAdapter: HostAdapter = createClaudeAdapter()
