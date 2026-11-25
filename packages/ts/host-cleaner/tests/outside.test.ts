/**
 * A plugin package outside this one builds and passes the contract suite
 * with `@osdlc/host-cleaner/plugin` and `@osdlc/host-cleaner/testing` alone.
 * The package is made in a temporary folder, where `@osdlc/host-cleaner`
 * exports only those entries of the built dist/, so run `pnpm build`
 * first, as for the typecheck.
 */
import { afterAll, beforeAll, describe, expect, onTestFinished, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import * as entry from '../src/plugin.ts'
import { tempHome, type TempHome } from '../src/testing.ts'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = join(here, '..')
const require = createRequire(import.meta.url)
const tsc = require.resolve('typescript/bin/tsc')

const newestMs = (folder: string): number =>
  Math.max(
    0,
    ...readdirSync(folder, { recursive: true, encoding: 'utf8' }).map(
      (f) => statSync(join(folder, f)).mtimeMs,
    ),
  )

/** Throws unless dist/ was built after the last change to src/, so the package checks this code. */
function assertBuilt(): void {
  const dist = join(pkg, 'dist')
  if (!existsSync(join(dist, 'plugin.d.ts'))) {
    throw new Error('dist/ has no plugin entry: run `pnpm build` before these tests')
  }
  if (newestMs(join(pkg, 'src')) > newestMs(dist)) {
    throw new Error('src/ changed after the last build: run `pnpm build` before these tests')
  }
}

const fixtures = Object.fromEntries(
  ['plugin.ts', 'check.ts'].map((f) => [f, join(here, 'fixtures', 'outside-plugin', f)]),
)

interface Outside {
  /** Copied into `src/`, by name there. */
  files?: Record<string, string>
  /** The entries of host-cleaner the package sees. */
  entries?: string[]
  /** A folder whose package.json and tsconfig.json the package takes, in place of its own. */
  root?: string
}

/** A package holding `files` in its `src/`, with host-cleaner limited to `entries`. */
function outsidePackage({
  files = fixtures,
  entries = ['plugin', 'testing'],
  root,
}: Outside = {}): TempHome {
  assertBuilt()
  const outside = tempHome('host-cleaner-outside-')
  const dir = outside.home
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
      exports: Object.fromEntries(entries.map((e) => [`./${e}`, exports[`./${e}`]])),
    }),
  )
  symlinkSync(join(pkg, 'dist'), join(hc, 'dist'), 'dir')
  mkdirSync(join(dir, 'node_modules', '@types'))
  const types = dirname(require.resolve('@types/node/package.json'))
  symlinkSync(types, join(dir, 'node_modules', '@types', 'node'), 'dir')
  return outside
}

const build = (dir: string) =>
  spawnSync(process.execPath, [tsc, '-p', dir], { cwd: dir, encoding: 'utf8' })

// One package, shared by the tests that use it; only they need a fresh dist/.
describe('a package outside this one', () => {
  let dir = ''
  let cleanup = (): void => {}
  beforeAll(() => {
    ;({ home: dir, cleanup } = outsidePackage())
  }, 60_000)
  afterAll(() => cleanup())

  test('builds against ./plugin and ./testing, and its plugin keeps the contract', () => {
    const built = build(dir)
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

test('the podman example builds against ./plugin alone, and the loader takes it as a package', () => {
  const example = join(pkg, 'examples', 'podman-plugin')
  const { home: dir, cleanup } = outsidePackage({
    files: { 'index.ts': join(example, 'src', 'index.ts') },
    entries: ['plugin'],
    root: example,
  })
  onTestFinished(cleanup)
  const built = build(dir)
  expect(built.stdout + built.stderr).toBe('')
  expect(built.status).toBe(0)
  const exported = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    exports: Record<string, Record<string, string>>
  }
  for (const target of Object.values(exported.exports['.']!)) {
    expect(existsSync(join(dir, target)), target).toBe(true)
  }

  // Installed under its own name, then loaded and created by the built host-cleaner.
  const root = join(dir, 'installed')
  mkdirSync(root)
  symlinkSync(dir, join(root, 'host-cleaner-podman'), 'dir')
  const script = `
import { loadPackages, pluginKit } from ${JSON.stringify(pathToFileURL(join(pkg, 'dist', 'index.js')).href)}
const { loaded, failed } = await loadPackages([{ name: 'podman', package: 'host-cleaner-podman' }], [${JSON.stringify(root)}])
const def = loaded[0]?.definition
const plugin = def?.create({ settings: def.settings.parse({}), env: {}, kit: pluginKit('podman') })
process.stdout.write(JSON.stringify({ failed, version: loaded[0]?.version, name: plugin?.name }))
`
  const ran = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
  })
  expect(ran.stderr).toBe('')
  expect(JSON.parse(ran.stdout)).toEqual({ failed: [], version: '0.0.0', name: 'podman' })
}, 60_000)

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
    'definePlugin',
    'idleHoursSetting',
    'pluginKit',
    'z',
  ])
})

test("the guide's plugin is the one built above", () => {
  const guide = readFileSync(join(pkg, 'docs', 'guide', 'writing-a-plugin.md'), 'utf8')
  const shown = /```ts\n([\s\S]*?)```/.exec(guide)?.[1]
  const fixture = readFileSync(join(here, 'fixtures', 'outside-plugin', 'plugin.ts'), 'utf8')
  expect(fixture.endsWith(shown ?? '-')).toBe(true)
})
