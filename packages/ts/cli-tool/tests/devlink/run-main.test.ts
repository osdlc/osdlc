/**
 * `runMain` with `devlinkHook`: `dev` is answered, a selected checkout runs in
 * place of this code, a process that was handed off runs its own main, and
 * `--where` says which layer chose the process that answers it.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { devlinkHook, homePath } from '../../src/devlink/index.ts'
import { captureContext, runMain } from '../../src/index.ts'
import { SPEC, sandbox, seedCheckout, type Sandbox } from './support.ts'

let sb: Sandbox
let before: typeof process.exitCode
beforeEach(() => {
  sb = sandbox()
  before = process.exitCode
})
afterEach(() => {
  process.exitCode = before ?? 0
  sb.dispose()
})

/** A PATH directory holding a `bun` that records its layer and arguments, then exits 5. */
function fakeBunDir(report: string): string {
  const dir = join(sb.root, 'path-bin')
  mkdirSync(dir)
  writeFileSync(
    join(dir, 'bun'),
    `#!/bin/sh\nprintf '%s %s' "$TOOLY_LAUNCH_LAYER" "$*" > "${report}"\nexit 5\n`,
  )
  chmodSync(join(dir, 'bun'), 0o755)
  return dir
}

function run(env: Record<string, string>, argv: string[], script?: string) {
  const context = captureContext({ cwd: sb.root, env: { HOME: sb.home, ...env } })
  let called = false
  const main = () => {
    called = true
    return 0
  }
  return {
    context,
    called: () => called,
    done: runMain(main, {
      name: 'tooly',
      context,
      argv,
      version: '1.2.3',
      devlink: devlinkHook(SPEC, script === undefined ? {} : { script }),
      ...(script === undefined ? {} : { script }),
    }),
  }
}

describe('runMain with devlink', () => {
  test('TOOLY_HOME hands off to that checkout, which is told the layer', async () => {
    const other = seedCheckout(join(sb.root, 'other'))
    const report = join(sb.root, 'report')
    const r = run({ TOOLY_HOME: other, PATH: fakeBunDir(report) }, ['list', '-x'])
    await r.done
    expect(process.exitCode).toBe(5)
    expect(r.called()).toBe(false)
    expect(readFileSync(report, 'utf-8')).toBe(
      `env --no-env-file --config=/dev/null run ${join(other, 'src/cli.ts')} list -x`,
    )
    expect(r.context.io.err).toContain(`tooly: running ${join(other, 'src/cli.ts')}`)
  })

  test('a handed-off process runs its own main and answers --version', async () => {
    const other = seedCheckout(join(sb.root, 'other'))
    process.env['TOOLY_LAUNCH_LAYER'] = 'env'
    const r = run({ TOOLY_HOME: other, TOOLY_LAUNCH_LAYER: 'env' }, ['--version'])
    await r.done
    expect(r.context.io.out).toBe('tooly 1.2.3\n')
    expect(process.exitCode).toBe(0)
    // Removed once read, so a process this run starts resolves for itself.
    expect(r.context.env['TOOLY_LAUNCH_LAYER']).toBeUndefined()
    expect(process.env['TOOLY_LAUNCH_LAYER']).toBeUndefined()
  })

  test('nothing selected runs main', async () => {
    const r = run({}, ['list'])
    await r.done
    expect(r.called()).toBe(true)
  })

  test('the checkout the script runs from is not handed off to', async () => {
    const self = seedCheckout(join(sb.root, 'self'))
    const r = run({ TOOLY_HOME: self }, ['list'], join(self, 'bin', 'tooly'))
    await r.done
    expect(r.called()).toBe(true)
  })

  test('dev is answered by devlink, not main', async () => {
    const r = run({}, ['dev', 'nope'])
    await r.done
    expect(r.called()).toBe(false)
    expect(process.exitCode).toBe(2)
    expect(r.context.io.err).toContain('tooly dev')
  })

  test('a script under node_modules has no checkout of its own', async () => {
    const installed = seedCheckout(join(sb.root, 'node_modules', 'tooly'))
    const path = fakeBunDir(join(sb.root, 'report'))
    const r = run({ TOOLY_HOME: installed, PATH: path }, ['list'], join(installed, 'bin', 'tooly'))
    await r.done
    // Not recognised as its own checkout, so TOOLY_HOME naming it hands off.
    expect(process.exitCode).toBe(5)
  })
})

describe('runMain --where with devlink', () => {
  test('a process handed off by TOOLY_HOME names its checkout and the env layer', async () => {
    const other = seedCheckout(join(sb.root, 'other'))
    const script = join(other, 'src', 'cli.ts')
    const r = run({ TOOLY_HOME: other, TOOLY_LAUNCH_LAYER: 'env' }, ['--where'], script)
    await r.done
    expect(r.called()).toBe(false)
    expect(process.exitCode).toBe(0)
    expect(r.context.io.out).toBe(
      `tooly 1.2.3\nfile      ${script}\nfrom      checkout ${other}\nchosen by env ($TOOLY_HOME)\n`,
    )
  })

  test('a process handed off by the link names the link file', async () => {
    const other = seedCheckout(join(sb.root, 'other'))
    const script = join(other, 'src', 'cli.ts')
    const r = run({ TOOLY_LAUNCH_LAYER: 'link' }, ['--where', '--json'], script)
    await r.done
    expect(r.called()).toBe(false)
    expect(JSON.parse(r.context.io.out)).toEqual({
      name: 'tooly',
      version: '1.2.3',
      file: script,
      compiled: false,
      from: { kind: 'checkout', path: other },
      chosenBy: {
        checkout: other,
        layer: 'link',
        text: `link (${homePath(SPEC)})`,
        linkFile: homePath(SPEC),
      },
    })
  })

  test('an install that nothing handed off says no layer selected another', async () => {
    const installed = seedCheckout(join(sb.root, 'node_modules', 'tooly'))
    const script = join(installed, 'bin', 'tooly')
    const r = run({}, ['--where'], script)
    await r.done
    expect(r.called()).toBe(false)
    expect(r.context.io.out).toBe(
      `tooly 1.2.3\nfile      ${script}\nfrom      install ${installed}\n` +
        'chosen by this install (no devlink layer selected another)\n',
    )
  })

  test('a layer that names this checkout is reported, with no hand-off', async () => {
    const self = seedCheckout(join(sb.root, 'self'))
    const r = run({ TOOLY_HOME: self }, ['--where'], join(self, 'bin', 'tooly'))
    await r.done
    expect(r.context.io.out).toContain(`from      checkout ${self}\n`)
    expect(r.context.io.out).toContain('chosen by this checkout (TOOLY_HOME, which is this one)\n')
  })

  test('the process that hands off does not answer --where itself', async () => {
    const other = seedCheckout(join(sb.root, 'other'))
    const report = join(sb.root, 'report')
    const r = run({ TOOLY_HOME: other, PATH: fakeBunDir(report) }, ['--where'])
    await r.done
    expect(r.context.io.out).toBe('')
    expect(readFileSync(report, 'utf-8')).toContain(`${join(other, 'src/cli.ts')} --where`)
  })
})
