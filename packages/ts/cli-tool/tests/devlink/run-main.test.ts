/**
 * `runMain` with `devlinkHook`: `dev` is answered, a selected checkout runs in
 * place of this code, and a process that was handed off runs its own main.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { devlinkHook } from '../../src/devlink/index.ts'
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
    const r = run({ TOOLY_HOME: other, TOOLY_LAUNCH_LAYER: 'env' }, ['--version'])
    await r.done
    expect(r.context.io.out).toBe('tooly 1.2.3\n')
    expect(process.exitCode).toBe(0)
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
