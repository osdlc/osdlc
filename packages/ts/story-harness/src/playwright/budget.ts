/**
 * Perf budgets. Record mode by default: every value and verdict is written
 * and nothing fails. `PW_PERF_ASSERT=1` also asserts each verdict, against
 * `limit × PW_PERF_SLACK` (default 1). The report goes to `STORY_PERF_FILE`
 * (set by `defineStoryConfig`), else `test-results/story-perf.json` under the
 * working directory. Each Playwright worker process has its own recorder.
 * Every write merges into the run's report on disk under a lock file, so
 * parallel workers and a worker restarted after a failure keep each other's
 * values and verdicts.
 */
import { randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  type Stats,
  writeFileSync,
} from 'node:fs'
import { cpus, loadavg } from 'node:os'
import { dirname, join } from 'node:path'
import { expect } from '@playwright/test'

export interface Verdict {
  value: number
  limit: number
  slack: number
  pass: boolean
}

export interface PerfReport {
  /** The Playwright runner's process id, the parent of every worker. */
  runId: number
  mode: 'record' | 'assert'
  date: string
  userAgent: string
  cpu: string
  /** 1/5/15-minute load averages when the run's first recorder was made, and at the last write. */
  loadBefore: number[]
  loadAfter: number[]
  values: Record<string, unknown>
  verdicts: Record<string, Verdict>
}

export interface PerfRecorderOptions {
  outFile?: string
  env?: Record<string, string | undefined>
  /** Default `process.ppid`: workers of one run share their parent. */
  runId?: number
  /** How long a write waits for the report's lock before it throws. Default 30 s. */
  lockDeadlineMs?: number
}

function readReport(outFile: string): PerfReport | undefined {
  try {
    return JSON.parse(readFileSync(outFile, 'utf8')) as PerfReport
  } catch {
    return undefined
  }
}

/** A lock older than this was left by a worker that died holding it. */
const STALE_LOCK_MS = 10_000
/** Give up on the lock after this long, rather than spin forever. */
const LOCK_DEADLINE_MS = 30_000

const sleepSync = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

/**
 * Remove `lock` only if it is still the file `seen` describes. The rename moves
 * one file, so two waiters cannot both take over the same stale lock. If a live
 * lock replaced the stale one after `seen` was read, it is put back. Without
 * hard links the put-back is a rename, which is skipped, with the same warning,
 * when a lock already exists at the path.
 *
 * Remaining race: between the rename and the put-back the lock path is empty,
 * so another waiter can take the lock while its holder is still live. Two
 * workers then hold it, and one merge can drop the other's perf values. The
 * lock guards only the perf report, so that is the whole cost; it is reported
 * with a warning.
 */
export function removeStaleLock(
  lock: string,
  seen: { ino: number; dev: number; mtimeMs: number },
  link: (existing: string, target: string) => void = linkSync,
): boolean {
  const aside = `${lock}.${process.pid}.${randomUUID()}`
  try {
    renameSync(lock, aside)
  } catch {
    return false // Another waiter moved it first, or its holder released it.
  }
  const moved = statSync(aside)
  // The mtime check also catches a fresh lock that reused the stale one's inode.
  if (moved.ino === seen.ino && moved.dev === seen.dev && moved.mtimeMs === seen.mtimeMs) {
    rmSync(aside, { force: true })
    return true
  }
  try {
    link(aside, lock)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
      // No hard links on this filesystem: move the live lock back and wait,
      // unless a waiter took the empty path meanwhile. A rename would then
      // overwrite that new lock, so keep it and warn instead.
      if (!existsSync(lock)) {
        renameSync(aside, lock)
        return false
      }
    }
    console.warn(
      `story-harness: ${lock} was taken while its holder was live; two workers may hold it and perf values may be lost`,
    )
  }
  rmSync(aside, { force: true })
  return false
}

/** Run `fn` while holding `<file>.lock`, so one process at a time reads, merges and writes. */
function withLock(file: string, deadlineMs: number, fn: () => void): void {
  const lock = `${file}.lock`
  const deadline = Date.now() + deadlineMs
  for (;;) {
    try {
      closeSync(openSync(lock, 'wx'))
      break
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
      let seen: Stats | undefined
      try {
        seen = statSync(lock)
      } catch {
        // Released between the open and the stat.
      }
      if (seen && Date.now() - seen.mtimeMs > STALE_LOCK_MS) removeStaleLock(lock, seen)
      if (Date.now() > deadline) {
        throw new Error(
          `story-harness: could not take ${lock} within ${deadlineMs / 1000} s; remove it if no run is writing the report`,
        )
      }
      sleepSync(2)
    }
  }
  try {
    fn()
  } finally {
    rmSync(lock, { force: true })
  }
}

const load = (): number[] => loadavg().map((v) => Number(v.toFixed(2)))

export function createPerfRecorder(options: PerfRecorderOptions = {}) {
  const env = options.env ?? process.env
  const outFile =
    options.outFile ?? env.STORY_PERF_FILE ?? join(process.cwd(), 'test-results', 'story-perf.json')
  const assert = env.PW_PERF_ASSERT === '1'
  const slack = Number(env.PW_PERF_SLACK ?? 1)
  if (!(slack > 0))
    throw new Error(`PW_PERF_SLACK must be a positive number, got ${env.PW_PERF_SLACK}`)

  const runId = options.runId ?? process.ppid
  const lockDeadlineMs = options.lockDeadlineMs ?? LOCK_DEADLINE_MS
  const earlier = readReport(outFile)
  const report: PerfReport =
    earlier?.runId === runId
      ? earlier
      : {
          runId,
          mode: assert ? 'assert' : 'record',
          date: new Date().toISOString(),
          userAgent: '',
          cpu: cpus()[0]?.model ?? 'unknown',
          loadBefore: load(),
          loadAfter: [],
          values: {},
          verdicts: {},
        }

  // What this recorder set; it wins over the disk copy on a merge.
  const own = { values: {} as PerfReport['values'], verdicts: {} as PerfReport['verdicts'] }

  const write = () => {
    mkdirSync(dirname(outFile), { recursive: true })
    withLock(outFile, lockDeadlineMs, () => {
      const disk = readReport(outFile)
      if (disk?.runId === runId) {
        report.values = { ...disk.values, ...own.values }
        report.verdicts = { ...disk.verdicts, ...own.verdicts }
        report.userAgent ||= disk.userAgent
        // The run's first writer set the header; later workers keep it.
        report.date = disk.date
        report.cpu = disk.cpu
        report.loadBefore = disk.loadBefore
      }
      report.loadAfter = load()
      // Write then rename, so a reader outside the lock never sees a half-written report.
      const tmp = `${outFile}.${process.pid}.tmp`
      writeFileSync(tmp, `${JSON.stringify(report, null, 2)}\n`)
      renameSync(tmp, outFile)
    })
  }

  return {
    report,
    /** Record a value with no budget. */
    record(name: string, value: unknown): void {
      own.values[name] = value
      report.values[name] = value
      write()
    },
    /** Record `value` against `limit` (pass when `value <= limit × slack`); assert it under `PW_PERF_ASSERT=1`. */
    budget(name: string, value: number, limit: number): void {
      const pass = value <= limit * slack
      own.values[name] = value
      own.verdicts[name] = { value, limit, slack, pass }
      report.values[name] = value
      report.verdicts[name] = own.verdicts[name]
      write()
      if (assert) {
        expect(
          value,
          `${name} = ${value.toFixed(1)} (budget <= ${limit} × ${slack})`,
        ).toBeLessThanOrEqual(limit * slack)
      }
    },
    /** The browser that ran the measurements, e.g. `navigator.userAgent`. */
    setUserAgent(userAgent: string): void {
      report.userAgent = userAgent
      write()
    },
  }
}

export type PerfRecorder = ReturnType<typeof createPerfRecorder>
