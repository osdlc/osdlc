/**
 * `way dev …` is devlink run from wayfinder's own `main`. The verb is matched
 * before the flags are parsed, its state goes under the injected HOME, and
 * `self` is this checkout.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { captureIo } from '@osdlc/cli-tool'
import { resolve } from '@osdlc/cli-tool/devlink'

import { main } from '../src/cli.ts'
import { checkoutRoot, WAYFINDER_SPEC } from '../src/devlink.ts'

let tmp: string
let home: string
let savedHome: string | undefined

beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), 'wayfinder-dev-')))
  home = join(tmp, 'home')
  mkdirSync(home, { recursive: true })
  // devlink's state goes through the fleet SDK, which reads HOME from the
  // process environment; the injected `home` argument is wayfinder's own.
  savedHome = process.env['HOME']
  process.env['HOME'] = home
})

afterEach(() => {
  if (savedHome === undefined) delete process.env['HOME']
  else process.env['HOME'] = savedHome
  rmSync(tmp, { recursive: true, force: true })
})

describe('way dev', () => {
  test('the spec names this package: the shim is the marker and the launcher', () => {
    expect(WAYFINDER_SPEC.name).toBe('way')
    expect(WAYFINDER_SPEC.aliases).toEqual(['wayfinder'])
    expect(checkoutRoot()?.endsWith('wayfinder')).toBe(true)
  })

  test('status reports local when nothing is linked', async () => {
    const io = captureIo()
    const code = await main(['dev', 'status', '--json'], { HOME: home }, home, io)
    expect(code).toBe(0)
    const s = JSON.parse(io.out) as { selection: { source: string }; self: string }
    expect(s.selection.source).toBe('local')
    expect(s.self).toBe(checkoutRoot())
  })

  test('link with no path links this checkout; history lists it; off clears it', async () => {
    let io = captureIo()
    // cwd is inside this checkout, so the bare link resolves to it.
    expect(await main(['dev', 'link'], { HOME: home }, home, io)).toBe(0)
    expect(io.out).toContain(`way now runs ${checkoutRoot()}/src/cli.ts`)

    io = captureIo()
    expect(await main(['dev', 'history', '--json'], { HOME: home }, home, io)).toBe(0)
    const rows = JSON.parse(io.out) as Array<{ checkout: string; active: boolean }>
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ checkout: checkoutRoot(), active: true })

    io = captureIo()
    expect(await main(['dev', 'off'], { HOME: home }, home, io)).toBe(0)
    expect(io.out).toContain('way runs the local install')
  })

  test('--help exits 0 with the verb table; a bad verb exits 2', async () => {
    let io = captureIo()
    expect(await main(['dev', '--help'], { HOME: home }, home, io)).toBe(0)
    expect(io.out).toContain('usage: way dev <verb>')
    io = captureIo()
    expect(await main(['dev', 'bogus'], { HOME: home }, home, io)).toBe(2)
  })
})

/** A directory with `src/cli.ts` and a `package.json` named `name`. */
function fakeCheckout(dir: string, name: string): string {
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(join(dir, 'src', 'cli.ts'), '// entry\n')
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name }))
  return dir
}

describe('the launcher hands off only to a chosen wayfinder checkout', () => {
  const pick = (cwd: string, env: Record<string, string> = {}) =>
    resolve(WAYFINDER_SPEC, { cwd, env: { HOME: home, ...env }, self: checkoutRoot() })

  test('standing in a repository with src/cli.ts runs the install, not that repository', () => {
    const repo = fakeCheckout(join(tmp, 'repo'), 'some-cli')
    mkdirSync(join(repo, 'src', 'deep'), { recursive: true })
    expect(pick(join(repo, 'src', 'deep')).source).toBe('local')
  })

  test('standing in another wayfinder checkout runs the install too', () => {
    const other = fakeCheckout(join(tmp, 'other'), '@osdlc/wayfinder')
    expect(pick(other).source).toBe('local')
  })

  test('WAY_HOME applies only to a checkout named @osdlc/wayfinder', () => {
    const repo = fakeCheckout(join(tmp, 'repo'), 'some-cli')
    expect(pick(tmp, { WAY_HOME: repo }).source).toBe('local')
    const other = fakeCheckout(join(tmp, 'other'), '@osdlc/wayfinder')
    const sel = pick(tmp, { WAY_HOME: other })
    expect(sel.source).toBe('env')
    expect(sel.checkout).toBe(other)
  })

  test('dev is not listed in the help, but still runs', async () => {
    for (const args of [['--help'], ['--help', '--all']]) {
      const io = captureIo()
      expect(await main(args, { HOME: home }, home, io)).toBe(0)
      expect(io.out).not.toMatch(/^\s*dev\b/m)
    }
    const io = captureIo()
    expect(await main(['dev', '--help'], { HOME: home }, home, io)).toBe(0)
  })
})
