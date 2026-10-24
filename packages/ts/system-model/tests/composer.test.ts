import { afterAll, describe, expect, test } from 'vitest'

import { tasks, type Task } from '../src/model.ts'
import { composer } from '../src/plugins/php/index.ts'
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
  return { options: { discovery: 'walk' as const, tools: [composer], ...extra } }
}

function byName(list: Task[], name: string): Task | undefined {
  return list.find((t) => t.path[t.path.length - 1] === name)
}

describe('composer runner', () => {
  test('no report when no composer.json', async () => {
    const dir = await root({ 'README.md': 'hi' })
    const catalog = await collect(dir, opts().options)
    expect(catalog.reports.find((r) => r.runner === 'composer')).toBeUndefined()
  })

  test('absent when composer.json has no scripts', async () => {
    const dir = await root({
      'composer.json': JSON.stringify({ name: 'acme/thing', require: {} }),
    })
    const catalog = await collect(dir, opts().options)
    const report = catalog.reports.find((r) => r.runner === 'composer')
    expect(report?.status).toBe('absent')
    expect(report?.tasks).toEqual([])
  })

  test('a string-valued and an array-valued script', async () => {
    const dir = await root({
      'composer.json': JSON.stringify({
        name: 'acme/thing',
        scripts: {
          test: 'phpunit',
          check: ['@test', 'phpstan analyse', 'phpcs'],
        },
      }),
    })
    const catalog = await collect(dir, opts().options)
    const found = tasks(catalog)

    const testTask = byName(found, 'test')
    expect(testTask).toBeDefined()
    expect(testTask?.argv).toEqual(['composer', 'run-script', 'test'])
    expect(testTask?.display).toBe('composer run-script test')
    expect(testTask?.detail).toBe('phpunit')
    expect(testTask?.origin).toBe('declared')
    expect(testTask?.cwd).toBe('.')

    const checkTask = byName(found, 'check')
    expect(checkTask).toBeDefined()
    expect(checkTask?.argv).toEqual(['composer', 'run-script', 'check'])
    expect(checkTask?.display).toBe('composer run-script check')
    // "@test" is skipped from the joined detail text but the task is one task.
    expect(checkTask?.detail).toBe('phpstan analyse && phpcs')
  })

  test('nested composer.json uses --working-dir', async () => {
    const dir = await root({
      'packages/api/composer.json': JSON.stringify({
        name: 'acme/api',
        scripts: { test: 'phpunit' },
      }),
    })
    const catalog = await collect(dir, opts().options)
    const found = tasks(catalog)
    const testTask = byName(found, 'test')
    expect(testTask).toBeDefined()
    expect(testTask?.argv).toEqual([
      'composer',
      '--working-dir',
      'packages/api',
      'run-script',
      'test',
    ])
    expect(testTask?.display).toBe('composer --working-dir packages/api run-script test')
    expect(testTask?.cwd).toBe('.')
  })

  test('no argv element contains shell metacharacters', async () => {
    const dir = await root({
      'composer.json': JSON.stringify({
        name: 'acme/thing',
        scripts: {
          test: 'phpunit',
          check: ['@test', 'phpstan analyse', 'phpcs'],
        },
      }),
      'packages/api/composer.json': JSON.stringify({
        name: 'acme/api',
        scripts: { build: 'php build.php' },
      }),
    })
    const catalog = await collect(dir, opts().options)
    const found = tasks(catalog)
    expect(found.length).toBeGreaterThan(0)
    for (const arg of found.flatMap((t) => t.argv)) {
      expect(arg).not.toMatch(/[;|&`]|\$\(/)
    }
  })
})
