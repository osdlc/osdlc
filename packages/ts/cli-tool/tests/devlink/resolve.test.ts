import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { cwdCheckout, isCheckout, resolve } from '../../src/devlink/resolve.ts'
import { writeActive } from '../../src/devlink/state.ts'
import type { ToolSpec } from '../../src/devlink/spec.ts'
import { SPEC, sandbox, seedCheckout, type Sandbox } from './support.ts'

let sb: Sandbox
beforeEach(() => {
  sb = sandbox()
})
afterEach(() => sb.dispose())

const opts = (extra: Record<string, unknown> = {}) => ({
  dirs: sb.dirs,
  env: {} as Record<string, string | undefined>,
  cwd: sb.root,
  ...extra,
})

describe('isCheckout / cwdCheckout', () => {
  test('a directory with the marker is a checkout; its parents are not', () => {
    const ck = seedCheckout(join(sb.root, 'ck'))
    expect(isCheckout(SPEC, ck)).toBe(true)
    expect(isCheckout(SPEC, sb.root)).toBe(false)
    const deep = join(ck, 'a', 'b')
    mkdirSync(deep, { recursive: true })
    expect(cwdCheckout(SPEC, deep)).toBe(ck)
    expect(cwdCheckout(SPEC, sb.root)).toBeNull()
  })
})

describe('resolve', () => {
  test('nothing set → local', () => {
    const sel = resolve(SPEC, opts())
    expect(sel.source).toBe('local')
  })

  test('env wins over everything, and applies under a suppressor', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    writeActive(SPEC, b, { dirs: sb.dirs })
    const sel = resolve(SPEC, opts({ env: { TOOLY_HOME: a, TOOLY_HARNESS: '1' }, cwd: b }))
    expect(sel.source).toBe('env')
    expect(sel.checkout).toBe(a)
    expect(sel.entry).toBe(join(a, 'src', 'cli.ts'))
  })

  test('cwd beats link', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    writeActive(SPEC, b, { dirs: sb.dirs })
    const sel = resolve(SPEC, opts({ cwd: join(a, 'src') }))
    expect(sel.source).toBe('cwd')
    expect(sel.checkout).toBe(a)
  })

  test('link applies when the cwd is elsewhere', () => {
    const b = seedCheckout(join(sb.root, 'b'))
    writeActive(SPEC, b, { dirs: sb.dirs })
    const sel = resolve(SPEC, opts())
    expect(sel.source).toBe('link')
    expect(sel.checkout).toBe(b)
  })

  test('a suppressor turns off cwd and link', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    writeActive(SPEC, a, { dirs: sb.dirs })
    const sel = resolve(SPEC, opts({ env: { TOOLY_HARNESS: '' }, cwd: a }))
    expect(sel.source).toBe('local')
  })

  test('<NAME>_CWD_DEV=0 turns off only the cwd layer', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    writeActive(SPEC, b, { dirs: sb.dirs })
    const sel = resolve(SPEC, opts({ env: { TOOLY_CWD_DEV: '0' }, cwd: a }))
    expect(sel.source).toBe('link')
    expect(sel.checkout).toBe(b)
  })

  test('a layer naming an invalid checkout is skipped, not fatal', () => {
    const b = seedCheckout(join(sb.root, 'b'))
    writeActive(SPEC, b, { dirs: sb.dirs })
    const sel = resolve(SPEC, opts({ env: { TOOLY_HOME: join(sb.root, 'gone') } }))
    expect(sel.source).toBe('link')
  })

  test('a layer naming self is the local no-op', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    writeActive(SPEC, a, { dirs: sb.dirs })
    const sel = resolve(SPEC, opts({ self: a }))
    expect(sel.source).toBe('local')
    expect(sel.reason).toContain('this checkout')
  })
})

describe('cwdLayer', () => {
  // SPEC with `cwdLayer` left unset, the default.
  const { cwdLayer: _on, ...OFF } = SPEC

  test('the cwd layer is off unless the spec turns it on', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const deep = join(a, 'src')
    expect(resolve(OFF, opts({ cwd: deep })).source).toBe('local')
    expect(resolve(SPEC, opts({ cwd: deep })).source).toBe('cwd')
  })

  test('with the cwd layer off, a link still applies from inside another checkout', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    writeActive(OFF, b, { dirs: sb.dirs })
    const sel = resolve(OFF, opts({ cwd: a }))
    expect(sel.source).toBe('link')
    expect(sel.checkout).toBe(b)
  })
})

describe('packageName', () => {
  const NAMED: ToolSpec = { ...SPEC, packageName: '@example/tooly' }
  const withName = (dir: string, name: string | null): string => {
    seedCheckout(dir)
    if (name !== null) writeFileSync(join(dir, 'package.json'), JSON.stringify({ name }))
    return dir
  }

  test('a checkout needs the marker and the package name', () => {
    expect(isCheckout(NAMED, withName(join(sb.root, 'right'), '@example/tooly'))).toBe(true)
    expect(isCheckout(NAMED, withName(join(sb.root, 'wrong'), 'other'))).toBe(false)
    expect(isCheckout(NAMED, withName(join(sb.root, 'none'), null))).toBe(false)
    const bad = withName(join(sb.root, 'bad'), null)
    writeFileSync(join(bad, 'package.json'), '{ not json')
    expect(isCheckout(NAMED, bad)).toBe(false)
  })

  test('env and link naming a checkout with another package name are skipped', () => {
    const other = withName(join(sb.root, 'other'), 'other')
    writeActive(NAMED, other, { dirs: sb.dirs })
    expect(resolve(NAMED, opts({ env: { TOOLY_HOME: other } })).source).toBe('local')
    const right = withName(join(sb.root, 'right'), '@example/tooly')
    expect(resolve(NAMED, opts({ env: { TOOLY_HOME: right } })).source).toBe('env')
  })
})
