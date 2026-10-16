/**
 * Need: a small client for one repository, where every call shares the same
 * folder, time cap and environment, without repeating them on each call.
 *
 * `withDefaults(runner, opts)` returns a runner that fills them in. A
 * per-call option replaces the default of the same name, except `env`, which
 * is merged over the bound one. `runChecked`, `runJson` and their async forms
 * take the bound runner and need only the options it did not bind.
 */

import { expect, test } from 'bun:test'

import {
  runChecked,
  runCheckedAsync,
  runJson,
  runJsonAsync,
  shellQuote,
  spawnRunner,
  spawnRunnerAsync,
  withDefaults,
  type AsyncCommandRunner,
  type CommandRunner,
  type DefaultedRunner,
  type JsonRun,
} from '@osdlc/command-seam'
import { fakeRunner } from '@osdlc/command-seam/testing'

// ---- Code under test -------------------------------------------------------

const C_LOCALE = { LC_ALL: 'C' }

/** git in one repo: a 30 s cap and a C locale on every call. */
function gitClient(dir: string, git: CommandRunner = spawnRunner('git')) {
  const run: DefaultedRunner<CommandRunner, 'cwd' | 'timeoutMs' | 'env'> = withDefaults(git, {
    cwd: dir,
    timeoutMs: 30_000,
    env: C_LOCALE,
  })
  return {
    head: () => runChecked(run, ['rev-parse', 'HEAD']).stdout.trim(),
    isClean: () => runChecked(run, ['status', '--porcelain']).stdout === '',
    // A fetch may take longer than the default cap.
    fetch: () => runChecked(run, ['fetch', '--prune'], { timeoutMs: 300_000 }),
    // A per-call `env` is merged over the bound one, so the locale stays.
    // git runs GIT_SSH_COMMAND through the shell, so the path is quoted.
    fetchWithKey: (key: string) =>
      runChecked(run, ['fetch'], { env: { GIT_SSH_COMMAND: `ssh -i ${shellQuote(key)}` } }),
  }
}

interface PullRequest {
  number: number
  title: string
}

const prView = (n: number) => ['pr', 'view', String(n), '--json', 'number,title']

/** A check, not a cast: gh must have printed a list. */
function countOf(value: unknown): number {
  if (!Array.isArray(value)) throw new Error('expected a list')
  return value.length
}

/** gh in one repo. */
function ghClient(dir: string, gh: CommandRunner = spawnRunner('gh')) {
  const run = withDefaults(gh, { cwd: dir, timeoutMs: 30_000 })
  return {
    pullRequest: (n: number) => runJson<PullRequest>(run, prView(n)),
    // With `parse`, the value's type comes from what `parse` returns.
    prCount: () => runJson(run, ['pr', 'list', '--json', 'number'], { parse: countOf }),
  }
}

/** gh for concurrent work: the same calls, awaited. */
function ghClientAsync(dir: string, gh: AsyncCommandRunner = spawnRunnerAsync('gh')) {
  const run = withDefaults(gh, { cwd: dir, timeoutMs: 30_000 })
  return {
    viewer: async () =>
      (await runCheckedAsync(run, ['api', 'user', '--jq', '.login'])).stdout.trim(),
    pullRequest: (n: number) => runJsonAsync<PullRequest>(run, prView(n)),
    prCount: () => runJsonAsync(run, ['pr', 'list', '--json', 'number'], { parse: countOf }),
  }
}

// ---- Tests -----------------------------------------------------------------

test('every call gets the bound options; a per-call option wins', () => {
  const { runner, calls } = fakeRunner({
    'rev-parse HEAD': { stdout: 'abc\n' },
    'fetch --prune': {},
  })
  const repo = gitClient('/repo', runner)

  expect(repo.head()).toBe('abc')
  repo.fetch()

  expect(calls.map((c) => c.opts)).toEqual([
    { cwd: '/repo', timeoutMs: 30_000, env: { LC_ALL: 'C' } },
    { cwd: '/repo', timeoutMs: 300_000, env: { LC_ALL: 'C' } },
  ])
})

test('a failed status is an error, not a clean tree', () => {
  const clean = fakeRunner({ 'status --porcelain': {} })
  const dirty = fakeRunner({ 'status --porcelain': { stdout: ' M a.ts\n' } })
  const noGit = fakeRunner({})

  expect(gitClient('/repo', clean.runner).isClean()).toBe(true)
  expect(gitClient('/repo', dirty.runner).isClean()).toBe(false)
  expect(() => gitClient('/repo', noGit.runner).isClean()).toThrow(
    'no answer for: status --porcelain',
  )
})

test('a per-call env is merged over the bound env', () => {
  const { runner, calls } = fakeRunner({ fetch: {} })

  gitClient('/repo', runner).fetchWithKey('/keys/my deploy key')

  expect(calls[0]?.opts.env).toEqual({
    LC_ALL: 'C',
    GIT_SSH_COMMAND: "ssh -i '/keys/my deploy key'",
  })
})

test('runJson takes the bound runner', () => {
  const { runner } = fakeRunner({
    'pr view 7 --json number,title': { stdout: '{"number":7,"title":"Fix login"}' },
    'pr list --json number': { stdout: '[{"number":7},{"number":8}]' },
  })
  const gh = ghClient('/repo', runner)
  const notAList = ghClient(
    '/repo',
    fakeRunner({ 'pr list --json number': { stdout: '{}' } }).runner,
  )

  const pr = gh.pullRequest(7)
  const count = gh.prCount()

  expect(pr.ok && pr.value.title).toBe('Fix login')
  expect(count.ok && count.value).toBe(2)
  expect(notAList.prCount()).toMatchObject({ ok: false, reason: 'invalid' })
})

test('the async forms do the same', async () => {
  const { asyncRunner, calls } = fakeRunner({
    'api user --jq .login': { stdout: 'octocat\n' },
    'pr view 7 --json number,title': { stdout: '{"number":7,"title":"Fix login"}' },
    'pr list --json number': { stdout: '[{"number":7}]' },
  })
  const gh = ghClientAsync('/repo', asyncRunner)

  expect(await gh.viewer()).toBe('octocat')
  const pr = await gh.pullRequest(7)
  expect(pr.ok && pr.value.number).toBe(7)
  const count = await gh.prCount()
  expect(count.ok && count.value).toBe(1)
  expect(calls.every((c) => c.opts.cwd === '/repo')).toBe(true)
})

test('a bound runner still passes as the plain runner type', () => {
  const { runner, calls } = fakeRunner({ status: {} })
  // Code that takes a `CommandRunner` accepts it, and its own `cwd` wins.
  const plain: CommandRunner = withDefaults(runner, { cwd: '/repo', timeoutMs: 5_000 })

  plain.run(['status'], { cwd: '/other' })

  expect(calls[0]?.opts).toEqual({ cwd: '/other', timeoutMs: 5_000 })
})

test('the types catch an unbound cwd and a misspelt key', () => {
  const capped = withDefaults(spawnRunner('sh'), { timeoutMs: 10_000 })
  const nothingBound = withDefaults(spawnRunner('sh'), {})
  const mistakes = async () => {
    // @ts-expect-error -- `cwd` has no default here, so each call must pass it.
    capped.run(['-c', 'true'])
    // @ts-expect-error -- the same with nothing bound.
    nothingBound.run(['-c', 'true'])
    // @ts-expect-error -- `timout` is not an option.
    withDefaults(spawnRunner('sh'), { cwd: '/', timout: 5 })
    // @ts-expect-error -- nor per call.
    capped.run(['-c', 'true'], { cwd: '/', timout: 5 })
    // @ts-expect-error -- an explicit type still needs `cwd` when none is bound.
    runJson<PullRequest>(spawnRunner('gh'), prView(7))
    // @ts-expect-error -- the same when only `timeoutMs` is bound.
    runJson<PullRequest>(capped, prView(7))
    // @ts-expect-error -- `parse` returns a number, so the value is not a string.
    const wrong: JsonRun<string> = ghClient('/').prCount()
    const count = await ghClientAsync('/').prCount()
    // @ts-expect-error -- the async form types the value from `parse` too.
    const wrongAsync: string = count.ok ? count.value : ''
    return [wrong, wrongAsync]
  }
  void mistakes
})

// ---- The real runner -------------------------------------------------------

test('bound options reach a real process', () => {
  const sh = withDefaults(spawnRunner('sh'), { cwd: '/', env: { X: 'bound' } })

  expect(sh.run(['-c', 'pwd -P; echo "$X"']).stdout).toBe('/\nbound\n')
  expect(sh.run(['-c', 'pwd -P'], { cwd: '/usr' }).stdout).toBe('/usr\n')
}, 15_000)
