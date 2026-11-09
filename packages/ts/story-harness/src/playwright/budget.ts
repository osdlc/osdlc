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
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { cpus, loadavg } from 'node:os'
import { dirname, join } from 'node:path'
import { LockTimeoutError, withLock } from '@osdlc/file-lock'
import { expect } from '@playwright/test'

export interface Verdict {
  value: number
  limit: number
  slack: number
  pass: boolean
}

export interface PerfReport {
  /**
   * The run's id: `STORY_PERF_RUN`, which `defineStoryConfig` sets once per run,
   * else the Playwright runner's process id, the parent of every worker.
   */
  runId: string
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

/** Give up on the lock after this long, rather than wait forever. */
const LOCK_DEADLINE_MS = 30_000

const load = (): number[] => loadavg().map((v) => Number(v.toFixed(2)))

export function createPerfRecorder(options: PerfRecorderOptions = {}) {
  const env = options.env ?? process.env
  const outFile =
    options.outFile ?? env.STORY_PERF_FILE ?? join(process.cwd(), 'test-results', 'story-perf.json')
  const assert = env.PW_PERF_ASSERT === '1'
  const slack = Number(env.PW_PERF_SLACK ?? 1)
  if (!(slack > 0))
    throw new Error(`PW_PERF_SLACK must be a positive number, got ${env.PW_PERF_SLACK}`)

  const runId = env.STORY_PERF_RUN ?? String(process.ppid)
  const lockDeadlineMs = options.lockDeadlineMs ?? LOCK_DEADLINE_MS
  // The header this worker writes when it is the run's first writer.
  const header = {
    runId,
    mode: assert ? 'assert' : 'record',
    date: new Date().toISOString(),
    cpu: cpus()[0]?.model ?? 'unknown',
    loadBefore: load(),
  } as const
  // What this worker recorded; it wins over the disk copy on a merge.
  const own: Pick<PerfReport, 'userAgent' | 'values' | 'verdicts'> = {
    userAgent: '',
    values: {},
    verdicts: {},
  }
  mkdirSync(dirname(outFile), { recursive: true })

  // Read, merge and write under `<outFile>.lock`, so one worker at a time does it.
  const merge = () => {
    const disk = readReport(outFile)
    const sameRun = disk?.runId === runId ? disk : undefined
    const report: PerfReport = {
      // The run's first writer set the header; later workers keep it.
      ...header,
      ...(sameRun && {
        mode: sameRun.mode,
        date: sameRun.date,
        cpu: sameRun.cpu,
        loadBefore: sameRun.loadBefore,
      }),
      userAgent: own.userAgent || sameRun?.userAgent || '',
      loadAfter: load(),
      values: { ...sameRun?.values, ...own.values },
      verdicts: { ...sameRun?.verdicts, ...own.verdicts },
    }
    // Write then rename, so a reader outside the lock never sees a half-written report.
    const tmp = `${outFile}.${process.pid}.tmp`
    writeFileSync(tmp, `${JSON.stringify(report, null, 2)}\n`)
    renameSync(tmp, outFile)
  }
  const write = () => {
    try {
      // A lock untouched for 10 s was left by a worker that died holding it,
      // and is taken over.
      withLock(`${outFile}.lock`, merge, { timeoutMs: lockDeadlineMs })
    } catch (err) {
      if (!(err instanceof LockTimeoutError)) throw err
      throw new Error(
        `story-harness: could not take ${err.path} within ${lockDeadlineMs / 1000} s; remove it if no run is writing the report`,
        { cause: err },
      )
    }
  }

  return {
    /** Record a value with no budget. */
    record(name: string, value: unknown): void {
      own.values[name] = value
      write()
    },
    /** Record `value` against `limit` (pass when `value <= limit × slack`); assert it under `PW_PERF_ASSERT=1`. */
    budget(name: string, value: number, limit: number): void {
      const pass = value <= limit * slack
      own.values[name] = value
      own.verdicts[name] = { value, limit, slack, pass }
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
      own.userAgent = userAgent
      write()
    },
  }
}

export type PerfRecorder = ReturnType<typeof createPerfRecorder>
