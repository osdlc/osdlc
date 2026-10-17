/**
 * Need: a library function that shells out, which production calls with no
 * runner and a unit test calls with a fake.
 *
 * The function takes an optional runner. `resolveRunner(binary, injected)`
 * returns the injected one, else the real `spawnRunner(binary)`. A fake is
 * any object with a `run` method; this file writes one by hand to show that.
 * Scenario 14 uses the ready-made fakes. `asAsync` lets one sync fake serve
 * async code too.
 */

import { expect, test } from 'bun:test'

import {
  asAsync,
  resolveRunner,
  resolveRunnerAsync,
  runChecked,
  runCheckedAsync,
  type AsyncCommandRunner,
  type CommandResult,
  type CommandRunner,
  type CommandRunOptions,
} from '@osdlc/command-seam'

// ---- Code under test -------------------------------------------------------

interface RepoInfo {
  branch: string
  head: string
}

/** Branch and short head sha of the repo in `dir`. */
function repoInfo(dir: string, runner?: CommandRunner): RepoInfo {
  const git = resolveRunner('git', runner)
  const read = (argv: string[]) => runChecked(git, argv, { cwd: dir }).stdout.trim()
  return {
    branch: read(['branch', '--show-current']),
    head: read(['rev-parse', '--short', 'HEAD']),
  }
}

/** `repoInfo` for several repos at once. */
async function repoInfos(dirs: string[], runner?: AsyncCommandRunner): Promise<RepoInfo[]> {
  const git = resolveRunnerAsync('git', runner)
  const read = async (dir: string, argv: string[]) =>
    (await runCheckedAsync(git, argv, { cwd: dir })).stdout.trim()
  return Promise.all(
    dirs.map(async (dir) => ({
      branch: await read(dir, ['branch', '--show-current']),
      head: await read(dir, ['rev-parse', '--short', 'HEAD']),
    })),
  )
}

// ---- A hand-written fake ---------------------------------------------------

/** Answers by argv, per repo; records every call. */
function fakeGit(repos: Record<string, Record<string, Partial<CommandResult>>>) {
  const calls: { argv: string[]; opts: CommandRunOptions }[] = []
  const runner: CommandRunner = {
    run(argv, opts) {
      calls.push({ argv, opts })
      const answer = repos[opts.cwd]?.[argv.join(' ')]
      if (answer === undefined)
        return { exitCode: 128, stdout: '', stderr: 'fatal: no fake answer' }
      return { exitCode: 0, stdout: '', stderr: '', ...answer }
    },
  }
  return { runner, calls }
}

const twoRepos = {
  '/a': {
    'branch --show-current': { stdout: 'main\n' },
    'rev-parse --short HEAD': { stdout: 'a1\n' },
  },
  '/b': {
    'branch --show-current': { stdout: 'dev\n' },
    'rev-parse --short HEAD': { stdout: 'b2\n' },
  },
}

// ---- Tests -----------------------------------------------------------------

test('a sync consumer runs against the fake', () => {
  const { runner, calls } = fakeGit(twoRepos)

  expect(repoInfo('/a', runner)).toEqual({ branch: 'main', head: 'a1' })
  expect(calls.map((c) => c.argv[0])).toEqual(['branch', 'rev-parse'])
})

test("a failing fake surfaces as the consumer's CommandFailed", () => {
  const { runner } = fakeGit({})

  expect(() => repoInfo('/nowhere', runner)).toThrow('fatal: no fake answer')
})

test('asAsync lets the same fake drive the async consumer', async () => {
  const { runner, calls } = fakeGit(twoRepos)

  expect(await repoInfos(['/a', '/b'], asAsync(runner))).toEqual([
    { branch: 'main', head: 'a1' },
    { branch: 'dev', head: 'b2' },
  ])
  expect(calls).toHaveLength(4)
})

// ---- The real runner -------------------------------------------------------

test('with nothing injected, resolveRunner gives the real binary', () => {
  // `sh` stands in for any binary on PATH.
  const sh = resolveRunner('sh')

  expect(sh.run(['-c', 'echo real'], { cwd: process.cwd() }).stdout).toBe('real\n')
}, 15_000)
