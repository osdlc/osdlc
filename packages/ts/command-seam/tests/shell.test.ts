import { describe, expect, test } from 'bun:test'

import { asAsync, shellQuote } from '../index.ts'
import { runShell, runShellAsync, shellRunner, shellRunnerAsync } from '../shell.ts'
import type { CommandRunner } from '../sync.ts'

const CWD = process.cwd()

describe('runShell', () => {
  test('interprets the verb as shell', () => {
    const r = runShell('echo a && echo b >&2; exit 3', { cwd: CWD })
    expect(r.exitCode).toBe(3)
    expect(r.stdout).toBe('a\n')
    expect(r.stderr).toBe('b\n')
  })

  test('forwards cwd, env and input', () => {
    const r = runShell('printf "%s|%s|" "$PWD" "$X"; cat', {
      cwd: '/',
      env: { X: 'v' },
      input: 'in',
    })
    expect(r.stdout).toBe('/|v|in')
  })

  test('args become $1.. and scriptName becomes $0', () => {
    const r = runShell('printf "%s|%s|%s" "$0" "$1" "$2"', {
      cwd: CWD,
      scriptName: 'hook',
      args: ['a b', "it's"],
    })
    expect(r.stdout).toBe("hook|a b|it's")
  })

  test('args alone leave $0 as sh', () => {
    expect(runShell('printf "%s|%s" "$0" "$1"', { cwd: CWD, args: ['x'] }).stdout).toBe('sh|x')
  })

  // Without `--`, sh reads a verb that starts with `-` or `+` as an option.
  // One test per verb and runner, each run capped below the test timeout, so a
  // run that does not finish fails under its own name with its result.
  const runners = {
    sync: async (verb: string) => runShell(verb, { cwd: CWD, timeoutMs: 4000 }),
    async: (verb: string) => runShellAsync(verb, { cwd: CWD, timeoutMs: 4000 }),
  }
  for (const verb of ['-x', '+x']) {
    for (const [name, run] of Object.entries(runners)) {
      test(`a verb that starts with ${verb[0]} runs as a command, not an option (${name})`, async () => {
        const r = await run(verb)
        expect(r).toMatchObject({ exitCode: 127 })
        expect(r.stderr).toContain(`${verb}: `)
        expect(r.stderr).not.toContain('option')
      })
    }
  }

  test('a shellQuote-d value is data, not syntax', () => {
    const word = "x; echo pwned '$(id)'"
    expect(runShell(`printf %s ${shellQuote(word)}`, { cwd: CWD }).stdout).toBe(word)
  })
})

describe('shellRunner', () => {
  const recording = (): { sh: CommandRunner; calls: string[][] } => {
    const calls: string[][] = []
    return {
      calls,
      sh: {
        run: (argv) => {
          calls.push(argv)
          return { exitCode: 0, stdout: '', stderr: '' }
        },
      },
    }
  }

  test('hands sh exactly -c -- <verb> when there are no positionals', () => {
    const { sh, calls } = recording()
    shellRunner(sh).run('ls -la', { cwd: CWD })
    expect(calls).toEqual([['-c', '--', 'ls -la']])
  })

  test('hands sh -c -- <verb> <scriptName> <args...> when given', () => {
    const { sh, calls } = recording()
    shellRunner(sh).run('v', { cwd: CWD, scriptName: 'h', args: ['a'] })
    expect(calls).toEqual([['-c', '--', 'v', 'h', 'a']])
  })

  test('hands sh -c -- <verb> <scriptName> when scriptName is given with no args', () => {
    const { sh, calls } = recording()
    shellRunner(sh).run('v', { cwd: CWD, scriptName: 'h', args: [] })
    expect(calls).toEqual([['-c', '--', 'v', 'h']])
  })
})

describe('async runner', () => {
  test('runShellAsync matches the sync runner', async () => {
    const r = await runShellAsync('echo hi; exit 2', { cwd: CWD })
    expect(r.exitCode).toBe(2)
    expect(r.stdout).toBe('hi\n')
  })

  test('shellRunnerAsync runs through an injected runner', async () => {
    const calls: string[][] = []
    const sh = asAsync({
      run: (argv) => {
        calls.push(argv)
        return { exitCode: 0, stdout: 'ok', stderr: '' }
      },
    })
    const r = await shellRunnerAsync(sh).run('v', { cwd: CWD, scriptName: 'h', args: ['a'] })
    expect(r.stdout).toBe('ok')
    expect(calls).toEqual([['-c', '--', 'v', 'h', 'a']])
  })
})
