import { afterAll, describe, expect, test } from 'vitest'

import { BUILTIN_TOOL_IDS, builtins } from '../src/builtins.ts'
import { tasks, type Task } from '../src/model.ts'
import { type Canned, collect, fakeRunners, fakeWhich, fixtureRoot, removeRoot } from './support.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function root(files: Record<string, string>): Promise<string> {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return dir
}

/**
 * Fixture roots are not repositories, so discovery is pinned to the walk.
 * `which` finds nothing unless a test opts in, so results do not depend on the
 * machine running them.
 */
function opts(canned: Canned[] = [], extra: Record<string, unknown> = {}) {
  const { make, calls } = fakeRunners(canned)
  return {
    options: { discovery: 'walk' as const, makeRunner: make, which: fakeWhich({}), ...extra },
    calls,
  }
}

describe('every built-in tool', () => {
  test('has an https homepage and a one-sentence description', () => {
    for (const tool of builtins) {
      expect(tool.homepage, tool.id).toMatch(/^https:\/\/[^\s]+$/)
      expect(tool.description, tool.id).toMatch(/^[A-Z].*\.$/)
    }
  })

  test('carries its brand on the tool, not on the runner role', () => {
    for (const tool of builtins) expect(tool.roles.runner?.brand, tool.id).toBeUndefined()
    const branded = builtins.filter((t) => t.brand !== undefined).map((t) => t.id)
    expect(branded).toContain('just')
    expect(branded).toContain('cargo')
  })

  test('a language-agnostic tool names no ecosystem', () => {
    const agnostic = ['moon', 'just', 'make', 'turbo', 'go-task', 'docker-compose', 'mise']
    for (const id of agnostic) {
      expect(builtins.find((t) => t.id === id)?.ecosystem, id).toBeUndefined()
    }
  })
})

describe('every built-in runner', () => {
  const runnerTools = builtins.filter((t) => t.roles.runner !== undefined)

  // node-scripts and python resolve their binary per directory (npm vs pnpm,
  // uv vs poetry), so a single static name would misrepresent them.
  const ABSTAINERS = new Set(['node-scripts', 'python'])

  test('built-in ids line up with the roster', () => {
    expect(builtins.map((t) => t.id)).toEqual([...BUILTIN_TOOL_IDS])
  })

  test('declares a `binary`, or is one of the documented abstainers', () => {
    for (const tool of runnerTools) {
      if (ABSTAINERS.has(tool.id)) {
        expect(tool.binary).toBeUndefined()
      } else {
        expect(typeof tool.binary).toBe('string')
        expect(tool.binary?.length).toBeGreaterThan(0)
      }
    }
  })

  /**
   * What each built-in intends its tasks' `executes` to be, declared here
   * rather than read off the emitted tasks. The map must cover the runner
   * roster exactly, so a new runner cannot land without stating what its
   * tasks do when run.
   */
  const INTENDED_EXECUTES: Record<string, Task['executes']> = {
    moon: 'local',
    mise: 'local',
    just: 'local',
    'node-scripts': 'local',
    make: 'local',
    cargo: 'local',
    sbt: 'local',
    python: 'local',
    composer: 'local',
    'deno-tasks': 'local',
    turbo: 'local',
    maven: 'local',
    swiftpm: 'local',
    gradle: 'local',
    'go-task': 'local',
    rake: 'local',
    'docker-compose': 'container',
    'github-actions': 'remote',
  }

  test('has a declared `executes` intent', () => {
    expect(Object.keys(INTENDED_EXECUTES).sort()).toEqual(runnerTools.map((t) => t.id).sort())
  })

  test('emits only the `executes` value its runner intended', async () => {
    // A fixture rich enough to give each built-in something to report, run
    // with `allowExec` so the exec runners run too.
    const dir = await root({
      '.moon/workspace.yml': 'projects: []\n',
      'mise.toml': "[tasks.build]\nrun = 'x'\n",
      justfile: 'build:\n    echo\n',
      'package.json': JSON.stringify({ name: 'demo', scripts: { build: 'tsc' } }),
      Makefile: 'all:\n\techo\n',
      'Cargo.toml': '[package]\nname = "demo"\n',
      'build.sbt': 'name := "demo"\n',
      'pyproject.toml': '[project]\nname = "demo"\n\n[tool.ruff]\n',
      'composer.json': JSON.stringify({ scripts: { test: 'phpunit' } }),
      'deno.json': JSON.stringify({ tasks: { build: 'deno run x' } }),
      'turbo.json': JSON.stringify({ tasks: { build: {} } }),
      'pom.xml': '<project></project>',
      'Package.swift': '// swift-tools-version:5.9\n',
      'compose.yaml': 'services:\n  web:\n    image: nginx\n',
      '.github/workflows/release.yml': 'name: Release\non:\n  workflow_dispatch:\njobs: {}\n',
    })
    const { options } = opts([
      { binary: 'moon', argv: ['query', 'tasks'], stdout: '{"tasks":{}}' },
      { binary: 'moon', argv: ['query', 'projects'], stdout: '{"projects":[]}' },
      { binary: 'mise', argv: ['tasks', '--json'], stdout: '[]' },
      { binary: 'sbt', argv: ['-batch'], stdout: '[info] In file:/x/\n[info]   * root\n' },
    ])
    const found = tasks(await collect(dir, { ...options, allowExec: true }))

    expect(found.length).toBeGreaterThan(0)
    // Synthesized runners (package-manager, tool-manager, hook-manager) are not tool runners.
    for (const task of found.filter((t) => t.runner in INTENDED_EXECUTES)) {
      expect(task.executes).toBe(INTENDED_EXECUTES[task.runner] as Task['executes'])
    }

    // Not vacuous: the non-local runners really emitted.
    expect(
      new Set(found.filter((t) => t.runner in INTENDED_EXECUTES).map((t) => t.executes)),
    ).toEqual(new Set(['local', 'container', 'remote']))
  })
})
