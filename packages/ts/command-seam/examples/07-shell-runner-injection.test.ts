/**
 * Need: a hook runner whose unit tests check which configured commands would
 * run, and in what order, without running any of them.
 *
 * The code takes a `ShellRunner`. `shellRunner(sh)` builds one over any
 * `CommandRunner` for `sh`, so a test passes a fake and sees the exact argv
 * `sh` would get. `shellRunnerAsync(fake.asyncRunner)` does the same for
 * async code.
 */

import { expect, test } from 'vitest'

import {
  shellRunner,
  shellRunnerAsync,
  type AsyncShellRunner,
  type ShellRunner,
} from '@osdlc/command-seam'
import { fakeRunner } from '@osdlc/command-seam/testing'

// ---- Code under test -------------------------------------------------------

/** Run each hook in order and stop at the first that fails; returns those that passed. */
function runHooks(hooks: string[], cwd: string, sh: ShellRunner = shellRunner()): string[] {
  const passed: string[] = []
  for (const hook of hooks) {
    if (sh.run(hook, { cwd, scriptName: 'hook' }).exitCode !== 0) break
    passed.push(hook)
  }
  return passed
}

/** Run independent hooks at once; returns the hooks that failed. */
async function failingHooks(
  hooks: string[],
  cwd: string,
  sh: AsyncShellRunner = shellRunnerAsync(),
): Promise<string[]> {
  const results = await Promise.all(hooks.map((hook) => sh.run(hook, { cwd, timeoutMs: 60_000 })))
  return hooks.filter((_, i) => results[i]!.exitCode !== 0)
}

// ---- Tests -----------------------------------------------------------------

test('stops at the first failing hook; the fake sees what sh would get', () => {
  const sh = fakeRunner((argv) => (argv[2] === 'npm test' ? { exitCode: 1 } : {}))

  const passed = runHooks(
    ['npm run lint', 'npm test', 'npm run build'],
    '/repo',
    shellRunner(sh.runner),
  )

  expect(passed).toEqual(['npm run lint'])
  expect(sh.calls.map((c) => c.argv)).toEqual([
    ['-c', '--', 'npm run lint', 'hook'],
    ['-c', '--', 'npm test', 'hook'],
  ])
})

test('the same fake drives the async shell runner', async () => {
  const sh = fakeRunner((argv) => (argv[2] === 'tsc' ? { exitCode: 2 } : {}))

  const failed = await failingHooks(['eslint .', 'tsc'], '/repo', shellRunnerAsync(sh.asyncRunner))

  expect(failed).toEqual(['tsc'])
  expect(sh.calls.map((c) => c.opts.timeoutMs)).toEqual([60_000, 60_000])
})

// ---- The real runner -------------------------------------------------------

test('with no argument it is the real sh', () => {
  expect(runHooks(['true', 'false', 'true'], process.cwd())).toEqual(['true'])
}, 15_000)
