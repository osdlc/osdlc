import { afterAll, describe, expect, test } from 'vitest'

import { tasks, type Task } from '../src/model.ts'
import { denoTasks } from '../src/plugins/deno/index.ts'
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
  return { discovery: 'walk' as const, tools: [denoTasks], ...extra }
}

function byName(list: Task[], name: string): Task | undefined {
  return list.find((t) => t.path[t.path.length - 1] === name)
}

describe('deno-tasks runner', () => {
  test('no report with no deno.json or deno.jsonc', async () => {
    const dir = await root({ 'README.md': 'hi' })
    const catalog = await collect(dir, opts())
    expect(catalog.reports).toEqual([])
    expect(tasks(catalog)).toEqual([])
  })

  test('string-form tasks at the root', async () => {
    const dir = await root({
      'deno.json': JSON.stringify({
        tasks: {
          dev: 'deno run --watch main.ts',
          test: 'deno test',
        },
      }),
    })
    const catalog = await collect(dir, opts())
    const report = catalog.reports[0]
    expect(report?.status).toBe('ok')

    const list = tasks(catalog)
    const dev = byName(list, 'dev')
    expect(dev?.argv).toEqual(['deno', 'task', 'dev'])
    expect(dev?.display).toBe('deno task dev')
    expect(dev?.detail).toBe('deno run --watch main.ts')
    expect(dev?.persistent.value).toBe(true)
    expect(dev?.origin).toBe('declared')
    expect(dev?.cwd).toBe('.')

    const t = byName(list, 'test')
    expect(t?.argv).toEqual(['deno', 'task', 'test'])
    expect(t?.persistent.value).toBe(false)
  })

  test('deno.jsonc with comments, including a comment-like substring inside a string', async () => {
    const jsonc = `{
      // top-level config
      "tasks": {
        /* block comment
           spanning lines */
        "start": "deno run --allow-net main.ts",
        "ping": "echo http://example.com" // trailing comment
      }
    }`
    const dir = await root({ 'deno.jsonc': jsonc })
    const catalog = await collect(dir, opts())
    const report = catalog.reports[0]
    expect(report?.status).toBe('ok')

    const list = tasks(catalog)
    expect(list.length).toBe(2)
    const ping = byName(list, 'ping')
    expect(ping?.detail).toBe('echo http://example.com')
    expect(ping?.argv).toEqual(['deno', 'task', 'ping'])

    const start = byName(list, 'start')
    expect(start?.detail).toBe('deno run --allow-net main.ts')
  })

  test('trailing commas and a BOM parse, as Deno accepts them', async () => {
    const jsonc = '\uFEFF{ "tasks": { "dev": "deno run main.ts", }, }'
    const dir = await root({ 'deno.jsonc': jsonc })
    const catalog = await collect(dir, opts())

    expect(catalog.reports[0]?.status).toBe('ok')
    expect(byName(tasks(catalog), 'dev')?.detail).toBe('deno run main.ts')
    expect(catalog.reports[0]?.diagnostics).toEqual([])
  })

  test('a config that does not parse is reported, not dropped silently', async () => {
    const dir = await root({ 'deno.json': '{ "tasks": { "dev": ' })
    const report = (await collect(dir, opts())).reports[0]

    expect(report?.tasks).toEqual([])
    expect(report?.diagnostics[0]?.severity).toBe('warning')
    expect(report?.diagnostics[0]?.source).toBe('deno.json')
  })

  test('object-form task sets doc from description', async () => {
    const dir = await root({
      'deno.json': JSON.stringify({
        tasks: {
          build: { command: 'deno compile main.ts', description: 'Build the binary.' },
        },
      }),
    })
    const catalog = await collect(dir, opts())
    const list = tasks(catalog)
    const build = byName(list, 'build')
    expect(build?.doc).toBe('Build the binary.')
    expect(build?.detail).toBe('deno compile main.ts')
    expect(build?.argv).toEqual(['deno', 'task', 'build'])
  })

  test('nested deno.json uses --cwd before the task name', async () => {
    const dir = await root({
      'apps/api/deno.json': JSON.stringify({
        tasks: { serve: 'deno run --allow-net server.ts' },
      }),
    })
    const catalog = await collect(dir, opts())
    const list = tasks(catalog)
    const serve = byName(list, 'serve')
    expect(serve?.argv).toEqual(['deno', 'task', '--cwd', 'apps/api', 'serve'])
    expect(serve?.display).toBe('deno task --cwd apps/api serve')
    expect(serve?.cwd).toBe('.')
  })

  test('no argv element contains shell metacharacters', async () => {
    const dir = await root({
      'apps/api/deno.json': JSON.stringify({
        tasks: { serve: 'deno run --allow-net server.ts' },
      }),
      'deno.json': JSON.stringify({
        tasks: { dev: 'deno run --watch main.ts' },
      }),
    })
    const catalog = await collect(dir, opts())
    for (const task of tasks(catalog)) {
      for (const arg of task.argv) {
        expect(arg).not.toMatch(/[;|&`]|\$\(/)
      }
    }
  })
})
