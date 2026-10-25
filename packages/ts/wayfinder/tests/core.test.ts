/**
 * The session core: the filter, the unknown labels, run resolution, the
 * hand-off and the session itself. Every surface uses these, so they are
 * tested here once rather than through each surface.
 */

import { readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { afterAll, describe, expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { commandString } from '@osdlc/command-seam/quote'
import type { Catalog, RunnerReport, Task } from '@osdlc/system-model/detect'

import { CONFIG_ENV_VAR } from '../src/app.ts'
import { makeProject } from '../src/catalog.ts'
import { settingLayer } from '../src/config-keys.ts'
import { taskCopyText } from '../src/core/copy-text.ts'
import { filterTasks, sourceDepth } from '../src/core/filter.ts'
import { handOff } from '../src/core/run.ts'
import { viewPath } from '../src/core/saved-view.ts'
import { SessionError, createSession, resolveRun } from '../src/core/session.ts'
import { execOffSource, unknownLine, unknownsOf } from '../src/core/unknowns.ts'
import { withheldTrustHint } from '../src/commands/shared.ts'
import {
  countTasks,
  parametersUnknownLabel,
  runnerLabel,
  staleLabel,
  withheldLabel,
} from '../src/vocabulary.ts'
import { fixtureRoot, removeRoot } from './support.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function root(files: Record<string, string>): Promise<string> {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return dir
}

function task(over: Partial<Task> & { id: string }): Task {
  return {
    runner: 'npm',
    path: ['npm', over.id],
    argv: ['npm', 'run', over.id],
    cwd: '.',
    display: `npm run ${over.id}`,
    parameters: [],
    source: 'package.json',
    origin: 'declared',
    tags: [],
    persistent: { value: false, declared: false },
    executes: 'local',
    ...over,
  }
}

function report(runner: string, tasks: Task[], over: Partial<RunnerReport> = {}): RunnerReport {
  return {
    runner,
    status: 'ok',
    tasks,
    diagnostics: [],
    chain: [],
    skippedForExec: false,
    ...over,
  }
}

function catalogOf(reports: RunnerReport[]): Catalog {
  return {
    kind: 'catalog',
    schemaVersion: 1,
    root: '/repo',
    generatedAt: new Date(0).toISOString(),
    discovery: 'walk',
    allowExec: false,
    reports,
  }
}

const TASKS = [
  task({ id: 'build' }),
  task({ id: 'dev', persistent: { value: true, declared: true } }),
  task({ id: 'test', origin: 'synthesized' }),
  task({ id: 'web-build', source: 'apps/web/package.json' }),
]

describe('filterTasks', () => {
  test('an empty filter keeps every task, in catalog order', () => {
    expect(filterTasks([report('npm', TASKS)]).map((h) => h.task.id)).toEqual([
      'build',
      'dev',
      'test',
      'web-build',
    ])
  })

  test('each filter drops what it names', () => {
    const ids = (filter: Parameters<typeof filterTasks>[1]) =>
      filterTasks([report('npm', TASKS)], filter).map((h) => h.task.id)
    expect(ids({ servicesOnly: true })).toEqual(['dev'])
    expect(ids({ declaredOnly: true })).toEqual(['build', 'dev', 'web-build'])
    expect(ids({ maxDepth: 0 })).toEqual(['build', 'dev', 'test'])
    expect(ids({ maxDepth: 2 })).toHaveLength(4)
    expect(ids({ runners: ['cargo'] })).toEqual([])
  })

  test('a query ranks best first and drops what does not match', () => {
    const hits = filterTasks([report('npm', TASKS)], { query: 'build' })
    expect(hits.map((h) => h.task.id)).toEqual(['build', 'web-build'])
    expect(hits[0]!.score).toBeGreaterThanOrEqual(hits[1]!.score)
    expect(filterTasks([report('npm', TASKS)], { query: 'bld', mode: 'exact' })).toEqual([])
  })

  test('sourceDepth counts the directories above the declaring file', () => {
    expect(sourceDepth({ source: 'justfile' })).toBe(0)
    expect(sourceDepth({ source: 'apps/web/client/moon.yml' })).toBe(3)
  })
})

describe('unknownsOf', () => {
  test('names each kind of unknown with the vocabulary label', () => {
    const unknowns = unknownsOf({
      reports: [
        report('moon', [], { skippedForExec: true, status: 'absent' }),
        report(
          'just',
          [
            task({ id: 'just:a', runner: 'just', parametersUnknown: 'exec-withheld' }),
            task({ id: 'just:b', runner: 'just', parametersUnknown: 'exec-withheld' }),
          ],
          { tool: { binary: 'just', found: false } },
        ),
        report('make', []),
      ],
      cache: [
        {
          runner: 'make',
          state: 'stale',
          reason: 'changed',
          ageMs: 5000,
          estimateMs: null,
          slow: false,
        },
      ],
      withheld: 'untrusted',
    })
    expect(unknowns).toEqual([
      { kind: 'withheld', runner: 'moon', reason: 'untrusted', label: withheldLabel('untrusted') },
      { kind: 'binary', runner: 'just', binary: 'just', label: 'just is not installed' },
      {
        kind: 'parameters',
        runner: 'just',
        reason: 'exec-withheld',
        tasks: ['just:a', 'just:b'],
        label: parametersUnknownLabel('exec-withheld'),
      },
      {
        kind: 'stale',
        runner: 'make',
        reason: 'changed',
        ageMs: 5000,
        label: staleLabel('changed', 5000),
      },
    ])
    expect(unknownLine(unknowns[2]!)).toBe(
      `just: ${parametersUnknownLabel('exec-withheld')} (${countTasks(2)})`,
    )
  })

  test('a complete catalog has no unknowns', () => {
    expect(unknownsOf({ reports: [report('npm', TASKS)] })).toEqual([])
  })
})

describe('vocabulary', () => {
  test('a synthesized group is named by its group, a runner by its id', () => {
    expect(runnerLabel('package-manager')).toBe('dependencies')
    expect(runnerLabel('hook-manager')).toBe('git hooks')
    expect(runnerLabel('just')).toBe('just')
  })

  test('the task noun counts', () => {
    expect(countTasks(1)).toBe('1 task')
    expect(countTasks(3)).toBe('3 tasks')
  })

  test('the withheld wording names the reason', () => {
    expect(withheldLabel('untrusted')).toBe('withheld: this repository is not trusted')
    expect(withheldLabel('exec-off')).toBe('withheld: execution is off')
  })

  test('an editor variable reads as cannot run, not as unknown parameters', () => {
    expect(parametersUnknownLabel('editor-variable')).toBe(
      'cannot run here: the task uses an editor variable',
    )
    expect(parametersUnknownLabel('not-read')).toMatch(/^parameters unknown: /)
  })

  test('exec-off names what turned execution off', () => {
    expect(withheldLabel('exec-off', [], 'flag')).toBe('withheld: --no-exec was given')
    expect(withheldLabel('exec-off', [], 'user')).toBe(
      'withheld: allowExec is false in your user config',
    )
    const setting = (value: boolean, source: 'default' | 'user' | 'project') =>
      ({ allowExec: { key: 'allowExec', value, source } }) as never
    expect(execOffSource(setting(false, 'project'))).toBe('project')
    expect(execOffSource(setting(true, 'default'))).toBe('flag')
    const [held] = unknownsOf({
      reports: [report('moon', [], { skippedForExec: true })],
      withheld: 'exec-off',
      execOff: 'flag',
    })
    expect(held?.label).toBe('withheld: --no-exec was given')
  })

  test('the trust hint names the command a grant needs, and is absent when trust would not help', () => {
    const held = (reason: 'untrusted' | 'tool-untrusted' | 'exec-off', missing?: string[]) => ({
      kind: 'withheld' as const,
      runner: 'moon',
      reason,
      ...(missing !== undefined ? { missing } : {}),
      label: withheldLabel(reason, missing),
    })
    expect(withheldTrustHint([held('untrusted')])).toContain('"way trust"')
    expect(withheldTrustHint([held('tool-untrusted', ['moon', 'mise'])])).toBe(
      'run "way trust --scope moon", "way trust --scope mise" to trust each, or pass --exec for this run only',
    )
    expect(withheldTrustHint([held('exec-off')])).toBeNull()
    expect(withheldTrustHint([])).toBeNull()
  })
})

describe('resolveRun', () => {
  const project = makeProject()

  test('finds a task by id and binds arguments the way its tool expects', () => {
    const catalog = catalogOf([
      report('node-scripts', [task({ id: 'build', runner: 'node-scripts' })]),
    ])
    const plan = resolveRun(project, '/repo', catalog, 'build', ['--watch'])
    expect(plan.argv).toEqual(['npm', 'run', 'build', '--', '--watch'])
    expect(plan.cwd).toBe('/repo')
    expect(plan.env).toEqual({})
  })

  test('finds a task by a command line only one task has', () => {
    const catalog = catalogOf([report('npm', TASKS)])
    expect(resolveRun(project, '/repo', catalog, 'npm run dev').task.id).toBe('dev')
  })

  test('an unknown id is task-not-found, with the closest ids as a hint', () => {
    const catalog = catalogOf([report('npm', TASKS)])
    try {
      resolveRun(project, '/repo', catalog, 'buld')
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(SessionError)
      expect((err as SessionError).code).toBe('task-not-found')
      expect((err as SessionError).hint).toContain('build')
    }
  })

  test('an unknown id is not matched to a task that only has its letters in order', () => {
    const catalog = catalogOf([report('npm', [task({ id: 'node-scripts:package.json:evil' })])])
    try {
      resolveRun(project, '/repo', catalog, 'nope')
      expect.unreachable()
    } catch (err) {
      expect((err as SessionError).hint).not.toContain('evil')
      expect((err as SessionError).hint).toContain('list --json')
    }
  })

  test('an id two tasks share is refused, naming the line that runs each', () => {
    const two = task({ id: 'a:b:c', argv: ['npm', 'run', 'two'] })
    const catalog = catalogOf([
      report('npm', [task({ id: 'a:b:c', argv: ['npm', 'run', 'one'] }), two]),
    ])
    expect(() => resolveRun(project, '/repo', catalog, 'a:b:c')).toThrow(
      expect.objectContaining({
        code: 'ambiguous-task',
        hint: expect.stringContaining(
          commandString(['way', 'run', taskCopyText(two, process.platform)!]),
        ),
      }),
    )
    // The line the hint names runs that task.
    expect(
      resolveRun(project, '/repo', catalog, taskCopyText(two, process.platform)!).argv,
    ).toEqual(['npm', 'run', 'two'])
  })

  test('two tasks with the same id and the same display run by the line list prints', () => {
    const sub = task({ id: 'a:b:c', display: 'npm run x', argv: ['npm', 'run', 'x'], cwd: 'sub' })
    const catalog = catalogOf([
      report('npm', [task({ id: 'a:b:c', display: 'npm run x', argv: ['npm', 'run', 'x'] }), sub]),
    ])
    const plan = resolveRun(project, '/repo', catalog, taskCopyText(sub, process.platform)!)
    expect(plan.cwd).toBe(resolve('/repo', 'sub'))
  })

  test('two tasks with the same id and the same line say they cannot be told apart', () => {
    const catalog = catalogOf([
      report('npm', [
        task({ id: 'a:b:c', argv: ['npm', 'run', 'x'] }),
        task({ id: 'a:b:c', argv: ['npm', 'run', 'x'] }),
      ]),
    ])
    expect(() => resolveRun(project, '/repo', catalog, 'a:b:c')).toThrow(
      expect.objectContaining({
        code: 'ambiguous-task',
        hint: expect.stringContaining('cannot tell them apart'),
      }),
    )
  })

  test('a task that uses an editor variable is not run', () => {
    const catalog = catalogOf([
      report('vscode', [
        task({ id: 'open', runner: 'vscode', parametersUnknown: 'editor-variable' }),
      ]),
    ])
    expect(() => resolveRun(project, '/repo', catalog, 'open')).toThrow(
      expect.objectContaining({ code: 'not-runnable' }),
    )
  })

  test('arguments a task cannot take are bad-arguments', () => {
    // A tool whose rule refuses arguments, as a Procfile process run through a manager does.
    const picky = makeProject([
      {
        id: 'picky',
        markers: [{ files: 'picky.txt', tier: 'files' }],
        roles: {
          runner: {
            kind: 'parse',
            chain: [],
            collect: async () => ({ status: 'absent', tasks: [], diagnostics: [] }),
            invoke: () => {
              throw new Error('picky: a process takes no arguments')
            },
          },
        },
      },
    ])
    const web = task({ id: 'web', runner: 'picky', argv: ['picky', 'web'] })
    const catalog = catalogOf([report('picky', [web])])
    expect(() => resolveRun(picky, '/repo', catalog, 'web', ['--port', '1'])).toThrow(
      expect.objectContaining({
        code: 'bad-arguments',
        message: 'picky: a process takes no arguments',
      }),
    )
    // With no arguments it resolves.
    expect(resolveRun(picky, '/repo', catalog, 'web').argv).toEqual(['picky', 'web'])
  })
})

describe.skipIf(process.platform === 'win32')('handOff', () => {
  test("returns the task's exit code", () => {
    const plan = { task: task({ id: 'x' }), argv: ['sh', '-c', 'exit 3'], env: {}, cwd: '/' }
    expect(handOff(plan)).toEqual({ exit: 3 })
  })

  test('a task ended by a signal exits 128 + the signal, as a shell reports it', () => {
    const plan = { task: task({ id: 'x' }), argv: ['sh', '-c', 'kill -TERM $$'], env: {}, cwd: '/' }
    expect(handOff(plan)).toEqual({ exit: 143 })
  })

  test('the variables of the plan reach the task', () => {
    const plan = {
      task: task({ id: 'x' }),
      argv: ['sh', '-c', 'test "$WAY_TEST_VAR" = yes'],
      env: { WAY_TEST_VAR: 'yes' },
      cwd: '/',
    }
    expect(handOff(plan).exit).toBe(0)
  })

  test('an argv holding a NUL never starts, and says why instead of throwing', () => {
    const plan = { task: task({ id: 'x' }), argv: ['sh', 'n\u0000x'], env: {}, cwd: '/' }
    const ended = handOff(plan)
    expect(ended.exit).toBe(1)
    expect(ended.error).toContain('null bytes')
  })

  test('a SIGTERM sent to this process waits for the task instead of orphaning it', () => {
    // In a child process: the signal would otherwise end the test worker.
    const run = pathToFileURL(fileURLToPath(new URL('../src/core/run.ts', import.meta.url))).href
    const script =
      `const { handOff } = await import(${JSON.stringify(run)});` +
      `const r = handOff({ argv: ['sh', '-c', 'kill -TERM $PPID; sleep 0.3; echo task-done'], env: {}, cwd: '/' });` +
      `console.log('exit', r.exit)`
    const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
    })
    expect(res.signal).toBeNull()
    expect(res.stdout).toBe('task-done\nexit 0\n')
  })

  test('a binary that does not exist never starts, and says why', () => {
    const plan = { task: task({ id: 'x' }), argv: ['way-no-such-binary'], env: {}, cwd: '/' }
    const ended = handOff(plan)
    expect(ended.exit).toBe(1)
    expect(ended.error).toBeDefined()
  })
})

describe('createSession', () => {
  test('a start directory that does not exist is an error, not the enclosing repository', async () => {
    const dir = await root({ 'package.json': '{"name":"p","scripts":{"b":"x"}}' })
    await expect(
      createSession({ dir: 'missing', cwd: dir, env: {}, home: dir }),
    ).rejects.toMatchObject({ code: 'no-such-directory', message: 'missing: no such directory' })
  })

  test('a fresh probe reports each probed runner time; the store answers --cached', async () => {
    const dir = await root({ 'package.json': '{"name":"p","scripts":{"b":"x"}}' })
    const session = await createSession({ dir, cwd: dir, env: {}, home: dir })
    const fresh = await session.catalog()
    expect(fresh.origin).toBe('probe')
    const npm = fresh.cache.find((c) => c.runner === 'node-scripts')
    expect(npm?.state).toBe('fresh')
    expect(typeof npm?.probeMs).toBe('number')
    expect(npm?.estimateMs).toBe(npm?.probeMs)

    const saved = await session.catalog({ cached: true })
    expect(saved.origin).toBe('saved')
    expect(saved.cache.find((c) => c.runner === 'node-scripts')?.probeMs).toBeUndefined()

    // With no saved listing, the store answers.
    await rm(viewPath(session.store, session.root), { force: true })
    const stored = await session.catalog({ cached: true })
    expect(stored.origin).toBe('store')
    expect(stored.cache.find((c) => c.runner === 'node-scripts')?.probeMs).toBeUndefined()
  })

  test('grantTrust allows execution for the rest of the session; revokeTrust removes the grant', async () => {
    const dir = await root({ 'mise.toml': '[tasks.hello]\nrun = "echo hi"\n' })
    const session = await createSession({ dir, cwd: dir, env: {}, home: dir })
    expect(session.trustable()).toBe(true)
    expect(session.withheldReason()).toBe('untrusted')
    const withheld = await session.catalog()
    expect(session.unknowns(withheld).map((u) => u.kind)).toContain('withheld')

    expect(await session.grantTrust()).toEqual({ changed: true })
    expect(session.gate.allowExec).toBe(true)
    expect(session.options.allowExec).toBe(true)
    expect(session.options.execWithheldHint).toBeUndefined()
    expect(session.trustable()).toBe(false)
    expect(session.settings()).toMatchObject({ allowExec: true, trusted: true, trustable: false })

    expect(await session.revokeTrust()).toEqual({ changed: true })
    expect(await session.revokeTrust()).toEqual({ changed: false })
  })

  test('settings come from the shared reader: allowExec defaults to true, a project file only lowers it', async () => {
    const plain = await root({ 'package.json': '{"name":"p"}' })
    const byDefault = (
      await createSession({ dir: plain, cwd: plain, env: {}, home: plain })
    ).settings()
    expect(byDefault.settings.allowExec).toMatchObject({ value: true, source: 'default' })
    // The default alone does not run anything: the repository is not trusted.
    expect(byDefault).toMatchObject({ allowExec: false, reason: 'untrusted', trusted: false })

    const lowered = await root({
      'package.json': '{"name":"p"}',
      'wayfinder.config.json': '{"allowExec": false}',
    })
    const off = (
      await createSession({ dir: lowered, cwd: lowered, env: {}, home: lowered })
    ).settings()
    expect(off.settings.allowExec).toMatchObject({ value: false, source: 'project' })

    const user = await root({ 'config.json': '{"allowExec": false}' })
    const raised = await root({
      'package.json': '{"name":"p"}',
      'wayfinder.config.json': '{"allowExec": true}',
    })
    const session = await createSession({
      dir: raised,
      cwd: raised,
      env: { [CONFIG_ENV_VAR]: `${user}/config.json` },
      home: raised,
    })
    expect(session.settings().settings.allowExec).toMatchObject({ value: false, source: 'user' })
    expect(session.warnings.join('\n')).toContain('allowExec: true is ignored in a project file')
  })

  test('a grant that would change nothing is refused', async () => {
    const dir = await root({ 'mise.toml': '[tasks.hello]\nrun = "echo hi"\n' })
    const session = await createSession({
      dir,
      cwd: dir,
      env: {},
      home: dir,
      flags: { allowExec: false },
    })
    expect(session.withheldReason()).toBe('exec-off')
    await expect(session.grantTrust()).rejects.toMatchObject({ code: 'not-trustable' })
  })

  test('storedCatalog answers from the store alone, and is null before a probe', async () => {
    const dir = await root({ 'package.json': '{"name":"p","scripts":{"b":"x"}}' })
    const session = await createSession({ dir, cwd: dir, env: {}, home: dir })
    expect(await session.storedCatalog()).toBeNull()
    await session.catalog()
    const stored = await session.storedCatalog()
    expect(stored?.origin).toBe('store')
    expect(stored?.catalog.reports.map((r) => r.runner)).toContain('node-scripts')
  })

  test('savedCatalog draws the last catalog, only under the same trust and settings', async () => {
    const dir = await root({ 'package.json': '{"name":"p","scripts":{"b":"x"}}' })
    const session = await createSession({ dir, cwd: dir, env: {}, home: dir })
    expect(await session.savedCatalog()).toBeNull()
    await session.catalog()
    const again = await createSession({ dir, cwd: dir, env: {}, home: dir })
    const saved = await again.savedCatalog()
    expect(saved?.origin).toBe('saved')
    expect(saved?.catalog.reports.map((r) => r.runner)).toContain('node-scripts')
    expect(saved?.cache.every((c) => c.probeMs === undefined)).toBe(true)
    // Another runner selection probes other rows, so it does not draw these.
    const other = await createSession({
      dir,
      cwd: dir,
      env: {},
      home: dir,
      flags: { exclude: ['node-scripts'] },
    })
    expect(other.viewKey()).not.toBe(session.viewKey())
    expect(await other.savedCatalog()).toBeNull()
  })

  test('saveSetting writes the file settingLayer picks and the options follow', async () => {
    const dir = await root({ 'package.json': '{"name":"p"}' })
    const session = await createSession({ dir, cwd: dir, env: {}, home: dir })
    const saved = await session.saveSetting('runners.disabled', ['make'])
    expect(saved).toMatchObject({ layer: 'project', pinned: false })
    expect(saved.file).toBe(join(dir, 'wayfinder.config.json'))
    expect(session.options.exclude).toEqual(['make'])
    expect(saved.snapshot.settings.settings).toContainEqual(
      expect.objectContaining({ key: 'runners.disabled', value: ['make'], source: 'project' }),
    )
    // No file sets the order, so it goes to the user file.
    expect((await session.saveSetting('runners.order', ['npm'])).layer).toBe('user')
    expect(session.runnerOrder()).toEqual(['npm'])
  })

  test('saveSetting writes runners.order to the project file when that file sets it', async () => {
    const dir = await root({
      'package.json': '{"name":"p"}',
      'wayfinder.config.json': '{"runners":{"order":["just"]}}',
    })
    const session = await createSession({ dir, cwd: dir, env: {}, home: dir })
    const saved = await session.saveSetting('runners.order', ['make', 'just'])
    expect(saved.layer).toBe('project')
    expect(JSON.parse(await readFile(join(dir, 'wayfinder.config.json'), 'utf-8'))).toMatchObject({
      runners: { order: ['make', 'just'] },
    })
    expect(session.runnerOrder()).toEqual(['make', 'just'])
  })

  test('saveSetting leaves an option a flag set, and says so', async () => {
    const dir = await root({ 'package.json': '{"name":"p"}' })
    const session = await createSession({
      dir,
      cwd: dir,
      env: {},
      home: dir,
      flags: { discovery: 'walk' },
    })
    const saved = await session.saveSetting('discovery', 'git')
    expect(saved.pinned).toBe(true)
    expect(session.options.discovery).toBe('walk')
  })

  test('saveSetting refuses a value the key does not take', async () => {
    const dir = await root({ 'package.json': '{"name":"p"}' })
    const session = await createSession({ dir, cwd: dir, env: {}, home: dir })
    const refused = session.saveSetting('discovery', 'sideways')
    await expect(refused).rejects.toBeInstanceOf(SessionError)
    await expect(refused).rejects.toMatchObject({
      code: 'config',
      message: expect.stringMatching(/^not saved: /),
    })
  })

  test('reloadSettings picks up an edit made outside the session', async () => {
    const dir = await root({ 'package.json': '{"name":"p"}' })
    const session = await createSession({ dir, cwd: dir, env: {}, home: dir })
    await writeFile(join(dir, 'wayfinder.config.json'), '{"excludePaths":["vendor"]}', 'utf-8')
    const snapshot = await session.reloadSettings()
    expect(snapshot.settings.settings).toContainEqual(
      expect.objectContaining({ key: 'excludePaths', value: ['vendor'] }),
    )
    expect(session.options.excludePaths).toEqual(['vendor'])
    await writeFile(join(dir, 'wayfinder.config.json'), '{ not json', 'utf-8')
    await expect(session.reloadSettings()).rejects.toMatchObject({ code: 'config' })
  })
})

describe('settingLayer', () => {
  test('user-only keys go to the user file, runners.order to the file that sets it', () => {
    expect(settingLayer('theme', 'default')).toBe('user')
    expect(settingLayer('skills', 'project')).toBe('user')
    expect(settingLayer('runners.order', 'project')).toBe('project')
    expect(settingLayer('runners.order', 'user')).toBe('user')
    expect(settingLayer('runners.order', 'default')).toBe('user')
    expect(settingLayer('runners.disabled', 'user')).toBe('project')
    expect(settingLayer('discovery', 'default')).toBe('project')
  })
})
