/**
 * The tool-agnostic parts of a typed client over one program: `runFailed`
 * (the result gate), `classifyFailed` (the classifier's start), the
 * `methodFacade` proxy with `tryMethods` and `tryMethodsAsync` on it, and
 * the `notAnOption` guard.
 */

import { describe, expect, test } from 'vitest'

import { FailureError } from '@osdlc/result'

import {
  classifyFailed,
  CommandFailed,
  isCommandFailed,
  methodFacade,
  notAnOption,
  runFailed,
  tryMethods,
  tryMethodsAsync,
  type CommandFailure,
  type CommandResult,
} from '../src/index.ts'

const run = (fields: Partial<CommandResult>): CommandResult => ({
  exitCode: 0,
  stdout: '',
  stderr: '',
  ...fields,
})

describe('runFailed', () => {
  test('exit 0 is not a failure; any other exit is, by default', () => {
    expect(runFailed(run({}))).toBe(false)
    expect(runFailed(run({ exitCode: 2 }))).toBe(true)
  })

  test('isAnswer accepts a non-zero exit as an answer', () => {
    const absent = (r: CommandResult) => r.exitCode === 1
    expect(runFailed(run({ exitCode: 1 }), absent)).toBe(false)
    expect(runFailed(run({ exitCode: 128 }), absent)).toBe(true)
  })

  test('a run that never exited fails whatever isAnswer says, and isAnswer is not asked', () => {
    let asked = false
    const r = run({ exitCode: 1, neverExited: true, reason: 'spawn' })
    expect(
      runFailed(r, () => {
        asked = true
        return true
      }),
    ).toBe(true)
    expect(asked).toBe(false)
  })

  test('output cut short fails, at exit 0 and at an accepted exit alike', () => {
    expect(runFailed(run({ outputIncomplete: true }))).toBe(true)
    expect(runFailed(run({ exitCode: 1, outputIncomplete: true }), () => true)).toBe(true)
  })
})

describe('classifyFailed', () => {
  const missing = run({ exitCode: 1, neverExited: true, reason: 'spawn', error: 'spawn ENOENT' })

  test('a runner that names no binary gets the given one in its messages', () => {
    const failed = new CommandFailed(['status'], missing)
    expect(failed.failure.message).toBe('The command is not installed or not on PATH.')
    const f = classifyFailed(failed, { binary: 'git' })
    expect(f.kind).toBe('not-installed')
    expect(f.message).toBe('`git` is not installed or not on PATH.')
    expect(f.cause).toBe(failed)
  })

  test('a runner that names its binary keeps its own failure', () => {
    const failed = new CommandFailed(['status'], missing, 'my-git')
    const f = classifyFailed(failed, { binary: 'git' })
    expect(f.message).toBe('`my-git` is not installed or not on PATH.')
  })

  test('installHint is the hint of a not-installed failure only', () => {
    const hint = 'Install git.'
    const options = { binary: 'git', installHint: hint }
    expect(classifyFailed(new CommandFailed(['x'], missing), options).hint).toBe(hint)
    const exit = new CommandFailed(['x'], run({ exitCode: 2, stderr: 'boom' }))
    const f = classifyFailed(exit, options)
    expect(f.kind).toBe('exit')
    expect(f.message).toBe('boom')
    expect(f.hint).toBeUndefined()
  })

  test('output cut short at exit 0 is still a failure', () => {
    const failed = new CommandFailed(['x'], run({ outputIncomplete: true, error: 'cut' }))
    expect(classifyFailed(failed, { binary: 'git' }).kind).toBe('exit')
  })
})

class Client {
  #secret = 7
  calls = 0
  get label(): string {
    return 'client'
  }
  value(): number {
    this.calls++
    return this.#secret
  }
  fail(): number {
    throw new CommandFailed(['fail'], run({ exitCode: 3, stderr: 'no' }), 'tool')
  }
  bug(): number {
    throw new TypeError('bug')
  }
  async later(): Promise<number> {
    return this.#secret
  }
  async failLater(): Promise<number> {
    return this.fail()
  }
  async bugLater(): Promise<number> {
    return this.bug()
  }
}

const recognize = (error: unknown): CommandFailure | null =>
  isCommandFailed(error) ? error.failure : null

describe('methodFacade', () => {
  test('wraps each method, by name, and runs it on the client', () => {
    const client = new Client()
    const names: string[] = []
    const proxy = methodFacade(client, (call, name) => {
      names.push(name)
      return call()
    }) as Client
    expect(proxy.value()).toBe(7)
    expect(client.calls).toBe(1)
    expect(proxy.label).toBe('client')
    expect(names).toEqual(['value'])
  })

  test('wrap may skip the call', () => {
    const client = new Client()
    const proxy = methodFacade(client, () => 'skipped') as { value(): unknown }
    expect(proxy.value()).toBe('skipped')
    expect(client.calls).toBe(0)
  })
})

describe('tryMethods', () => {
  const tried = tryMethods(new Client(), recognize)

  test('a return is ok', () => {
    expect(tried.value()).toEqual({ ok: true, value: 7 })
  })

  test('a recognized throw is err with the failure', () => {
    const r = tried.fail()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toBe('no')
  })

  test('anything else throws again', () => {
    expect(() => tried.bug()).toThrow(TypeError)
  })

  test('a FailureError is recognized when recognize says so', () => {
    const client = {
      boom(): number {
        throw new FailureError({ kind: 'x', message: 'm' })
      },
    }
    const r = tryMethods(client, (e) => (e instanceof FailureError ? e.failure : null)).boom()
    expect(r.ok).toBe(false)
  })
})

describe('tryMethodsAsync', () => {
  const tried = tryMethodsAsync(new Client(), recognize)

  test('a resolution is ok, a recognized rejection is err', async () => {
    expect(await tried.later()).toEqual({ ok: true, value: 7 })
    const r = await tried.failLater()
    expect(r.ok).toBe(false)
  })

  test('any other rejection rejects again', async () => {
    await expect(tried.bugLater()).rejects.toThrow(TypeError)
  })
})

describe('notAnOption', () => {
  const reject = (v: string) => new RangeError(`bad ${v}`)

  test('returns a value that does not start with "-"', () => {
    expect(notAnOption('main', reject)).toBe('main')
    expect(notAnOption('a-b', reject)).toBe('a-b')
    expect(notAnOption('', reject)).toBe('')
  })

  test('throws the error reject builds for one that does', () => {
    expect(() => notAnOption('--upload-pack=x', reject)).toThrow('bad --upload-pack=x')
    expect(() => notAnOption('-', reject)).toThrow(RangeError)
  })
})
