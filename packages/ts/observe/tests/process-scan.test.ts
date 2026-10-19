import { describe, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { spawnRunnerAsync, type CommandRunner } from '@osdlc/command-seam'

import { sessionEnv } from '../env.ts'
import {
  liveSessionIds,
  parsePsEnvironment,
  processScanSupported,
  scanTaggedProcesses,
} from '../process-scan.ts'

const COMMANDS = '  4242 agent -- hi\n  1 /sbin/launchd\n'
const WITH_ENV =
  '  4242 agent -- hi HOME=/home/me OBSERVE_SESSION=abc-123 OBSERVE_TASK=issue-12 PATH=/usr/bin\n' +
  '  1 /sbin/launchd\n'

/** A `ps` fake: `-E` gets `withEnv`, the plain listing gets `commands`. */
function ps(exitCode: number, withEnv: string, commands: string): CommandRunner {
  return {
    run: (argv) => ({ exitCode, stdout: argv.includes('-E') ? withEnv : commands, stderr: '' }),
  }
}

describe('scanTaggedProcesses', () => {
  test('parses a ps -E line holding both tags into one entry', () => {
    expect(scanTaggedProcesses(ps(0, WITH_ENV, COMMANDS), { platform: 'darwin' })).toEqual([
      { pid: 4242, sessionId: 'abc-123', task: 'issue-12' },
    ])
  })

  test('returns null (could not tell) when ps exits non-zero', () => {
    expect(scanTaggedProcesses(ps(1, WITH_ENV, COMMANDS), { platform: 'darwin' })).toBeNull()
  })

  test('returns null when the runner throws', () => {
    const runner: CommandRunner = {
      run: () => {
        throw new Error('spawn failed')
      },
    }
    expect(scanTaggedProcesses(runner, { platform: 'darwin' })).toBeNull()
  })

  test('returns null on an unsupported platform', () => {
    expect(scanTaggedProcesses(ps(0, WITH_ENV, COMMANDS), { platform: 'win32' })).toBeNull()
  })

  test('returns [] (none running) when ps works and nothing is tagged', () => {
    expect(scanTaggedProcesses(ps(0, COMMANDS, COMMANDS), { platform: 'darwin' })).toEqual([])
  })

  test('returns null when /proc cannot be read', () => {
    expect(
      scanTaggedProcesses(ps(1, '', ''), { platform: 'linux', procDir: '/nonexistent-proc' }),
    ).toBeNull()
  })

  test('a tag in the arguments of a process with no readable environment is ignored', () => {
    // A SIP-protected shell: `ps -E` prints its command line and no environment.
    const line = '  17 bash -c env OBSERVE_SESSION=abc node x\n'
    expect(parsePsEnvironment(line, line)).toEqual([])
  })

  test('a tagged process whose command changed between snapshots is "could not tell"', () => {
    expect(parsePsEnvironment('7 agent OBSERVE_SESSION=s X=1', '7 node other')).toBeNull()
  })

  test('a tagged process that exited between snapshots is skipped', () => {
    expect(parsePsEnvironment('7 agent OBSERVE_SESSION=s X=1', '1 launchd')).toEqual([])
  })

  test('an empty task tag reads as no task', () => {
    expect(parsePsEnvironment('7 agent OBSERVE_SESSION=s OBSERVE_TASK= X=1', '7 agent')).toEqual([
      { pid: 7, sessionId: 's', task: null },
    ])
  })

  test('reads the legacy SDLC_ tags of a process an older launcher started', () => {
    expect(parsePsEnvironment('7 agent SDLC_SESSION=s SDLC_TASK=t X=1', '7 agent')).toEqual([
      { pid: 7, sessionId: 's', task: 't' },
    ])
  })

  test('when the two names differ the legacy one wins (a pre-0.3.3 launcher nested in a newer session)', () => {
    expect(parsePsEnvironment('7 agent OBSERVE_SESSION=A SDLC_SESSION=B X=1', '7 agent')).toEqual([
      { pid: 7, sessionId: 'B', task: null },
    ])
    expect(
      parsePsEnvironment('7 agent SDLC_SESSION=same OBSERVE_SESSION=same X=1', '7 agent'),
    ).toEqual([{ pid: 7, sessionId: 'same', task: null }])
  })

  test('reads /proc/<pid>/environ on linux', () => {
    const proc = mkdtempSync(join(tmpdir(), 'observe-proc-'))
    mkdirSync(join(proc, '99'))
    writeFileSync(join(proc, '99', 'environ'), 'HOME=/root\0OBSERVE_SESSION=s9\0')
    mkdirSync(join(proc, '98'))
    writeFileSync(join(proc, '98', 'environ'), 'SDLC_SESSION=s8\0SDLC_TASK=t8\0')
    mkdirSync(join(proc, '100'))
    mkdirSync(join(proc, 'self'))
    const found = scanTaggedProcesses(ps(1, '', ''), { platform: 'linux', procDir: proc })
    expect(found?.sort((a, b) => a.pid - b.pid)).toEqual([
      { pid: 98, sessionId: 's8', task: 't8' },
      { pid: 99, sessionId: 's9', task: null },
    ])
    rmSync(proc, { recursive: true, force: true })
  })
})

test('only linux and darwin can be scanned', () => {
  expect(processScanSupported('linux')).toBe(true)
  expect(processScanSupported('darwin')).toBe(true)
  expect(processScanSupported('win32')).toBe(false)
})

/** Resolves once `pid` is gone (`kill(pid, 0)` fails with ESRCH); rejects after 10 s. */
async function exited(pid: number): Promise<void> {
  const deadline = Date.now() + 10_000
  for (;;) {
    try {
      process.kill(pid, 0)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ESRCH') return
      throw e
    }
    if (Date.now() > deadline) throw new Error(`pid ${pid} still running after 10 s`)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

describe('liveSessionIds', () => {
  test.skipIf(!processScanSupported())(
    'finds a running process launched with sessionEnv',
    async () => {
      const id = crypto.randomUUID()
      const abort = new AbortController()
      let pid = 0
      let spawned!: () => void
      const started = new Promise<void>((resolve) => (spawned = resolve))
      const child = spawnRunnerAsync(process.execPath).run(['-e', 'setTimeout(() => {}, 20000)'], {
        cwd: import.meta.dirname,
        env: sessionEnv({ id, machine: 'm-0123456789abcdef' }),
        timeoutMs: 30_000,
        signal: abort.signal,
        onSpawn: (p) => {
          pid = p
          spawned()
        },
      })
      try {
        await started
        expect(liveSessionIds()?.has(id)).toBe(true)
      } finally {
        abort.abort()
        await child
      }
      // An abort settles the run at once, before the child has exited.
      await exited(pid)
      expect(liveSessionIds()?.has(id)).toBe(false)
    },
    30_000,
  )

  test.skipIf(processScanSupported())('reports could not tell where it cannot scan', () => {
    expect(liveSessionIds()).toBeNull()
  })
})
