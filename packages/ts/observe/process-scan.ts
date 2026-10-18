/**
 * The process scan: which running processes carry a session tag. It reads each
 * process's environment (Linux `/proc/<pid>/environ`, macOS `ps -E`) and keeps
 * only the session and task tags. Other platforms report "could not tell".
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { spawnRunner, type CommandRunner } from '@osdlc/command-seam'

import { legacyName, SESSION_ENV_VAR } from './envelope.ts'
import { TASK_ENV_VAR } from './env.ts'

/** A running process that carries a session tag. */
export interface TaggedProcess {
  pid: number
  /** The session id the process carries. */
  sessionId: string
  /** The task it carries; `null` when the tag is unset or empty. */
  task: string | null
}

/** Matches a tag under its `OBSERVE_*` name and its legacy `SDLC_*` name: `[current, legacy]`. */
const tagPatterns = (name: string): [RegExp, RegExp] => [
  new RegExp(`(?:^|\\s)${name}=(\\S*)`),
  new RegExp(`(?:^|\\s)${legacyName(name)}=(\\S*)`),
]
const SESSION_TAGS = tagPatterns(SESSION_ENV_VAR)
const TASK_TAGS = tagPatterns(TASK_ENV_VAR)

/**
 * The tag's value in `environment`; `undefined` when neither name is set. Same rule as
 * `readTag`: when the two names differ the legacy one wins.
 */
function tagValue([current, legacy]: [RegExp, RegExp], environment: string): string | undefined {
  const old = legacy.exec(environment)?.[1]
  const value = current.exec(environment)?.[1]
  return old !== undefined && old !== value ? old : value
}

/** Whether `text` carries a non-empty session tag under either name. */
const hasSessionTag = (text: string): boolean => !!tagValue(SESSION_TAGS, text)

/** Reads the tags from a process's environment only; an empty session tag is no tag, and an empty task tag is no task. */
function tagged(pid: number, environment: string): TaggedProcess | null {
  const sessionId = tagValue(SESSION_TAGS, environment)
  if (!sessionId) return null
  return { pid, sessionId, task: tagValue(TASK_TAGS, environment) || null }
}

/** `pid -> rest of line` for `ps -o pid=,command=` output. */
function psLines(stdout: string): Map<number, string> {
  const lines = new Map<number, string>()
  for (const line of stdout.split('\n')) {
    const m = /^\s*(\d+) (.*)$/.exec(line)
    if (m !== null) lines.set(Number(m[1]), m[2]!)
  }
  return lines
}

/**
 * Parse `ps -axww -E -o pid=,command=` output, given the plain command lines of
 * (at least) the pids that carry a tag. Each `-E` line is the command line plus
 * the environment, so only the suffix past the command line is read: a process
 * whose arguments contain `OBSERVE_SESSION=` is not taken as tagged.
 *
 * `null` means "could not tell": a tagged pid is still running but its command
 * line no longer matches (it re-exec'd between the two snapshots), so whether
 * it is a session is unknown. A pid missing from `withoutEnv` has exited and is
 * skipped. Internal: not exported from the package entry.
 */
export function parsePsEnvironment(withEnv: string, withoutEnv: string): TaggedProcess[] | null {
  const commands = psLines(withoutEnv)
  const found: TaggedProcess[] = []
  for (const [pid, line] of psLines(withEnv)) {
    const command = commands.get(pid)
    if (command === undefined) {
      continue
    }
    if (!line.startsWith(command)) {
      if (hasSessionTag(line)) return null
      continue
    }
    const entry = tagged(pid, line.slice(command.length))
    if (entry !== null) found.push(entry)
  }
  return found
}

/** The pids of `ps -E` lines that mention a session tag anywhere (the cheap pre-filter for the second `ps`). */
function candidatePids(withEnv: string): number[] {
  return [...psLines(withEnv)].filter(([, line]) => hasSessionTag(line)).map(([pid]) => pid)
}

function scanProc(procDir: string): TaggedProcess[] {
  const found: TaggedProcess[] = []
  for (const name of readdirSync(procDir)) {
    if (!/^\d+$/.test(name)) continue
    let environ: string
    try {
      environ = readFileSync(join(procDir, name, 'environ'), 'utf-8')
    } catch {
      continue // exited, or owned by another user
    }
    const entry = tagged(Number(name), environ.replaceAll('\0', '\n'))
    if (entry !== null) found.push(entry)
  }
  return found
}

/** Whether {@link scanTaggedProcesses} can read process environments on `platform` (default `process.platform`): Linux and macOS. */
export function processScanSupported(platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'linux' || platform === 'darwin'
}

/** A probe for the ids of running sessions: `null` when the scan could not run (unsupported platform, `ps` failed, unreadable `/proc`). */
export type LiveIds = () => ReadonlySet<string> | null

/**
 * Running processes tagged by a launcher (`sessionEnv`), found by reading
 * each process's environment. Read-only. On macOS it runs `ps` through `runner`
 * (`ps -axww -E`, then `ps -p` for the tagged pids); on Linux it reads `procDir`
 * (default `/proc`) and does not use `runner`. Only processes of the same user
 * are visible. `null` means the scan could not run (unsupported platform, `ps`
 * failed or threw, `/proc` unreadable): "could not tell", which is not the same
 * as `[]`, "none running".
 */
export function scanTaggedProcesses(
  runner: CommandRunner,
  opts: { platform?: NodeJS.Platform; procDir?: string } = {},
): TaggedProcess[] | null {
  const platform = opts.platform ?? process.platform
  try {
    if (!processScanSupported(platform)) return null
    if (platform === 'linux') return scanProc(opts.procDir ?? '/proc')
    // `ps -E` appends the environment to each command line; it omits it for
    // other users' processes and SIP-protected system binaries.
    const withEnv = runner.run(['-axww', '-E', '-o', 'pid=,command='], { cwd: '/' })
    if (withEnv.exitCode !== 0) return null
    // The plain command lines are read only for the pids that carry a tag, to
    // split each command from its environment; every other process is skipped.
    const pids = candidatePids(withEnv.stdout)
    if (pids.length === 0) return []
    const withoutEnv = runner.run(['-ww', '-p', pids.join(','), '-o', 'pid=,command='], {
      cwd: '/',
    })
    // `ps -p` exits 1 when none of the pids is left: they all exited, so none is running.
    if (
      withoutEnv.exitCode !== 0 &&
      !(withoutEnv.exitCode === 1 && withoutEnv.stdout.trim() === '')
    )
      return null
    return parsePsEnvironment(withEnv.stdout, withoutEnv.stdout)
  } catch {
    return null
  }
}

/** The default {@link LiveIds}: one {@link scanTaggedProcesses} with the system `ps`; `null` when the scan failed. */
export const liveSessionIds: LiveIds = () => {
  const found = scanTaggedProcesses(spawnRunner('ps'))
  return found === null ? null : new Set(found.map((p) => p.sessionId))
}
