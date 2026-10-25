/**
 * The options-only constructor: `new Gh({ repo, hostname?, runner? })` and
 * the same for `AsyncGh`. Such a client names a repository and no
 * directory. It builds the same argv as `new Gh(cwd, { repo })` and runs
 * each call in `process.cwd()`, read when the call is made. `repo` is
 * required in that form, by the types and at runtime.
 */

import { afterEach, describe, expect, expectTypeOf, test, vi } from 'vitest'

import {
  AsyncGh,
  Gh,
  type AsyncCommandRunner,
  type AsyncGhRepoOptions,
  type CommandResult,
  type CommandRunner,
  type GhRepoOptions,
} from '../src/index.ts'

interface Call {
  argv: string[]
  cwd: string
  env: Record<string, string | undefined> | undefined
}

const ok = (stdout: string): CommandResult => ({ exitCode: 0, stdout, stderr: '' })

function syncRecorder(stdout = '[]') {
  const calls: Call[] = []
  const runner: CommandRunner = {
    run(argv, opts) {
      calls.push({ argv: [...argv], cwd: opts.cwd, env: opts.env })
      return ok(stdout)
    },
  }
  return { calls, runner }
}

function asyncRecorder(stdout = '[]') {
  const calls: Call[] = []
  const runner: AsyncCommandRunner = {
    async run(argv, opts) {
      calls.push({ argv: [...argv], cwd: opts.cwd, env: opts.env })
      return ok(stdout)
    },
  }
  return { calls, runner }
}

const TARGET = { repo: 'acme/widgets', hostname: 'ghe.acme.com' } as const

/** Repo-targeted and host-only calls, run on a sync client. */
function runSync(gh: Gh): void {
  gh.prList()
  gh.issueList()
  gh.labelList()
  gh.api('repos/{owner}/{repo}/branches')
  gh.soft.repoView()
  gh.repoList('acme')
  gh.searchPrs('is:open')
  gh.raw(['pr', 'status'])
}

/** {@link runSync} for an async client. */
async function runAsync(gh: AsyncGh): Promise<void> {
  await gh.prList()
  await gh.issueList()
  await gh.labelList()
  await gh.api('repos/{owner}/{repo}/branches')
  await gh.soft.repoView()
  await gh.repoList('acme')
  await gh.searchPrs('is:open')
  await gh.raw(['pr', 'status'])
}

const strip = (calls: Call[]) => calls.map(({ argv, env }) => ({ argv, env }))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('new Gh({ repo }) and new AsyncGh({ repo })', () => {
  test('build the same argv and env as the cwd form, sync and async', async () => {
    const withCwd = syncRecorder()
    const repoOnly = syncRecorder()
    runSync(new Gh('/clone', { ...TARGET, runner: withCwd.runner }))
    runSync(new Gh({ ...TARGET, runner: repoOnly.runner }))
    expect(strip(repoOnly.calls)).toEqual(strip(withCwd.calls))
    expect(repoOnly.calls[0]!.argv).toContain('--repo')

    const asyncCwd = asyncRecorder()
    const asyncRepoOnly = asyncRecorder()
    await runAsync(new AsyncGh('/clone', { ...TARGET, runner: asyncCwd.runner }))
    await runAsync(new AsyncGh({ ...TARGET, runner: asyncRepoOnly.runner }))
    expect(strip(asyncRepoOnly.calls)).toEqual(strip(asyncCwd.calls))
    expect(strip(asyncRepoOnly.calls)).toEqual(strip(repoOnly.calls))
  })

  test('the cwd form still runs every call in its own directory', () => {
    const { calls, runner } = syncRecorder()
    runSync(new Gh('/clone', { ...TARGET, runner }))
    expect(new Set(calls.map((c) => c.cwd))).toEqual(new Set(['/clone']))
  })

  test('pass process.cwd() to the runner, read at call time', async () => {
    const spy = vi.spyOn(process, 'cwd').mockReturnValue('/first')
    const sync = syncRecorder()
    const as = asyncRecorder()
    const gh = new Gh({ repo: 'acme/widgets', runner: sync.runner })
    const agh = new AsyncGh({ repo: 'acme/widgets', runner: as.runner })
    expect(gh.cwd).toBe('/first')
    expect(agh.cwd).toBe('/first')

    spy.mockReturnValue('/second')
    gh.prList()
    gh.rawChecked(['pr', 'status'])
    gh.soft.issueList()
    await agh.prList()
    await agh.rawChecked(['pr', 'status'])
    await agh.try.issueList()

    expect(gh.cwd).toBe('/second')
    expect(agh.cwd).toBe('/second')
    expect(sync.calls.map((c) => c.cwd)).toEqual(['/second', '/second', '/second'])
    expect(as.calls.map((c) => c.cwd)).toEqual(['/second', '/second', '/second'])
  })

  test('keep repo and hostname on the instance', () => {
    const gh = new Gh(TARGET)
    const agh = new AsyncGh(TARGET)
    expect([gh.repo, gh.hostname]).toEqual(['acme/widgets', 'ghe.acme.com'])
    expect([agh.repo, agh.hostname]).toEqual(['acme/widgets', 'ghe.acme.com'])
  })

  test('at(cwd) gives a normal cwd-bound client with the same runner and target', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/elsewhere')
    const sync = syncRecorder()
    const as = asyncRecorder()
    const gh = new Gh({ ...TARGET, runner: sync.runner }).at('/clone')
    const agh = new AsyncGh({ ...TARGET, runner: as.runner }).at('/clone')
    gh.prList()
    await agh.prList()

    expect(gh.cwd).toBe('/clone')
    expect(agh.cwd).toBe('/clone')
    expect([gh.repo, gh.hostname]).toEqual([TARGET.repo, TARGET.hostname])
    expect([agh.repo, agh.hostname]).toEqual([TARGET.repo, TARGET.hostname])
    expect(sync.calls.map((c) => c.cwd)).toEqual(['/clone'])
    expect(as.calls.map((c) => c.cwd)).toEqual(['/clone'])
    expect(sync.calls[0]!.argv).toContain('ghe.acme.com/acme/widgets')
  })

  test('withRepo(repo) keeps the client without a directory', async () => {
    const spy = vi.spyOn(process, 'cwd').mockReturnValue('/first')
    const sync = syncRecorder()
    const as = asyncRecorder()
    const gh = new Gh({ ...TARGET, runner: sync.runner }).withRepo('acme/gadgets')
    const agh = new AsyncGh({ ...TARGET, runner: as.runner }).withRepo('acme/gadgets')
    spy.mockReturnValue('/second')
    gh.prList()
    await agh.prList()

    expect(gh.repo).toBe('acme/gadgets')
    expect(agh.hostname).toBe('ghe.acme.com')
    expect(sync.calls.map((c) => c.cwd)).toEqual(['/second'])
    expect(as.calls.map((c) => c.cwd)).toEqual(['/second'])
    expect(sync.calls[0]!.argv).toContain('ghe.acme.com/acme/gadgets')
  })

  test('withRepo(repo) on a cwd-bound client keeps the directory', () => {
    const gh = new Gh('/clone', { repo: 'acme/widgets' }).withRepo('acme/gadgets')
    expect(gh.cwd).toBe('/clone')
  })

  test('prFind of owner/name#N on a repo-only client names that repository', () => {
    const { calls, runner } = syncRecorder('{"number":9}')
    new Gh({ repo: 'acme/widgets', runner }).prFind('acme/gadgets#9', { fields: ['number'] })
    expect(calls[0]!.argv).toEqual([
      'pr',
      'view',
      '9',
      '--repo',
      'acme/gadgets',
      '--json',
      'number',
    ])
  })

  test('throw TypeError without a repo, and RangeError for an invalid one', () => {
    for (const make of [
      (o: unknown) => new Gh(o as GhRepoOptions),
      (o: unknown) => new AsyncGh(o as AsyncGhRepoOptions),
    ]) {
      expect(() => make({})).toThrow(TypeError)
      expect(() => make({ hostname: 'ghe.acme.com' })).toThrow(TypeError)
      expect(() => make({ repo: undefined })).toThrow(TypeError)
      expect(() => make(undefined)).toThrow(TypeError)
      expect(() => make({ repo: 'not a slug' })).toThrow(RangeError)
      expect(() => make({ repo: '' })).toThrow(RangeError)
    }
  })
})

describe('the constructor types', () => {
  test('the options-only form requires repo', () => {
    // Type-level only: each line must fail to typecheck (`pnpm run typecheck`).
    const typeOnly = (): void => {
      // @ts-expect-error repo is required without a cwd
      new Gh({})
      // @ts-expect-error repo is required without a cwd
      new Gh({ hostname: 'ghe.acme.com' })
      // @ts-expect-error repo must be a string, not undefined
      new Gh({ repo: undefined })
      // @ts-expect-error the options-only form takes no second argument
      new Gh({ repo: 'acme/widgets' }, {})
      // @ts-expect-error repo is required without a cwd
      new AsyncGh({})
      // @ts-expect-error repo is required without a cwd
      new AsyncGh({ hostname: 'ghe.acme.com' })
      // @ts-expect-error a sync runner is not an async one
      new AsyncGh({ repo: 'acme/widgets', runner: syncRecorder().runner })
      // @ts-expect-error cwd is read-only
      new Gh({ repo: 'acme/widgets' }).cwd = '/x'
    }
    expect(typeof typeOnly).toBe('function')
  })

  test('both forms typecheck, and cwd is a string on each', () => {
    expectTypeOf(new Gh({ repo: 'acme/widgets' })).toEqualTypeOf<Gh>()
    expectTypeOf(new Gh('/clone')).toEqualTypeOf<Gh>()
    expectTypeOf(new Gh('/clone', { hostname: 'ghe.acme.com' })).toEqualTypeOf<Gh>()
    expectTypeOf(new AsyncGh({ repo: 'acme/widgets' })).toEqualTypeOf<AsyncGh>()
    expectTypeOf(new AsyncGh('/clone')).toEqualTypeOf<AsyncGh>()
    expectTypeOf<Gh['cwd']>().toEqualTypeOf<string>()
    expectTypeOf<AsyncGh['cwd']>().toEqualTypeOf<string>()
    expectTypeOf<GhRepoOptions['repo']>().toEqualTypeOf<string>()
    expectTypeOf<AsyncGhRepoOptions['repo']>().toEqualTypeOf<string>()
  })
})
