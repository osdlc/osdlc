/**
 * The `claude-code` plugin: running Claude Code sessions, closed one at a time on approval.
 *
 * Claude Code puts no session id on its command line unless started with
 * `--resume <id>`, so `resumeId` is often null; the transcript is then the
 * newest one in the working directory's project folder (see `projectSlug`).
 */

import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { resolveConfigDir, type HarnessCatalog } from '@osdlc/detect-harness'
import { nodeGuard } from '@osdlc/path-guard/node'

import { checkoutsOf, envOf, type ArtifactOptions, type Env } from './artifacts.ts'
import type { Candidate, Objection, Plugin } from './types.ts'

export const CLAUDE_PLUGIN = 'claude-code'

/** The risk a person grants by name before a session is closed. */
export const CLOSE_SESSION = 'close-session'

const DEFAULT_WAIT_MS = 10_000
const POLL_MS = 200
/** `ps` zone and locale for `lstart`; see `PS_ENV` in repo-cleaner/src/processes.ts. */
const PS_ENV = { TZ: 'UTC', LC_ALL: 'C' } as const

/** `<pid> <lstart: Wed Nov 18 23:37:21 2026> <command>` */
const PS_LINE =
  /^\s*(\d+)\s+([A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.+?)\s*$/
/** `claude` or `claude.exe`, bare or as a path without spaces, ending at a space or the end. */
const CLAUDE_EXE = /^(?:\S*\/)?claude(?:\.exe)?(?=\s|$)/
const NODE_CLAUDE = /^(?:\S*\/)?node\s+(?:\S*\/)?claude(?=\s|$)/
/** A shell running a `claude` wrapper script is not the session; its child is. */
const SHELLS: ReadonlySet<string> = new Set(['sh', 'bash', 'zsh', 'fish', 'dash'])
const SESSION_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

export interface ClaudeOptions extends ArtifactOptions {
  /** Which coding harnesses are installed and where; read from the config folder when absent. */
  harnesses?: HarnessCatalog | null | undefined
  env?: Readonly<Record<string, string | undefined>> | undefined
  home?: string | undefined
  /** The OS temp directory a session's working directory counts as orphaned under. */
  tmp?: string | undefined
  /** The pid whose ancestors are the sessions host-cleaner runs under. Defaults to this process. */
  ownPid?: number | undefined
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
  /** host-cleaner runs inside this session, so closing it would end the run. */
  ownSession: boolean
  worktree: string | null
}

/** A path with symlinks resolved, so differently spelled paths to one place compare equal; the path itself when it does not resolve. */
function canon(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

const SLEEPER = new Int32Array(new SharedArrayBuffer(4))
// Synchronous sleep: `execute` is sync.
const pause = (ms: number): void => {
  Atomics.wait(SLEEPER, 0, 0, ms)
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
  const launched = SHELLS.has(basename(command.split(/\s+/)[0]!))
    ? null
    : (CLAUDE_EXE.exec(command) ?? NODE_CLAUDE.exec(command))
  if (launched === null) return null
  const argv = command.slice(launched[0].length).trim().split(/\s+/)
  return {
    pid: Number(m[1]),
    startedAt: m[2]!.replace(/\s+/g, ' '),
    command,
    resumeId: resumeIdOf(argv),
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
function locate(opts: ClaudeOptions): { projects: string | null; installed: boolean } {
  const report = opts.harnesses?.reports.find((r) => r.harness === 'claude')
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

/**
 * Lists each running Claude Code session as a `session:<pid>` candidate
 * carrying a `close-session` protest and held for review. A session
 * host-cleaner runs inside is refused.
 *
 * `delete` checks the pid still has the planned start time and command, sends
 * SIGTERM and waits up to `waitMs` for it to exit. It never sends SIGKILL: a
 * session still running after `waitMs` fails its step.
 */
export function claudeCodePlugin(options: ClaudeOptions = {}): Plugin {
  const tmp = canon(options.tmp ?? tmpdir())
  const waitMs = options.waitMs ?? DEFAULT_WAIT_MS
  const sleep = options.sleep ?? pause

  /** Every session now, or throws when the process table cannot be read. */
  const sessions = (env: Env): Proc[] => {
    const ps = env.command('ps').run(['-axo', 'pid=,lstart=,command='], { cwd: '/', env: PS_ENV })
    if (ps.exitCode !== 0 || ps.stdout.trim() === '') {
      throw new Error(`ps failed (exit ${ps.exitCode}): ${ps.stderr.trim() || 'no output'}`)
    }
    return ps.stdout.split('\n').flatMap((l) => parseSession(l) ?? [])
  }

  const cwdsOf = (env: Env, pids: readonly number[]): Map<number, string> => {
    if (pids.length === 0) return new Map()
    try {
      const lsof = env
        .command('lsof')
        .run(['-n', '-P', '-a', '-d', 'cwd', '-Fpn', '-p', pids.join(',')], { cwd: '/' })
      // lsof exits 1 when some pid is gone yet lists the rest. With no lsof the
      // output is empty, and every row reads its working directory as unreadable.
      return parseCwds(lsof.stdout)
    } catch {
      // A command seam that throws: treat as no lsof.
      return new Map()
    }
  }

  /** The pids from `ownPid` up through its parents. Throws when the process table cannot be read. */
  const ancestorsOf = (env: Env): Set<number> => {
    const ps = env.command('ps').run(['-axo', 'pid=,ppid='], { cwd: '/', env: PS_ENV })
    if (ps.exitCode !== 0) {
      throw new Error(`ps failed (exit ${ps.exitCode}): ${ps.stderr.trim() || 'no output'}`)
    }
    const parent = new Map<number, number>()
    for (const line of ps.stdout.split('\n')) {
      const m = /^\s*(\d+)\s+(\d+)\s*$/.exec(line)
      if (m !== null) parent.set(Number(m[1]), Number(m[2]))
    }
    const chain = new Set<number>()
    for (
      let p: number | undefined = options.ownPid ?? process.pid;
      p !== undefined && !chain.has(p);
      p = parent.get(p)
    ) {
      chain.add(p)
    }
    return chain
  }

  const gather = (env: Env): Candidate[] => {
    const { projects } = locate(options)
    const procs = sessions(env)
    const own = ancestorsOf(env)
    const cwds = cwdsOf(
      env,
      procs.map((p) => p.pid),
    )
    const checkouts = checkoutsOf(env).map((c) => ({ path: c.path, real: canon(c.path) }))
    return procs.map((p): Candidate => {
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
              .filter((c) => nodeGuard.contains(c.real, real))
              .sort((a, b) => b.path.length - a.path.length)[0]?.path ?? null)
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
        ownSession: own.has(p.pid),
        worktree,
      }
      const facts = [
        cwd === null ? 'working directory unreadable' : `in ${cwd}`,
        ...(orphan ? ['its directory is gone or temporary'] : []),
        ...(own.has(p.pid) ? ['host-cleaner is running inside it'] : []),
        ...(duplicateOf.length > 0 ? [`also resumed by pid ${duplicateOf.join(', ')}`] : []),
        evidence.lastWrite === null ? 'no transcript found' : `last wrote ${evidence.lastWrite}`,
      ]
      return {
        id: `session:${p.pid}`,
        kind: 'session',
        path: cwd ?? `pid ${p.pid}`,
        owner: CLAUDE_PLUGIN,
        why: `Claude Code session started ${p.startedAt}, ${facts.join('; ')}`,
        held: true,
        evidence: evidence as unknown as Record<string, unknown>,
      }
    })
  }

  const execute = (c: Candidate, env: Env): string => {
    const ev = c.evidence as unknown as SessionEvidence
    const { pid, startedAt } = ev
    if (ancestorsOf(env).has(pid)) throw new Error(`pid ${pid} is the session host-cleaner runs in`)
    if (!env.probe.alive(pid, startedAt)) throw new Error(`pid ${pid} is no longer running`)
    const now = env
      .command('ps')
      .run(['-o', 'pid=,lstart=,command=', '-p', String(pid)], { cwd: '/', env: PS_ENV })
    const current = parseSession(now.stdout)
    if (current === null)
      throw new Error(`pid ${pid} cannot be read as a session: ${now.stderr.trim() || 'no output'}`)
    if (current.startedAt !== startedAt || current.command !== ev.command) {
      throw new Error(
        `pid ${pid} is not the session that was planned: it is now ${current.command}`,
      )
    }
    const kill = env.command('kill').run(['-TERM', String(pid)], { cwd: '/' })
    if (kill.exitCode !== 0) {
      throw new Error(`kill -TERM ${pid} failed: ${kill.stderr.trim() || kill.stdout.trim()}`)
    }
    const deadline = Date.now() + waitMs
    do {
      if (!env.probe.alive(pid, startedAt)) return `sent SIGTERM to pid ${pid}; it exited`
      sleep(POLL_MS)
    } while (Date.now() < deadline)
    throw new Error(`pid ${pid} is still running ${waitMs} ms after SIGTERM; it was not killed`)
  }

  return {
    name: CLAUDE_PLUGIN,
    detect: () => locate(options).installed,
    discover: (ctx) => gather(envOf(options, ctx)),
    object: (all) =>
      all
        .filter((c) => c.owner === CLAUDE_PLUGIN)
        .flatMap((c): Objection[] => [
          {
            by: CLAUDE_PLUGIN,
            candidate: c.id,
            level: 'protest',
            code: CLOSE_SESSION,
            reason: 'ends a running coding-agent session',
          },
          ...((c.evidence as unknown as SessionEvidence).ownSession
            ? [
                {
                  by: CLAUDE_PLUGIN,
                  candidate: c.id,
                  level: 'refuse' as const,
                  code: 'own-session',
                  reason: 'host-cleaner is running inside this session',
                },
              ]
            : []),
        ]),
    delete: (c, ctx) => execute(c, envOf(options, ctx)),
  }
}
