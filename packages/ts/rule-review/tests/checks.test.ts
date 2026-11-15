import { describe, expect, test } from 'vitest'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import type { AsyncCommandRunner, CommandResult } from '@osdlc/command-seam'

import {
  checkEnv,
  checksExitCode,
  formatPlan,
  formatReport,
  planChecks,
  runChecks,
  runToJson,
  type CheckResult,
} from '../src/checks.ts'
import {
  readCheckFolder,
  type CheckFolder,
  type ScriptCheck,
} from '../src/providers/check-folder.ts'

const FIXTURES = join(import.meta.dirname, 'fixtures', 'checks.d')
const ROOT = join(import.meta.dirname, '..')

async function runFixture(entry: string) {
  const folder = await readCheckFolder(FIXTURES)
  const only: CheckFolder = {
    ...folder,
    checks: folder.checks.filter((c) => c.entry === entry),
    skipped: [],
  }
  const { results } = await runChecks(only, { projectRoot: ROOT })
  return results[0]!
}

function script(entry: string, timeoutSec = 600): ScriptCheck {
  const m = /^(\d+)-(.*)$/.exec(entry)!
  return {
    kind: 'script',
    entry,
    path: `/checks/${entry}`,
    order: Number(m[1]),
    name: m[2]!,
    timeoutSec,
    scope: ['**'],
  }
}

const folderOf = (...checks: ScriptCheck[]): CheckFolder => ({
  dir: '/checks',
  checks,
  skipped: [],
})

describe('runChecks with the real runner', () => {
  test('exit 0 passes', async () => {
    expect(await runFixture('10-pass')).toMatchObject({ status: 'PASS', exitCode: 0 })
  })

  test('a non-zero exit fails and keeps stderr', async () => {
    const r = await runFixture('20-fail')

    expect(r).toMatchObject({ status: 'FAIL', exitCode: 3, reason: 'exit 3' })
    expect(r.stderr).toContain('lint broke')
  })

  test('exceeding the timeout is an error', async () => {
    const r = await runFixture('30-slow')

    expect(r.status).toBe('ERROR')
    expect(r.reason).toBe('timed out after 1s')
    // The seam's own timeout message is not repeated under the reason.
    expect(r.stderr).toBe('')
    expect(r.durationMs).toBeGreaterThanOrEqual(1000)
    expect(r.durationMs).toBeLessThan(4000)
  })

  test('a timeout kills a child the script did not exec', async () => {
    const r = await runFixture('35-child')
    const pid = Number(/child=(\d+)/.exec(r.stdout ?? '')?.[1])
    try {
      expect(r).toMatchObject({ status: 'ERROR', reason: 'timed out after 1s' })
      expect(pid).toBeGreaterThan(0)
      let alive = true
      for (let i = 0; i < 40 && alive; i++) {
        try {
          process.kill(pid, 0)
          await sleep(50)
        } catch {
          alive = false
        }
      }
      expect(alive).toBe(false)
    } finally {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // already gone
      }
    }
  })

  test('death by signal is an error', async () => {
    const r = await runFixture('50-signal')

    expect(r.status).toBe('ERROR')
    expect(r.reason).toBe('terminated by SIGTERM')
  })

  test('the script sees CHECK_* and runs at the project root', async () => {
    const r = await runFixture('40-env')

    expect(r.status).toBe('PASS')
    const out = r.stdout ?? ''
    expect(out).toContain(`CHECK_ROOT=${ROOT}`)
    expect(out).toContain('CHECK_NAME=env')
    expect(out).toContain('CHECK_ORDER=40')
    expect(out).toContain(`CHECK_DIR=${FIXTURES}`)
    expect(out).toContain(`PWD=${ROOT}`)
  })
})

describe('runChecks with a fake runner', () => {
  test('runs in prefix order, one at a time, with env, cwd and timeout', async () => {
    const calls: Array<{
      path: string
      cwd?: string | undefined
      env?: unknown
      timeoutMs?: number | undefined
      processGroup?: boolean | undefined
    }> = []
    let active = 0
    let overlapped = false
    const runnerFor = (path: string): AsyncCommandRunner => ({
      async run(_argv, opts) {
        if (++active > 1) overlapped = true
        calls.push({
          path,
          cwd: opts.cwd,
          env: opts.env,
          timeoutMs: opts.timeoutMs,
          processGroup: opts.processGroup,
        })
        await sleep(5)
        active--
        return { exitCode: 0, stdout: '', stderr: '' }
      },
    })

    const folder = folderOf(script('9-a', 2), script('10-a'))
    const { results } = await runChecks(folder, { projectRoot: '/proj', runnerFor })

    expect(results.map((r) => r.status)).toEqual(['PASS', 'PASS'])
    expect(overlapped).toBe(false)
    expect(calls.map((c) => c.path)).toEqual(['/checks/9-a', '/checks/10-a'])
    expect(calls[0]).toMatchObject({
      cwd: '/proj',
      timeoutMs: 2000,
      processGroup: true,
      env: { CHECK_ROOT: '/proj', CHECK_NAME: 'a', CHECK_ORDER: '9', CHECK_DIR: '/checks' },
    })
    expect(calls[1]!.timeoutMs).toBe(600_000)
  })

  test('maps exit codes, timeouts, failed starts and kills to statuses', async () => {
    let t = 0
    const answers: Record<string, { result: CommandResult; elapsed: number }> = {
      '/checks/1-ok': { result: { exitCode: 0, stdout: '', stderr: '' }, elapsed: 1 },
      '/checks/2-bad': { result: { exitCode: 7, stdout: '', stderr: '' }, elapsed: 1 },
      '/checks/3-slow': {
        result: { exitCode: 1, stdout: '', stderr: '', neverExited: true, reason: 'timeout' },
        elapsed: 3000,
      },
      '/checks/4-unstartable': {
        result: {
          exitCode: 1,
          stdout: '',
          stderr: '',
          neverExited: true,
          reason: 'spawn',
          error: 'spawn EACCES',
        },
        elapsed: 2,
      },
      '/checks/5-killed': {
        result: {
          exitCode: 1,
          stdout: '',
          stderr: '',
          neverExited: true,
          reason: 'signal',
          signal: 'SIGKILL',
        },
        elapsed: 2,
      },
    }
    const runnerFor = (path: string): AsyncCommandRunner => ({
      async run() {
        const a = answers[path]!
        t += a.elapsed
        return a.result
      },
    })
    const folder = folderOf(
      script('1-ok'),
      script('2-bad'),
      script('3-slow', 3),
      script('4-unstartable', 3),
      script('5-killed', 3),
    )

    const { results } = await runChecks(folder, {
      projectRoot: '/p',
      runnerFor,
      now: () => t,
    })

    expect(results.map((r) => [r.status, r.reason])).toEqual([
      ['PASS', undefined],
      ['FAIL', 'exit 7'],
      ['ERROR', 'timed out after 3s'],
      ['ERROR', 'failed to start'],
      ['ERROR', 'terminated by SIGKILL'],
    ])
    expect(results.map((r) => r.durationMs)).toEqual([1, 1, 3000, 2, 2])
  })

  test("prints a message once: the seam's error only where no reason says it", async () => {
    let t = 0
    const answers: Record<string, { result: CommandResult; elapsed: number }> = {
      '/checks/1-slow-quiet': {
        result: {
          exitCode: 1,
          stdout: '',
          stderr: '',
          neverExited: true,
          reason: 'timeout',
          error: 'deadline hit',
        },
        elapsed: 3000,
      },
      '/checks/2-slow-noisy': {
        result: {
          exitCode: 1,
          stdout: '',
          stderr: 'still working\n',
          neverExited: true,
          reason: 'timeout',
          error: 'deadline hit',
        },
        elapsed: 3000,
      },
      '/checks/3-unstartable': {
        result: {
          exitCode: 1,
          stdout: '',
          stderr: '',
          neverExited: true,
          reason: 'spawn',
          error: 'spawn EACCES',
        },
        elapsed: 2,
      },
    }
    const runnerFor = (path: string): AsyncCommandRunner => ({
      async run() {
        const a = answers[path]!
        t += a.elapsed
        return a.result
      },
    })
    const folder = folderOf(
      script('1-slow-quiet', 3),
      script('2-slow-noisy', 3),
      script('3-unstartable', 3),
    )

    const { results } = await runChecks(folder, { projectRoot: '/p', runnerFor, now: () => t })

    expect(results.map((r) => [r.reason, r.stderr])).toEqual([
      ['timed out after 3s', ''],
      ['timed out after 3s', 'still working\n'],
      ['failed to start', 'spawn EACCES'],
    ])
  })

  test('an abort marks the running check interrupted and stops the run', async () => {
    const ac = new AbortController()
    const ran: string[] = []
    const runnerFor = (path: string): AsyncCommandRunner => ({
      async run(_argv, opts) {
        ran.push(path)
        expect(opts.signal).toBe(ac.signal)
        ac.abort()
        return {
          exitCode: 1,
          stdout: '',
          stderr: '',
          neverExited: true,
          reason: 'abort',
          error: 'run stopped',
        }
      },
    })

    const { results } = await runChecks(folderOf(script('1-a'), script('2-b')), {
      projectRoot: '/p',
      runnerFor,
      signal: ac.signal,
    })

    expect(ran).toEqual(['/checks/1-a'])
    expect(results.map((r) => [r.entry, r.status, r.reason, r.stderr])).toEqual([
      ['1-a', 'ERROR', 'interrupted', ''],
    ])
  })

  test('an abort leaves out the discovery skips of files that never had a turn', async () => {
    const ac = new AbortController()
    const runnerFor = (): AsyncCommandRunner => ({
      async run() {
        ac.abort()
        return {
          exitCode: 1,
          stdout: '',
          stderr: '',
          neverExited: true,
          reason: 'abort',
          error: 'run stopped',
        }
      },
    })
    const folder: CheckFolder = {
      ...folderOf(script('1-a')),
      skipped: [{ entry: 'notes.txt', reason: 'no numeric prefix' }],
    }

    const { results } = await runChecks(folder, {
      projectRoot: '/p',
      runnerFor,
      signal: ac.signal,
    })

    expect(results.map((r) => r.entry)).toEqual(['1-a'])
  })

  test('prompt checks and discovery skips become SKIP without running', async () => {
    const folder: CheckFolder = {
      dir: '/checks',
      checks: [{ kind: 'prompt', entry: '5-r.md', path: '/checks/5-r.md', order: 5, name: 'r.md' }],
      skipped: [{ entry: '.x', reason: "leading '.'" }],
    }
    const runnerFor = (): AsyncCommandRunner => {
      throw new Error('must not run')
    }

    const { results } = await runChecks(folder, { projectRoot: '/p', runnerFor })

    expect(results).toEqual([
      { entry: '5-r.md', status: 'SKIP', reason: 'prompt checks not yet supported', durationMs: 0 },
      { entry: '.x', status: 'SKIP', reason: "leading '.'", durationMs: 0 },
    ])
  })
})

describe('scope selection', () => {
  const scoped = (entry: string, scope: string[]): ScriptCheck => ({ ...script(entry), scope })
  const folder = folderOf(
    script('1-any'),
    scoped('2-src', ['src/**']),
    scoped('3-docs', ['docs/**']),
    scoped('4-both', ['docs/**', 'src/**']),
  )
  const changeset = { files: ['docs/d.md', 'src/a.ts', 'src/b.ts'], base: 'abc123' }

  test('runs matching scripts with their files on stdin and CHECK_BASE', async () => {
    const calls: Array<{ path: string; input?: string | undefined; env?: unknown }> = []
    const runnerFor = (path: string): AsyncCommandRunner => ({
      async run(_argv, opts) {
        calls.push({ path, input: opts.input, env: opts.env })
        return { exitCode: 0, stdout: '', stderr: '' }
      },
    })

    await runChecks(folder, { projectRoot: '/proj', runnerFor, changeset })

    expect(calls.map((c) => [c.path, c.input])).toEqual([
      ['/checks/1-any', 'docs/d.md\nsrc/a.ts\nsrc/b.ts\n'],
      ['/checks/2-src', 'src/a.ts\nsrc/b.ts\n'],
      ['/checks/3-docs', 'docs/d.md\n'],
      ['/checks/4-both', 'docs/d.md\nsrc/a.ts\nsrc/b.ts\n'],
    ])
    expect(calls[0]!.env).toMatchObject({ CHECK_BASE: 'abc123' })
  })

  test('a script matching no file is SKIP in place and never started', async () => {
    const started: string[] = []
    const runnerFor = (path: string): AsyncCommandRunner => ({
      async run() {
        started.push(path)
        return { exitCode: 0, stdout: '', stderr: '' }
      },
    })

    const { results } = await runChecks(folder, {
      projectRoot: '/proj',
      runnerFor,
      changeset: { files: ['src/a.ts'], base: 'HEAD' },
    })

    expect(results.map((r) => [r.entry, r.status])).toEqual([
      ['1-any', 'PASS'],
      ['2-src', 'PASS'],
      ['3-docs', 'SKIP'],
      ['4-both', 'PASS'],
    ])
    expect(results[2]!.reason).toBe('no changed files in scope')
    expect(started).not.toContain('/checks/3-docs')
    expect(formatReport({ dir: '/checks', results })).toContain(
      'SKIP  3-docs - no changed files in scope',
    )
    expect(runToJson({ dir: '/checks', results }).results[2]).toMatchObject({
      entry: '3-docs',
      status: 'SKIP',
      reason: 'no changed files in scope',
    })
  })

  test('without a changeset every script runs with empty stdin and no CHECK_BASE', async () => {
    const inputs: Array<string | undefined> = []
    const bases: unknown[] = []
    const runnerFor = (): AsyncCommandRunner => ({
      async run(_argv, opts) {
        inputs.push(opts.input)
        bases.push((opts.env as Record<string, string>)['CHECK_BASE'])
        return { exitCode: 0, stdout: '', stderr: '' }
      },
    })

    await runChecks(folder, { projectRoot: '/proj', runnerFor })

    expect(inputs).toEqual(['', '', '', ''])
    expect(bases).toEqual([undefined, undefined, undefined, undefined])
  })

  test('planChecks lists unmatched scripts as skipped', () => {
    const plan = planChecks(folder, { files: ['docs/d.md'], base: 'HEAD' })

    expect(plan.run.map((c) => c.entry)).toEqual(['1-any', '3-docs', '4-both'])
    expect(plan.skipped).toContainEqual({ entry: '2-src', reason: 'no changed files in scope' })
  })
})

describe('checkEnv', () => {
  test('carries the four CHECK_ variables', () => {
    expect(checkEnv(script('12-x-y'), folderOf(), '/r')).toEqual({
      CHECK_ROOT: '/r',
      CHECK_NAME: 'x-y',
      CHECK_ORDER: '12',
      CHECK_DIR: '/checks',
    })
  })

  test('adds CHECK_BASE when a base is given, even an empty one', () => {
    expect(checkEnv(script('12-x'), folderOf(), '/r', '')).toMatchObject({ CHECK_BASE: '' })
  })
})

describe('report', () => {
  const results: CheckResult[] = [
    { entry: '10-a', status: 'PASS', durationMs: 12, exitCode: 0 },
    { entry: '20-b', status: 'FAIL', reason: 'exit 1', durationMs: 1500, stdout: 'oops\n' },
    { entry: '30-c', status: 'ERROR', reason: 'timed out after 1s', durationMs: 1000 },
    { entry: 'x', status: 'SKIP', reason: 'no numeric prefix', durationMs: 0 },
  ]

  test('text has one line per check, failure output and a summary', () => {
    expect(formatReport({ dir: '/c', results })).toBe(
      [
        'PASS  10-a (12ms)',
        'FAIL  20-b - exit 1 (1.5s)',
        '        oops',
        'ERROR 30-c - timed out after 1s (1.0s)',
        'SKIP  x - no numeric prefix',
        '',
        '1 passed, 1 failed, 1 errored, 1 skipped',
        '',
      ].join('\n'),
    )
  })

  test('stdout and stderr stay on separate lines', () => {
    const r: CheckResult = {
      entry: '1-x',
      status: 'FAIL',
      reason: 'exit 1',
      durationMs: 1,
      stdout: 'out-no-newline',
      stderr: 'err\n',
    }
    expect(formatReport({ dir: '/c', results: [r] })).toContain(
      '        out-no-newline\n        err\n',
    )
  })

  test('json carries the same results plus counts', () => {
    const json = runToJson({ dir: '/c', results })

    expect(json.results).toBe(results)
    expect(json.summary).toEqual({ PASS: 1, FAIL: 1, SKIP: 1, ERROR: 1 })
  })

  test('exit code is 1 on a failure or error, 0 otherwise', () => {
    expect(checksExitCode(results)).toBe(1)
    expect(checksExitCode(results.filter((r) => r.status === 'ERROR'))).toBe(1)
    expect(checksExitCode(results.filter((r) => r.status !== 'FAIL' && r.status !== 'ERROR'))).toBe(
      0,
    )
    expect(checksExitCode([])).toBe(0)
  })
})

describe('planChecks', () => {
  test('lists scripts to run and everything skipped, prompt checks included', async () => {
    const plan = planChecks(await readCheckFolder(FIXTURES))

    expect(plan.run.map((c) => c.entry)).toEqual([
      '10-pass',
      '20-fail',
      '30-slow',
      '35-child',
      '40-env',
      '50-signal',
    ])
    expect(plan.skipped).toContainEqual({
      entry: '60-review.md',
      reason: 'prompt checks not yet supported',
    })
    expect(plan.skipped).toContainEqual({ entry: '90-dir', reason: 'directory' })
    expect(formatPlan(plan)).toContain('RUN   30-slow (timeout 1s)')
    expect(formatPlan(plan)).toContain('SKIP  .hidden')
  })
})
