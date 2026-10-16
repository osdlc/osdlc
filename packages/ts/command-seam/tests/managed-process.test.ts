/**
 * The managed-process runner: real-spawn cases prove the handle's `pid`,
 * `kill()`, and `exited` promise against an actual child (including the
 * `processGroup` kill); the fake-injection case proves the `ManagedProcessRunner` shape a call site
 * takes is usable with no real process at all.
 */

import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  managedProcessRunner,
  stopProcess,
  type ManagedProcessExit,
  type ManagedProcessHandle,
  type ManagedProcessRunner,
} from '../index.ts'

const CWD = process.cwd()

describe('managedProcessRunner', () => {
  test('run() returns synchronously with a real pid, without waiting for the child', () => {
    // `run` itself never awaits anything — its return is on the same
    // synchronous call stack as this line, before the 0.3s sleep could ever
    // have fired an exit event.
    const handle = managedProcessRunner('sh').run(['-c', 'sleep 0.3; exit 0'], { cwd: CWD })
    expect(handle.pid).toBeGreaterThan(0)
    return handle.exited.then((r) => {
      expect(r).toEqual({ exitCode: 0, signal: null })
    })
  })

  test('unref still runs the child to completion and reports its exit', async () => {
    const handle = managedProcessRunner('sh').run(['-c', 'exit 3'], { cwd: CWD, unref: true })
    expect(handle.pid).toBeGreaterThan(0)
    expect((await handle.exited).exitCode).toBe(3)
  })

  test('detached puts the child in its own session and process group, away from the parent', async () => {
    const out = join(mkdtempSync(join(tmpdir(), 'mp-')), 'ids')
    const ids = (pid: string): string => `ps -o pgid= -p ${pid} | tr -s ' '`
    const handle = managedProcessRunner('sh').run(['-c', `${ids('$$')} > "${out}"`], {
      cwd: CWD,
      processGroup: true,
      unref: true,
    })
    await handle.exited
    const child = readFileSync(out, 'utf-8').trim().split(' ')
    const parent = Bun.spawnSync(['sh', '-c', ids(String(process.pid))])
      .stdout.toString()
      .trim()
      .split(' ')
    expect(child[0]).not.toBe(parent[0])
    expect(child[0]).toBe(String(handle.pid))
  })

  test('exited resolves with the real exit code', async () => {
    const handle = managedProcessRunner('sh').run(['-c', 'exit 7'], { cwd: CWD })
    const r = await handle.exited
    expect(r.exitCode).toBe(7)
    expect(r.neverExited).toBeUndefined()
  })

  test('a missing binary settles exited with neverExited, not a rejection', async () => {
    const handle = managedProcessRunner('definitely-not-a-real-binary-mp-t1').run([], { cwd: CWD })
    const r = await handle.exited
    expect(r.exitCode).not.toBe(0)
    expect(r.neverExited).toBe(true)
  })

  test('kill() terminates a running child, reflected in exited', async () => {
    const handle = managedProcessRunner('sh').run(['-c', 'sleep 30'], { cwd: CWD })
    handle.kill('SIGKILL')
    const r = await handle.exited
    expect(r.signal).toBe('SIGKILL')
  })

  test('processGroup: true makes kill() reap a grandchild the child itself forked', async () => {
    // The direct child forks a grandchild that writes its own pid to a file
    // and then sleeps, like a hung tool that forks a survivor. Killing just the
    // direct pid would leave the grandchild running; `processGroup: true` makes
    // the child a process-group leader, so `kill()` (which negates the pid
    // for a process-group handle) reaps both in one signal.
    const { mkdtempSync, readFileSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = mkdtempSync(join(tmpdir(), 'managed-process-group-'))
    const pidFile = join(dir, 'grandchild.pid')
    try {
      const handle = managedProcessRunner('sh').run(
        ['-c', 'sleep 30 & echo $! > "$1"; wait', 'sh', pidFile],
        { cwd: CWD, processGroup: true },
      )
      // Wait for the grandchild's pid file to appear.
      let grandchildPid = 0
      for (let i = 0; i < 40; i++) {
        try {
          grandchildPid = Number(readFileSync(pidFile, 'utf-8').trim())
          if (grandchildPid > 0) break
        } catch {
          // Not written yet.
        }
        await new Promise((r) => setTimeout(r, 50))
      }
      expect(grandchildPid).toBeGreaterThan(0)

      handle.kill('SIGKILL')
      await handle.exited

      let alive = true
      for (let i = 0; i < 40 && alive; i++) {
        await new Promise((r) => setTimeout(r, 50))
        try {
          process.kill(grandchildPid, 0)
        } catch {
          alive = false
        }
      }
      expect(alive).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 10_000)
})

describe('stopProcess', () => {
  /** A child that ignores SIGTERM, resolved once the trap is set. */
  async function stubborn(): Promise<{ handle: ManagedProcessHandle; cleanup: () => void }> {
    const { existsSync, mkdtempSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = mkdtempSync(join(tmpdir(), 'seam-stop-'))
    // `exec` keeps one process, and an ignored signal stays ignored across it.
    const handle = managedProcessRunner('sh').run(
      ['-c', `trap '' TERM; : > ready; exec sleep 30`],
      { cwd: dir },
    )
    while (!existsSync(join(dir, 'ready'))) await new Promise((r) => setTimeout(r, 10))
    return { handle, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
  }

  test('a child that ignores SIGTERM gets SIGKILL after the grace period', async () => {
    const { handle, cleanup } = await stubborn()
    try {
      const started = performance.now()
      const exit = await stopProcess(handle, { graceMs: 200 })
      expect(exit).toEqual({ exitCode: 1, signal: 'SIGKILL', neverExited: true, reason: 'abort' })
      expect(performance.now() - started).toBeGreaterThanOrEqual(150)
    } finally {
      handle.kill('SIGKILL')
      cleanup()
    }
  }, 10_000)

  test('a child that exits on SIGTERM gets no SIGKILL', async () => {
    const handle = managedProcessRunner('sh').run(['-c', 'exec sleep 30'], { cwd: CWD })
    const exit = await stopProcess(handle, { graceMs: 5_000 })
    expect(exit).toEqual({ exitCode: 1, signal: 'SIGTERM', neverExited: true, reason: 'abort' })
  }, 10_000)

  test('a process that already ended, or never started, resolves with that exit', async () => {
    const done = managedProcessRunner('sh').run(['-c', 'exit 3'], { cwd: CWD })
    await done.exited
    expect(await stopProcess(done)).toEqual({ exitCode: 3, signal: null })
    const missing = managedProcessRunner('definitely-not-a-real-binary-stop').run([], { cwd: CWD })
    expect((await stopProcess(missing)).reason).toBe('spawn')
  })

  test('graceMs: 0 sends SIGKILL at once; a bad value rejects', async () => {
    const signals: (NodeJS.Signals | number | undefined)[] = []
    let end: (exit: ManagedProcessExit) => void = () => {}
    const handle: ManagedProcessHandle = {
      pid: 1,
      kill: (signal) => {
        signals.push(signal)
        if (signal === 'SIGKILL') end({ exitCode: 1, signal: 'SIGKILL' })
      },
      exited: new Promise((resolve) => (end = resolve)),
    }
    expect((await stopProcess(handle, { graceMs: 0 })).signal).toBe('SIGKILL')
    expect(signals).toEqual([undefined, 'SIGKILL'])

    await expect(stopProcess(handle, { graceMs: -1 })).rejects.toThrow(RangeError)
    await expect(stopProcess(handle, { graceMs: NaN })).rejects.toThrow(RangeError)
    const notANumber = { graceMs: '5' } as unknown as { graceMs: number }
    await expect(stopProcess(handle, notANumber)).rejects.toThrow(TypeError)
  })

  test('a graceMs above the largest timer delay is clamped, not fired at once', async () => {
    const signals: (NodeJS.Signals | number | undefined)[] = []
    let end: (exit: ManagedProcessExit) => void = () => {}
    const handle: ManagedProcessHandle = {
      pid: 1,
      kill: (signal) => void signals.push(signal),
      exited: new Promise((resolve) => (end = resolve)),
    }
    const stopping = stopProcess(handle, { graceMs: 2 ** 31 })
    await new Promise((r) => setTimeout(r, 20))
    end({ exitCode: 0, signal: null })
    expect(await stopping).toEqual({ exitCode: 0, signal: null })
    expect(signals).toEqual([undefined])
  })

  test('graceMs: Infinity never sends SIGKILL', async () => {
    const signals: (NodeJS.Signals | number | undefined)[] = []
    let end: (exit: ManagedProcessExit) => void = () => {}
    const handle: ManagedProcessHandle = {
      pid: 1,
      kill: (signal) => void signals.push(signal),
      exited: new Promise((resolve) => (end = resolve)),
    }
    const stopping = stopProcess(handle, { graceMs: Infinity })
    await new Promise((r) => setTimeout(r, 20))
    end({ exitCode: 0, signal: null })
    expect(await stopping).toEqual({ exitCode: 0, signal: null })
    expect(signals).toEqual([undefined])
  })
})

describe('ManagedProcessRunner — fake injection (no real process)', () => {
  test('a call site typed against ManagedProcessRunner accepts a fake', async () => {
    const calls: Array<{ argv: string[] }> = []
    const fake: ManagedProcessRunner = {
      run(argv): ManagedProcessHandle {
        calls.push({ argv: [...argv] })
        const exited: Promise<ManagedProcessExit> = Promise.resolve({
          exitCode: 0,
          signal: null,
        })
        return { pid: 4242, kill: () => {}, exited }
      },
    }
    const handle = fake.run(['--port', '4000'], { cwd: '/fake' })
    expect(handle.pid).toBe(4242)
    expect(await handle.exited).toEqual({ exitCode: 0, signal: null })
    expect(calls).toEqual([{ argv: ['--port', '4000'] }])
  })
})
