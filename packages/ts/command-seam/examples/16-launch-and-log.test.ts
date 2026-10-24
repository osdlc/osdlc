/**
 * Need: a CLI opens a folder in the user's editor and returns at once, runs a
 * step with all of its output in one log file, in the order the step wrote
 * it, and reports a step that could not start in its own words.
 *
 * `stdio` on `managedProcessRunner` and `streamRunner` sends the child's
 * stdio to `/dev/null` (`'ignore'`) or to file descriptors the caller opened
 * (`{ stdout, stderr }`, the same fd for both to keep one ordered log).
 * `'ignore'` with `unref` and `processGroup` launches a program and leaves it
 * running. The editor outlives the CLI, does not keep it open, and never
 * writes to its terminal. `quiet` stops `streamRunner` printing its own failure line, for a
 * caller that reports the failure itself.
 */

import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, expect, test } from 'vitest'

import {
  managedProcessRunner,
  streamRunner,
  type ManagedProcessRunner,
  type StdioOption,
  type StreamResult,
  type StreamRunner,
  type StreamRunOptions,
} from '@osdlc/command-seam'
import { fakeProcess } from '@osdlc/command-seam/testing'

// ---- Code under test -------------------------------------------------------

class StepError extends Error {}

/** Open `dir` in the editor and return without waiting for it. */
function openInEditor(dir: string, editor: ManagedProcessRunner = managedProcessRunner('code')) {
  editor.run([dir], { cwd: dir, processGroup: true, unref: true, stdio: 'ignore' })
}

/**
 * Run `binary argv` with stdout and stderr both written to the open file
 * `fd`. Resolves with the exit code, or 127 when it could not start, as a
 * shell would.
 */
async function runToFd(
  binary: string,
  argv: string[],
  fd: number,
  opts: { cwd: string; runner?: ManagedProcessRunner },
): Promise<number> {
  const stdio: StdioOption = { stdout: fd, stderr: fd }
  const runner = opts.runner ?? managedProcessRunner(binary)
  const exit = await runner.run(argv, { cwd: opts.cwd, stdio }).exited
  return exit.reason === 'spawn' ? 127 : exit.exitCode
}

/** Run `make` in `dir` with its output in `log`. Throws a `StepError` of our own when it fails. */
function make(dir: string, log: string, runner: StreamRunner = streamRunner('make')): void {
  const fd = openSync(log, 'a')
  let r: StreamResult
  try {
    r = runner.run([], { cwd: dir, stdio: { stdout: fd, stderr: fd }, quiet: true })
  } finally {
    closeSync(fd)
  }
  if (r.reason === 'spawn') throw new StepError(`make failed to start: ${r.error}`)
  if (r.exitCode !== 0) throw new StepError(`make failed (exit ${r.exitCode}); see ${log}`)
}

// ---- Tests -----------------------------------------------------------------

test('the editor is launched detached, unref’d and silent', () => {
  const proc = fakeProcess()

  openInEditor('/work/repo', proc.runner)

  expect(proc.calls).toEqual([
    {
      argv: ['/work/repo'],
      opts: { cwd: '/work/repo', processGroup: true, unref: true, stdio: 'ignore' },
    },
  ])
})

test('runToFd sends both streams to the fd, and maps a failed start to 127', async () => {
  const ran = fakeProcess()
  ran.exit({ exitCode: 3 })
  expect(await runToFd('make', ['test'], 9, { cwd: '/w', runner: ran.runner })).toBe(3)
  expect(ran.calls[0]?.opts.stdio).toEqual({ stdout: 9, stderr: 9 })

  const missing = fakeProcess({ pid: -1 })
  missing.exit({ exitCode: 1, neverExited: true, reason: 'spawn', error: 'spawn make ENOENT' })
  expect(await runToFd('make', [], 9, { cwd: '/w', runner: missing.runner })).toBe(127)
})

/** A stream fake that ends every run with `result` and records the options. */
function fakeMake(result: StreamResult) {
  const calls: StreamRunOptions[] = []
  const runner: StreamRunner = {
    run(_argv, opts) {
      calls.push(opts)
      return result
    },
  }
  return { runner, calls }
}

const scratch = mkdtempSync(join(tmpdir(), 'examples-log-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

test('make runs quiet, so its failure is reported once, in our words', () => {
  const missing = fakeMake({
    exitCode: 1,
    neverExited: true,
    reason: 'spawn',
    error: 'spawnSync make ENOENT',
  })
  const log = join(scratch, 'fake.log')

  expect(() => make('/w', log, missing.runner)).toThrow(
    new StepError('make failed to start: spawnSync make ENOENT'),
  )
  expect(missing.calls[0]?.quiet).toBe(true)
  expect(() => make('/w', log, fakeMake({ exitCode: 2 }).runner)).toThrow(`see ${log}`)
})

// ---- The real runners ------------------------------------------------------

test('a real step logs both streams in the order it wrote them', async () => {
  const log = join(scratch, 'step.log')
  const fd = openSync(log, 'w')
  try {
    const script = 'echo compiling; echo "warning: unused" >&2; echo linking; exit 2'
    expect(await runToFd('sh', ['-c', script], fd, { cwd: scratch })).toBe(2)
    expect(await runToFd('definitely-not-a-real-tool', [], fd, { cwd: scratch })).toBe(127)
  } finally {
    closeSync(fd)
  }
  expect(readFileSync(log, 'utf-8')).toBe('compiling\nwarning: unused\nlinking\n')
})

test('a real make that cannot start throws our error and prints nothing', () => {
  const log = join(scratch, 'make.log')
  expect(() => make(scratch, log, streamRunner('definitely-not-a-real-make'))).toThrow(
    'make failed to start',
  )
  expect(readFileSync(log, 'utf-8')).toBe('')
})
