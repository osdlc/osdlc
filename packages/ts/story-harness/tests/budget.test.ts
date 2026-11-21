import { execFile, spawn } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPerfRecorder, type PerfReport } from '../src/playwright/budget.ts'

let dir: string
let outFile: string
const read = (): PerfReport => JSON.parse(readFileSync(outFile, 'utf8'))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'story-perf-'))
  outFile = join(dir, 'test-results', 'story-perf.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('budget', () => {
  it('records a missed budget and passes in record mode', () => {
    const { budget } = createPerfRecorder({ outFile, env: {} })
    expect(() => budget('firstRowsMs', 180, 150)).not.toThrow()
    const report = read()
    expect(report.mode).toBe('record')
    expect(report.verdicts.firstRowsMs).toEqual({ value: 180, limit: 150, slack: 1, pass: false })
    expect(report.values.firstRowsMs).toBe(180)
    expect(report.cpu).toBeTruthy()
    expect(report.loadBefore).toHaveLength(3)
    expect(report.loadAfter).toHaveLength(3)
  })

  it('fails a missed budget under PW_PERF_ASSERT=1, after writing it', () => {
    const { budget } = createPerfRecorder({ outFile, env: { PW_PERF_ASSERT: '1' } })
    expect(() => budget('firstRowsMs', 180, 150)).toThrow(/firstRowsMs/)
    expect(read().verdicts.firstRowsMs!.pass).toBe(false)
  })

  it('passes a value under twice the limit with PW_PERF_SLACK=2', () => {
    const { budget } = createPerfRecorder({
      outFile,
      env: { PW_PERF_ASSERT: '1', PW_PERF_SLACK: '2' },
    })
    expect(() => budget('firstRowsMs', 290, 150)).not.toThrow()
    expect(read().verdicts.firstRowsMs).toEqual({ value: 290, limit: 150, slack: 2, pass: true })
    expect(() => budget('expandMs', 210, 100)).toThrow(/expandMs/)
  })

  it('keeps every budget and plain value of the run in one file', () => {
    const { budget, record } = createPerfRecorder({ outFile, env: {} })
    budget('a', 1, 2)
    record('rowsMounted', 88)
    budget('b', 3, 2)
    const report = read()
    expect(Object.keys(report.verdicts)).toEqual(['a', 'b'])
    expect(report.values).toEqual({ a: 1, rowsMounted: 88, b: 3 })
  })

  it('writes through a temp file and leaves only the report behind', () => {
    const { budget } = createPerfRecorder({ outFile, env: {} })
    budget('a', 1, 2)
    budget('b', 1, 2)
    expect(readdirSync(join(dir, 'test-results'))).toEqual(['story-perf.json'])
  })
})

describe('the report across worker processes', () => {
  it('keeps the verdicts of a worker that exited, as Playwright restarts one after a failure', () => {
    const env = { PW_PERF_ASSERT: '1' }
    const first = createPerfRecorder({ outFile, env: { ...env, STORY_PERF_RUN: '7' } })
    expect(() => first.budget('firstRowsMs', 180, 150)).toThrow()
    createPerfRecorder({ outFile, env: { ...env, STORY_PERF_RUN: '7' } }).budget(
      'expandMs',
      50,
      100,
    )
    const report = read()
    expect(Object.keys(report.verdicts)).toEqual(['firstRowsMs', 'expandMs'])
    expect(report.verdicts.firstRowsMs!.pass).toBe(false)
  })

  it('replaces a report left by an earlier run', () => {
    createPerfRecorder({ outFile, env: { STORY_PERF_RUN: '7' } }).budget('old', 1, 2)
    createPerfRecorder({ outFile, env: { STORY_PERF_RUN: '8' } }).budget('new', 1, 2)
    expect(Object.keys(read().verdicts)).toEqual(['new'])
  })

  it('keeps every value and verdict when two workers interleave writes', () => {
    const a = createPerfRecorder({ outFile, env: { STORY_PERF_RUN: '7' } })
    const b = createPerfRecorder({ outFile, env: { STORY_PERF_RUN: '7' } })
    a.budget('a1', 1, 2)
    b.budget('b1', 1, 2)
    a.record('aValue', 3)
    b.budget('b2', 3, 2)
    a.budget('a2', 1, 2)
    const report = read()
    expect(Object.keys(report.verdicts).sort()).toEqual(['a1', 'a2', 'b1', 'b2'])
    expect(report.values).toMatchObject({ a1: 1, b1: 1, aValue: 3, b2: 3, a2: 1 })
    expect(report.verdicts.b2!.pass).toBe(false)
  })

  it('keeps every verdict when worker processes write at the same moment', async () => {
    const writer = join(import.meta.dirname, 'fixtures', 'perf-writer.ts')
    const workers = 8
    const each = 20
    const startAt = String(Date.now() + 1_500)
    await Promise.all(
      Array.from(
        { length: workers },
        (_, w) =>
          new Promise<void>((resolve, reject) => {
            const child = spawn(
              process.execPath,
              [writer, outFile, '4242', String(w), String(each), startAt],
              { stdio: ['ignore', 'ignore', 'inherit'] },
            )
            child.once('error', reject)
            child.once('exit', (code) =>
              code === 0 ? resolve() : reject(new Error(`worker ${w} exited ${code}`)),
            )
          }),
      ),
    )
    expect(Object.keys(read().verdicts)).toHaveLength(workers * each)
  }, 30_000)
  it('keeps every value when two worker processes write at the same time', async () => {
    const budgetUrl = new URL('../src/playwright/budget.ts', import.meta.url).href
    const worker = (name: string) =>
      // Two real processes, so their writes interleave as Playwright workers' do.
      promisify(execFile)(process.execPath, [
        '--input-type=module',
        '-e',
        `const { createPerfRecorder } = await import(${JSON.stringify(budgetUrl)})
         const r = createPerfRecorder({ outFile: ${JSON.stringify(outFile)}, env: { STORY_PERF_RUN: '7' } })
         for (let i = 0; i < 300; i++) r.record('${name}' + i, i)`,
      ])
    await Promise.all([worker('a'), worker('b')])
    expect(Object.keys(read().values)).toHaveLength(600)
  }, 60_000)

  it("keeps the header of the run's first writer", () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      const a = createPerfRecorder({ outFile, env: { STORY_PERF_RUN: '7' } })
      vi.setSystemTime(new Date('2026-01-01T00:05:00Z'))
      const b = createPerfRecorder({ outFile, env: { STORY_PERF_RUN: '7' } })
      a.budget('a', 1, 2)
      b.budget('b', 1, 2)
      expect(read().date).toBe('2026-01-01T00:00:00.000Z')
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a user agent another worker wrote', () => {
    createPerfRecorder({ outFile, env: { STORY_PERF_RUN: '7' } }).setUserAgent('Chrome/1')
    createPerfRecorder({ outFile, env: { STORY_PERF_RUN: '7' } }).budget('x', 1, 2)
    expect(read().userAgent).toBe('Chrome/1')
  })
})

describe('recorder options', () => {
  it.each(['0', '-1', 'abc'])('rejects PW_PERF_SLACK=%s', (slack) => {
    expect(() => createPerfRecorder({ outFile, env: { PW_PERF_SLACK: slack } })).toThrow(
      /PW_PERF_SLACK must be a positive number/,
    )
  })

  it('writes the user agent', () => {
    createPerfRecorder({ outFile, env: {} }).setUserAgent('HeadlessChrome/140')
    expect(read().userAgent).toBe('HeadlessChrome/140')
  })

  it('reports assert mode under PW_PERF_ASSERT=1', () => {
    createPerfRecorder({ outFile, env: { PW_PERF_ASSERT: '1' } }).record('x', 1)
    expect(read().mode).toBe('assert')
  })

  it('writes to STORY_PERF_FILE when no outFile is given', () => {
    const file = join(dir, 'elsewhere', 'perf.json')
    createPerfRecorder({ env: { STORY_PERF_FILE: file } }).record('x', 1)
    expect(JSON.parse(readFileSync(file, 'utf8')).values).toEqual({ x: 1 })
  })
})

describe('lock deadline', () => {
  it('throws, naming the lock, when a live lock is held past the deadline', () => {
    const recorder = createPerfRecorder({
      outFile,
      env: { STORY_PERF_RUN: '7' },
      lockDeadlineMs: 50,
    })
    mkdirSync(dirname(outFile), { recursive: true })
    // A fresh lock, so it is not stale: someone holds it.
    writeFileSync(`${outFile}.lock`, '')
    expect(() => recorder.record('x', 1)).toThrow(
      /could not take .*story-perf\.json\.lock within 0\.05 s/,
    )
  })
})

describe('stale lock takeover', () => {
  const lockFile = () => `${outFile}.lock`
  const old = new Date(Date.now() - 60_000)

  it('takes over a lock left by a worker that died holding it', () => {
    mkdirSync(join(dir, 'test-results'), { recursive: true })
    writeFileSync(lockFile(), '')
    utimesSync(lockFile(), old, old)
    createPerfRecorder({ outFile, env: {} }).budget('a', 1, 2)
    expect(read().values).toEqual({ a: 1 })
    expect(readdirSync(join(dir, 'test-results'))).toEqual(['story-perf.json'])
  })
})
