/**
 * A plugin package outside this one builds and passes the contract suite
 * with `@osdlc/workstation-cleaner/plugin` and `@osdlc/workstation-cleaner/testing` alone.
 * The package is made in a temporary folder, where `@osdlc/workstation-cleaner`
 * exports only those entries of src/, built there as dist/ is. The
 * workspace siblings resolve to their own dist/, so run `pnpm build` first, as
 * for the typecheck.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, onTestFinished, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse as parseYaml } from 'yaml'

import { bumpVersion, configProblems, pendingBumps } from '@osdlc/conformance-suites'

import { clean, plan, survey, type RunCtx } from '../src/index.ts'
import * as entry from '../src/plugin.ts'
import { fakeContext, tempHome } from '../src/testing.ts'
import scratch from './fixtures/outside-plugin/plugin.ts'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = join(here, '..')
const require = createRequire(import.meta.url)
const tsc = require.resolve('typescript/bin/tsc')
const guide = readFileSync(join(pkg, 'docs', 'guide', 'writing-a-plugin.md'), 'utf8')

/** Builds src/ into `out` with the package's build config, so the outside package checks this code. */
function build(out: string): void {
  const args = [tsc, '-p', join(pkg, 'tsconfig.build.json'), '--outDir', out]
  const built = spawnSync(process.execPath, args, { cwd: pkg, encoding: 'utf8' })
  if (built.status !== 0) throw new Error(`building src/ failed:\n${built.stdout}${built.stderr}`)
}

const fixtures = Object.fromEntries(
  ['plugin.ts', 'check.ts'].map((f) => [f, join(here, 'fixtures', 'outside-plugin', f)]),
)

interface Outside {
  /** Copied into `src/`, by name there. */
  files?: Record<string, string>
  /** The entries of workstation-cleaner the package sees. */
  entries?: string[]
  /** A folder whose package.json and tsconfig.json the package takes, in place of its own. */
  root?: string
}

/** Limits the workstation-cleaner installed in the package at `dir` to `entries`, where `.` is the main entry. */
function workstationCleanerEntries(dir: string, entries: string[]): void {
  const { exports } = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')) as {
    exports: Record<string, unknown>
  }
  const key = (e: string) => (e === '.' ? '.' : `./${e}`)
  writeFileSync(
    join(dir, 'node_modules', '@osdlc', 'workstation-cleaner', 'package.json'),
    JSON.stringify({
      name: '@osdlc/workstation-cleaner',
      type: 'module',
      exports: Object.fromEntries(entries.map((e) => [key(e), exports[key(e)]])),
    }),
  )
}

/** Makes `dir` a package holding `files` in its `src/`, with workstation-cleaner limited to `entries`. */
function outsidePackage(
  dir: string,
  { files = fixtures, entries = ['plugin', 'testing'], root }: Outside = {},
): void {
  const json = (path: string, value: unknown) =>
    writeFileSync(join(dir, path), `${JSON.stringify(value, null, 2)}\n`)
  if (root === undefined) {
    json('package.json', { name: 'outside-plugin', private: true, type: 'module' })
    json('tsconfig.json', {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        // No skipLibCheck: nothing else checks the emitted declarations, and a
        // type one of them cannot find would be `any` here.
        types: ['node'],
        rootDir: 'src',
        outDir: 'dist',
      },
      include: ['src'],
    })
  } else {
    for (const f of ['package.json', 'tsconfig.json']) copyFileSync(join(root, f), join(dir, f))
  }
  mkdirSync(join(dir, 'src'))
  for (const [f, from] of Object.entries(files)) copyFileSync(from, join(dir, 'src', f))
  const hc = join(dir, 'node_modules', '@osdlc', 'workstation-cleaner')
  mkdirSync(hc, { recursive: true })
  workstationCleanerEntries(dir, entries)
  build(join(hc, 'dist'))
  // The built files find workstation-cleaner's dependencies here.
  symlinkSync(join(pkg, 'node_modules'), join(hc, 'node_modules'), 'dir')
  mkdirSync(join(dir, 'node_modules', '@types'))
  const types = dirname(require.resolve('@types/node/package.json'))
  symlinkSync(types, join(dir, 'node_modules', '@types', 'node'), 'dir')
}

/** Builds the package in `dir` with its own tsconfig. */
const compile = (dir: string) =>
  spawnSync(process.execPath, [tsc, '-p', dir], { cwd: dir, encoding: 'utf8' })

// One package, shared by the tests that use it.
describe('a package outside this one', () => {
  // Made in beforeAll, so a run that skips these tests leaves no folder behind.
  let dir = ''
  let cleanup = () => {}
  beforeAll(() => {
    ;({ home: dir, cleanup } = tempHome('workstation-cleaner-outside-'))
    outsidePackage(dir)
  }, 120_000)
  afterAll(() => cleanup())

  test('builds against ./plugin and ./testing, and its plugin keeps the contract', () => {
    const built = compile(dir)
    expect(built.stdout + built.stderr).toBe('')
    expect(built.status).toBe(0)

    const ran = spawnSync(process.execPath, [join(dir, 'dist', 'check.js')], { encoding: 'utf8' })
    expect(ran.stderr).toBe('')
    const out = JSON.parse(ran.stdout) as {
      ids: string[]
      problems: string[]
      relative: { active: boolean; note: string }
    }
    // build-2 holds no files yet, so it is not idle.
    expect(out.ids).toEqual([expect.stringMatching(/^scratch:.*\/\.scratch\/build-1$/)])
    expect(out.problems).toEqual([])
    expect(out.relative).toEqual({ active: false, note: '~/.scratch is not absolute' })
  }, 60_000)

  test('reaches ./plugin and ./testing, and not the main entry', () => {
    const from = createRequire(join(dir, 'src', 'check.ts'))
    expect(from.resolve('@osdlc/workstation-cleaner/plugin')).toMatch(/dist[/\\]plugin\.js$/)
    expect(from.resolve('@osdlc/workstation-cleaner/testing')).toMatch(/dist[/\\]testing\.js$/)
    expect(() => from.resolve('@osdlc/workstation-cleaner')).toThrow(
      expect.objectContaining({ code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' }),
    )
  })
})

const example = join(pkg, 'examples', 'podman-plugin')

test('the podman example builds against ./plugin alone, and the loader takes it as a package', () => {
  const { home: dir, cleanup } = tempHome('workstation-cleaner-outside-')
  onTestFinished(cleanup)
  outsidePackage(dir, {
    files: { 'index.ts': join(example, 'src', 'index.ts') },
    entries: ['plugin'],
    root: example,
  })
  const built = compile(dir)
  expect(built.stdout + built.stderr).toBe('')
  expect(built.status).toBe(0)
  const exported = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    exports: Record<string, Record<string, string>>
  }
  for (const target of Object.values(exported.exports['.']!)) {
    expect(existsSync(join(dir, target)), target).toBe(true)
  }

  // Installed under its own name, in a folder outside the package so that
  // nothing walking the package meets a cycle, then loaded by the built
  // workstation-cleaner and run through the contract suite on a fake podman.
  const { home: root, cleanup: uninstall } = tempHome('workstation-cleaner-installed-')
  onTestFinished(uninstall)
  symlinkSync(dir, join(root, 'workstation-cleaner-podman'), 'dir')
  const hc = join(dir, 'node_modules', '@osdlc', 'workstation-cleaner')
  const dist = (f: string) => JSON.stringify(pathToFileURL(join(hc, 'dist', f)).href)
  const listed = [{ Name: 'cache', Driver: 'local', CreatedAt: '2026-05-01T09:00:00Z' }]
  const script = `
import { loadPackages, pluginKit } from ${dist('index.js')}
import { contractSuite, fakeRunner } from ${dist('testing.js')}
const { loaded, failed } = await loadPackages([{ name: 'podman', package: 'workstation-cleaner-podman' }], [${JSON.stringify(root)}])
const def = loaded[0]?.definition
const fake = fakeRunner({ podman: (argv) => argv[0] === 'info' ? {} : argv[0] === 'volume' && argv[1] === 'ls' ? { stdout: ${JSON.stringify(JSON.stringify(listed))} } : undefined })
const plugin = def?.create({ settings: def.settings.parse({ package: 'workstation-cleaner-podman' }), env: {}, kit: pluginKit('podman', { ...fake }) })
const problems = plugin === undefined ? [] : await contractSuite(plugin)
const ran = fake.calls.map((c) => c.argv.join(' '))
process.stdout.write(JSON.stringify({ failed, version: loaded[0]?.version, name: plugin?.name, problems, ran }))
`
  const ran = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
  })
  expect(ran.stderr).toBe('')
  const out = JSON.parse(ran.stdout) as { ran: string[] }
  expect(out).toEqual({
    failed: [],
    version: '0.0.0',
    name: 'podman',
    problems: [],
    ran: expect.arrayContaining(['podman info', expect.stringMatching(/^podman volume ls /)]),
  })
  expect(out.ran.filter((c) => c.startsWith('podman volume rm'))).toEqual([])

  // The example's tests, typechecked as the package would: they also reach
  // the main entry and ./testing, which its plugin code does not.
  // workstation-cleaner's own typecheck checks both to this repo's bar.
  workstationCleanerEntries(dir, ['.', 'plugin', 'testing'])
  mkdirSync(join(dir, 'test'))
  copyFileSync(join(example, 'test', 'podman.test.ts'), join(dir, 'test', 'podman.test.ts'))
  const vitest = dirname(require.resolve('vitest/package.json'))
  symlinkSync(vitest, join(dir, 'node_modules', 'vitest'), 'dir')
  writeFileSync(
    join(dir, 'tsconfig.test.json'),
    JSON.stringify({
      extends: './tsconfig.json',
      compilerOptions: { noEmit: true, allowImportingTsExtensions: true, rootDir: '.' },
      include: ['src', 'test'],
    }),
  )
  const checked = spawnSync(process.execPath, [tsc, '-p', join(dir, 'tsconfig.test.json')], {
    cwd: dir,
    encoding: 'utf8',
  })
  expect(checked.stdout + checked.stderr).toBe('')
  expect(checked.status).toBe(0)
}, 120_000)

test("the podman example's and the guide's version ranges are workstation-cleaner's next release, and the rest the workspace catalog's", () => {
  const manifest = JSON.parse(readFileSync(join(example, 'package.json'), 'utf8')) as {
    peerDependencies: Record<string, string>
    devDependencies: Record<string, string>
  }
  const { version } = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')) as {
    version: string
  }
  // The release the pending changesets make, which a copy of the example installs.
  const changesets = join(pkg, '..', '..', '..', '.changeset')
  const config: unknown = JSON.parse(readFileSync(join(changesets, 'config.json'), 'utf8'))
  expect(configProblems(config, existsSync(join(changesets, 'pre.json')))).toEqual([])
  const bumps = pendingBumps(
    readdirSync(changesets)
      .filter((f) => f.endsWith('.md') && f !== 'README.md')
      .map((f): [string, string] => [f, readFileSync(join(changesets, f), 'utf8')]),
  )
  const next = bumpVersion(version, bumps.get('@osdlc/workstation-cleaner') ?? 'none')
  // The minor is kept from 1.0 on too: the example may use what that minor added.
  const range = `^${next.split('.').slice(0, 2).join('.')}.0`
  expect(manifest.peerDependencies['@osdlc/workstation-cleaner']).toBe(range)
  expect(manifest.devDependencies['@osdlc/workstation-cleaner']).toBe(range)
  const readme = readFileSync(join(example, 'README.md'), 'utf8')
  expect(readme).toContain(`\`@osdlc/workstation-cleaner\` \`${range}\``)
  // The guide's package.json, which the example follows.
  expect(guide).toContain(`"peerDependencies": { "@osdlc/workstation-cleaner": "${range}" }`)
  expect(guide).toContain(`"devDependencies": { "@osdlc/workstation-cleaner": "${range}" }`)

  const yaml = readFileSync(join(pkg, '..', '..', '..', 'pnpm-workspace.yaml'), 'utf8')
  const workspace = parseYaml(yaml) as { catalog: Record<string, string> }
  for (const [name, wanted] of Object.entries(manifest.devDependencies)) {
    if (name !== '@osdlc/workstation-cleaner') expect(wanted, name).toBe(workspace.catalog[name])
  }
})

test('./plugin re-exports zod as z, the one the core validates settings with', async () => {
  const { z } = await import('zod')
  expect(entry.z).toBe(z)
  expect(entry.PLUGIN_API).toBe(1)
})

test('./plugin exports what a plugin is written with, and nothing of the run', () => {
  expect(Object.keys(entry).sort()).toEqual([
    'COST_DESCRIPTIONS',
    'CommandFailed',
    'DEFAULT_IDLE_HOURS',
    'FatalRun',
    'HOOKS',
    'LEVELS',
    'MEASURE_BUDGET_MS',
    'PLUGIN_API',
    'RUN_LIMIT_MS',
    'commandHasName',
    'containedIn',
    'coveredBy',
    'definePlugin',
    'idleHoursOr',
    'idleHoursSetting',
    'pluginKit',
    'present',
    'z',
  ])
})

describe("the guide's plugin, its walk out of time in one survey and not the other", () => {
  const DAY_MS = 86_400_000
  let made: ReturnType<typeof tempHome> | undefined
  let home = ''
  let env: ReturnType<typeof tempHome>['env'] = {}
  let path = ''
  let ctx: RunCtx
  beforeAll(() => {
    made = tempHome('workstation-cleaner-scratch-')
    ;({ home, env } = made)
    path = join(home, '.scratch', 'build-1')
    ctx = { cwd: home, targets: [home], allow: [] }
  })
  afterAll(() => made?.cleanup())
  beforeEach(() => {
    mkdirSync(path, { recursive: true })
    writeFileSync(join(path, 'out.bin'), 'x')
    const old = new Date(Date.now() - 2 * DAY_MS)
    utimesSync(join(path, 'out.bin'), old, old)
  })

  /** The plugin, whose folder walks all run out of time when `slow`. */
  const make = (slow: boolean) => {
    let ms = 0
    return scratch.create({
      settings: scratch.settings.parse({}),
      env,
      kit: entry.pluginKit(scratch.name, { env, ...(slow ? { clock: () => (ms += DAY_MS) } : {}) }),
    })
  }
  const allow = ['unmeasured']

  test.each([
    { planned: 'unmeasured', slow: true },
    { planned: 'measured', slow: false },
  ])('is not dropped as changed: $planned when planned', async ({ slow }) => {
    const planned = plan(await survey([make(slow)], ctx), { allow })
    expect(planned.candidates.map((c) => c.unmeasured)).toEqual([slow ? true : undefined])
    const receipt = await clean(planned, [make(!slow)], ctx)
    expect(receipt.dropped).toEqual([])
    expect(receipt.steps).toEqual([
      expect.objectContaining({ id: `scratch:${path}`, result: 'ok' }),
    ])
    expect(existsSync(path)).toBe(false)
  })

  test('is kept when the re-check cannot measure it and that is not allowed', async () => {
    const planned = plan(await survey([make(false)], ctx))
    const receipt = await clean(planned, [make(true)], ctx)
    expect(receipt.dropped).toEqual([expect.objectContaining({ reason: 'not-allowed' })])
    expect(existsSync(path)).toBe(true)
  })

  test('is gone at the re-check once it is no longer idle', async () => {
    const planned = plan(await survey([make(true)], ctx), { allow })
    writeFileSync(join(path, 'out.bin'), 'y')
    const receipt = await clean(planned, [make(false)], ctx)
    expect(receipt.dropped).toEqual([expect.objectContaining({ reason: 'gone' })])
    expect(existsSync(path)).toBe(true)
  })

  test('does not measure a folder the run ignores', async () => {
    // Every measure runs out of time, so a measured folder would be proposed.
    const found = await make(true).discover?.(fakeContext({ cwd: home, ignore: [path] }))
    expect(found).toEqual([])
  })

  // Root reads a folder of mode 000.
  const asRoot = process.getuid?.() === 0
  test.skipIf(asRoot)('keeps the other folders when it cannot read one', async () => {
    const locked = join(home, '.scratch', 'locked')
    mkdirSync(join(locked, 'inside'), { recursive: true })
    chmodSync(locked, 0o000)
    try {
      const found = await make(false).discover?.(fakeContext({ cwd: home }))
      expect(found?.map((c) => c.path)).toEqual([path])
    } finally {
      chmodSync(locked, 0o700)
      rmSync(locked, { recursive: true })
    }
  })

  test('does not run when its folder is a file', async () => {
    const file = join(home, 'a-file')
    writeFileSync(file, 'x')
    const plugin = scratch.create({
      settings: scratch.settings.parse({ dir: file }),
      env,
      kit: entry.pluginKit(scratch.name, { env }),
    })
    expect(await plugin.detect(fakeContext({ cwd: home }))).toBe(false)
  })
})

test("the guide's table names every export of ./plugin", () => {
  const row = guide.split('\n').find((l) => l.startsWith('| `@osdlc/workstation-cleaner/plugin`'))
  const named = new Set(row?.match(/`\w+`/g))
  expect(Object.keys(entry).filter((name) => !named.has(`\`${name}\``))).toEqual([])
})

test("the guide's plugin is the one built above", () => {
  const shown = /```ts\n([\s\S]*?)```/.exec(guide)?.[1]
  const fixture = readFileSync(join(here, 'fixtures', 'outside-plugin', 'plugin.ts'), 'utf8')
  expect(fixture.endsWith(shown ?? '-')).toBe(true)
})
