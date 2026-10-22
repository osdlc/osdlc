import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { cwdCheckout, isCheckout, resolve } from '../../src/devlink/resolve.ts'
import { writeActive } from '../../src/devlink/state.ts'
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
