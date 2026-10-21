/**
 * Need: a release step where any failed command means "stop", reported as the
 * app's own error rather than a raw command failure.
 *
 * `runChecked` throws `CommandFailed` on a non-zero exit. `mapFailed` turns
 * that into the caller's error type; `catchFailed` turns it into a fallback
 * value. Both let any other error through. The `Async` forms do the same for
 * `runCheckedAsync`.
 */

import { expect, test } from 'vitest'

import {
  catchFailed,
  catchFailedAsync,
  CommandFailed,
  mapFailed,
  mapFailedAsync,
  runChecked,
  runCheckedAsync,
  spawnRunner,
  spawnRunnerAsync,
  type AsyncCommandRunner,
  type CommandRunner,
} from '@osdlc/command-seam'
import { fakeRunner } from '@osdlc/command-seam/testing'

// ---- Code under test -------------------------------------------------------

class ReleaseError extends Error {
  override name = 'ReleaseError'
}

/** Tag HEAD as `v<version>` and return the tagged commit. */
function tagRelease(dir: string, version: string, git: CommandRunner = spawnRunner('git')): string {
  const tag = `v${version}`
  return mapFailed(
    () => {
      if (!/^\d+\.\d+\.\d+$/.test(version)) throw new TypeError(`not a version: ${version}`)
      runChecked(git, ['tag', '-a', tag, '-m', `Release ${version}`], { cwd: dir })
      return runChecked(git, ['rev-list', '-n', '1', tag], { cwd: dir }).stdout.trim()
    },
    (e) => new ReleaseError(`could not tag ${tag}: ${e.detail}`, { cause: e }),
  )
}

/** The upstream branch and how far HEAD is ahead of it; `null` when there is no upstream. */
function upstream(
  dir: string,
  git: CommandRunner = spawnRunner('git'),
): { branch: string; ahead: number } | null {
  // Two commands that can fail, so one `catchFailed` covers both. For a
  // single command, `ran(r) ? … : null` reads as well with no closure.
  return catchFailed(
    () => {
      const run = (argv: string[]) => runChecked(git, argv, { cwd: dir }).stdout.trim()
      const branch = run(['rev-parse', '--abbrev-ref', '@{upstream}'])
      return { branch, ahead: Number(run(['rev-list', '--count', `${branch}..HEAD`])) }
    },
    () => null,
  )
}

/** Push the tag; a rejected push becomes a `ReleaseError`. */
async function pushTag(
  dir: string,
  version: string,
  git: AsyncCommandRunner = spawnRunnerAsync('git'),
): Promise<void> {
  await mapFailedAsync(
    () => runCheckedAsync(git, ['push', 'origin', `v${version}`], { cwd: dir, timeoutMs: 60_000 }),
    (e) => new ReleaseError(`push of v${version} was rejected: ${e.detail}`, { cause: e }),
  )
}

/** Whether the remote already has the tag. An unreachable remote counts as "no". */
async function remoteHasTag(
  dir: string,
  version: string,
  git: AsyncCommandRunner = spawnRunnerAsync('git'),
): Promise<boolean> {
  return catchFailedAsync(
    async () => {
      const argv = ['ls-remote', '--tags', 'origin', `v${version}`]
      return (await runCheckedAsync(git, argv, { cwd: dir })).stdout.trim() !== ''
    },
    () => false,
  )
}

// ---- Tests -----------------------------------------------------------------

test('tags and returns the commit', () => {
  const { runner, calls } = fakeRunner({
    // The message is one argument, so the key quotes it, as `shellQuote` would.
    "tag -a v1.2.0 -m 'Release 1.2.0'": {},
    'rev-list -n 1 v1.2.0': { stdout: '9fceb02\n' },
  })

  expect(tagRelease('/repo', '1.2.0', runner)).toBe('9fceb02')
  expect(calls).toHaveLength(2)
})

test('a failed tag becomes a ReleaseError that keeps the CommandFailed', () => {
  const { runner } = fakeRunner({
    "tag -a v1.2.0 -m 'Release 1.2.0'": {
      exitCode: 128,
      stderr: "fatal: tag 'v1.2.0' already exists\n",
    },
  })

  let caught: unknown
  try {
    tagRelease('/repo', '1.2.0', runner)
  } catch (e) {
    caught = e
  }

  expect(caught).toBeInstanceOf(ReleaseError)
  expect((caught as Error).message).toBe("could not tag v1.2.0: fatal: tag 'v1.2.0' already exists")
  const cause = (caught as Error).cause as CommandFailed
  expect(cause).toBeInstanceOf(CommandFailed)
  expect(cause.argv).toEqual(['tag', '-a', 'v1.2.0', '-m', 'Release 1.2.0'])
})

test('a bug in the step is not rewrapped', () => {
  const { runner, calls } = fakeRunner({})

  expect(() => tagRelease('/repo', 'latest', runner)).toThrow(
    new TypeError('not a version: latest'),
  )
  expect(calls).toEqual([])
})

test('no upstream is a value, not an error', () => {
  // `{` is a shell character, so the key quotes `@{upstream}`.
  const tracking = fakeRunner({
    "rev-parse --abbrev-ref '@{upstream}'": { stdout: 'origin/main\n' },
    'rev-list --count origin/main..HEAD': { stdout: '2\n' },
  })
  const none = fakeRunner({
    "rev-parse --abbrev-ref '@{upstream}'": { exitCode: 128, stderr: 'fatal: no upstream' },
  })

  expect(upstream('/repo', tracking.runner)).toEqual({ branch: 'origin/main', ahead: 2 })
  expect(upstream('/repo', none.runner)).toBeNull()
  expect(none.calls).toHaveLength(1)
})

test('the async forms read the same way', async () => {
  const { asyncRunner: git } = fakeRunner({
    // `detail` joins both streams: git's error on stderr, the hook's reason on stdout.
    'push origin v1.2.0': {
      exitCode: 1,
      stdout: 'pre-push: tests failed\n',
      stderr: 'error: failed to push some refs\n',
    },
    'ls-remote --tags origin v1.2.0': { stdout: 'abc\trefs/tags/v1.2.0\n' },
    'ls-remote --tags origin v9.9.9': { stdout: '' },
  })

  await expect(pushTag('/repo', '1.2.0', git)).rejects.toThrow(
    new ReleaseError(
      'push of v1.2.0 was rejected: error: failed to push some refs\npre-push: tests failed',
    ),
  )
  expect(await remoteHasTag('/repo', '1.2.0', git)).toBe(true)
  expect(await remoteHasTag('/repo', '9.9.9', git)).toBe(false)
})

test('an unreachable remote counts as no tag', async () => {
  const { asyncRunner } = fakeRunner({
    'ls-remote --tags origin v1.2.0': {
      exitCode: 128,
      stderr: 'fatal: could not read from remote',
    },
  })

  expect(await remoteHasTag('/repo', '1.2.0', asyncRunner)).toBe(false)
})

// ---- The real runner -------------------------------------------------------

test('a real failure: the message names the binary, the argv and the stderr', () => {
  const sh = spawnRunner('sh')
  const argv = ['-c', 'echo "hook said no"; echo "commit failed" >&2; exit 1']

  expect(() => runChecked(sh, argv, { cwd: process.cwd() })).toThrow(
    `command failed (exit 1): sh -c 'echo "hook said no"; echo "commit failed" >&2; exit 1'\ncommit failed`,
  )
}, 15_000)
