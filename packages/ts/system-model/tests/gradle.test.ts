import { afterAll, describe, expect, test } from 'vitest'

import { tasks, type Task } from '../src/model.ts'
import { gradle } from '../src/plugins/jvm/index.ts'
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

/** Fixture roots are not repositories, so discovery is pinned to the walk. */
function opts(canned: Canned[] = [], extra: Record<string, unknown> = {}) {
  const { make, calls } = fakeRunners(canned)
  return { options: { discovery: 'walk' as const, makeRunner: make, ...extra }, calls }
}

const SHELL_METACHARS = /[;|&`]|\$\(/

describe('gradle runner', () => {
  test('absent on an empty root', async () => {
    const dir = await root({ 'README.md': 'nothing here\n' })
    const { options } = opts()
    const result = await collect(dir, { ...options, tools: [gradle] })

    expect(tasks(result)).toEqual([])
    expect(result.reports.find((r) => r.runner === 'gradle')).toBeUndefined()
  })

  test('root build.gradle.kts + settings.gradle.kts synthesizes the five verbs once each', async () => {
    const dir = await root({
      'build.gradle.kts': '// build\n',
      'settings.gradle.kts': '// settings\n',
    })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, tools: [gradle] }))

    expect(found.map((t) => t.path[2])).toEqual(['build', 'test', 'clean', 'assemble', 'check'])
    expect(found.every((t) => t.origin === 'synthesized')).toBe(true)

    const buildTask = found.find((t) => t.path[2] === 'build')
    expect(buildTask?.argv).toEqual(['gradle', 'build'])
    expect(buildTask?.cwd).toBe('.')
    expect(buildTask?.display).toBe('gradle build')
    // deduped by directory: two marker files in one dir, not ten tasks
    expect(found).toHaveLength(5)
  })

  test("nested build file addresses via -p with the project directory, cwd stays '.'", async () => {
    const dir = await root({ 'sub/build.gradle': '// build\n' })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, tools: [gradle] }))

    const testTask = found.find((t) => t.path[2] === 'test')
    expect(testTask?.argv).toEqual(['gradle', '-p', 'sub', 'test'])
    expect(testTask?.cwd).toBe('.')
    expect(testTask?.display).toBe('gradle -p sub test')
  })

  test('wrapper at the repository root switches every project to ./gradlew', async () => {
    const dir = await root({
      gradlew: '#!/bin/sh\n',
      'build.gradle.kts': '// build\n',
      'sub/build.gradle': '// build\n',
    })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, tools: [gradle] }))

    const rootTask = found.find((t) => t.path[1] === '.' && t.path[2] === 'build')
    const subTask = found.find((t) => t.path[1] === 'sub' && t.path[2] === 'build')
    expect(rootTask?.argv).toEqual(['./gradlew', 'build'])
    expect(subTask?.argv).toEqual(['./gradlew', '-p', 'sub', 'build'])
  })

  test('wrapper beside a nested build file is used only when no root wrapper exists', async () => {
    const dir = await root({
      'sub/build.gradle': '// build\n',
      'sub/gradlew': '#!/bin/sh\n',
    })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, tools: [gradle] }))

    const testTask = found.find((t) => t.path[2] === 'test')
    expect(testTask?.argv).toEqual(['./sub/gradlew', '-p', 'sub', 'test'])
  })

  test('no wrapper anywhere falls back to the bare gradle binary', async () => {
    const dir = await root({ 'build.gradle': '// build\n' })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, tools: [gradle] }))

    expect(found.every((t) => t.argv[0] === 'gradle')).toBe(true)
  })

  test('no argv element ever contains shell metacharacters', async () => {
    const dir = await root({
      gradlew: '#!/bin/sh\n',
      'build.gradle.kts': '// build\n',
      'settings.gradle.kts': '// settings\n',
      'sub/build.gradle': '// build\n',
    })
    const { options } = opts()
    const found: Task[] = tasks(await collect(dir, { ...options, tools: [gradle] }))

    expect(found.length).toBeGreaterThan(0)
    for (const t of found) {
      for (const arg of t.argv) {
        expect(SHELL_METACHARS.test(arg)).toBe(false)
      }
    }
  })
})

// ------------------------------------------------------------ the exec path
//
// This suite does not need gradle installed. Every exec-path assertion below
// runs against recorded `gradle tasks --all` output through the injected
// runner, as the moon and just suites do. A change to gradle's report format
// shows up here as a deliberate fixture edit, not as a suite that passes on one
// machine and fails on another.

/**
 * A `gradle tasks --all` listing carrying every shape the parser has to
 * survive: the bracketed "Tasks runnable from" header, group headings over
 * same-length dashed underlines, `name - description` rows, a row with NO
 * description (`generateDocs`), a subproject-qualified name
 * (`sub:integrationTest`), the `Rules` trailer whose rows are patterns rather
 * than tasks, and the closing hint line.
 */
const TASKS_ALL = [
  '------------------------------------------------------------',
  "Tasks runnable from root project 'demo'",
  '------------------------------------------------------------',
  '',
  'Build tasks',
  '-----------',
  'assemble - Assembles the outputs of this project.',
  'build - Assembles and tests this project.',
  '',
  'Other tasks',
  '-----------',
  'generateDocs',
  'sub:integrationTest - Runs the integration suite.',
  '',
  'Rules',
  '-----',
  'Pattern: clean<TaskName>: Cleans the output files of a task.',
  '',
  'To see more detail about a task, run gradle help --task <task>',
  '',
].join('\n')

/** Calls made against the build's own tool, ignoring discovery's `git`. */
function gradleCalls<T extends { binary: string }>(calls: T[]): T[] {
  return calls.filter((c) => c.binary === 'gradle' || c.binary.endsWith('gradlew'))
}

const PROBE_ARGV = ['-q', '--console=plain', 'tasks', '--all']

/**
 * The probe's run options are part of what it promises. A `tasks --all` that
 * starts a daemon and compiles a build script is the one call in this package
 * that can hang for minutes, so the cap, the caller's abort signal and the
 * directory it runs in are asserted. Any of them could be removed from the
 * provider and the task assertions would still pass.
 */
function expectProbeOptions(
  opts: {
    timeoutMs?: number | undefined
    signal?: AbortSignal | undefined
    cwd?: string | undefined
  },
  root: string,
): void {
  expect(opts.timeoutMs).toBe(300_000)
  expect(opts.signal).toBeInstanceOf(AbortSignal)
  expect(opts.cwd).toBe(root)
}

describe('gradle provider — asking the build', () => {
  test('allowExec false keeps the synthesized floor and spawns nothing', async () => {
    const dir = await root({ 'build.gradle.kts': '// build\n' })
    const { options, calls } = opts([{ binary: 'gradle', argv: ['-q'], stdout: TASKS_ALL }])
    const catalog = await collect(dir, {
      ...options,
      tools: [gradle],
      which: fakeWhich({ gradle: '/usr/bin/gradle' }),
    })
    const found = tasks(catalog)

    expect(found.map((t) => t.path[2])).toEqual(['build', 'test', 'clean', 'assemble', 'check'])
    expect(found.every((t) => t.origin === 'synthesized')).toBe(true)
    expect(found[0]?.argv).toEqual(['gradle', 'build'])
    expect(gradleCalls(calls)).toEqual([])
  })

  test('the floor emits no diagnostics at all under allowExec false', async () => {
    const dir = await root({ 'build.gradle.kts': '// build\n', 'sub/build.gradle': '// build\n' })
    const { options } = opts()
    const catalog = await collect(dir, {
      ...options,
      tools: [gradle],
      which: fakeWhich({ gradle: '/usr/bin/gradle' }),
    })

    // Nothing was withheld and nothing degraded. With execution off, the
    // synthesized verbs are the whole intended answer, so a warning would be
    // noise on every `quality detect` run in the repository.
    expect(catalog.reports.find((r) => r.runner === 'gradle')?.diagnostics).toEqual([])
  })

  test('allowExec true but no gradle and no wrapper keeps the floor and says why', async () => {
    const dir = await root({ 'build.gradle': '// build\n' })
    const { options, calls } = opts()
    const catalog = await collect(dir, {
      ...options,
      tools: [gradle],
      allowExec: true,
      which: fakeWhich({}),
    })

    expect(tasks(catalog).map((t) => t.path[2])).toEqual([
      'build',
      'test',
      'clean',
      'assemble',
      'check',
    ])
    const report = catalog.reports.find((r) => r.runner === 'gradle')
    expect(report?.diagnostics[0]?.severity).toBe('warning')
    expect(report?.diagnostics[0]?.message).toContain('not on the PATH')
    expect(report?.diagnostics[0]?.message).toContain('gradlew')
    // No PATH binary and no wrapper means nothing was invocable, so nothing ran.
    expect(gradleCalls(calls)).toEqual([])
  })

  test("exec path reports the build's real tasks and the exact argv it sent", async () => {
    const dir = await root({
      'build.gradle.kts': '// build\n',
      'settings.gradle.kts': 'include("sub")\n',
      'sub/build.gradle': '// build\n',
    })
    const { options, calls } = opts([{ binary: 'gradle', argv: PROBE_ARGV, stdout: TASKS_ALL }])
    const cancel = new AbortController()
    const catalog = await collect(dir, {
      ...options,
      tools: [gradle],
      allowExec: true,
      which: fakeWhich({ gradle: '/usr/bin/gradle' }),
      signal: cancel.signal,
    })
    const found = tasks(catalog)

    // One invocation for the whole multi-project build, with the verified argv.
    const probe = gradleCalls(calls)
    expect(probe).toHaveLength(1)
    expect(probe[0]?.binary).toBe('gradle')
    expect(probe[0]?.argv).toEqual(PROBE_ARGV)
    expectProbeOptions(probe[0]!.opts, dir)
    // The caller's signal cancels the probe: the signal handed to it follows
    // the caller's, not some private controller the caller cannot reach.
    expect(probe[0]?.opts.signal?.aborted).toBe(false)
    cancel.abort()
    expect(probe[0]?.opts.signal?.aborted).toBe(true)

    const assemble = found.find((t) => t.path[1] === '.' && t.path[2] === 'assemble')
    expect(assemble?.origin).toBe('declared')
    expect(assemble?.doc).toBe('Assembles the outputs of this project.')
    expect(assemble?.argv).toEqual(['gradle', 'assemble'])

    // A row with no description still becomes a task, without a `doc`.
    const docs = found.find((t) => t.path[2] === 'generateDocs')
    expect(docs?.origin).toBe('declared')
    expect(docs?.doc).toBeUndefined()

    // `sub:integrationTest` lands in the `sub` directory, addressed with -p.
    const integration = found.find((t) => t.path[2] === 'integrationTest')
    expect(integration?.path[1]).toBe('sub')
    expect(integration?.origin).toBe('declared')
    expect(integration?.argv).toEqual(['gradle', '-p', 'sub', 'integrationTest'])
    expect(integration?.source).toBe('sub/build.gradle')

    // The Rules trailer is not a task, and neither is the closing hint line.
    expect(found.some((t) => t.path[2]?.startsWith('Pattern'))).toBe(false)
    expect(found.some((t) => t.path[2] === 'To')).toBe(false)

    const report = catalog.reports.find((r) => r.runner === 'gradle')
    const info = report?.diagnostics.find((d) => d.severity === 'info')
    expect(info?.message).toContain('tasks --all')
    expect(info?.message).toContain('come from the build itself')
    expect(report?.diagnostics.some((d) => d.severity === 'warning')).toBe(false)
  })

  test('the floor survives the exec path for verbs gradle did not list', async () => {
    const dir = await root({ 'build.gradle.kts': '// build\n' })
    const { options } = opts([{ binary: 'gradle', argv: PROBE_ARGV, stdout: TASKS_ALL }])
    const found = tasks(
      await collect(dir, {
        ...options,
        tools: [gradle],
        allowExec: true,
        which: fakeWhich({ gradle: '/usr/bin/gradle' }),
      }),
    )

    // Every one of the five conventional verbs is still offered.
    for (const verb of ['build', 'test', 'clean', 'assemble', 'check']) {
      expect(found.some((t) => t.path[1] === '.' && t.path[2] === verb)).toBe(true)
    }
    // The two gradle listed are declared; the three it did not stay synthesized.
    const originOf = (name: string) =>
      found.find((t) => t.path[1] === '.' && t.path[2] === name)?.origin
    expect(originOf('build')).toBe('declared')
    expect(originOf('assemble')).toBe('declared')
    expect(originOf('test')).toBe('synthesized')
    expect(originOf('clean')).toBe('synthesized')
    expect(originOf('check')).toBe('synthesized')
    // No verb is emitted twice under two origins.
    expect(found.filter((t) => t.path[1] === '.' && t.path[2] === 'build')).toHaveLength(1)
  })

  test('a build script that fails to compile falls back to the five verbs', async () => {
    const dir = await root({ 'build.gradle.kts': '// build\n' })
    const { options } = opts([
      {
        binary: 'gradle',
        argv: PROBE_ARGV,
        exitCode: 1,
        stderr: [
          'FAILURE: Build failed with an exception.',
          '',
          '* What went wrong:',
          'Script compilation error: Unresolved reference: nope',
        ].join('\n'),
      },
    ])
    const catalog = await collect(dir, {
      ...options,
      tools: [gradle],
      allowExec: true,
      which: fakeWhich({ gradle: '/usr/bin/gradle' }),
    })
    const found = tasks(catalog)

    expect(found.map((t) => t.path[2])).toEqual(['build', 'test', 'clean', 'assemble', 'check'])
    expect(found.every((t) => t.origin === 'synthesized')).toBe(true)
    const diag = catalog.reports.find((r) => r.runner === 'gradle')?.diagnostics[0]
    expect(diag?.severity).toBe('warning')
    expect(diag?.message).toContain('Script compilation error')
    expect(diag?.message).toContain('conventional lifecycle verbs')
  })

  test('a failed spawn says gradle could not be run', async () => {
    const dir = await root({ 'build.gradle.kts': '// build\n' })
    // The command seam's message is in `error`. The child wrote no stderr.
    const { options } = opts([
      { binary: 'gradle', argv: PROBE_ARGV, exitCode: 1, error: 'spawn gradle ENOENT' },
    ])
    const catalog = await collect(dir, {
      ...options,
      tools: [gradle],
      allowExec: true,
      which: fakeWhich({ gradle: '/usr/bin/gradle' }),
    })

    const diag = catalog.reports.find((r) => r.runner === 'gradle')?.diagnostics[0]
    expect(diag?.message).toMatch(/^`gradle` could not be run/)
  })

  test('output that does not parse falls back to the five verbs', async () => {
    const dir = await root({ 'build.gradle.kts': '// build\n' })
    const { options } = opts([
      { binary: 'gradle', argv: PROBE_ARGV, stdout: 'Welcome to Gradle 9.0.\n\n\n' },
    ])
    const catalog = await collect(dir, {
      ...options,
      tools: [gradle],
      allowExec: true,
      which: fakeWhich({ gradle: '/usr/bin/gradle' }),
    })
    const found = tasks(catalog)

    expect(found.map((t) => t.path[2])).toEqual(['build', 'test', 'clean', 'assemble', 'check'])
    expect(found.every((t) => t.origin === 'synthesized')).toBe(true)
    const diag = catalog.reports.find((r) => r.runner === 'gradle')?.diagnostics[0]
    expect(diag?.severity).toBe('warning')
    expect(diag?.message).toContain('could not be read')
  })

  test('a wrapper repo probes and emits ./gradlew, with no bare gradle on PATH', async () => {
    const dir = await root({
      gradlew: '#!/bin/sh\n',
      'build.gradle.kts': '// build\n',
      'settings.gradle.kts': 'include("sub")\n',
      'sub/build.gradle': '// build\n',
    })
    const { options, calls } = opts([{ binary: './gradlew', argv: PROBE_ARGV, stdout: TASKS_ALL }])
    const catalog = await collect(dir, {
      ...options,
      tools: [gradle],
      allowExec: true,
      // Nothing named `gradle` is on PATH. The exec path still runs because
      // the wrapper is the binary.
      which: fakeWhich({}),
    })
    const found = tasks(catalog)

    const probe = gradleCalls(calls)
    expect(probe).toHaveLength(1)
    expect(probe[0]?.binary).toBe('./gradlew')
    expect(probe[0]?.argv).toEqual(PROBE_ARGV)
    expectProbeOptions(probe[0]!.opts, dir)

    const assemble = found.find((t) => t.path[1] === '.' && t.path[2] === 'assemble')
    expect(assemble?.origin).toBe('declared')
    expect(assemble?.argv).toEqual(['./gradlew', 'assemble'])
    const integration = found.find((t) => t.path[2] === 'integrationTest')
    expect(integration?.argv).toEqual(['./gradlew', '-p', 'sub', 'integrationTest'])
  })

  test('with no root build file the single probe addresses the project with -p', async () => {
    const dir = await root({ 'sub/build.gradle': '// build\n' })
    const { options, calls } = opts([
      {
        binary: 'gradle',
        argv: ['-p', 'sub', ...PROBE_ARGV],
        stdout: [
          'Build tasks',
          '-----------',
          'jar - Assembles a jar archive containing the classes.',
          '',
        ].join('\n'),
      },
    ])
    const found = tasks(
      await collect(dir, {
        ...options,
        tools: [gradle],
        allowExec: true,
        which: fakeWhich({ gradle: '/usr/bin/gradle' }),
      }),
    )

    const probe = gradleCalls(calls)
    expect(probe).toHaveLength(1)
    expect(probe[0]?.binary).toBe('gradle')
    expect(probe[0]?.argv).toEqual(['-p', 'sub', ...PROBE_ARGV])
    expectProbeOptions(probe[0]!.opts, dir)

    const jar = found.find((t) => t.path[2] === 'jar')
    expect(jar?.path[1]).toBe('sub')
    expect(jar?.argv).toEqual(['gradle', '-p', 'sub', 'jar'])
    expect(jar?.origin).toBe('declared')
  })

  test('a subproject with no build file of its own keeps its qualified name', async () => {
    const dir = await root({ 'build.gradle.kts': '// build\n' })
    const { options } = opts([
      {
        binary: 'gradle',
        argv: PROBE_ARGV,
        stdout: ['Other tasks', '-----------', ':api:openapi - Generates the spec.', ''].join('\n'),
      },
    ])
    const found = tasks(
      await collect(dir, {
        ...options,
        tools: [gradle],
        allowExec: true,
        which: fakeWhich({ gradle: '/usr/bin/gradle' }),
      }),
    )

    const spec = found.find((t) => t.path[2]?.endsWith('openapi'))
    expect(spec?.path[1]).toBe('.')
    expect(spec?.path[2]).toBe('api:openapi')
    expect(spec?.argv).toEqual(['gradle', 'api:openapi'])
  })

  test('a declared long-running task is marked persistent, as a guess', async () => {
    const dir = await root({ 'build.gradle.kts': '// build\n' })
    const { options } = opts([
      {
        binary: 'gradle',
        argv: PROBE_ARGV,
        stdout: [
          'Application tasks',
          '-----------------',
          'run - Runs this project as a JVM application',
          '',
          'Build tasks',
          '-----------',
          'build - Assembles and tests this project.',
          '',
        ].join('\n'),
      },
    ])
    const found = tasks(
      await collect(dir, {
        ...options,
        tools: [gradle],
        allowExec: true,
        which: fakeWhich({ gradle: '/usr/bin/gradle' }),
      }),
    )

    // `declared: false` throughout. gradle's task report says nothing about
    // whether a task keeps running, so this is a guess from the task name. A
    // consumer that wants only authoritative answers ignores it.
    const run = found.find((t) => t.path[2] === 'run')
    expect(run?.origin).toBe('declared')
    expect(run?.persistent).toEqual({ value: true, declared: false })
    const build = found.find((t) => t.path[2] === 'build')
    expect(build?.persistent).toEqual({ value: false, declared: false })
  })
})
