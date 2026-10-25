/**
 * Listing, searching and invoking tasks, through the package name only.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import {
  createProject,
  diagnostics,
  SYNTHESIZED_RUNNERS,
  tasks,
  type CachedCatalog,
  type Catalog,
  type ChainSegment,
  type CollectOptions,
  type Diagnostic,
  type Invocation,
  type Param,
  type ParamBinding,
  type ParamValues,
  type ParametersUnknownReason,
  type RunnerBrand,
  type RunnerCacheState,
  type RunnerReport,
  type Runners,
  type Severity,
  type StaleReason,
  type Task,
  type TaskExecutionTarget,
  type TaskOrigin,
} from '@osdlc/system-model/detect'
import { builtins } from '@osdlc/system-model/builtins'
import { humanAge, humanMs } from '@osdlc/system-model/duration'
import {
  exact,
  fuzzy,
  matchEntry,
  terms,
  type EntryMatch,
  type Hit,
  type Matchable,
  type Mode,
} from '@osdlc/system-model/match'
import { bindParams, paramShape, type BoundParams } from '@osdlc/system-model/params'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function repo(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'project-example-')))
  roots.push(root)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

const project = createProject({ tools: builtins })
const runners: Runners = project.runners

const FILES = {
  justfile: 'build:\n    cargo build\n\ndeploy env:\n    ./deploy.sh {{env}}\n',
  'package.json': JSON.stringify({ scripts: { dev: 'vite', test: 'vitest' } }),
  'package-lock.json': '{}',
}

test('collect lists every runner that was found, then the synthesized groups', async () => {
  const profile = await project.detect(repo(FILES), { discovery: 'walk' })
  const catalog: Catalog = await runners.collect(profile)

  const reports: RunnerReport[] = catalog.reports
  expect(reports.map((r) => r.runner)).toEqual([
    'just',
    'node-scripts',
    SYNTHESIZED_RUNNERS.packageManager,
  ])

  const all: Task[] = tasks(catalog)
  const deploy = all.find((t) => t.argv.at(-1) === 'deploy')!
  const origin: TaskOrigin = deploy.origin
  const where: TaskExecutionTarget = deploy.executes
  expect([origin, where]).toEqual(['declared', 'local'])

  // Installs are tasks too, marked as synthesized so a filter can hide them.
  const install = all.find((t) => t.runner === 'package-manager')!
  expect(install.argv).toEqual(['npm', 'ci'])
  expect(install.origin).toBe('synthesized')

  const chain: ChainSegment[] = reports[0]!.chain
  const brand: RunnerBrand | undefined = reports[0]!.brand
  expect(chain[0]!.label).toBe('runner')
  expect(brand?.color).toMatch(/^#/)
})

test('an exec runner is withheld until execution is allowed', async () => {
  const root = repo({ 'mise.toml': '[tasks.lint]\nrun = "eslint ."\n' })
  const profile = await project.detect(root, { discovery: 'walk' })
  const options: CollectOptions = { execWithheldHint: 'run `tooly trust` to allow it' }
  const catalog = await runners.collect(profile, options)

  const mise = catalog.reports.find((r) => r.runner === 'mise')!
  expect(mise.skippedForExec).toBe(true)
  const notes: Array<Diagnostic & { runner: string }> = diagnostics(catalog)
  const severity: Severity = notes[0]!.severity
  expect(severity).toBe('info')
  expect(notes[0]!.message).toMatch(/tooly trust/)
})

test('invoke binds arguments the way each tool expects', async () => {
  const profile = await project.detect(repo(FILES), { discovery: 'walk' })
  const all = tasks(await runners.collect(profile))
  const deploy = all.find((t) => t.argv.at(-1) === 'deploy')!
  const test = all.find((t) => t.runner === 'node-scripts' && t.argv.includes('test'))!

  expect(runners.invoke(deploy, ['prod'])).toEqual(['just', 'deploy', 'prod'])
  // npm run reads its own flags up to `--`.
  expect(runners.invoke(test, ['--watch'])).toEqual(['npm', 'run', 'test', '--', '--watch'])

  // Without running just, recipes are scanned from source. Their parameters
  // are unknown, which is not the same as having none.
  const why: ParametersUnknownReason | undefined = deploy.parametersUnknown
  expect([deploy.parameters, why]).toEqual([[], 'exec-withheld'])
  // `paramShape` renders parameters when they are known.
  const params: Param[] = [{ name: 'env', required: true, variadic: false }]
  expect(paramShape(params)).toBe('<env>')
})

test('values by name are bound by each parameter binding', () => {
  // A make target reads `NAME=value` arguments and the environment.
  const assign: ParamBinding = { kind: 'assign' }
  const env: ParamBinding = { kind: 'env', name: 'TOKEN' }
  const deploy: Task = {
    id: 'make:Makefile:deploy',
    runner: 'make',
    path: ['make', '.', 'deploy'],
    argv: ['make', 'deploy'],
    cwd: '.',
    display: 'make deploy',
    parameters: [
      { name: 'ENV', required: true, variadic: false, binding: assign, choices: ['dev', 'prod'] },
      { name: 'token', required: false, variadic: false, binding: env, doc: 'API token' },
    ],
    source: 'Makefile',
    origin: 'declared',
    tags: [],
    persistent: { value: false, declared: false },
    executes: 'local',
  }
  const values: ParamValues = { ENV: 'prod', token: 'abc' }

  const bound: BoundParams = bindParams(deploy.parameters, values)
  expect(bound).toEqual({ positional: [], named: ['ENV=prod'], env: { TOKEN: 'abc' } })

  const run: Invocation = runners.invocation(deploy, values)
  expect(run).toEqual({ argv: ['make', 'deploy', 'ENV=prod'], env: { TOKEN: 'abc' } })
  expect(runners.invoke(deploy, { ENV: 'dev' })).toEqual(['make', 'deploy', 'ENV=dev'])
  expect(() => runners.invoke(deploy, { ENV: 'qa' })).toThrow(/one of dev, prod/)
})

test('search ranks tasks against a query', async () => {
  const profile = await project.detect(repo(FILES), { discovery: 'walk' })
  const catalog = await runners.collect(profile)
  const mode: Mode = 'fuzzy'
  expect(runners.search(catalog, 'dev', mode)[0]?.argv).toEqual(['npm', 'run', 'dev'])

  const words = terms('Build')
  const hit: Hit | null = fuzzy('cargo build', words[0]!)
  expect(hit?.idx.length).toBe(5)
  expect(exact('cargo build', 'carb')).toBeNull()
  const entry: Matchable = { path: ['just', '.', 'build'], display: 'just build', tags: [] }
  const match: EntryMatch | null = matchEntry(entry, words, 'exact')
  expect(match?.score).toBeGreaterThan(0)
})

test('a cache directory you choose keeps results between runs', async () => {
  const root = repo(FILES)
  const cacheDir = realpathSync(mkdtempSync(join(tmpdir(), 'project-cache-')))
  roots.push(cacheDir)
  const profile = await project.detect(root, { discovery: 'walk' })

  const before: CachedCatalog = await runners.readCached(profile, cacheDir)
  expect(before.catalog).toBeNull()

  await runners.collectAndCache(profile, cacheDir)
  const after = await runners.readCached(profile, cacheDir)
  const states: RunnerCacheState[] = after.runners
  expect(states.every((s) => s.state === 'fresh')).toBe(true)
  expect(after.allFresh).toBe(true)

  writeFileSync(join(root, 'justfile'), 'build:\n    make\n')
  const stale = await runners.readCached(profile, cacheDir)
  const reason: StaleReason | undefined = stale.runners.find((s) => s.runner === 'just')?.reason
  expect(reason).toBe('changed')
  expect(humanMs(stale.runners[0]!.estimateMs ?? 0)).toMatch(/ms|s/)
  expect(humanAge(stale.runners[0]!.ageMs)).toMatch(/old$/)
})
