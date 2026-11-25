/**
 * A plugin package outside this one builds and passes the contract suite
 * with `@osdlc/host-cleaner/plugin` and `@osdlc/host-cleaner/testing` alone.
 * The package is made in a temporary folder, where `@osdlc/host-cleaner`
 * exports only those two entries of src/ as built here, into a folder of
 * this test's own. The workspace siblings resolve to their built dist/, so
 * run `pnpm build` first, as for the typecheck.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as entry from '../src/plugin.ts'
import { tempHome, type TempHome } from '../src/testing.ts'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = join(here, '..')
const require = createRequire(import.meta.url)
const tsc = require.resolve('typescript/bin/tsc')

/** Builds src/ as the published dist/ is built, into `out`, so the package checks this code. */
function build(out: string): void {
  const built = spawnSync(
    process.execPath,
    [tsc, '-p', join(pkg, 'tsconfig.build.json'), '--outDir', out],
    { cwd: pkg, encoding: 'utf8' },
  )
  if (built.status !== 0) throw new Error(`building src/ failed:\n${built.stdout}${built.stderr}`)
}

/** A package holding the fixture plugin, with host-cleaner limited to the two entries. */
function outsidePackage(): TempHome {
  // Inside this package's node_modules, so the built files find its dependencies.
  const dist = join(pkg, 'node_modules', '.outside-dist')
  rmSync(dist, { recursive: true, force: true })
  build(dist)
  const outside = tempHome('host-cleaner-outside-')
  const dir = outside.home
  const json = (path: string, value: unknown) =>
    writeFileSync(join(dir, path), `${JSON.stringify(value, null, 2)}\n`)
  json('package.json', { name: 'outside-plugin', private: true, type: 'module' })
  json('tsconfig.json', {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      // The libraries' declarations are checked where they are built.
      skipLibCheck: true,
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
  symlinkSync(dist, join(hc, 'dist'), 'dir')
  mkdirSync(join(dir, 'node_modules', '@types'))
  const types = dirname(require.resolve('@types/node/package.json'))
  symlinkSync(types, join(dir, 'node_modules', '@types', 'node'), 'dir')
  return outside
}

// One package, shared by the tests that use it.
describe('a package outside this one', () => {
  let dir = ''
  let cleanup = (): void => {}
  beforeAll(() => {
    ;({ home: dir, cleanup } = outsidePackage())
  }, 120_000)
  afterAll(() => cleanup())

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

test("the guide's plugin is the one built above", () => {
  const guide = readFileSync(join(pkg, 'docs', 'guide', 'writing-a-plugin.md'), 'utf8')
  const shown = /```ts\n([\s\S]*?)```/.exec(guide)?.[1]
  const fixture = readFileSync(join(here, 'fixtures', 'outside-plugin', 'plugin.ts'), 'utf8')
  expect(fixture.endsWith(shown ?? '-')).toBe(true)
})
