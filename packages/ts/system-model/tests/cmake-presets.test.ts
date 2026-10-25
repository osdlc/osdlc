import { afterAll, describe, expect, test } from 'vitest'

import { tasks, type Task } from '../src/model.ts'
import type { ToolDef } from '../src/tool.ts'
import { detectAndCollect, fakeWhich, fixtureRoot, removeRoot } from './support.ts'
import { cmakePresets } from '../src/plugins/runners/index.ts'

const TOOLS = [cmakePresets]

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

/** Fixture roots are not repositories, so discovery is pinned to the walk. */
async function run(
  files: Record<string, string>,
  tools: readonly ToolDef[] = TOOLS,
  which: Record<string, string> = {},
) {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return detectAndCollect(dir, { discovery: 'walk', tools, which: fakeWhich(which) })
}

const PRESETS = JSON.stringify({
  version: 6,
  include: ['cmake/ci.json'],
  configurePresets: [
    { name: 'base', hidden: true, generator: 'Ninja' },
    { name: 'dev', inherits: 'base', displayName: 'Developer build' },
  ],
  buildPresets: [
    { name: 'dev', configurePreset: 'dev' },
    { name: 'child', inherits: 'dev' },
    { name: 'from-hidden', configurePreset: 'base' },
  ],
  testPresets: [{ name: 'dev', configurePreset: 'dev', description: 'Unit tests' }],
})

const CI = JSON.stringify({ version: 6, configurePresets: [{ name: 'ci' }] })

const key = (t: Task) => `${t.path[2]}:${t.path[3]}`

describe('cmake-presets runner', () => {
  test('lists configure, build and test presets, without hidden ones', async () => {
    const { catalog } = await run({ 'CMakePresets.json': PRESETS, 'cmake/ci.json': CI })
    const found = tasks(catalog)
    expect(found.map(key)).toEqual([
      'configure:ci',
      'configure:dev',
      'build:dev',
      'build:child',
      'build:from-hidden',
      'test:dev',
    ])
    const byKey = (k: string) => found.find((t) => key(t) === k)!
    expect(byKey('configure:dev')).toMatchObject({
      argv: ['cmake', '--preset', 'dev'],
      cwd: '.',
      doc: 'Developer build',
      source: 'CMakePresets.json',
    })
    expect(byKey('configure:ci').source).toBe('cmake/ci.json')
    expect(byKey('build:dev').argv).toEqual(['cmake', '--build', '--preset', 'dev'])
    expect(byKey('test:dev')).toMatchObject({
      argv: ['ctest', '--preset', 'dev'],
      doc: 'Unit tests',
    })
  })

  test('a build or test preset depends on its configure preset, inherited too', async () => {
    const { catalog } = await run({ 'CMakePresets.json': PRESETS, 'cmake/ci.json': CI })
    const found = tasks(catalog)
    const byKey = (k: string) => found.find((t) => key(t) === k)!
    const dev = 'cmake-presets:CMakePresets.json:configure:dev'
    expect(byKey('build:dev').dependsOn).toEqual([dev])
    expect(byKey('build:child').dependsOn).toEqual([dev])
    expect(byKey('test:dev').dependsOn).toEqual([dev])
    expect(byKey('build:from-hidden').dependsOnUnresolved).toEqual(['base'])
  })

  test('a nested project: -S for configure, its directory for build and test', async () => {
    const { project, catalog } = await run({
      'native/CMakePresets.json': PRESETS,
      'native/cmake/ci.json': CI,
    })
    const found = tasks(catalog)
    const byKey = (k: string) => found.find((t) => key(t) === k)!
    expect(byKey('configure:dev')).toMatchObject({
      argv: ['cmake', '-S', 'native', '--preset', 'dev'],
      cwd: '.',
    })
    expect(byKey('build:dev').cwd).toBe('native')
    expect(project.runners.invoke(byKey('build:dev'), ['--target', 'app'])).toEqual([
      'cmake',
      '--build',
      '--preset',
      'dev',
      '--target',
      'app',
    ])
  })

  test('CMakeUserPresets.json includes CMakePresets.json and adds its own', async () => {
    const { catalog } = await run({
      'CMakePresets.json': JSON.stringify({ version: 3, configurePresets: [{ name: 'dev' }] }),
      'CMakeUserPresets.json': JSON.stringify({
        version: 3,
        configurePresets: [{ name: 'mine', inherits: 'dev' }],
        buildPresets: [{ name: 'mine', configurePreset: 'mine' }],
      }),
    })
    expect(tasks(catalog).map((t) => [key(t), t.source])).toEqual([
      ['configure:dev', 'CMakePresets.json'],
      ['configure:mine', 'CMakeUserPresets.json'],
      ['build:mine', 'CMakeUserPresets.json'],
    ])
  })

  test('broken, missing, escaping and duplicate presets are diagnostics', async () => {
    const { catalog } = await run({
      'CMakePresets.json': JSON.stringify({
        version: 6,
        include: ['missing.json', '../../outside.json', 'dup.json'],
        configurePresets: [{ name: 'a' }],
      }),
      'dup.json': JSON.stringify({ configurePresets: [{ name: 'a' }] }),
      'b/CMakePresets.json': '{',
    })
    const messages = catalog.reports[0]!.diagnostics.map((d) => [d.source, d.message])
    expect(messages).toEqual([
      ['missing.json', 'an included presets file does not exist'],
      [
        'CMakePresets.json',
        'include ../../outside.json is outside the repository and was not read',
      ],
      ['CMakePresets.json', 'configure preset a is declared twice; the first was kept'],
      ['b/CMakePresets.json', 'unparseable CMake presets file'],
    ])
    expect(tasks(catalog).map(key)).toEqual(['configure:a'])
  })

  test('absent without a presets file', async () => {
    const { catalog } = await run({ 'CMakeLists.txt': 'project(x)\n' })
    expect(catalog.reports).toEqual([])
  })
})
