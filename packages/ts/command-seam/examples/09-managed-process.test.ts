/**
 * Need: start a dev server, wait until it is ready, fail fast if it dies or
 * never gets ready, and stop it (and anything it forked) at the end.
 *
 * `managedProcessRunner` returns a handle as soon as the child exists:
 * `exited` settles when it is gone, `kill` stops it. Output is inherited, not
 * captured, so readiness is checked from outside (a port, a file, an HTTP
 * probe). `processGroup` makes `kill` reach the server's own children.
 * `kill` sends one signal, so a server that ignores SIGTERM would never stop;
 * `stopProcess` sends SIGTERM, waits a grace period, then sends SIGKILL.
 * A group leader misses the terminal's Ctrl-C, so the host calls
 * `installGroupSignalForwarding` once: on SIGINT, SIGTERM or SIGHUP every live
 * group is killed before the host exits. `forwardedSignal` tells a loop that
 * starts one command after another to stop, and `forwardedExitCode` gives the
 * host its exit code.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, expect, test } from 'bun:test'

import {
  forwardedExitCode,
  forwardedSignal,
  installGroupSignalForwarding,
  liveProcessGroups,
  managedProcessRunner,
  stopProcess,
  type GroupSignalForwardingOptions,
  type ManagedProcessExit,
  type ManagedProcessHandle,
  type ManagedProcessRunner,
  type ManagedProcessRunOptions,
} from '@osdlc/command-seam'
import { fakeProcess } from '@osdlc/command-seam/testing'

// ---- Code under test -------------------------------------------------------

class DevServerError extends Error {}

interface DevServer {
  pid: number
  stop(): Promise<ManagedProcessExit>
}

interface StartOptions {
  readyTimeoutMs?: number
  pollMs?: number
  /** How long a stop waits after SIGTERM before it sends SIGKILL. */
  graceMs?: number
  node?: ManagedProcessRunner
}

function describeExit(exit: ManagedProcessExit): string {
  if (exit.reason === 'spawn') return exit.error ?? 'it could not start'
  if (exit.signal !== null) return `killed by ${exit.signal}`
  return `exit ${exit.exitCode}`
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** A probe that throws, such as a refused connection, means "not ready yet". */
async function probe(isReady: () => boolean | Promise<boolean>): Promise<boolean> {
  try {
    return await isReady()
  } catch {
    return false
  }
}

/** Start `node server.js` in `dir` and resolve once `isReady` says it serves. */
async function startDevServer(
  dir: string,
  isReady: () => boolean | Promise<boolean>,
  opts: StartOptions = {},
): Promise<DevServer> {
  const graceMs = opts.graceMs ?? 5_000
  const runOpts: ManagedProcessRunOptions = { cwd: dir, processGroup: true }
  const server: ManagedProcessHandle = (opts.node ?? managedProcessRunner('node')).run(
    ['server.js'],
    runOpts,
  )
  let early: ManagedProcessExit | undefined
  void server.exited.then((exit) => {
    early = exit
  })

  try {
    const deadline = Date.now() + (opts.readyTimeoutMs ?? 30_000)
    for (;;) {
      const ready = await probe(isReady)
      // Checked after every probe: a stale ready file or a port held by
      // another process must not hide a dead server.
      if (early) {
        throw new DevServerError(`dev server stopped before it was ready: ${describeExit(early)}`)
      }
      if (ready) return { pid: server.pid, stop: () => stopProcess(server, { graceMs }) }
      if (Date.now() >= deadline) throw new DevServerError('dev server was not ready in time')
      await sleep(opts.pollMs ?? 100)
    }
  } catch (e) {
    // No failure leaves the process group running.
    await stopProcess(server, { graceMs })
    throw e
  }
}

// ---- Tests -----------------------------------------------------------------

test('waits for ready, then stops the server', async () => {
  const proc = fakeProcess({ pid: 7 })
  let polls = 0

  const server = await startDevServer('/app', () => ++polls === 3, { node: proc.runner, pollMs: 1 })
  const exit = await server.stop()

  expect(server.pid).toBe(7)
  expect(proc.calls[0]).toEqual({ argv: ['server.js'], opts: { cwd: '/app', processGroup: true } })
  expect(proc.signals).toEqual(['SIGTERM'])
  expect(exit.reason).toBe('abort')
})

test('a probe that throws counts as not ready yet', async () => {
  const proc = fakeProcess()
  let polls = 0
  const refusedTwice = () => {
    if (++polls < 3) throw new Error('connect ECONNREFUSED 127.0.0.1:5173')
    return true
  }

  const server = await startDevServer('/app', refusedTwice, { node: proc.runner, pollMs: 1 })

  expect(server.pid).toBe(4242)
  expect(proc.signals).toEqual([])
})

test('a server that dies first is reported, even if the probe says ready', async () => {
  const crashed = fakeProcess()
  crashed.exit({ exitCode: 1 })
  const missing = fakeProcess({ pid: -1 })
  missing.exit({ exitCode: 1, neverExited: true, reason: 'spawn', error: 'spawn node ENOENT' })
  // A ready file left over from an earlier run.
  const stale = () => true

  await expect(startDevServer('/app', stale, { node: crashed.runner, pollMs: 1 })).rejects.toThrow(
    'dev server stopped before it was ready: exit 1',
  )
  await expect(startDevServer('/app', stale, { node: missing.runner, pollMs: 1 })).rejects.toThrow(
    'dev server stopped before it was ready: spawn node ENOENT',
  )
})

test('a server that never gets ready is killed', async () => {
  const proc = fakeProcess()

  const starting = startDevServer('/app', () => false, {
    node: proc.runner,
    readyTimeoutMs: 5,
    pollMs: 1,
  })

  await expect(starting).rejects.toThrow('dev server was not ready in time')
  expect(proc.signals).toEqual(['SIGTERM'])
})

test('a server that ignores SIGTERM gets SIGKILL after the grace period', async () => {
  // Only SIGKILL ends this fake, as for a server that traps SIGTERM.
  const proc = fakeProcess({ exitOnKill: ['SIGKILL'] })
  const server = await startDevServer('/app', () => true, { node: proc.runner, graceMs: 5 })

  expect((await server.stop()).signal).toBe('SIGKILL')
  expect(proc.signals).toEqual(['SIGTERM', 'SIGKILL'])
})

// ---- The real runner -------------------------------------------------------

const scratch = mkdtempSync(join(tmpdir(), 'examples-server-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

test('a real server: ready, stopped, missing, crashed', async () => {
  const ready = join(scratch, 'ready')
  const isReady = () => existsSync(ready)
  writeFileSync(
    join(scratch, 'server.js'),
    `require('fs').writeFileSync('ready', ''); setInterval(() => {}, 1000)\n`,
  )

  const server = await startDevServer(scratch, isReady, { pollMs: 20 })
  const exit = await server.stop()

  // Stopped by our own signal, so `reason` says the stop was ours.
  expect(exit).toMatchObject({ signal: 'SIGTERM', neverExited: true, reason: 'abort' })

  rmSync(ready)
  const noNode = managedProcessRunner('no-such-node')
  // The spawn error's wording differs between Node and Bun; both name the binary.
  await expect(startDevServer(scratch, isReady, { node: noNode })).rejects.toThrow('no-such-node')

  writeFileSync(join(scratch, 'server.js'), 'process.exit(7)\n')
  await expect(startDevServer(scratch, isReady, { pollMs: 20 })).rejects.toThrow('exit 7')
}, 15_000)

test('a host installs signal forwarding once; its live groups are listed until they stop', async () => {
  const opts: GroupSignalForwardingOptions = { graceMs: 200 }
  const uninstall = installGroupSignalForwarding(opts)
  try {
    const server = managedProcessRunner('node').run(['-e', 'setInterval(() => {}, 1000)'], {
      cwd: scratch,
      processGroup: true,
    })
    expect(liveProcessGroups()).toContain(server.pid)
    // No signal yet, so a loop over commands would carry on, and the host
    // exits with its own code (`process.exitCode = forwardedExitCode() ?? code`).
    expect(forwardedSignal()).toBeUndefined()
    expect(forwardedExitCode()).toBeUndefined()
    await stopProcess(server, { graceMs: 2_000 })
    expect(liveProcessGroups()).not.toContain(server.pid)
  } finally {
    uninstall()
  }
}, 15_000)
