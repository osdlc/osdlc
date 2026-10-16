/**
 * Need: read a fact from a tool (the current branch, a blob id, matching
 * commits), and treat "the tool could not answer" as an answer of its own.
 *
 * Make a runner once per binary and call `run` with argv (no binary name) and
 * a `cwd`. `run` never throws for a failed command, so the code reads the
 * result and decides. `ran(r)` is the check: the process started and exited 0.
 */

import { expect, test } from 'bun:test'

import { firstLine, ran, spawnRunner, stderrOrError, type CommandRunner } from '@osdlc/command-seam'
import { fakeRunner } from '@osdlc/command-seam/testing'

// ---- Code under test -------------------------------------------------------

/** The checked-out branch; `null` when HEAD is detached, `dir` is not a repo, or git could not run. */
function currentBranch(dir: string, git: CommandRunner = spawnRunner('git')): string | null {
  const r = git.run(['branch', '--show-current'], { cwd: dir })
  return ran(r) ? firstLine(r.stdout) || null : null
}

/** Store `text` as a blob and return its id. */
function storeBlob(dir: string, text: string, git: CommandRunner = spawnRunner('git')): string {
  const r = git.run(['hash-object', '-w', '--stdin'], { cwd: dir, input: text })
  // `stderrOrError`: when git never ran, the reason is in `error`, not `stderr`.
  if (!ran(r)) throw new Error(`could not store blob: ${stderrOrError(r)}`)
  return firstLine(r.stdout)
}

/** Subjects of the commits whose message contains `needle`, as a user typed it. */
function searchLog(dir: string, needle: string, git: CommandRunner = spawnRunner('git')): string[] {
  // `needle` is one argv entry: nothing parses it as shell.
  const r = git.run(['log', '--format=%s', '--fixed-strings', `--grep=${needle}`], { cwd: dir })
  return ran(r) ? r.stdout.split('\n').filter(Boolean) : []
}

// ---- Tests -----------------------------------------------------------------

test('reads the branch', () => {
  const { runner } = fakeRunner({ 'branch --show-current': { stdout: 'main\n' } })

  expect(currentBranch('/repo', runner)).toBe('main')
})

test('detached, outside a repo, or no git at all: no branch', () => {
  const detached = fakeRunner({ 'branch --show-current': { stdout: '' } })
  const notARepo = fakeRunner({
    'branch --show-current': { exitCode: 128, stderr: 'fatal: not a git repository' },
  })
  // A call with no answer reports a failed spawn, as a missing binary would.
  const noGit = fakeRunner({})

  expect(currentBranch('/repo', detached.runner)).toBeNull()
  expect(currentBranch('/tmp', notARepo.runner)).toBeNull()
  expect(currentBranch('/repo', noGit.runner)).toBeNull()
})

test('feeds the text on stdin', () => {
  const { runner, calls } = fakeRunner({ 'hash-object -w --stdin': { stdout: 'e69de29\n' } })

  expect(storeBlob('/repo', 'hello\n', runner)).toBe('e69de29')
  expect(calls[0]?.opts.input).toBe('hello\n')
})

test('a blob that cannot be stored says why, even when git never ran', () => {
  const { runner } = fakeRunner({})

  expect(() => storeBlob('/repo', 'hello\n', runner)).toThrow(
    'could not store blob: fakeRunner: no answer for: hash-object -w --stdin',
  )
})

test('passes user text through as one argument', () => {
  const needle = '$(rm -rf ~); fix'
  // A key quotes each argument with `shellQuote`: the quotes show one argument.
  const { runner, calls } = fakeRunner({
    "log --format=%s --fixed-strings '--grep=$(rm -rf ~); fix'": {
      stdout: 'fix: $(rm -rf ~); fix\n',
    },
  })

  expect(searchLog('/repo', needle, runner)).toEqual(['fix: $(rm -rf ~); fix'])
  expect(calls[0]?.argv.at(-1)).toBe(`--grep=${needle}`)
})

// ---- The real runner -------------------------------------------------------

test('a real run: argv is not shell, stdin is fed, failures are values', () => {
  const cwd = process.cwd()

  const printed = spawnRunner('printf').run(['%s', '$(echo hi); rm -rf /'], { cwd })
  const echoed = spawnRunner('cat').run([], { cwd, input: 'piped in\n' })
  const failed = spawnRunner('sh').run(['-c', 'echo "nothing to do" >&2; exit 3'], { cwd })
  const missing = spawnRunner('no-such-binary').run([], { cwd })

  expect(printed.stdout).toBe('$(echo hi); rm -rf /')
  expect(echoed.stdout).toBe('piped in\n')
  expect(failed.exitCode).toBe(3)
  expect(failed.stderr.trim()).toBe('nothing to do')
  // The child chose exit 3 itself, so the runner does not mark it.
  expect(failed.neverExited).toBeUndefined()
  // A binary that never started: the exit code is a stand-in, `reason` says why.
  expect(missing).toMatchObject({ exitCode: 1, neverExited: true, reason: 'spawn' })
}, 15_000)
