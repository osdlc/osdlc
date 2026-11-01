/**
 * A checkout whose `node_modules` is incomplete is refused before the
 * hand-off, with the bash launcher's `need_deps` lines, rather than failing
 * later inside the checkout's own code.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { captureIo, type CliContext } from '../../src/index.ts'
import { missingDependency } from '../../src/devlink/deps.ts'
import { devlinkHook } from '../../src/devlink/hook.ts'
import { SPEC, sandbox, seedCheckout, type Sandbox } from './support.ts'

let sb: Sandbox
beforeEach(() => {
  sb = sandbox()
})
afterEach(() => sb.dispose())

function writePackage(dir: string, dependencies: Record<string, string>): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', dependencies }))
}

function installed(dir: string, dep: string): void {
  mkdirSync(join(dir, 'node_modules', dep), { recursive: true })
}

describe('missingDependency', () => {
  test('a checkout with dependencies and no node_modules', () => {
    const co = seedCheckout(join(sb.root, 'co'))
    writePackage(co, { a: '1' })
    expect(missingDependency(co, join(co, 'src/cli.ts'))).toBe('node_modules')
  })

  test('a checkout with no dependencies needs no node_modules, as bun creates none', () => {
    const co = seedCheckout(join(sb.root, 'co'))
    writePackage(co, {})
    expect(missingDependency(co, join(co, 'src/cli.ts'))).toBeNull()
  })

  test('names the first dependency with no node_modules entry', () => {
    const co = seedCheckout(join(sb.root, 'co'))
    writePackage(co, { a: '1', '@s/b': '1' })
    installed(co, 'a')
    expect(missingDependency(co, join(co, 'src/cli.ts'))).toBe('@s/b')
    installed(co, '@s/b')
    expect(missingDependency(co, join(co, 'src/cli.ts'))).toBeNull()
  })

  test("reads every package.json from the entry's directory up to the checkout", () => {
    const co = seedCheckout(join(sb.root, 'co'))
    const pkg = join(co, 'packages', 'tool')
    writePackage(co, {})
    writePackage(pkg, { inner: '1' })
    installed(co, 'other')
    // A workspace package's dependency may be hoisted to the checkout root.
    expect(missingDependency(co, join(pkg, 'src', 'cli.ts'))).toBe('inner')
    installed(co, 'inner')
    expect(missingDependency(co, join(pkg, 'src', 'cli.ts'))).toBeNull()
  })

  test('does not look above the checkout', () => {
    installed(sb.root, 'a')
    const co = seedCheckout(join(sb.root, 'co'))
    writePackage(co, { a: '1' })
    mkdirSync(join(co, 'node_modules'))
    expect(missingDependency(co, join(co, 'src/cli.ts'))).toBe('a')
  })

  test('a checkout with no package.json needs nothing', () => {
    const co = seedCheckout(join(sb.root, 'co'))
    expect(missingDependency(co, join(co, 'src/cli.ts'))).toBeNull()
  })
})

describe('devlinkHook refuses a checkout without its dependencies', () => {
  function runHook(env: Record<string, string>) {
    const calls: string[] = []
    const hook = devlinkHook(SPEC, {
      script: join(sb.root, 'elsewhere', 'tooly.js'),
      execve: (file) => calls.push(file),
    })
    const io = captureIo()
    const ctx: CliContext = { io, cwd: sb.root, env: { HOME: sb.home, ...env } }
    return { code: hook([], ctx), calls, err: io.err }
  }

  test('no node_modules: exit 1 and no hand-off', () => {
    const co = seedCheckout(join(sb.root, 'co'))
    writePackage(co, { a: '1' })
    const r = runHook({ TOOLY_HOME: co })
    expect(r.code).toBe(1)
    expect(r.calls).toEqual([])
    expect(r.err).toBe(`tooly: ${co} has no node_modules. Run 'bun install' there.\n`)
  })

  test('a missing package: exit 1, named', () => {
    const co = seedCheckout(join(sb.root, 'co'))
    writePackage(co, { a: '1' })
    mkdirSync(join(co, 'node_modules'))
    const r = runHook({ TOOLY_HOME: co, TOOLY_QUIET: '1' })
    expect(r.code).toBe(1)
    expect(r.err).toBe(`tooly: ${co} is missing package 'a'. Run 'bun install' there.\n`)
  })

  test('a complete checkout hands off', () => {
    const co = seedCheckout(join(sb.root, 'co'))
    writePackage(co, { a: '1' })
    installed(co, 'a')
    const bin = join(sb.root, 'path-bin')
    mkdirSync(bin)
    writeFileSync(join(bin, 'bun'), '#!/bin/sh\n', { mode: 0o755 })
    const r = runHook({ TOOLY_HOME: co, TOOLY_QUIET: '1', PATH: bin })
    expect(r.code).toBe(0)
    expect(r.calls).toEqual([join(bin, 'bun')])
  })
})
