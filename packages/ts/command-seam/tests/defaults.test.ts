/**
 * `withDefaults` on each runner type: the defaults reach `run`, a per-call
 * option wins, a per-call `env` merges over the bound one, and a per-call
 * `undefined` keeps the default.
 */

import { describe, expect, test } from 'vitest'

import {
  spawnRunner,
  withDefaults,
  type AsyncCommandRunner,
  type AsyncCommandRunOptions,
  type AsyncShellRunner,
  type AsyncShellRunOptions,
  type CommandResult,
  type CommandRunner,
  type CommandRunOptions,
  type ManagedProcessHandle,
  type ManagedProcessRunner,
  type ManagedProcessRunOptions,
  type ShellRunner,
  type ShellRunOptions,
  type StreamRunner,
  type StreamRunOptions,
} from '../index.ts'

const OK: CommandResult = { exitCode: 0, stdout: '', stderr: '' }

describe('withDefaults', () => {
  test('capture runner: defaults bound, a per-call option wins', () => {
    const seen: CommandRunOptions[] = []
    const fake: CommandRunner = { run: (_argv, opts) => (seen.push(opts), OK) }
    const git = withDefaults(fake, { cwd: '/repo', timeoutMs: 30_000 })

    git.run(['status'])
    git.run(['fetch'], { timeoutMs: 120_000, input: 'x' })

    expect(seen).toEqual([
      { cwd: '/repo', timeoutMs: 30_000 },
      { cwd: '/repo', timeoutMs: 120_000, input: 'x' },
    ])
  })

  test('async runner', async () => {
    const seen: AsyncCommandRunOptions[] = []
    const fake: AsyncCommandRunner = { run: async (_argv, opts) => (seen.push(opts), OK) }
    const signal = new AbortController().signal
    const git = withDefaults(fake, { cwd: '/repo', processGroup: true })

    await git.run(['fetch'], { signal })
    await git.run(['fetch'], { processGroup: false })

    expect(seen).toEqual([
      { cwd: '/repo', processGroup: true, signal },
      { cwd: '/repo', processGroup: false },
    ])
  })

  test('shell runners', async () => {
    const seen: (ShellRunOptions | AsyncShellRunOptions)[] = []
    const sync: ShellRunner = { run: (_verb, opts) => (seen.push(opts), OK) }
    const async: AsyncShellRunner = { run: async (_verb, opts) => (seen.push(opts), OK) }

    withDefaults(sync, { cwd: '/repo', scriptName: 'hook' }).run('true', { args: ['a'] })
    await withDefaults(async, { cwd: '/repo', args: ['a'] }).run('true', { args: ['b'] })

    expect(seen).toEqual([
      { cwd: '/repo', scriptName: 'hook', args: ['a'] },
      { cwd: '/repo', args: ['b'] },
    ])
  })

  test('streaming runner', () => {
    const seen: StreamRunOptions[] = []
    const fake: StreamRunner = { run: (_argv, opts) => (seen.push(opts), { exitCode: 0 }) }

    withDefaults(fake, { cwd: '/repo', env: { CI: '1', TERM: 'dumb' } }).run(['build'], {
      env: { CI: '0' },
    })

    expect(seen).toEqual([{ cwd: '/repo', env: { CI: '0', TERM: 'dumb' } }])
  })

  test('managed-process runner', () => {
    const seen: ManagedProcessRunOptions[] = []
    const handle: ManagedProcessHandle = {
      pid: 1,
      kill: () => {},
      exited: Promise.resolve({ exitCode: 0, signal: null }),
    }
    const fake: ManagedProcessRunner = { run: (_argv, opts) => (seen.push(opts), handle) }

    expect(withDefaults(fake, { cwd: '/repo', processGroup: true }).run(['serve'])).toBe(handle)
    expect(seen).toEqual([{ cwd: '/repo', processGroup: true }])
  })

  test('a per-call undefined keeps the default', () => {
    const seen: CommandRunOptions[] = []
    const fake: CommandRunner = { run: (_argv, opts) => (seen.push(opts), OK) }

    withDefaults(fake, { cwd: '/repo', timeoutMs: 5 }).run(['x'], { timeoutMs: undefined })

    expect(seen).toEqual([{ cwd: '/repo', timeoutMs: 5 }])
  })

  test('a per-call env merges over the bound env, and an undefined value removes one', () => {
    const seen: CommandRunOptions[] = []
    const fake: CommandRunner = { run: (_argv, opts) => (seen.push(opts), OK) }
    const bound = { LC_ALL: 'C', GIT_DIR: '/repo/.git' }
    const git = withDefaults(fake, { cwd: '/repo', env: bound })

    git.run(['fetch'], { env: { GIT_SSH_COMMAND: 'ssh -i key' } })
    git.run(['status'], { env: { GIT_DIR: undefined } })
    git.run(['log'], { env: undefined })

    expect(seen.map((o) => o.env)).toEqual([
      { LC_ALL: 'C', GIT_DIR: '/repo/.git', GIT_SSH_COMMAND: 'ssh -i key' },
      { LC_ALL: 'C', GIT_DIR: undefined },
      { LC_ALL: 'C', GIT_DIR: '/repo/.git' },
    ])
    // The bound object is never written to.
    expect(bound).toEqual({ LC_ALL: 'C', GIT_DIR: '/repo/.git' })
  })

  test('a per-call env with no bound env is passed as is', () => {
    const seen: CommandRunOptions[] = []
    const fake: CommandRunner = { run: (_argv, opts) => (seen.push(opts), OK) }

    withDefaults(fake, { cwd: '/repo' }).run(['x'], { env: { A: '1' } })

    expect(seen).toEqual([{ cwd: '/repo', env: { A: '1' } }])
  })

  test('an undefined value removes a bound variable from a real child', () => {
    const env = { SEAM_A: 'bound', SEAM_B: 'bound' }
    const sh = withDefaults(spawnRunner('sh'), { cwd: '/', env })
    const r = sh.run(['-c', 'echo "${SEAM_A-unset} ${SEAM_B-unset} ${SEAM_C-unset}"'], {
      env: { SEAM_B: undefined, SEAM_C: 'call' },
    })
    expect(r.stdout).toBe('bound unset call\n')
  })

  test('the defaults are copied when bound', () => {
    const seen: CommandRunOptions[] = []
    const fake: CommandRunner = { run: (_argv, opts) => (seen.push(opts), OK) }
    const defaults = { cwd: '/repo' }
    const git = withDefaults(fake, defaults)

    defaults.cwd = '/elsewhere'
    git.run(['status'])

    expect(seen).toEqual([{ cwd: '/repo' }])
  })

  test('the result is still a runner of the original type', () => {
    const runner: CommandRunner = withDefaults(spawnRunner('sh'), { cwd: '/' })
    expect(runner.run(['-c', 'pwd -P'], { cwd: process.cwd() }).stdout.trim()).not.toBe('/')
    expect(runner.run(['-c', 'pwd -P'], { cwd: '/' }).stdout).toBe('/\n')
  })
})
