/**
 * Group registry and signal forwarding: a host that gets SIGTERM must not
 * leave the process trees it started with `processGroup: true` behind.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'bun:test'

import {
  forwardedExitCode,
  forwardedSignal,
  installGroupSignalForwarding,
  liveProcessGroups,
  managedProcessRunner,
  spawnRunnerAsync,
} from '../index.ts'
import { alive, gone, reap } from './support/procs.ts'

const CWD = process.cwd()
const posix = process.platform !== 'win32'
const HOST = join(import.meta.dir, 'support', 'forwarding-host.ts')
const SEQUENCE_HOST = join(import.meta.dir, 'support', 'sequence-host.ts')

/** Spawn the host script under bun; resolves with the pids it prints once ready. */
async function startHost(extra: string[] = []) {
  const host = spawn(process.execPath, [HOST, ...extra], { stdio: ['ignore', 'pipe', 'inherit'] })
  let out = ''
  const ready = new Promise<{ grandchild: number }>((resolve, reject) => {
    host.stdout.on('data', (d: Buffer) => {
      out += d.toString()
      const m = /grandchild=(\d+)/.exec(out)
      if (m) resolve({ grandchild: Number(m[1]) })
    })
    host.on('exit', () => reject(new Error(`host exited early: ${out}`)))
  })
  return { host, ready }
}

test.skipIf(!posix)(
  'the async runner registers a group and unregisters it when the run settles',
  async () => {
    const before = liveProcessGroups().length
    const run = spawnRunnerAsync('sh').run(['-c', 'sleep 0.3'], { cwd: CWD, processGroup: true })
    expect(liveProcessGroups().length).toBe(before + 1)
    await run
    expect(liveProcessGroups().length).toBe(before)
  },
)

test.skipIf(!posix)('a run without processGroup is not registered', async () => {
  const before = liveProcessGroups().length
  const run = spawnRunnerAsync('sh').run(['-c', 'true'], { cwd: CWD })
  expect(liveProcessGroups().length).toBe(before)
  await run
})

test.skipIf(!posix)('the managed runner registers a group until the leader exits', async () => {
  const before = liveProcessGroups().length
  const h = managedProcessRunner('sh').run(['-c', 'sleep 30'], { cwd: CWD, processGroup: true })
  expect(liveProcessGroups()).toContain(h.pid)
  h.kill('SIGKILL')
  await h.exited
  expect(liveProcessGroups().length).toBe(before)
})

test.skipIf(!posix)(
  "an unref'd managed group is not registered: it may outlive the host",
  async () => {
    const before = liveProcessGroups().length
    const h = managedProcessRunner('sh').run(['-c', 'sleep 30'], {
      cwd: CWD,
      processGroup: true,
      unref: true,
    })
    expect(liveProcessGroups().length).toBe(before)
    h.kill('SIGKILL')
    await h.exited
  },
)

test.skipIf(!posix)(
  "a signal to the host leaves an unref'd group alive: it may outlive the host",
  async () => {
    const { host, ready } = await startHost(['--unref'])
    const exited = new Promise<number | null>((res) => host.on('exit', (code) => res(code)))
    const { grandchild } = await ready
    try {
      expect(alive(grandchild)).toBe(true)
      host.kill('SIGTERM')
      await exited
      // Forwarding would have killed it within the 500 ms grace; wait past that.
      await new Promise((res) => setTimeout(res, 1_000))
      expect(alive(grandchild)).toBe(true)
    } finally {
      reap(grandchild)
      host.kill('SIGKILL')
    }
  },
  20_000,
)

for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
  test.skipIf(!posix)(
    `${sig} to the host kills a grandchild and exits 128+signo`,
    async () => {
      const { host, ready } = await startHost()
      const exited = new Promise<number | null>((res) => host.on('exit', (code) => res(code)))
      const { grandchild } = await ready
      try {
        expect(alive(grandchild)).toBe(true)
        host.kill(sig)
        const code = await exited
        expect(code).toBe(128 + { SIGTERM: 15, SIGINT: 2, SIGHUP: 1 }[sig])
        expect(await gone(grandchild)).toBe(true)
      } finally {
        reap(grandchild)
        host.kill('SIGKILL')
      }
    },
    20_000,
  )
}

test.skipIf(!posix)(
  'an async group stays registered after the run settles, so SIGTERM still kills a background member',
  async () => {
    const { host, ready } = await startHost(['--async-background'])
    const exited = new Promise<number | null>((res) => host.on('exit', (code) => res(code)))
    const { grandchild } = await ready
    try {
      expect(alive(grandchild)).toBe(true)
      host.kill('SIGTERM')
      expect(await exited).toBe(143)
      expect(await gone(grandchild)).toBe(true)
    } finally {
      reap(grandchild)
      host.kill('SIGKILL')
    }
  },
  20_000,
)

test.skipIf(!posix)(
  'a grandchild that ignores SIGTERM gets SIGKILL after the grace',
  async () => {
    const { host, ready } = await startHost(['--stubborn'])
    const exited = new Promise<number | null>((res) => host.on('exit', (code) => res(code)))
    const { grandchild } = await ready
    try {
      host.kill('SIGTERM')
      expect(await exited).toBe(143)
      expect(await gone(grandchild, 4_000)).toBe(true)
    } finally {
      reap(grandchild)
      host.kill('SIGKILL')
    }
  },
  20_000,
)

test.skipIf(!posix)(
  'a host with its own SIGTERM listener keeps the exit but groups still die',
  async () => {
    const { host, ready } = await startHost(['--own-handler'])
    const exited = new Promise<number | null>((res) => host.on('exit', (code) => res(code)))
    const { grandchild } = await ready
    try {
      host.kill('SIGTERM')
      // The host's own handler exits 7 after the forwarded kill.
      expect(await exited).toBe(7)
      expect(await gone(grandchild)).toBe(true)
    } finally {
      reap(grandchild)
      host.kill('SIGKILL')
    }
  },
  20_000,
)

test.skipIf(!posix)(
  'a host process.once listener keeps the exit, and a later run is not refused',
  async () => {
    const { host, ready } = await startHost(['--own-once'])
    let out = ''
    host.stdout.on('data', (d: Buffer) => (out += d.toString()))
    const exited = new Promise<number | null>((res) => host.on('exit', (code) => res(code)))
    const { grandchild } = await ready
    try {
      host.kill('SIGTERM')
      expect(await exited).toBe(7)
      expect(out).toContain('later=0')
      expect(await gone(grandchild)).toBe(true)
    } finally {
      reap(grandchild)
      host.kill('SIGKILL')
    }
  },
  20_000,
)

test.skipIf(!posix)('listeners are armed only while a group is live', async () => {
  const before = process.listenerCount('SIGTERM')
  const uninstall = installGroupSignalForwarding({ exit: () => {} })
  try {
    expect(process.listenerCount('SIGTERM')).toBe(before)
    const run = spawnRunnerAsync('sh').run(['-c', 'sleep 0.3'], { cwd: CWD, processGroup: true })
    expect(process.listenerCount('SIGTERM')).toBe(before + 1)
    expect(process.listenerCount('exit')).toBeGreaterThan(0)
    await run
    expect(process.listenerCount('SIGTERM')).toBe(before)
  } finally {
    uninstall()
  }
})

test.skipIf(!posix)(
  'a managed group stays registered after its leader exits until it is empty',
  async () => {
    const before = liveProcessGroups().length
    const h = managedProcessRunner('sh').run(['-c', 'sleep 30 & echo $!'], {
      cwd: CWD,
      processGroup: true,
    })
    await h.exited
    try {
      expect(liveProcessGroups()).toContain(h.pid)
      process.kill(-h.pid, 'SIGKILL')
      const end = performance.now() + 3000
      while (liveProcessGroups().includes(h.pid) && performance.now() < end) {
        await new Promise((r) => setTimeout(r, 50))
      }
      expect(liveProcessGroups().length).toBe(before)
    } finally {
      try {
        process.kill(-h.pid, 'SIGKILL')
      } catch {}
    }
  },
  10_000,
)

test.skipIf(!posix)(
  'a host that exits first still SIGKILLs a SIGTERM-ignoring group',
  async () => {
    const { host, ready } = await startHost(['--stubborn', '--own-handler-immediate'])
    const exited = new Promise<number | null>((res) => host.on('exit', (code) => res(code)))
    const { grandchild } = await ready
    try {
      host.kill('SIGTERM')
      expect(await exited).toBe(9)
      expect(await gone(grandchild)).toBe(true)
    } finally {
      reap(grandchild)
      host.kill('SIGKILL')
    }
  },
  20_000,
)

test.skipIf(!posix)(
  'a repeat signal during the grace window kills at once and exits',
  async () => {
    // graceMs is 30 s in this host, so only the escalation can end it quickly.
    const { host, ready } = await startHost(['--stubborn', '--long-grace'])
    const exited = new Promise<number | null>((res) => host.on('exit', (code) => res(code)))
    const { grandchild } = await ready
    try {
      const start = performance.now()
      host.kill('SIGTERM')
      await new Promise((r) => setTimeout(r, 300))
      host.kill('SIGTERM')
      expect(await exited).toBe(143)
      expect(performance.now() - start).toBeLessThan(10_000)
      expect(await gone(grandchild)).toBe(true)
    } finally {
      reap(grandchild)
      host.kill('SIGKILL')
    }
  },
  20_000,
)

test.skipIf(!posix)('a group unregistered during the grace window is not SIGKILLed', async () => {
  // A group that ignores SIGTERM, standing in for a pid the OS has since reused.
  const bystander = spawn('sh', ['-c', 'trap "" TERM; sleep 30'], {
    detached: true,
    stdio: 'ignore',
  })
  const pid = bystander.pid!
  // Let sh install its trap before the first SIGTERM.
  await new Promise((r) => setTimeout(r, 200))
  const { trackGroup } = await import('../groups.ts')
  const uninstall = installGroupSignalForwarding({ graceMs: 300, exit: () => {} })
  const untrack = trackGroup(pid)
  try {
    process.emit('SIGTERM')
    untrack()
    await new Promise((r) => setTimeout(r, 700))
    expect(alive(pid)).toBe(true)
  } finally {
    uninstall()
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {}
  }
})

test.skipIf(!posix)(
  'after a forwarded signal, a host that goes on to a second run starts nothing',
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'command-seam-sequence-'))
    const marker = join(dir, 'second-ran')
    const host = spawn(process.execPath, [SEQUENCE_HOST, marker], {
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    let out = ''
    const started = new Promise<void>((resolve) => {
      host.stdout.on('data', (d: Buffer) => {
        out += d.toString()
        if (out.includes('first-started')) resolve()
      })
    })
    const exited = new Promise<number | null>((res) => host.on('exit', (code) => res(code)))
    try {
      await started
      host.kill('SIGTERM')
      expect(await exited).toBe(143)
      // Give a second run that did start time to write its marker.
      await new Promise((r) => setTimeout(r, 300))
      expect(existsSync(marker)).toBe(false)
      expect(out).toContain('second=abort')
    } finally {
      host.kill('SIGKILL')
      rmSync(dir, { recursive: true, force: true })
    }
  },
  20_000,
)

test.skipIf(!posix)(
  'once a signal is forwarded, new group runs are refused and forwardedSignal names it',
  async () => {
    const uninstall = installGroupSignalForwarding({ graceMs: 300, exit: () => {} })
    try {
      expect(forwardedSignal()).toBeUndefined()
      const first = spawnRunnerAsync('sh').run(['-c', 'sleep 30'], { cwd: CWD, processGroup: true })
      process.emit('SIGTERM')
      expect(forwardedSignal()).toBe('SIGTERM')
      expect(forwardedExitCode()).toBe(143)
      expect((await first).reason).toBe('signal')

      const refused = await spawnRunnerAsync('sh').run(['-c', 'echo ran'], {
        cwd: CWD,
        processGroup: true,
      })
      expect(refused).toMatchObject({ neverExited: true, reason: 'abort', stdout: '' })
      expect(refused.error).toBe('not started: the host got SIGTERM and is stopping')
      const managed = managedProcessRunner('sh').run(['-c', 'sleep 30'], {
        cwd: CWD,
        processGroup: true,
      })
      expect(managed.pid).toBe(-1)
      expect(await managed.exited).toMatchObject({ reason: 'abort', neverExited: true })
      // A run without a group is not the forwarding's to refuse.
      expect((await spawnRunnerAsync('sh').run(['-c', 'echo ran'], { cwd: CWD })).stdout).toBe(
        'ran\n',
      )
    } finally {
      uninstall()
    }
    expect(forwardedSignal()).toBeUndefined()
    expect(forwardedExitCode()).toBeUndefined()
  },
  10_000,
)

test.skipIf(!posix)(
  'an aborted group stays registered until its SIGKILL follow-up empties it',
  async () => {
    const controller = new AbortController()
    let pid = 0
    const run = spawnRunnerAsync('sh').run(['-c', 'trap "" TERM; sleep 30'], {
      cwd: CWD,
      processGroup: true,
      signal: controller.signal,
      onSpawn: (p) => {
        pid = p
      },
    })
    // Let sh install its trap before the abort's SIGTERM.
    await new Promise((r) => setTimeout(r, 200))
    controller.abort()
    expect((await run).reason).toBe('abort')
    try {
      expect(liveProcessGroups()).toContain(pid)
      const end = performance.now() + 4_000
      while (liveProcessGroups().includes(pid) && performance.now() < end) {
        await new Promise((r) => setTimeout(r, 50))
      }
      expect(liveProcessGroups()).not.toContain(pid)
    } finally {
      try {
        process.kill(-pid, 'SIGKILL')
      } catch {}
    }
  },
  10_000,
)

test.skipIf(!posix)(
  'a host whose own listener keeps running gets its groups killed but can start new ones',
  async () => {
    const own = () => {}
    process.on('SIGTERM', own)
    const uninstall = installGroupSignalForwarding({ graceMs: 300, exit: () => {} })
    try {
      const first = spawnRunnerAsync('sh').run(['-c', 'sleep 30'], { cwd: CWD, processGroup: true })
      process.emit('SIGTERM')
      expect((await first).reason).toBe('signal')
      expect(forwardedSignal()).toBeUndefined()
      const next = await spawnRunnerAsync('sh').run(['-c', 'echo ran'], {
        cwd: CWD,
        processGroup: true,
      })
      expect(next).toMatchObject({ exitCode: 0, stdout: 'ran\n' })
    } finally {
      uninstall()
      process.off('SIGTERM', own)
    }
  },
  10_000,
)
