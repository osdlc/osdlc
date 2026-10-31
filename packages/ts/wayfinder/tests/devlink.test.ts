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

import { main, runWay, type RunWayOptions } from '../src/cli.ts'
import { checkoutRoot, WAYFINDER_SPEC } from '../src/devlink.ts'
import { VERSION } from '../src/version.generated.ts'

let tmp: string
let home: string
const WINDOWS = process.platform === 'win32'
const MOVED = ['HOME', 'XDG_CONFIG_HOME'] as const
let saved: Record<string, string | undefined> = {}

beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), 'wayfinder-dev-')))
  home = join(tmp, 'home')
  mkdirSync(home, { recursive: true })
  // devlink's state goes through the fleet SDK, which reads HOME and
  // XDG_CONFIG_HOME from the process environment; the injected `home`
  // argument is wayfinder's own. CI runners set XDG_CONFIG_HOME, so both move.
  saved = Object.fromEntries(MOVED.map((name) => [name, process.env[name]]))
  process.env['HOME'] = home
  process.env['XDG_CONFIG_HOME'] = join(home, '.config')
})

afterEach(() => {
  for (const name of MOVED) {
    if (saved[name] === undefined) delete process.env[name]
    else process.env[name] = saved[name]
  }
  rmSync(tmp, { recursive: true, force: true })
})

describe('way dev', () => {
  test('the spec names this package: the shim is the marker and the launcher', () => {
    expect(WAYFINDER_SPEC.name).toBe('way')
    expect(WAYFINDER_SPEC.aliases).toEqual(['wayfinder'])
    expect(checkoutRoot()?.endsWith('wayfinder')).toBe(true)
  })

  // POSIX only: `way dev` is not available on Windows; its launcher is a POSIX shell script.
  test.skipIf(WINDOWS)(
    'status replaces control characters in a linked path, and has no cwd line',
    async () => {
      const checkout = join(tmp, 'co\u001b]0;pwned\u0007\u202e')
      mkdirSync(join(checkout, 'src'), { recursive: true })
      writeFileSync(join(checkout, 'src', 'cli.ts'), '')
      writeFileSync(join(checkout, 'package.json'), JSON.stringify({ name: '@osdlc/wayfinder' }))
      const link = captureIo()
      expect(await main(['dev', 'link', checkout], { HOME: home }, home, link)).toBe(0)
      const io = captureIo()
      expect(await main(['dev', 'status'], { HOME: home }, home, io)).toBe(0)
      const raw = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/
      expect(io.out).toContain('co')
      expect(io.out).not.toContain('cwd:')
      expect(io.out).not.toMatch(raw)
      expect(link.out).not.toMatch(raw)
    },
  )

  // POSIX only: `way dev` is not available on Windows; its launcher is a POSIX shell script.
  test.skipIf(WINDOWS)('status --json keeps a linked path exact and terminal-safe', async () => {
    const checkout = join(tmp, 'co\u001b]0;x\u0007\u202e\u009b')
    mkdirSync(join(checkout, 'src'), { recursive: true })
    writeFileSync(join(checkout, 'src', 'cli.ts'), '')
    writeFileSync(join(checkout, 'package.json'), JSON.stringify({ name: '@osdlc/wayfinder' }))
    expect(await main(['dev', 'link', checkout], { HOME: home }, home, captureIo())).toBe(0)
    const io = captureIo()
    expect(await main(['dev', 'status', '--json'], { HOME: home }, home, io)).toBe(0)
    expect(io.out).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e]/)
    const s = JSON.parse(io.out) as { selection: { checkout: string } }
    expect(s.selection.checkout).toBe(checkout)
  })

  // POSIX only: `way dev` is not available on Windows; its launcher is a POSIX shell script.
  test.skipIf(WINDOWS)('status reports local when nothing is linked', async () => {
    const io = captureIo()
    const code = await main(['dev', 'status', '--json'], { HOME: home }, home, io)
    expect(code).toBe(0)
    const s = JSON.parse(io.out) as { selection: { source: string }; self: string }
    expect(s.selection.source).toBe('local')
    expect(s.self).toBe(checkoutRoot())
  })

  // POSIX only: `way dev` is not available on Windows; its launcher is a POSIX shell script.
  test.skipIf(WINDOWS)(
    'link with no path links this checkout; history lists it; off clears it',
    async () => {
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
    },
  )

  // POSIX only: `way dev` is not available on Windows; its launcher is a POSIX shell script.
  test.skipIf(WINDOWS)('--help exits 0 with the verb table; a bad verb exits 2', async () => {
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
    expect(await main(['dev', '--help'], { HOME: home }, home, io)).toBe(WINDOWS ? 1 : 0)
  })

  test.runIf(WINDOWS)('way dev says it is not available on Windows', async () => {
    const io = captureIo()
    expect(await main(['dev', 'status'], { HOME: home }, home, io)).toBe(1)
    expect(io.err).toContain('not available on Windows')
  })
})

describe('runWay goes through runMain', () => {
  /** Run `way` with `argv` and `env`, and return its exit code and output. */
  async function run(
    argv: string[],
    env: Record<string, string | undefined>,
    opts: Omit<RunWayOptions, 'argv' | 'context'> = {},
  ) {
    const io = captureIo()
    try {
      await runWay({ argv, context: { io, cwd: tmp, env }, home, ...opts })
      return { code: process.exitCode, out: io.out, err: io.err }
    } finally {
      process.exitCode = undefined
    }
  }

  const ownScript = () => join(checkoutRoot()!, 'src', 'cli.ts')

  test('--version prints the name and the stamped version', async () => {
    const r = await run(['--version'], { HOME: home })
    expect(r.code).toBe(0)
    expect(r.out).toBe(`way ${VERSION}\n`)
  })

  test('--where from an install, with no layer set', async () => {
    const pkg = join(tmp, 'node_modules', '@osdlc', 'wayfinder')
    mkdirSync(join(pkg, 'bin'), { recursive: true })
    writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: '@osdlc/wayfinder' }))
    const script = join(pkg, 'bin', 'way.js')
    writeFileSync(script, '')
    const r = await run(['--where'], { HOME: home }, { script })
    expect(r.code).toBe(0)
    expect(r.out).toBe(
      `way ${VERSION}\n` +
        `file      ${script}\n` +
        `from      install ${pkg}\n` +
        'chosen by this install (no devlink layer selected another)\n',
    )
  })

  test('--where in a process handed off by WAY_HOME', async () => {
    const env: Record<string, string | undefined> = {
      HOME: home,
      WAY_HOME: checkoutRoot()!,
      WAY_LAUNCH_LAYER: 'env',
    }
    const r = await run(['--where'], env, { script: ownScript() })
    expect(r.code).toBe(0)
    expect(r.out).toContain(`from      checkout ${checkoutRoot()}\n`)
    expect(r.out).toContain('chosen by env ($WAY_HOME)\n')
    // Read once, then gone, so a process this run starts resolves for itself.
    expect(env['WAY_LAUNCH_LAYER']).toBeUndefined()
  })

  test('--where --json prints the same facts as one object', async () => {
    const env = { HOME: home, WAY_HOME: checkoutRoot()!, WAY_LAUNCH_LAYER: 'env' }
    const r = await run(['--where', '--json'], env, { script: ownScript() })
    expect(r.code).toBe(0)
    expect(JSON.parse(r.out)).toEqual({
      name: 'way',
      version: VERSION,
      file: realpathSync(ownScript()),
      compiled: false,
      from: { kind: 'checkout', path: checkoutRoot() },
      chosenBy: { checkout: checkoutRoot(), layer: 'env', text: 'env ($WAY_HOME)' },
    })
  })

  test('--where runs none of main: no command, no help, no catalog', async () => {
    const env = { HOME: home, WAY_LAUNCH_LAYER: 'local' }
    for (const argv of [
      ['--where', 'list', '--json'],
      ['--where', '--help'],
    ]) {
      const r = await run(argv, env, { script: ownScript() })
      expect(r.code).toBe(0)
      expect(r.out).toMatch(/^(way |\{"name":"way")/)
      expect(r.out).not.toContain('usage:')
      expect(r.out).not.toContain('schemaVersion')
      expect(r.err).toBe('')
    }
  })

  test('--where with a path holding control characters prints it terminal-safe', async () => {
    const pkg = join(tmp, 'node_modules', '@osdlc', 'wayfinder')
    const dir = join(pkg, 'b\u001b]0;pwned\u0007\u202e')
    mkdirSync(dir, { recursive: true })
    const script = join(dir, 'way.js')
    writeFileSync(script, '')
    for (const argv of [['--where'], ['--where', '--json']]) {
      const r = await run(argv, { HOME: home }, { script })
      expect(r.out).not.toMatch(/[\u001b\u0007\u202e]/)
    }
  })

  // POSIX only: `way dev` is not available on Windows.
  test.skipIf(WINDOWS)(
    'dev is answered by main, terminal-safe, after a global flag too',
    async () => {
      const checkout = fakeCheckout(join(tmp, 'co\u001b]0;pwned\u0007'), '@osdlc/wayfinder')
      expect((await run(['dev', 'link', checkout], { HOME: home })).code).toBe(0)
      const text = await run(['dev', 'status'], { HOME: home })
      expect(text.code).toBe(0)
      expect(text.out).toContain('co\ufffd]0;pwned\ufffd')
      const json = await run(['--json', 'dev', 'status'], { HOME: home })
      expect(json.code).toBe(0)
      expect(JSON.parse(json.out).link.value).toBe(checkout)
    },
  )
})
