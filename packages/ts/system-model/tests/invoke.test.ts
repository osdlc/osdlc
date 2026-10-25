/**
 * `runners.invoke` and `runners.invocation`: binding arguments by each
 * parameter's `binding`, and the rule that the binary never changes.
 */

import { describe, expect, test } from 'vitest'

import { builtins } from '../src/builtins.ts'
import type { Param, Task } from '../src/model.ts'
import { bindParams } from '../src/params.ts'
import { createProject } from '../src/project.ts'
import type { ToolDef } from '../src/tool.ts'

function task(runner: string, argv: string[], parameters: Param[] = []): Task {
  return {
    id: `${runner}:x`,
    runner,
    path: [runner, 'x'],
    argv,
    cwd: '.',
    display: argv.join(' '),
    parameters,
    source: 'x',
    origin: 'declared',
    tags: [],
    persistent: { value: false, declared: false },
    executes: 'local',
  }
}

const p = (name: string, extra: Partial<Param> = {}): Param => ({
  name,
  required: false,
  variadic: false,
  ...extra,
})

describe('bindParams', () => {
  test('sorts values by binding, in parameter order', () => {
    const params = [
      p('target', { required: true }),
      p('env', { binding: { kind: 'flag', flag: '--env' } }),
      p('input', { binding: { kind: 'flag', flag: '-f', key: 'input' } }),
      p('LEVEL', { binding: { kind: 'assign' } }),
      p('mode', { binding: { kind: 'assign', name: 'MODE' } }),
      p('token', { binding: { kind: 'env', name: 'TOKEN' } }),
    ]
    expect(
      bindParams(params, {
        target: 'web',
        env: 'prod',
        input: 'x',
        LEVEL: '2',
        mode: 'fast',
        token: 's3cret',
      }),
    ).toEqual({
      positional: ['web'],
      named: ['--env', 'prod', '-f', 'input=x', 'LEVEL=2', 'MODE=fast'],
      env: { TOKEN: 's3cret' },
    })
  })

  test('a missing value takes the default, and a variadic takes a list', () => {
    const params = [p('env', { default: 'dev' }), p('files', { variadic: true })]
    expect(bindParams(params, { files: ['a', 'b'] }).positional).toEqual(['dev', 'a', 'b'])
  })

  test('refuses values that do not fit', () => {
    const params = [p('env', { required: true, choices: ['dev', 'prod'] }), p('one'), p('two')]
    expect(() => bindParams(params, {})).toThrow('parameter env needs a value')
    expect(() => bindParams(params, { env: 'qa' })).toThrow(
      'parameter env takes one of dev, prod, not qa',
    )
    expect(() => bindParams(params, { env: 'dev', nope: 'x' })).toThrow('unknown parameter: nope')
    expect(() => bindParams(params, { env: ['dev', 'prod'] })).toThrow(
      'parameter env takes one value',
    )
    expect(() => bindParams(params, { env: 'dev', two: 'x' })).toThrow(
      'parameter two has a value but the earlier one has none',
    )
  })
})

describe('invoke', () => {
  const project = createProject({ tools: builtins })

  test('positional values go through the runner rule, named ones before its `--`', () => {
    const t = task(
      'go-task',
      ['task', 'deploy'],
      [p('target'), p('ENV', { binding: { kind: 'assign' } })],
    )
    expect(project.runners.invoke(t, { target: 'web', ENV: 'prod' })).toEqual([
      'task',
      'deploy',
      'ENV=prod',
      '--',
      'web',
    ])
    expect(project.runners.invoke(t, { ENV: 'prod' })).toEqual(['task', 'deploy', 'ENV=prod'])
  })

  test('a list of strings is still positional arguments', () => {
    const t = task('just', ['just', 'deploy'], [p('env')])
    expect(project.runners.invoke(t, ['prod'])).toEqual(['just', 'deploy', 'prod'])
    expect(project.runners.invoke(t, [])).toEqual(['just', 'deploy'])
  })

  test('named values go after a rule that rewrites the last word', () => {
    const t = task(
      'rake',
      ['rake', 'release'],
      [p('lib'), p('VERBOSE', { binding: { kind: 'assign' } })],
    )
    expect(project.runners.invoke(t, { lib: 'a', VERBOSE: '1' })).toEqual([
      'rake',
      'release[a]',
      'VERBOSE=1',
    ])
  })

  test('an env parameter needs invocation, which returns the environment', () => {
    const t = task(
      'make',
      ['make', 'deploy'],
      [p('token', { binding: { kind: 'env', name: 'TOKEN' } })],
    )
    expect(() => project.runners.invoke(t, { token: 'x' })).toThrow(
      'TOKEN must be set in the environment; use runners.invocation',
    )
    expect(project.runners.invocation(t, { token: 'x' })).toEqual({
      argv: ['make', 'deploy'],
      env: { TOKEN: 'x' },
    })
  })

  test('refuses a runner rule that changes the binary', () => {
    const sneaky: ToolDef = {
      id: 'sneaky',
      roles: {
        runner: {
          kind: 'parse',
          async collect() {
            return { status: 'absent', tasks: [], diagnostics: [] }
          },
          invoke: (_task, args) => ['sh', '-c', args.join(' ')],
        },
      },
    }
    const own = createProject({ tools: [sneaky] })
    const t = task('sneaky', ['sneaky', 'run'])
    expect(() => own.runners.invoke(t, ['x'])).toThrow(
      'sneaky: invoke changed the binary from sneaky to sh',
    )
    // No arguments, no rule: the task's own argv.
    expect(own.runners.invoke(t, [])).toEqual(['sneaky', 'run'])
  })

  test('rake escapes the characters its argument list splits on', () => {
    const t = task('rake', ['rake', 'release'])
    expect(project.runners.invoke(t, ['a,b', 'c]d', 'e\\f'])).toEqual([
      'rake',
      'release[a\\,b,c\\]d,e\\\\f]',
    ])
  })
})
