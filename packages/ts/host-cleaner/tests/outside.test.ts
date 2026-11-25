/**
 * A plugin package outside this one builds and passes the contract suite
 * with `@osdlc/host-cleaner/plugin` and `@osdlc/host-cleaner/testing` alone.
 * The package is made in a temporary folder, where `@osdlc/host-cleaner`
 * exports only those two entries of src/, built there as dist/ is. The
 * workspace siblings resolve to their own dist/, so run `pnpm build` first, as
 * for the typecheck.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { clean, plan, survey, type RunCtx } from '../src/index.ts'
import * as entry from '../src/plugin.ts'
import { tempHome } from '../src/testing.ts'
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

/** Makes `dir` a package holding the fixture plugin, with host-cleaner limited to the two entries. */
function outsidePackage(dir: string): void {
  const json = (path: string, value: unknown) =>
    writeFileSync(join(dir, path), `${JSON.stringify(value, null, 2)}\n`)
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
  mkdirSync(join(dir, 'src'))
  for (const f of ['plugin.ts', 'check.ts']) {
    copyFileSync(join(here, 'fixtures', 'outside-plugin', f), join(dir, 'src', f))
  }
  const hc = join(dir, 'node_modules', '@osdlc', 'host-cleaner')
  mkdirSync(hc, { recursive: true })
  const { exports } = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')) as {
    exports: Record<string, unknown>
  }
  writeFileSync(
    join(hc, 'package.json'),
    JSON.stringify({
      name: '@osdlc/host-cleaner',
      type: 'module',
      exports: { './plugin': exports['./plugin'], './testing': exports['./testing'] },
    }),
  )
  build(join(hc, 'dist'))
  // The built files find host-cleaner's dependencies here.
  symlinkSync(join(pkg, 'node_modules'), join(hc, 'node_modules'), 'dir')
  mkdirSync(join(dir, 'node_modules', '@types'))
  const types = dirname(require.resolve('@types/node/package.json'))
  symlinkSync(types, join(dir, 'node_modules', '@types', 'node'), 'dir')
}

// One package, shared by the tests that use it.
describe('a package outside this one', () => {
  const { home: dir, cleanup } = tempHome('host-cleaner-outside-')
  beforeAll(() => outsidePackage(dir), 120_000)
  afterAll(cleanup)

  test('builds against ./plugin and ./testing, and its plugin keeps the contract', () => {
    const built = spawnSync(process.execPath, [tsc, '-p', dir], { cwd: dir, encoding: 'utf8' })
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
    expect(from.resolve('@osdlc/host-cleaner/plugin')).toMatch(/dist[/\\]plugin\.js$/)
    expect(from.resolve('@osdlc/host-cleaner/testing')).toMatch(/dist[/\\]testing\.js$/)
    expect(() => from.resolve('@osdlc/host-cleaner')).toThrow(
      expect.objectContaining({ code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' }),
    )
  })
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
  const { home, env, cleanup } = tempHome('host-cleaner-scratch-')
  afterAll(cleanup)
  const path = join(home, '.scratch', 'build-1')
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
  const ctx: RunCtx = { cwd: home, targets: [home], allow: [] }
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
})

test("the guide's table names every export of ./plugin", () => {
  const row = guide.split('\n').find((l) => l.startsWith('| `@osdlc/host-cleaner/plugin`'))
  const named = new Set(row?.match(/`\w+`/g))
  expect(Object.keys(entry).filter((name) => !named.has(`\`${name}\``))).toEqual([])
})

test("the guide's plugin is the one built above", () => {
  const shown = /```ts\n([\s\S]*?)```/.exec(guide)?.[1]
  const fixture = readFileSync(join(here, 'fixtures', 'outside-plugin', 'plugin.ts'), 'utf8')
  expect(fixture.endsWith(shown ?? '-')).toBe(true)
})
