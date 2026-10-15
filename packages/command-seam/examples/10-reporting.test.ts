/**
 * Need: run a batch of checks and print one status line each, and give the
 * full story when a required step fails.
 *
 * `failureText` picks the stream that explains a failure: stderr, else the
 * runner's own `error` (a missing binary, a timeout), else stdout, else
 * `exit N`. `{ both: true }` joins both streams. `stderrOrError` never falls
 * back to stdout, for commands whose stdout is data. `CommandFailed.detail`
 * is `failureText(e.result, { both: true })`.
 */

import { expect, test } from 'bun:test'

import {
  CommandFailed,
  failureText,
  firstLine,
  mapFailed,
  ran,
  runChecked,
  spawnRunner,
  stderrOrError,
  type CommandResult,
  type CommandRunner,
  type FailureTextOptions,
} from '@sksizer/command-seam'
import { fakeRunner } from '@sksizer/command-seam/testing'

// ---- Code under test -------------------------------------------------------

interface Check {
  label: string
  argv: string[]
}

/** One status line per check, as a CLI prints it. */
function statusLine(label: string, r: CommandResult): string {
  if (ran(r)) return `ok   ${label}: ${firstLine(r.stdout, '(no output)')}`
  return `FAIL ${label}: ${firstLine(failureText(r))}`
}

function runChecks(checks: Check[], cwd: string, runner: CommandRunner): string[] {
  return checks.map(({ label, argv }) =>
    statusLine(label, runner.run(argv, { cwd, timeoutMs: 120_000 })),
  )
}

/** For `--verbose`: everything the command said, both streams. */
const verbose: FailureTextOptions = { both: true }

function verboseFailure(label: string, r: CommandResult): string {
  return `${label} failed:\n${failureText(r, verbose)}`
}

/** The staged diff. Its stdout is data, so a failure reads stderr only. */
function stagedDiff(cwd: string, git: CommandRunner): string {
  const r = git.run(['diff', '--cached'], { cwd })
  if (!ran(r)) throw new Error(`git diff: ${stderrOrError(r) || `exit ${r.exitCode}`}`)
  return r.stdout
}

/** Commit, or throw with both streams: a rejecting hook explains itself on stdout. */
function commit(message: string, cwd: string, git: CommandRunner): void {
  mapFailed(
    () => runChecked(git, ['commit', '-m', message], { cwd }),
    (e: CommandFailed) => new Error(`commit failed:\n${e.detail}`),
  )
}

// ---- Tests -----------------------------------------------------------------

test('one line per check, success or failure', () => {
  const { runner } = fakeRunner((argv) => {
    switch (argv[0]) {
      case 'version':
        return { stdout: '1.4.0\nbuilt 2026-01-01\n' }
      case 'quiet':
        return {}
      case 'lint':
        return { exitCode: 1, stderr: '\n  3 errors\n  see above\n' }
      case 'apply': // Some tools explain a failure on stdout.
        return { exitCode: 1, stdout: 'patch does not apply\n' }
      case 'silent':
        return { exitCode: 9 }
      default: // No answer: reported as a failed spawn.
        return undefined
    }
  })
  const checks = ['version', 'quiet', 'lint', 'apply', 'silent', 'missing'].map((label) => ({
    label,
    argv: [label],
  }))

  expect(runChecks(checks, '/repo', runner)).toEqual([
    'ok   version: 1.4.0',
    'ok   quiet: (no output)',
    'FAIL lint: 3 errors',
    'FAIL apply: patch does not apply',
    'FAIL silent: exit 9',
    'FAIL missing: fakeRunner: no answer for: missing',
  ])
})

test('verbose output keeps both streams', () => {
  const r = { exitCode: 1, stdout: 'reason from the hook\n', stderr: 'push rejected\n' }

  expect(verboseFailure('push', r)).toBe('push failed:\npush rejected\nreason from the hook')
})

test('a data command reports stderr, or why it never ran', () => {
  const failing = fakeRunner({
    'diff --cached': { exitCode: 128, stdout: 'ignored', stderr: 'fatal: bad index\n' },
  })
  const noGit = fakeRunner({})

  expect(() => stagedDiff('/repo', failing.runner)).toThrow('git diff: fatal: bad index')
  expect(() => stagedDiff('/repo', noGit.runner)).toThrow(
    'git diff: fakeRunner: no answer for: diff --cached',
  )
})

test('a thrown failure reports both halves', () => {
  const { runner } = fakeRunner({
    'commit -m wip': {
      exitCode: 1,
      stdout: 'pre-commit: lint failed\n',
      stderr: 'commit aborted\n',
    },
  })

  expect(() => commit('wip', '/repo', runner)).toThrow(
    'commit failed:\ncommit aborted\npre-commit: lint failed',
  )
})

// ---- The real runner -------------------------------------------------------

test("a real timeout: the runner's message is in error, the child's in stderr", () => {
  const sh = spawnRunner('sh')
  const cwd = process.cwd()

  const quiet = sh.run(['-c', 'sleep 10'], { cwd, timeoutMs: 200 })
  const noisy = sh.run(['-c', 'echo "still working" >&2; sleep 10'], { cwd, timeoutMs: 200 })

  expect(quiet.stderr).toBe('')
  expect(quiet.error).toBeDefined()
  expect(stderrOrError(quiet)).toBe(quiet.error!)
  expect(statusLine('slow', quiet)).toBe(`FAIL slow: ${quiet.error}`)
  expect(stderrOrError(noisy)).toBe('still working')
}, 15_000)
