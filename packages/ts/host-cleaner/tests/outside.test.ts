/**
 * A plugin package outside this one builds and passes the contract suite
 * with `@osdlc/host-cleaner/plugin` and `@osdlc/host-cleaner/testing` alone.
 * The package is made in a temporary folder, where `@osdlc/host-cleaner`
 * exports only those two entries of the built dist/, so run `pnpm build`
 * first, as for the typecheck.
 */
import { afterEach, expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import * as entry from '../src/plugin.ts'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = join(here, '..')
const require = createRequire(import.meta.url)
const tsc = require.resolve('typescript/bin/tsc')

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

const fixtures = Object.fromEntries(
  ['plugin.ts', 'check.ts'].map((f) => [f, join(here, 'fixtures', 'outside-plugin', f)]),
)

/**
 * A package holding `files` in its `src/` (the fixture plugin by default),
 * with host-cleaner limited to the two entries.
 */
function outsidePackage(files: Record<string, string> = fixtures): string {
  const dir = mkdtempSync(join(tmpdir(), 'host-cleaner-outside-'))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  const json = (path: string, value: unknown) =>
    writeFileSync(join(dir, path), `${JSON.stringify(value, null, 2)}\n`)
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
  mkdirSync(join(dir, 'src'))
  for (const [f, from] of Object.entries(files)) copyFileSync(from, join(dir, 'src', f))
  const hc = join(dir, 'node_modules', '@osdlc', 'host-cleaner')
  mkdirSync(hc, { recursive: true })
  const entryOf = (name: string) => ({
    types: `./dist/${name}.d.ts`,
    default: `./dist/${name}.js`,
  })
  writeFileSync(
    join(hc, 'package.json'),
    JSON.stringify({
      name: '@osdlc/host-cleaner',
      type: 'module',
      exports: { './plugin': entryOf('plugin'), './testing': entryOf('testing') },
    }),
  )
  symlinkSync(join(pkg, 'dist'), join(hc, 'dist'), 'dir')
  mkdirSync(join(dir, 'node_modules', '@types'))
  const types = dirname(require.resolve('@types/node/package.json'))
  symlinkSync(types, join(dir, 'node_modules', '@types', 'node'), 'dir')
  return dir
}

const build = (dir: string) =>
  spawnSync(process.execPath, [tsc, '-p', dir], { cwd: dir, encoding: 'utf8' })

test('an outside package builds against ./plugin and ./testing, and its plugin keeps the contract', () => {
  const dir = outsidePackage()
  const built = build(dir)
  expect(built.stdout + built.stderr).toBe('')
  expect(built.status).toBe(0)

  const ran = spawnSync(process.execPath, [join(dir, 'dist', 'check.js')], { encoding: 'utf8' })
  expect(ran.stderr).toBe('')
  const out = JSON.parse(ran.stdout) as { ids: string[]; problems: string[] }
  expect(out.ids).toEqual([expect.stringMatching(/^scratch:.*\/\.scratch\/build-1$/)])
  expect(out.problems).toEqual([])
}, 60_000)

test('the podman example builds against ./plugin alone, and the loader takes it as a package', () => {
  const example = join(pkg, 'examples', 'podman-plugin')
  const dir = outsidePackage({ 'index.ts': join(example, 'src', 'index.ts') })
  for (const f of ['package.json', 'tsconfig.json']) {
    copyFileSync(join(example, f), join(dir, f))
  }
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

test('the same package cannot reach the main entry', () => {
  const dir = outsidePackage()
  writeFileSync(join(dir, 'src', 'main.ts'), "export { survey } from '@osdlc/host-cleaner'\n")
  const built = build(dir)
  expect(built.status).not.toBe(0)
  expect(built.stdout).toContain("Cannot find module '@osdlc/host-cleaner'")
}, 60_000)

test('./plugin re-exports zod as z, the one the core validates settings with', async () => {
  const { z } = await import('zod')
  expect(entry.z).toBe(z)
  expect(entry.PLUGIN_API).toBe(1)
})

test('./plugin exports what a plugin is written with, and nothing of the run', () => {
  expect(Object.keys(entry).sort()).toEqual([
    'COST_DESCRIPTIONS',
    'DEFAULT_IDLE_HOURS',
    'FatalRun',
    'HOOKS',
    'LEVELS',
    'MEASURE_BUDGET_MS',
    'PLUGIN_API',
    'RUN_LIMIT_MS',
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
