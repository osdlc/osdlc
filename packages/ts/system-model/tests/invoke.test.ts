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
      args: ['web', '--env', 'prod', '-f', 'input=x'],
      positional: ['web'],
      assign: ['LEVEL=2', 'MODE=fast'],
      env: { TOKEN: 's3cret' },
    })
  })

  test('a switch gives its flag for true and nothing for false', () => {
    const params = [p('verbose', { binding: { kind: 'switch', flag: '-v' } })]
    expect(bindParams(params, { verbose: 'true' }).args).toEqual(['-v'])
    expect(bindParams(params, { verbose: 'false' }).args).toEqual([])
    expect(() => bindParams(params, { verbose: 'yes' })).toThrow(
      'parameter verbose is a switch: true or false, not yes',
    )
  })

  test('a parameter named after an Object.prototype member reads no inherited value', () => {
    const params = [p('constructor'), p('toString'), p('__proto__')]
    expect(bindParams(params, {})).toEqual({ args: [], positional: [], assign: [], env: {} })
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

  test('positional values go through the runner rule, assign ones before its `--`', () => {
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

  test('flag values go after the runner `--`, with the positional ones', () => {
    const npm = task(
      'node-scripts',
      ['npm', 'run', 'build'],
      [p('target'), p('env', { binding: { kind: 'flag', flag: '--env' } })],
    )
    expect(project.runners.invoke(npm, { target: 'a', env: 'prod' })).toEqual([
      'npm',
      'run',
      'build',
      '--',
      'a',
      '--env',
      'prod',
    ])
    const cargo = task(
      'cargo',
      ['cargo', 'run', '--bin', 'x'],
      [p('env', { binding: { kind: 'flag', flag: '--env' } })],
    )
    expect(project.runners.invoke(cargo, { env: 'prod' })).toEqual([
      'cargo',
      'run',
      '--bin',
      'x',
      '--',
      '--env',
      'prod',
    ])
  })

  test('a named positional value starting with - is refused where the runner reads options', () => {
    const make = task('make', ['make', 'deploy'], [p('target')])
    expect(() => project.runners.invoke(make, { target: '--eval=x' })).toThrow(
      'make: the value --eval=x starts with "-", and the runner would read it as an option',
    )
    // After a `--`, or for just, which ends its options at the recipe, it is safe.
    const npm = task('node-scripts', ['npm', 'run', 'build'], [p('target')])
    expect(project.runners.invoke(npm, { target: '-x' })).toEqual([
      'npm',
      'run',
      'build',
      '--',
      '-x',
    ])
    const just = task('just', ['just', 'deploy'], [p('target')])
    expect(project.runners.invoke(just, { target: '-x' })).toEqual(['just', 'deploy', '-x'])
    // A list is the caller's own argv and passes as given.
    expect(project.runners.invoke(make, ['-n'])).toEqual(['make', 'deploy', '-n'])
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
