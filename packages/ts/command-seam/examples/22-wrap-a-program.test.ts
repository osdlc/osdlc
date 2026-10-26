/**
 * Need: a small typed client over one program, with a method that throws, a
 * `try` form that returns the failure instead, and positional arguments that
 * can never be read as options.
 *
 * `runFailed` is the gate between a result and a parse: a run that never
 * exited or whose output was cut short fails, and so does a non-zero exit the
 * verb does not accept as an answer. `classifyFailed` starts the client's own
 * failure classifier. `tryMethods` (and `tryMethodsAsync`) build the `try`
 * form over `methodFacade`. `notAnOption` refuses a positional that starts
 * with `-`.
 */

import { expect, test } from 'vitest'

import {
  classifyFailed,
  CommandFailed,
  isCommandFailed,
  methodFacade,
  notAnOption,
  runFailed,
  tryMethods,
  tryMethodsAsync,
  type ClassifyFailedOptions,
  type CommandFailure,
  type CommandRunner,
  type TriedMethods,
  type TriedMethodsAsync,
} from '@osdlc/command-seam'
import { fakeNeverExited, fakeRunner } from '@osdlc/command-seam/testing'

// ---- Code under test -------------------------------------------------------

const KV: ClassifyFailedOptions = { binary: 'kv', installHint: 'Install kv from its website.' }

/** A failed `kv` run: command-seam's kinds, plus `no-store` read from stderr. */
type KvFailure = Omit<CommandFailure, 'kind'> & { kind: CommandFailure['kind'] | 'no-store' }

function classifyKv(failed: CommandFailed): KvFailure {
  const base = classifyFailed(failed, KV)
  if (base.kind !== 'exit') return base
  return /no store here/.test(failed.result.stderr)
    ? { ...base, kind: 'no-store' as const, message: 'There is no kv store here.' }
    : base
}

/** Thrown for a failed `kv` run. */
class KvError extends Error {
  readonly failure: KvFailure
  constructor(failure: KvFailure) {
    super(failure.message)
    this.failure = failure
  }
}

const recognize = (e: unknown): KvFailure | null => (e instanceof KvError ? e.failure : null)

class Kv {
  readonly #runner: CommandRunner
  constructor(runner: CommandRunner) {
    this.#runner = runner
  }

  /** The value under `key`, or `null` when it is unset (`kv get` exits 1). */
  get(key: string): string | null {
    const argv = ['get', notAnOption(key, (k) => new TypeError(`kv: key ${k} reads as an option`))]
    const result = this.#runner.run(argv, { cwd: '.' })
    if (runFailed(result, (r) => r.exitCode === 1)) {
      throw new KvError(classifyKv(new CommandFailed(argv, result, this.#runner.binary)))
    }
    return result.exitCode === 0 ? result.stdout.trim() : null
  }

  async getLater(key: string): Promise<string | null> {
    return this.get(key)
  }

  get try(): TriedMethods<Pick<Kv, 'get'>, KvFailure> {
    return tryMethods<Pick<Kv, 'get'>, KvFailure>(this, recognize)
  }

  get tryAsync(): TriedMethodsAsync<Pick<Kv, 'getLater'>, KvFailure> {
    return tryMethodsAsync<Pick<Kv, 'getLater'>, KvFailure>(this, recognize)
  }
}

// ---- Scenarios -------------------------------------------------------------

test('an unset key is an answer, not a failure', () => {
  const { runner } = fakeRunner({ 'get a': { stdout: '1\n' }, 'get b': { exitCode: 1 } })
  const kv = new Kv(runner)
  expect(kv.get('a')).toBe('1')
  expect(kv.get('b')).toBeNull()
})

test('a failure throws in the plain method and is a value through try', async () => {
  const { runner } = fakeRunner({ 'get a': { exitCode: 2, stderr: 'fatal: no store here' } })
  const kv = new Kv(runner)
  expect(() => kv.get('a')).toThrow('There is no kv store here.')
  const r = kv.try.get('a')
  expect(r.ok ? null : r.error.kind).toBe('no-store')
  const later = await kv.tryAsync.getLater('a')
  expect(later.ok).toBe(false)
})

test('a run that never started fails even where exit 1 is an answer', () => {
  const { runner } = fakeRunner({ 'get a': fakeNeverExited('spawn', { error: 'spawn kv ENOENT' }) })
  const r = new Kv(runner).try.get('a')
  expect(r.ok ? null : r.error).toMatchObject({
    kind: 'not-installed',
    message: '`kv` is not installed or not on PATH.',
    hint: 'Install kv from its website.',
  })
})

test('output cut short is a failure, even at exit 0', () => {
  const { runner } = fakeRunner({ 'get a': { stdout: 'par', outputIncomplete: true } })
  expect(new Kv(runner).try.get('a').ok).toBe(false)
})

test('a key that reads as an option throws before anything runs; try lets it through', () => {
  const { runner, calls } = fakeRunner({})
  expect(() => new Kv(runner).try.get('--all')).toThrow(TypeError)
  expect(calls).toEqual([])
})

test('methodFacade wraps every method of any object', () => {
  const seen: string[] = []
  const counted = methodFacade({ ping: () => 'pong' }, (call, name) => {
    seen.push(name)
    return call()
  }) as { ping(): string }
  expect(counted.ping()).toBe('pong')
  expect(seen).toEqual(['ping'])
  expect(isCommandFailed(new Error('x'))).toBe(false)
})
