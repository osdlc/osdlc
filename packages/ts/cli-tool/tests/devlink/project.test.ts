/**
 * The project layer: a copy of the tool's package installed in a project's
 * `node_modules` above the cwd runs instead of this one, as `npx` would.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { captureIo, type CliContext } from '../../src/index.ts'
import { execSelection } from '../../src/devlink/exec.ts'
import { devlinkHook } from '../../src/devlink/hook.ts'
import { binRuntime, projectBin, projectInstall, resolve } from '../../src/devlink/resolve.ts'
import type { Selected } from '../../src/devlink/resolve.ts'
import type { ToolSpec } from '../../src/devlink/spec.ts'
import { writeActive } from '../../src/devlink/state.ts'
import { SPEC, sandbox, seedCheckout, type Sandbox } from './support.ts'

const PKG = '@acme/tooly'
const PSPEC: ToolSpec = { ...SPEC, packageName: PKG }

let sb: Sandbox
beforeEach(() => {
  sb = sandbox()
})
afterEach(() => sb.dispose())

/** A project at `root/<name>` with `PKG` installed, its bin printing argv and the layer. */
function project(
  name = 'proj',
  pkg: Record<string, unknown> = {},
): { root: string; install: string; bin: string } {
  const root = join(sb.root, name)
  const install = join(root, 'node_modules', '@acme', 'tooly')
  mkdirSync(join(install, 'bin'), { recursive: true })
  const bin = join(install, 'bin', 'tooly.js')
  writeFileSync(
    bin,
    '#!/usr/bin/env node\n' +
      'console.log(JSON.stringify({ argv: process.argv.slice(2), layer: process.env.TOOLY_LAUNCH_LAYER ?? null }))\n' +
      'process.exitCode = 5\n',
  )
  writeFileSync(
    join(install, 'package.json'),
    JSON.stringify({ name: PKG, version: '2.0.0', bin: { tooly: 'bin/tooly.js' }, ...pkg }),
  )
  return { root, install, bin }
}

/** A checkout the spec with `packageName` accepts. */
function checkout(dir: string): string {
  seedCheckout(dir)
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: PKG, version: '1.0.0' }))
  return dir
}

const opts = (extra: Record<string, unknown> = {}) => ({
  dirs: sb.dirs,
  env: {} as Record<string, string | undefined>,
  cwd: sb.root,
  ...extra,
})

describe('projectInstall / projectBin', () => {
  test('finds the nearest node_modules copy with the right name, walking up', () => {
    const p = project()
    const deep = join(p.root, 'a', 'b')
    mkdirSync(deep, { recursive: true })
    expect(projectInstall(PSPEC, deep)).toBe(p.install)
    expect(projectInstall(PSPEC, sb.root)).toBeNull()
    expect(projectInstall(SPEC, deep)).toBeNull() // no packageName, nothing to look for
  })

  test('a package.json with another name is not the package', () => {
    const p = project('proj', { name: '@other/tooly' })
    expect(projectInstall(PSPEC, p.root)).toBeNull()
  })

  test('the bin is bin[name] or a string bin, and never outside the package', () => {
    expect(projectBin(PSPEC, project().install)).toBe(project().bin)
    expect(projectBin(PSPEC, project('s', { bin: 'bin/tooly.js' }).install)).toBe(
      project('s', { bin: 'bin/tooly.js' }).bin,
    )
    expect(projectBin(PSPEC, project('o', { bin: { other: 'bin/tooly.js' } }).install)).toBeNull()
    expect(projectBin(PSPEC, project('e', { bin: { tooly: '../../evil.js' } }).install)).toBeNull()
    expect(projectBin(PSPEC, project('d', { bin: { tooly: '.' } }).install)).toBeNull()
  })

  test('binRuntime reads the #! line', () => {
    const p = project()
    expect(binRuntime(p.bin)).toBe('node')
    writeFileSync(p.bin, '#!/usr/bin/env bun\n')
    expect(binRuntime(p.bin)).toBe('bun')
    expect(binRuntime(join(sb.root, 'missing.js'))).toBe('node')
  })
})

describe('resolve: the project layer', () => {
  test('a project copy is selected when nothing above it matches', () => {
    const p = project()
    const sel = resolve(PSPEC, opts({ cwd: p.root })) as Selected
    expect(sel).toMatchObject({
      source: 'project',
      checkout: p.install,
      entry: p.bin,
      runtime: 'node',
      version: '2.0.0',
    })
    expect(sel.reason).toBe(`project install at ${p.install}`)
  })

  test('env, cwd and link all win over the project copy', () => {
    const p = project()
    const a = checkout(join(sb.root, 'a'))
    expect(resolve(PSPEC, opts({ cwd: p.root, env: { TOOLY_HOME: a } })).source).toBe('env')
    writeActive(PSPEC, a, { dirs: sb.dirs })
    expect(resolve(PSPEC, opts({ cwd: p.root })).source).toBe('link')
    const inner = checkout(join(p.root, 'inner'))
    expect(resolve(PSPEC, opts({ cwd: inner })).source).toBe('cwd')
  })

  test('off with projectLayer: false, <NAME>_PROJECT=0, a suppressor, or no packageName', () => {
    const p = project()
    const local = (spec: ToolSpec, env: Record<string, string> = {}) =>
      resolve(spec, opts({ cwd: p.root, env })).source
    expect(local({ ...PSPEC, projectLayer: false })).toBe('local')
    expect(local(PSPEC, { TOOLY_PROJECT: '0' })).toBe('local')
    expect(local(PSPEC, { TOOLY_HARNESS: '1' })).toBe('local')
    expect(local(SPEC)).toBe('local')
    expect(local(PSPEC, { TOOLY_PROJECT: '1' })).toBe('project')
  })

  test('the copy that is running is local, also through a workspace symlink to its checkout', () => {
    const p = project()
    const sel = resolve(PSPEC, opts({ cwd: p.root, selfInstall: p.install }))
    expect(sel).toMatchObject({ source: 'local', reason: 'project install: this install' })

    const ck = checkout(join(sb.root, 'ck'))
    writeFileSync(join(ck, 'package.json'), JSON.stringify({ name: PKG, bin: 'src/cli.ts' }))
    const ws = join(sb.root, 'ws')
    mkdirSync(join(ws, 'node_modules', '@acme'), { recursive: true })
    symlinkSync(ck, join(ws, 'node_modules', '@acme', 'tooly'), 'dir')
    expect(resolve(PSPEC, opts({ cwd: ws, self: ck })).source).toBe('local')
    expect(resolve(PSPEC, opts({ cwd: ws })).source).toBe('project')
  })

  test('a copy without the tool in its bin is skipped', () => {
    const p = project('proj', { bin: { other: 'bin/tooly.js' } })
    expect(resolve(PSPEC, opts({ cwd: p.root })).source).toBe('local')
  })
})

describe('execSelection: a project copy', () => {
  const run = (version: string | null, env: Record<string, string> = {}) => {
    const p = project()
    const sel = resolve(PSPEC, opts({ cwd: p.root })) as Selected
    const lines: string[] = []
    const out = join(sb.root, 'out.json')
    // `node` is this test's own binary; the bin's output goes to a file, not the test's stdout.
    writeFileSync(
      p.bin,
      `require('fs').writeFileSync(${JSON.stringify(out)}, JSON.stringify({ argv: process.argv.slice(2), layer: process.env.TOOLY_LAUNCH_LAYER ?? null })); process.exitCode = 5\n`,
    )
    const code = execSelection(PSPEC, sel, ['a', 'b c'], {
      env,
      version,
      node: process.execPath,
      announce: (line) => lines.push(line),
    })
    return { code, lines, ran: JSON.parse(readFileSync(out, 'utf-8')) as unknown, p }
  }

  test('runs the bin under node by its path, with the args, the layer and its exit code', () => {
    const { code, ran } = run('2.0.0')
    expect(code).toBe(5)
    expect(ran).toEqual({ argv: ['a', 'b c'], layer: 'project' })
  })

  test('says nothing when the versions match; names both when they differ', () => {
    expect(run('2.0.0').lines).toEqual([])
    const { lines, p } = run('1.0.0')
    expect(lines).toEqual([
      `tooly: running ${p.bin} (project install at ${p.install}, 2.0.0; this install is 1.0.0)`,
    ])
    expect(run(null).lines[0]).toContain('this install is unknown')
    expect(run('1.0.0', { TOOLY_QUIET: '1' }).lines).toEqual([])
  })

  test('a node that cannot start returns 1 and names the off switch', () => {
    const p = project()
    const sel = resolve(PSPEC, opts({ cwd: p.root })) as Selected
    const lines: string[] = []
    const code = execSelection(PSPEC, sel, [], {
      env: { TOOLY_QUIET: '1' },
      node: join(sb.root, 'no-such-node'),
      announce: (line) => lines.push(line),
    })
    expect(code).toBe(1)
    expect(lines[0]).toContain('TOOLY_PROJECT=0')
  })
})

describe('devlinkHook: the project layer', () => {
  function ctx(cwd: string, env: Record<string, string | undefined>, io = captureIo()): CliContext {
    return { io, env, cwd } as unknown as CliContext
  }

  test('a process the project layer started runs its own code and says so for --where', () => {
    const p = project()
    const hook = devlinkHook(PSPEC, { script: p.bin })
    const env: Record<string, string | undefined> = { TOOLY_LAUNCH_LAYER: 'project' }
    expect(hook([], ctx(p.root, env))).toBeNull()
    expect(env['TOOLY_LAUNCH_LAYER']).toBeUndefined()
    expect(hook.describe?.()).toMatchObject({
      layer: 'project',
      text: `project install (${p.install})`,
    })
  })

  test('a project copy started without the env guard (an older release) still stops: the path check finds itself', () => {
    const p = project()
    const hook = devlinkHook(PSPEC, { script: p.bin })
    expect(hook([], ctx(p.root, {}))).toBeNull()
    expect(hook.describe?.()).toMatchObject({ layer: 'self' })
  })

  test('a project that declares the package but has not installed it gets one hint, unless quiet', () => {
    const root = join(sb.root, 'fresh')
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'package.json'), JSON.stringify({ devDependencies: { [PKG]: '^2' } }))
    const hook = devlinkHook(PSPEC, { script: join(sb.root, 'elsewhere', 'tooly.js') })
    const io = captureIo()
    expect(hook([], ctx(root, {}, io))).toBeNull()
    expect(io.err).toBe(
      `tooly: this project depends on ${PKG} but it is not installed; running the global copy. ` +
        "Run your package manager's install.\n",
    )
    const quiet = captureIo()
    expect(hook([], ctx(root, { TOOLY_QUIET: '1' }, quiet))).toBeNull()
    expect(quiet.err).toBe('')
  })

  // `dev` is not available on Windows.
  test.skipIf(process.platform === 'win32')(
    'dev subcommands never hand off to the project copy',
    () => {
      const p = project()
      const io = captureIo()
      const hook = devlinkHook(PSPEC, { script: join(sb.root, 'elsewhere', 'tooly.js') })
      const code = hook(['dev', 'status'], ctx(p.root, { HOME: sb.home }, io))
      expect(code).toBe(0)
      expect(io.out).toContain(`project:  ${p.install}`)
    },
  )
})
