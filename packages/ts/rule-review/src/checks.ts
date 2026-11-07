/**
 * Run a folder of checks and report the verdicts.
 *
 * Script checks run one after another in prefix order, each with its cwd at
 * the project root. With a changeset, a script runs only when its scope
 * matches a changed file, and reads those files on stdin. Processes are
 * started through `@osdlc/command-seam`, through a runner the caller can
 * replace. Each script leads its own process group, so a timeout or abort also
 * kills the processes it started.
 */
import { spawnRunnerAsync, type AsyncCommandRunner } from '@osdlc/command-seam'

import type { Changeset } from './changeset.ts'
import { selectByScope } from './select.ts'
import {
  PROMPT_UNSUPPORTED,
  type CheckFolder,
  type ScriptCheck,
  type SkippedEntry,
} from './providers/check-folder.ts'

/**
 * A check's verdict: `PASS` (exit 0), `FAIL` (any other exit), `SKIP` (not
 * run, with the reason) or `ERROR` (timed out, killed, or failed to start).
 *
 * @experimental
 */
export type CheckStatus = 'PASS' | 'FAIL' | 'SKIP' | 'ERROR'

/**
 * What became of one entry in a check folder.
 *
 * @experimental
 */
export interface CheckResult {
  /** File name inside the folder. */
  entry: string
  status: CheckStatus
  /** Why the check failed, errored or was skipped. */
  reason?: string
  durationMs: number
  exitCode?: number
  stdout?: string
  stderr?: string
}

/**
 * Every result of one run of a check folder, in run order.
 *
 * @experimental
 */
export interface ChecksRun {
  dir: string
  results: CheckResult[]
}

/** Reason for a script whose scope matches no changed file. */
export const NO_FILES_IN_SCOPE = 'no changed files in scope'

/**
 * Input to {@link runChecks}.
 *
 * @experimental
 */
export interface RunChecksOptions {
  projectRoot: string
  /** Select script checks by scope; without it every script runs with empty stdin. */
  changeset?: Changeset | undefined
  /** Builds the runner for one script path. Default: `spawnRunnerAsync`. */
  runnerFor?: (path: string) => AsyncCommandRunner
  /** Monotonic clock in milliseconds. Default: `performance.now`. */
  now?: () => number
  /** Aborting kills the running check and stops the run. */
  signal?: AbortSignal
}

/**
 * What a run would execute and what it would skip.
 *
 * @experimental
 */
export interface ChecksPlan {
  dir: string
  run: Array<Pick<ScriptCheck, 'entry' | 'order' | 'name' | 'timeoutSec'>>
  skipped: SkippedEntry[]
}

/** The environment a script check sees, on top of the parent's. */
export function checkEnv(
  check: ScriptCheck,
  folder: CheckFolder,
  projectRoot: string,
  base?: string,
) {
  return {
    CHECK_ROOT: projectRoot,
    CHECK_NAME: check.name,
    CHECK_ORDER: String(check.order),
    CHECK_DIR: folder.dir,
    ...(base === undefined ? {} : { CHECK_BASE: base }),
  }
}

/**
 * In-scope files per script entry; a script absent from the map matches no
 * changed file. Without a changeset every script is selected with no files.
 */
export function selectScripts(
  folder: CheckFolder,
  changeset: Changeset | undefined,
): Map<string, string[]> {
  const scripts = folder.checks.filter((c): c is ScriptCheck => c.kind === 'script')
  if (changeset === undefined) return new Map(scripts.map((c) => [c.entry, []]))
  return selectByScope(
    scripts.map((c) => ({ id: c.entry, patterns: c.scope })),
    changeset.files,
    [],
  ).covered
}

/**
 * Split a folder into what runs and what is skipped, without running it.
 *
 * @experimental
 */
export function planChecks(folder: CheckFolder, changeset?: Changeset): ChecksPlan {
  const selected = selectScripts(folder, changeset)
  const run: ChecksPlan['run'] = []
  const skipped: SkippedEntry[] = []
  for (const check of folder.checks) {
    if (check.kind === 'script') {
      if (!selected.has(check.entry)) {
        skipped.push({ entry: check.entry, reason: NO_FILES_IN_SCOPE })
        continue
      }
      run.push({
        entry: check.entry,
        order: check.order,
        name: check.name,
        timeoutSec: check.timeoutSec,
      })
    } else {
      skipped.push({ entry: check.entry, reason: PROMPT_UNSUPPORTED })
    }
  }
  return { dir: folder.dir, run, skipped: [...skipped, ...folder.skipped] }
}

async function runScript(
  check: ScriptCheck,
  folder: CheckFolder,
  opts: RunChecksOptions,
  files: readonly string[],
): Promise<CheckResult> {
  const runnerFor = opts.runnerFor ?? spawnRunnerAsync
  const now = opts.now ?? (() => performance.now())
  const timeoutMs = check.timeoutSec * 1000
  const started = now()
  const result = await runnerFor(check.path).run([], {
    cwd: opts.projectRoot,
    env: checkEnv(check, folder, opts.projectRoot, opts.changeset?.base),
    timeoutMs,
    input: files.map((f) => `${f}\n`).join(''),
    signal: opts.signal,
    processGroup: true,
  })
  const durationMs = Math.round(now() - started)
  // When the script wrote no stderr, show the seam's own message
  // (`result.error`) instead. The abort and timeout branches keep only the
  // script's stderr: their reason already says it.
  const base = {
    entry: check.entry,
    durationMs,
    stdout: result.stdout,
    stderr: result.stderr || (result.error ?? ''),
  }
  if (opts.signal?.aborted === true) {
    return { ...base, stderr: result.stderr, status: 'ERROR', reason: 'interrupted' }
  }
  if (result.reason === 'timeout') {
    return {
      ...base,
      stderr: result.stderr,
      status: 'ERROR',
      reason: `timed out after ${check.timeoutSec}s`,
    }
  }
  // stderr carries the detail: the seam's spawn error, or a killed script's
  // own output, printed once under the status line.
  if (result.reason === 'spawn') return { ...base, status: 'ERROR', reason: 'failed to start' }
  if (result.neverExited === true) {
    const by = result.signal === undefined ? 'a signal' : result.signal
    return { ...base, status: 'ERROR', reason: `terminated by ${by}` }
  }
  if (result.exitCode === 0) return { ...base, status: 'PASS', exitCode: 0 }
  return {
    ...base,
    status: 'FAIL',
    exitCode: result.exitCode,
    reason: `exit ${result.exitCode}`,
  }
}

/**
 * Run every selected script check in order. A script whose scope matches no
 * changed file is SKIP in its place; prompt checks and skipped entries follow
 * as SKIP. An abort ends the run after the check it interrupted, and the
 * skipped entries are then left out.
 *
 * @experimental
 */
export async function runChecks(folder: CheckFolder, opts: RunChecksOptions): Promise<ChecksRun> {
  const selected = selectScripts(folder, opts.changeset)
  const results: CheckResult[] = []
  for (const check of folder.checks) {
    if (opts.signal?.aborted === true) break
    if (check.kind === 'prompt') {
      results.push({
        entry: check.entry,
        status: 'SKIP',
        reason: PROMPT_UNSUPPORTED,
        durationMs: 0,
      })
    } else {
      const files = selected.get(check.entry)
      results.push(
        files === undefined
          ? { entry: check.entry, status: 'SKIP', reason: NO_FILES_IN_SCOPE, durationMs: 0 }
          : await runScript(check, folder, opts, files),
      )
    }
  }
  if (opts.signal?.aborted !== true) {
    for (const s of folder.skipped) {
      results.push({ entry: s.entry, status: 'SKIP', reason: s.reason, durationMs: 0 })
    }
  }
  return { dir: folder.dir, results }
}

/**
 * How many results have each status.
 *
 * @experimental
 */
export function summarize(results: CheckResult[]): Record<CheckStatus, number> {
  const counts: Record<CheckStatus, number> = { PASS: 0, FAIL: 0, SKIP: 0, ERROR: 0 }
  for (const r of results) counts[r.status]++
  return counts
}

/**
 * 1 when any check failed or errored, else 0.
 *
 * @experimental
 */
export function checksExitCode(results: CheckResult[]): 0 | 1 {
  return results.some((r) => r.status === 'FAIL' || r.status === 'ERROR') ? 1 : 0
}

export function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function summaryLine(counts: Record<CheckStatus, number>): string {
  return `${counts.PASS} passed, ${counts.FAIL} failed, ${counts.ERROR} errored, ${counts.SKIP} skipped`
}

/** Output lines under a failing check, indented. */
function indentedOutput(r: CheckResult): string[] {
  const text = [r.stdout, r.stderr]
    .map((s) => (s ?? '').trimEnd())
    .filter((s) => s !== '')
    .join('\n')
  return text === '' ? [] : text.split('\n').map((l) => `        ${l}`)
}

/**
 * One line per check, failure output indented beneath it, then a summary.
 *
 * @experimental
 */
export function formatReport(run: ChecksRun): string {
  const lines: string[] = []
  for (const r of run.results) {
    const parts = [r.status.padEnd(5), r.entry]
    if (r.reason !== undefined) parts.push(`- ${r.reason}`)
    if (r.status !== 'SKIP') parts.push(`(${formatDuration(r.durationMs)})`)
    lines.push(parts.join(' '))
    if (r.status === 'FAIL' || r.status === 'ERROR') lines.push(...indentedOutput(r))
  }
  lines.push('', summaryLine(summarize(run.results)))
  return lines.join('\n') + '\n'
}

/**
 * The `--dry-run` text: what would run, then what is skipped and why.
 *
 * @experimental
 */
export function formatPlan(plan: ChecksPlan): string {
  const lines = plan.run.map((c) => `RUN   ${c.entry} (timeout ${c.timeoutSec}s)`)
  for (const s of plan.skipped) lines.push(`SKIP  ${s.entry} - ${s.reason}`)
  lines.push('', `${plan.run.length} would run, ${plan.skipped.length} skipped. Nothing was run.`)
  return lines.join('\n') + '\n'
}

/**
 * The `--json` form of a run: the results and their counts by status.
 *
 * @experimental
 */
export function runToJson(run: ChecksRun): {
  dir: string
  results: CheckResult[]
  summary: Record<CheckStatus, number>
} {
  return { dir: run.dir, results: run.results, summary: summarize(run.results) }
}
