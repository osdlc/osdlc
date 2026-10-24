import { afterAll, describe, expect, test } from 'vitest'

import { tasks, type Task } from '../src/model.ts'
import { type MoonProjectFact } from '../src/plugins/runners/index.ts'
import {
  type Canned,
  collect,
  detectAndCollect,
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

function byName(list: Task[], name: string): Task | undefined {
  return list.find((t) => t.path[t.path.length - 1] === name)
}

describe('moon runner', () => {
  const TASKS = moonTasksJson('web', {
    dev: { id: 'dev', target: 'web:dev', command: 'vite', options: { persistent: true } },
    build: { id: 'build', target: 'web:build', command: 'vite', args: ['build'] },
    internal: { id: 'internal', target: 'web:internal', options: { internal: true } },
  })
  const PROJECTS = moonProjectsJson([
    {
      id: 'web',
      source: 'apps/web',
      layer: 'application',
      stack: 'frontend',
      language: 'typescript',
    },
  ])
  const CANNED: Canned[] = [
    { binary: 'moon', argv: ['query', 'tasks'], stdout: TASKS },
    { binary: 'moon', argv: ['query', 'projects'], stdout: PROJECTS },
  ]

  test('is withheld without opting into execution, and explains itself', async () => {
    const dir = await root({ '.moon/workspace.yml': 'projects: []\n' })
    const { options, calls } = opts()
    const catalog = await collect(dir, { ...options, only: ['moon'] })
    const report = catalog.reports[0]!

    expect(report.status).toBe('absent')
    expect(report.skippedForExec).toBe(true)
    expect(report.diagnostics[0]?.message).toContain('subprocess')
    // Neither the runner nor `describe` executes anything.
    expect(calls.filter((c) => c.binary === 'moon')).toEqual([])
  })

  test.each(['.moon/workspace.yml', '.moon/workspace.yaml'])('is detected by %s', async (file) => {
    const dir = await root({ [file]: 'projects: []\n' })
    const { options } = opts([{ binary: 'moon', argv: ['query', 'tasks'], stdout: '{"tasks":{}}' }])
    const { profile, catalog } = await detectAndCollect(dir, {
      ...options,
      only: ['moon'],
      allowExec: true,
    })

    expect(profile.tools).toContain('moon')
    expect(catalog.reports[0]?.status).toBe('ok')
  })

  test('is not detected without a workspace file, and produces no report', async () => {
    const dir = await root({ 'moon.yml': 'language: typescript\n' })
    const { options } = opts(CANNED)
    const { profile, catalog } = await detectAndCollect(dir, {
      ...options,
      only: ['moon'],
      allowExec: true,
    })

    expect(profile.tools).not.toContain('moon')
    expect(catalog.reports.find((r) => r.runner === 'moon')).toBeUndefined()
  })

  test('reports tasks and project facets when execution is allowed', async () => {
    const dir = await root({ '.moon/workspace.yml': 'projects: []\n' })
    const { options } = opts(CANNED)
    const found = tasks(await collect(dir, { ...options, only: ['moon'], allowExec: true }))

    expect(found.map((t) => t.path[3]).sort()).toEqual(['build', 'dev'])
    const dev = byName(found, 'dev')!
    expect(dev.argv).toEqual(['moon', 'run', 'web:dev'])
    expect(dev.path).toEqual(['moon', 'apps', 'web', 'dev'])
    expect(dev.tags).toContain('application')
  })

  test('distinguishes a declared persistent task from a guessed one', async () => {
    const dir = await root({ '.moon/workspace.yml': 'projects: []\n' })
    const { options } = opts(CANNED)
    const found = tasks(await collect(dir, { ...options, only: ['moon'], allowExec: true }))

    expect(byName(found, 'dev')?.persistent).toEqual({ value: true, declared: true })
    expect(byName(found, 'build')?.persistent).toEqual({ value: false, declared: false })
  })

  test('surfaces the whole diagnostic when moon fails, not just its headline', async () => {
    const dir = await root({ '.moon/workspace.yml': 'projects: []\n' })
    const stderr = [
      '[ WARN 12:00:00.000] moon_workspace  some warning',
      'Error: project_graph::duplicate_id',
      '',
      '  × A project already exists with the identifier graph-scheduler (existing',
      '  │ source packages/rust/graph-scheduler, new source packages/ts/graph-',
      '  │ scheduler).',
    ].join('\n')
    const { options } = opts([{ binary: 'moon', argv: ['query', 'tasks'], exitCode: 1, stderr }])
    const report = (await collect(dir, { ...options, only: ['moon'], allowExec: true })).reports[0]!

    expect(report.status).toBe('error')
    const message = report.diagnostics[0]!.message
    // The headline names only the error class; everything actionable is below it.
    expect(message).toContain('duplicate_id')
    expect(message).toContain('packages/rust/graph-scheduler')
    expect(message).not.toContain('WARN')
  })

  test('degrades to tasks without facets when project metadata is unavailable', async () => {
    const dir = await root({ '.moon/workspace.yml': 'projects: []\n' })
    const { options } = opts([{ binary: 'moon', argv: ['query', 'tasks'], stdout: TASKS }])
    const report = (await collect(dir, { ...options, only: ['moon'], allowExec: true })).reports[0]!

    expect(report.status).toBe('ok')
    expect(report.tasks.length).toBe(2)
    expect(report.diagnostics.some((d) => d.severity === 'warning')).toBe(true)
  })

  test('describe adds a project fact per moon project when execution is allowed', async () => {
    const dir = await root({ '.moon/workspace.yml': 'projects: []\n' })
    const { options } = opts(CANNED)
    const { profile } = await detectAndCollect(dir, { ...options, only: ['moon'], allowExec: true })

    const facts = profile.packages
      .flatMap((p) => p.tools)
      .filter((t) => t.tool === 'moon')
      .flatMap((t) => t.facts ?? []) as MoonProjectFact[]
    expect(facts).toEqual([
      { id: 'web', layer: 'application', stack: 'frontend', language: 'typescript' },
    ])
  })

  test('describe adds no facts, and runs nothing, without allowExec', async () => {
    const dir = await root({ '.moon/workspace.yml': 'projects: []\n' })
    const { options, calls } = opts(CANNED)
    const { profile } = await detectAndCollect(dir, { ...options, only: ['moon'] })

    const facts = profile.packages.flatMap((p) => p.tools).flatMap((t) => t.facts ?? [])
    expect(facts).toEqual([])
    expect(calls).toEqual([])
  })

  test('describe yields no facts when moon fails, and detection still succeeds', async () => {
    const dir = await root({ '.moon/workspace.yml': 'projects: []\n' })
    const { options } = opts([
      { binary: 'moon', argv: ['query', 'projects'], exitCode: 1, stderr: 'boom' },
    ])
    const { profile } = await detectAndCollect(dir, { ...options, only: ['moon'], allowExec: true })

    expect(profile.tools).toContain('moon')
    expect(profile.packages.flatMap((p) => p.tools).flatMap((t) => t.facts ?? [])).toEqual([])
  })

  test('invoke puts arguments after `--`', async () => {
    const dir = await root({ '.moon/workspace.yml': 'projects: []\n' })
    const { options } = opts(CANNED)
    const { project, catalog } = await detectAndCollect(dir, {
      ...options,
      only: ['moon'],
      allowExec: true,
    })
    const dev = byName(tasks(catalog), 'dev')!

    expect(project.runners.invoke(dev, ['--watch'])).toEqual([
      'moon',
      'run',
      'web:dev',
      '--',
      '--watch',
    ])
    expect(project.runners.invoke(dev, [])).toEqual(['moon', 'run', 'web:dev'])
  })
})
