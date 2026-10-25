/**
 * `Task.dependsOn` and `Task.dependsOnUnresolved`, for each runner that reads
 * dependencies: turbo, moon, go-task, just and rake.
 */

import { afterAll, describe, expect, test } from 'vitest'

import { tasks, type Catalog, type Task } from '../src/model.ts'
import { scanRecipes } from '../src/plugins/runners/just.ts'
import { readTaskfile } from '../src/plugins/runners/go-task.ts'
import { scanTasks } from '../src/plugins/ruby/rake.ts'
import {
  collect,
  fakeRunners,
  fakeWhich,
  fixtureRoot,
  moonProjectsJson,
  moonTasksJson,
  removeRoot,
} from './support.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function root(files: Record<string, string>): Promise<string> {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return dir
}

/** Each task's last path segment, with its dependency fields. */
function deps(catalog: Catalog): Record<string, Pick<Task, 'dependsOn' | 'dependsOnUnresolved'>> {
  return Object.fromEntries(
    tasks(catalog).map((t) => [
      t.path.at(-1),
      {
        ...(t.dependsOn ? { dependsOn: t.dependsOn } : {}),
        ...(t.dependsOnUnresolved ? { dependsOnUnresolved: t.dependsOnUnresolved } : {}),
      },
    ]),
  )
}

test('turbo: same-file keys resolve, `^` and missing names do not', async () => {
  const dir = await root({
    'turbo.json': JSON.stringify({
      tasks: {
        lint: {},
        build: { dependsOn: ['^build', 'lint', 'codegen'] },
        'web#lint': {},
        'web#build': { dependsOn: ['lint'] },
      },
    }),
  })
  expect(deps(await collect(dir, { discovery: 'walk', only: ['turbo'] }))).toEqual({
    lint: {},
    build: {
      dependsOn: ['turbo:turbo.json:lint'],
      dependsOnUnresolved: ['^build', 'codegen'],
    },
    'web#lint': {},
    // A scoped key looks in its own package first.
    'web#build': { dependsOn: ['turbo:turbo.json:web#lint'] },
  })
})

test('moon: targets resolve across projects, `~:` is the same project', async () => {
  const dir = await root({ '.moon/workspace.yml': '' })
  const fake = fakeRunners([
    {
      binary: 'moon',
      argv: ['query', 'tasks'],
      stdout: moonTasksJson('web', {
        build: { id: 'build', target: 'web:build', deps: [{ target: 'web:codegen' }] },
        codegen: { id: 'codegen', target: 'web:codegen' },
        test: { id: 'test', target: 'web:test', deps: ['~:build', '^:build', 'api:missing'] },
      }),
    },
    { binary: 'moon', argv: ['query', 'projects'], stdout: moonProjectsJson([]) },
  ])
  const catalog = await collect(dir, {
    discovery: 'walk',
    only: ['moon'],
    allowExec: true,
    makeRunner: fake.make,
    which: fakeWhich({ moon: '/bin/moon' }),
  })
  expect(deps(catalog)).toEqual({
    build: { dependsOn: ['moon:.:web:codegen'] },
    codegen: {},
    test: { dependsOn: ['moon:.:web:build'], dependsOnUnresolved: ['^:build', 'api:missing'] },
  })
})

describe('go-task', () => {
  test('reads flow and block `deps:`', () => {
    const { tasks: read } = readTaskfile(
      [
        'version: "3"',
        'tasks:',
        '  build:',
        '    deps: [lint, "gen", {task: fmt}]',
        '  test:',
        '    deps:',
        '      - build',
        '      - task: docs:build',
        '        vars: { X: 1 }',
        '    cmds:',
        '      - go test',
        '',
      ].join('\n'),
    )
    expect(read.get('build')?.deps).toEqual(['lint', 'gen', 'fmt'])
    expect(read.get('test')?.deps).toEqual(['build', 'docs:build'])
  })

  test('reads block items at the same indent as `deps:`, and mappings with nested braces', () => {
    const { tasks: read } = readTaskfile(
      [
        'tasks:',
        '  build:',
        '    deps:',
        '    - lint',
        '    - {task: gen, vars: {A: 1}}',
        '    cmds:',
        '    - go build',
        '  test:',
        '    deps: [lint, {task: test-unit, vars: {X: 1, Y: "a,b"}}, "c"] # note',
        '',
      ].join('\n'),
    )
    expect(read.get('build')?.deps).toEqual(['lint', 'gen'])
    expect(read.get('test')?.deps).toEqual(['lint', 'test-unit', 'c'])
  })

  test('resolves within the Taskfile', async () => {
    const dir = await root({
      'Taskfile.yml': 'tasks:\n  lint: {}\n  build:\n    deps: [lint, docs:build]\n',
    })
    expect(deps(await collect(dir, { discovery: 'walk', only: ['go-task'] }))).toEqual({
      lint: {},
      build: {
        dependsOn: ['go-task:Taskfile.yml:lint'],
        dependsOnUnresolved: ['docs:build'],
      },
    })
  })
})

describe('just', () => {
  test('scans dependencies before `&&`', () => {
    expect(scanRecipes('test: build (lint "x") && notify # note\nbuild:\nlint arg:\n')).toEqual([
      { name: 'test', deps: ['build', 'lint'] },
      { name: 'build', deps: [] },
      { name: 'lint', deps: [] },
    ])
  })

  test('a colon inside a quoted default is not the header colon', () => {
    expect(scanRecipes('deploy env="a:b" port=\'1:2\': build\nbuild:\n')).toEqual([
      { name: 'deploy', deps: ['build'] },
      { name: 'build', deps: [] },
    ])
  })

  test('resolves scanned and dumped dependencies, leaving out private recipes', async () => {
    const dir = await root({ justfile: 'test: build _setup\nbuild:\n_setup:\n' })
    expect(deps(await collect(dir, { discovery: 'walk', only: ['just'] }))).toEqual({
      test: { dependsOn: ['just:justfile:build', 'just:justfile:_setup'] },
      build: {},
      _setup: {},
    })

    const fake = fakeRunners([
      {
        binary: 'just',
        argv: ['--justfile'],
        stdout: JSON.stringify({
          recipes: {
            test: {
              name: 'test',
              priors: 2,
              dependencies: [{ recipe: 'build' }, { recipe: '_setup' }, { recipe: 'notify' }],
            },
            build: { name: 'build' },
            _setup: { name: '_setup', private: true },
            notify: { name: 'notify' },
          },
        }),
      },
    ])
    const dumped = await collect(dir, {
      discovery: 'walk',
      only: ['just'],
      allowExec: true,
      makeRunner: fake.make,
      which: fakeWhich({ just: '/bin/just' }),
    })
    expect(deps(dumped)).toEqual({
      test: { dependsOn: ['just:justfile:build'], dependsOnUnresolved: ['_setup'] },
      build: {},
      notify: {},
    })
  })
})

describe('rake', () => {
  test('scans every prerequisite form', () => {
    const scanned = scanTasks(
      [
        'task default: :test',
        'task :test => [:build, "lint"] do',
        'end',
        "task 'build', [:mode] => 'gen'",
        'task ci: %w[lint test]',
        'namespace :db do',
        '  task :seed => :migrate',
        '  task :migrate',
        'end',
      ].join('\n'),
    )
    expect(scanned.map((t) => [t.path, t.deps])).toEqual([
      ['default', ['test']],
      ['test', ['build', 'lint']],
      ['build', ['gen']],
      ['ci', ['lint', 'test']],
      ['db:seed', ['migrate']],
      ['db:migrate', []],
    ])
  })

  test('resolves in the namespace first, on the scan and the listing path', async () => {
    const dir = await root({
      Rakefile:
        'task :migrate\nnamespace :db do\n  task :migrate\n  task :seed => [:migrate, :x]\nend\n',
    })
    const scanned = deps(await collect(dir, { discovery: 'walk', only: ['rake'] }))
    expect(scanned['db:seed']).toEqual({
      dependsOn: ['rake:Rakefile:db:migrate'],
      dependsOnUnresolved: ['x'],
    })

    const fake = fakeRunners([
      {
        binary: 'rake',
        argv: ['-AT'],
        stdout: 'rake migrate     # m\nrake db:migrate  # m\nrake db:seed     # s\n',
      },
    ])
    const listed = await collect(dir, {
      discovery: 'walk',
      only: ['rake'],
      allowExec: true,
      makeRunner: fake.make,
      which: fakeWhich({ rake: '/bin/rake' }),
    })
    expect(deps(listed)['db:seed']).toEqual(scanned['db:seed'])
  })
})
