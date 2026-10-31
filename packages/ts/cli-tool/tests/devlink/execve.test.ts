/**
 * The hand-off replaces the process with `execve` where it can, so signals and
 * the exit status reach the program that runs; a spawn is the fallback. Under
 * Deno there is no hand-off at all.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { devNull } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { captureIo, type CliContext } from '../../src/index.ts'
import { execSelection } from '../../src/devlink/exec.ts'
import { devlinkHook } from '../../src/devlink/hook.ts'
import type { Selected } from '../../src/devlink/resolve.ts'
import { SPEC, sandbox, seedCheckout, type Sandbox } from './support.ts'

let sb: Sandbox
beforeEach(() => {
  sb = sandbox()
})
afterEach(() => sb.dispose())

const checkoutSel: Selected = {
  source: 'link',
  checkout: '/x',
  entry: '/x/src/cli.ts',
  reason: 'link (/home/.config/tooly/home)',
}
const projectSel: Selected = {
  source: 'project',
  checkout: '/p/node_modules/tooly',
  entry: '/p/node_modules/tooly/bin/tooly.js',
  reason: 'project install at /p/node_modules/tooly',
  runtime: 'node',
  version: '2.0.0',
}

interface Call {
  file: string
  args: string[]
  env: Record<string, string>
}

describe('execSelection with execve', () => {
  test('a checkout is replaced by bun with its run flags, the args and the layer', () => {
    const calls: Call[] = []
    const lines: string[] = []
    const code = execSelection(SPEC, checkoutSel, ['list', '-x'], {
      env: { PATH: '/bin', UNSET: undefined },
      bun: '/opt/bun',
      announce: (line) => lines.push(`${line} (calls: ${calls.length})`),
      execve: (file, args, env) => calls.push({ file, args, env }),
    })
    expect(code).toBe(0)
    expect(calls).toEqual([
      {
        file: '/opt/bun',
        args: [
          '/opt/bun',
          '--no-env-file',
          `--config=${devNull}`,
          'run',
          '/x/src/cli.ts',
          'list',
          '-x',
        ],
        env: { PATH: '/bin', TOOLY_LAUNCH_LAYER: 'link' },
      },
    ])
    // The running line is written before the process is replaced.
    expect(lines).toEqual([`tooly: running /x/src/cli.ts (${checkoutSel.reason}) (calls: 0)`])
  })

  test('a project copy is replaced by node given the bin', () => {
    const calls: Call[] = []
    execSelection(SPEC, projectSel, ['a'], {
      env: { TOOLY_QUIET: '1' },
      node: '/opt/node',
      execve: (file, args, env) => calls.push({ file, args, env }),
    })
    expect(calls).toEqual([
      {
        file: '/opt/node',
        args: ['/opt/node', projectSel.entry, 'a'],
        env: { TOOLY_QUIET: '1', TOOLY_LAUNCH_LAYER: 'project' },
      },
    ])
  })

  test('an execve that fails returns 1 with the could-not-start line', () => {
    const lines: string[] = []
    const code = execSelection(SPEC, projectSel, [], {
      env: { TOOLY_QUIET: '1' },
      node: '/no/node',
      announce: (line) => lines.push(line),
      execve: () => {
        throw new Error("ENOENT, No such file or directory '/no/node'")
      },
    })
    expect(code).toBe(1)
    expect(lines).toEqual([
      `tooly: the project's copy at ${projectSel.checkout} could not start /no/node ` +
        `(ENOENT, No such file or directory '/no/node'). Set TOOLY_PROJECT=0 to use this install.`,
    ])
  })
})

describe('devlinkHook under Deno', () => {
  test('never hands off: the copy that started runs, with nothing said', () => {
    const other = seedCheckout(join(sb.root, 'other'))
    const calls: string[] = []
    const hook = devlinkHook(SPEC, {
      script: join(sb.root, 'elsewhere', 'tooly.js'),
      versions: { deno: '2.5.0' },
      execve: (file) => calls.push(file),
    })
    const io = captureIo()
    const ctx: CliContext = { io, cwd: sb.root, env: { TOOLY_HOME: other } }
    expect(hook([], ctx)).toBeNull()
    expect(calls).toEqual([])
    expect(io.err).toBe('')
    expect(hook.describe?.()).toMatchObject({
      layer: 'self',
      text: 'this install (Deno: devlink does not hand off)',
    })
  })
})

// A real parent hands off to a child that reports its pid, then the test
// signals the parent's pid. With execve they are one process.
test.skipIf(process.platform === 'win32' || typeof process.execve !== 'function')(
  'a real hand-off keeps the pid, so SIGTERM to the parent stops the program and leaves no orphan',
  async () => {
    const pidFile = join(sb.root, 'pid')
    const child = join(sb.root, 'child.mjs')
    writeFileSync(
      child,
      `import { writeFileSync } from 'node:fs'\n` +
        `writeFileSync(${JSON.stringify(pidFile)}, String(process.pid))\n` +
        `setInterval(() => {}, 1000)\n`,
    )
    const exec = pathToFileURL(join(import.meta.dirname, '../../src/devlink/exec.ts')).href
    const parent = join(sb.root, 'parent.mjs')
    const sel: Selected = { ...projectSel, checkout: sb.root, entry: child }
    writeFileSync(
      parent,
      `import { execSelection } from ${JSON.stringify(exec)}\n` +
        `process.exitCode = execSelection(${JSON.stringify(SPEC)}, ${JSON.stringify(sel)}, [], ` +
        `{ env: { ...process.env, TOOLY_QUIET: '1' }, node: process.execPath })\n`,
    )
    const proc = spawn(process.execPath, [parent], { stdio: 'ignore' })
    const exited = new Promise<NodeJS.Signals | null>((done) =>
      proc.on('exit', (_, sig) => done(sig)),
    )
    const deadline = Date.now() + 10_000
    while (!existsSync(pidFile) || readFileSync(pidFile, 'utf-8') === '') {
      if (Date.now() > deadline) throw new Error('the child never wrote its pid')
      await new Promise((r) => setTimeout(r, 20))
    }
    const childPid = Number(readFileSync(pidFile, 'utf-8'))
    expect(childPid).toBe(proc.pid)
    proc.kill('SIGTERM')
    expect(await exited).toBe('SIGTERM')
    expect(() => process.kill(childPid, 0)).toThrow()
  },
  15_000,
)
