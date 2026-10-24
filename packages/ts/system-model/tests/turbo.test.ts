import { afterAll, describe, expect, test } from 'vitest'

import { turbo } from '../src/plugins/runners/index.ts'
import { tasks, type Task } from '../src/model.ts'
import { collect, fixtureRoot, removeRoot } from './support.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function root(files: Record<string, string>): Promise<string> {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return dir
}

/** Fixture roots are not repositories, so discovery is pinned to the walk. */
function opts(extra: Record<string, unknown> = {}) {
  return {
    discovery: 'walk' as const,
    tools: [turbo],
    ...extra,
  }
}

function byName(list: Task[], name: string): Task | undefined {
  return list.find((t) => t.path[t.path.length - 1] === name)
}

describe('turbo runner', () => {
  test('no report when no turbo.json', async () => {
    const dir = await root({ 'package.json': '{}' })
    const catalog = await collect(dir, opts())
    expect(catalog.reports).toEqual([])
    expect(tasks(catalog)).toEqual([])
  })

  test('v2 tasks key: argv, and cache-disabled dev guesses persistent while build does not', async () => {
    const dir = await root({
      'turbo.json': JSON.stringify({
        tasks: {
          build: { dependsOn: ['^build'], outputs: ['dist/**'] },
          dev: { cache: false, persistent: false },
        },
      }),
    })
    const catalog = await collect(dir, opts())
    const found = tasks(catalog)

    const build = byName(found, 'build')!
    expect(build.argv).toEqual(['turbo', 'run', 'build'])
    expect(build.persistent.value).toBe(false)
    expect(build.detail).toBe('depends on: ^build; outputs: dist/**')

    const dev = byName(found, 'dev')!
    expect(dev.argv).toEqual(['turbo', 'run', 'dev'])
    expect(dev.persistent.value).toBe(true)
    expect(dev.persistent.declared).toBe(false)
    expect(dev.tags).toContain('cache-disabled')
  })

  test('v1 pipeline key still produces tasks and emits a diagnostic', async () => {
    const dir = await root({
      'turbo.json': JSON.stringify({
        pipeline: {
          build: { outputs: ['dist/**'] },
        },
      }),
    })
    const catalog = await collect(dir, opts())
    const found = tasks(catalog)

    expect(byName(found, 'build')?.argv).toEqual(['turbo', 'run', 'build'])
    expect(catalog.reports[0]?.diagnostics.some((d) => /v1 pipeline/.test(d.message))).toBe(true)
  })

  test('workspace#task key splits into --filter form', async () => {
    const dir = await root({
      'turbo.json': JSON.stringify({
        tasks: {
          'web#build': {},
        },
      }),
    })
    const catalog = await collect(dir, opts())
    const found = tasks(catalog)
    const task = byName(found, 'web#build')!
    expect(task.argv).toEqual(['turbo', 'run', 'build', '--filter', 'web'])
  })

  test('a nested turbo.json names its directory with --cwd', async () => {
    // argv runs from the catalog root. Without `--cwd` it targets the root turbo
    // project. With no root turbo.json, turbo exits "Could not find turbo.json".
    // With one, it silently runs every package's build. `--cwd` is turbo's
    // global working-directory flag. Running turbo inside a package directory
    // scopes the task to that package
    // (turborepo.dev/docs/crafting-your-repository/running-tasks, "Automatic
    // Package Scoping").
    const dir = await root({
      'frontend/turbo.json': JSON.stringify({ tasks: { build: {} } }),
    })
    const catalog = await collect(dir, opts())
    const task = byName(tasks(catalog), 'build')!

    expect(task.argv).toEqual(['turbo', '--cwd', 'frontend', 'run', 'build'])
    expect(task.display).toBe('turbo --cwd frontend run build')
    expect(task.cwd).toBe('.')
  })

  test('explicit persistent: true is trusted and marked declared', async () => {
    const dir = await root({
      'turbo.json': JSON.stringify({
        tasks: {
          dev: { persistent: true },
        },
      }),
    })
    const catalog = await collect(dir, opts())
    const found = tasks(catalog)
    const dev = byName(found, 'dev')!
    expect(dev.persistent.declared).toBe(true)
    expect(dev.persistent.value).toBe(true)
  })

  test('no argv element contains shell metacharacters', async () => {
    const dir = await root({
      'turbo.json': JSON.stringify({
        tasks: {
          build: { outputs: ['dist/**'] },
          'web#dev': { persistent: true },
        },
      }),
    })
    const catalog = await collect(dir, opts())
    const found = tasks(catalog)
    expect(found.length).toBeGreaterThan(0)
    for (const task of found) {
      for (const arg of task.argv) {
        expect(arg).not.toMatch(/[;|&`]|\$\(/)
      }
    }
  })
})
