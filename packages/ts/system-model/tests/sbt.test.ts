import { afterAll, describe, expect, test } from 'vitest'

import { tasks } from '../src/model.ts'
import {
  type Canned,
  collect,
  detectAndCollect,
  fakeRunners,
  fakeWhich,
  fixtureRoot,
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

describe('sbt runner', () => {
  /**
   * `sbt -batch projects tasks` as it comes off the console: two listings in one
   * session, every line behind sbt's `[info]` log tag. sbt offers no JSON, so
   * this is the contract the parser is written against; a format change should
   * land here as a deliberate edit.
   */
  const LISTING = [
    '[info] welcome to sbt 1.9.9 (Homebrew Java 21.0.2)',
    '[info] loading project definition from /x/project',
    '[info] In file:/x/',
    '[info]   * root',
    '[info]     core',
    '[info] This is a list of tasks defined for the current project.',
    "[info] It does not list the scopes the tasks are defined in; use the 'inspect' command for that.",
    '[info] ',
    '[info]   clean    Deletes files produced by the build, such as generated sources.',
    '[info]   compile  Compiles sources.',
    '[info]   test     Executes all tests.',
    '[info] ',
    "[info] More tasks may be viewed by increasing verbosity.  See 'help tasks'.",
  ].join('\n')

  const SINGLE = [
    '[info] In file:/x/',
    '[info]   * demo',
    '[info] This is a list of tasks defined for the current project.',
    '[info]   compile  Compiles sources.',
  ].join('\n')

  test('is withheld without opting into execution', async () => {
    const dir = await root({ 'build.sbt': 'name := "demo"\n' })
    const { options, calls } = opts()
    const report = (await collect(dir, { ...options, only: ['sbt'] })).reports[0]!

    expect(report.status).toBe('absent')
    expect(report.skippedForExec).toBe(true)
    // Listing tasks compiles the build definition and runs its plugins, so
    // nothing may start a JVM without the caller asking.
    expect(calls.filter((c) => c.binary === 'sbt')).toEqual([])
  })

  test('reads the console listing, and asks sbt exactly once', async () => {
    const dir = await root({ 'build.sbt': 'name := "demo"\n' })
    const { options, calls } = opts([{ binary: 'sbt', argv: ['-batch'], stdout: SINGLE }])
    const found = tasks(await collect(dir, { ...options, only: ['sbt'], allowExec: true }))

    expect(calls.filter((c) => c.binary === 'sbt').length).toBe(1)
    expect(found.map((t) => t.path[2])).toEqual(['compile'])
    expect(found[0]?.argv).toEqual(['sbt', 'compile'])
    expect(found[0]?.doc).toBe('Compiles sources.')
    // Header prose separates its words with one space; only a two-space gap
    // after an indented name is a task row.
    expect(found.map((t) => t.path[2])).not.toContain('This')
  })

  test("a subproject's task is addressed project/task, and marked as inferred", async () => {
    const dir = await root({ 'build.sbt': 'lazy val core = project.in(file("core"))\n' })
    const { options } = opts([{ binary: 'sbt', argv: ['-batch'], stdout: LISTING }])
    const report = (await collect(dir, { ...options, only: ['sbt'], allowExec: true })).reports[0]!
    const found = report.tasks

    const rootTest = found.find((t) => t.path[1] === 'root' && t.path[2] === 'test')!
    const coreTest = found.find((t) => t.path[1] === 'core' && t.path[2] === 'test')!
    expect(rootTest.argv).toEqual(['sbt', 'test'])
    expect(rootTest.origin).toBe('declared')
    // sbt listed tasks for the current project only; the sibling's copy is a
    // claim this runner made, and says so.
    expect(coreTest.argv).toEqual(['sbt', 'core/test'])
    expect(coreTest.origin).toBe('synthesized')
    expect(report.diagnostics.some((d) => /sibling project/.test(d.message))).toBe(true)
  })

  test('a nested build.sbt is not a second build', async () => {
    const dir = await root({
      'build.sbt': 'lazy val core = project.in(file("core"))\n',
      'core/build.sbt': 'libraryDependencies += "org" %% "lib" % "1.0"\n',
      'project/build.properties': 'sbt.version=1.9.9\n',
      'project/plugins.sbt': 'addSbtPlugin("com.eed3si9n" % "sbt-assembly" % "2.1.5")\n',
    })
    const { options } = opts([{ binary: 'sbt', argv: ['-batch'], stdout: SINGLE }])
    const { profile } = await detectAndCollect(dir, { ...options, only: ['sbt'], allowExec: true })

    // Subprojects are declared in the root build.sbt; `core/build.sbt` only adds
    // settings to one, and `project/plugins.sbt` describes the meta-build.
    const sources = profile.packages
      .flatMap((p) => p.tools)
      .filter((t) => t.tool === 'sbt')
      .flatMap((t) => t.evidence.map((e) => e.source))
      .sort()
    expect(sources).toEqual(['build.sbt', 'project/build.properties'])
  })

  test('project/build.properties alone is enough: a build need not have a build.sbt', async () => {
    const dir = await root({ 'project/build.properties': 'sbt.version=1.9.9\n' })
    const { options } = opts([{ binary: 'sbt', argv: ['-batch'], stdout: SINGLE }])
    const report = (await collect(dir, { ...options, only: ['sbt'], allowExec: true })).reports[0]!

    expect(report.status).toBe('ok')
    expect(report.tasks[0]?.source).toBe('project/build.properties')
  })

  test('no sbt files means no report', async () => {
    const dir = await root({ 'README.md': '# hi\n' })
    const { options } = opts()
    const catalog = await collect(dir, { ...options, only: ['sbt'], allowExec: true })

    expect(catalog.reports.find((r) => r.runner === 'sbt')).toBeUndefined()
  })

  test('a missing binary is named as such rather than blamed on the build', async () => {
    const dir = await root({ 'build.sbt': 'name := "demo"\n' })
    // No canned `sbt`, so the call fails the way a missing binary does.
    const { options } = opts()
    const report = (await collect(dir, { ...options, only: ['sbt'], allowExec: true })).reports[0]!

    expect(report.status).toBe('error')
    expect(report.diagnostics[0]?.message).toContain('not on the PATH')
  })

  test('a failed spawn is named as a missing binary', async () => {
    const dir = await root({ 'build.sbt': 'name := "demo"\n' })
    // The seam's own message is in `error`; the child wrote no stderr.
    const { options } = opts([
      { binary: 'sbt', argv: ['-batch'], exitCode: 1, error: 'spawn sbt ENOENT' },
    ])
    const report = (await collect(dir, { ...options, only: ['sbt'], allowExec: true })).reports[0]!

    expect(report.status).toBe('error')
    expect(report.diagnostics[0]?.message).toContain('not on the PATH')
  })

  test('a build that fails to load reports its errors, not its exit code', async () => {
    const dir = await root({ 'build.sbt': 'name := \n' })
    const { options } = opts([
      {
        binary: 'sbt',
        argv: ['-batch'],
        exitCode: 1,
        stdout: [
          '[info] loading project definition',
          '[error] /x/build.sbt:1: error: illegal start of simple expression',
          '[error] Type error in expression',
        ].join('\n'),
      },
    ])
    const report = (await collect(dir, { ...options, only: ['sbt'], allowExec: true })).reports[0]!

    expect(report.status).toBe('error')
    expect(report.diagnostics[0]?.message).toContain('illegal start of simple expression')
    expect(report.diagnostics[0]?.message).not.toContain('[info]')
  })

  test('invoke appends arguments to the task', async () => {
    const dir = await root({ 'build.sbt': 'lazy val core = project.in(file("core"))\n' })
    const { options } = opts([{ binary: 'sbt', argv: ['-batch'], stdout: LISTING }])
    const { project, catalog } = await detectAndCollect(dir, {
      ...options,
      only: ['sbt'],
      allowExec: true,
    })
    const coreTest = tasks(catalog).find((t) => t.argv[1] === 'core/test')!

    expect(project.runners.invoke(coreTest, ['-v'])).toEqual(['sbt', 'core/test', '-v'])
  })
})
