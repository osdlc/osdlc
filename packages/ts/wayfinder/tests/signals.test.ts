/**
 * Ctrl-C reaches the probes. system-model runs each probe in its own process
 * group, so the terminal's SIGINT goes to wayfinder only. wayfinder must kill
 * the probe groups when it is signalled, or a wedged probe outlives it with
 * no deadline.
 */

import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, test } from 'vitest'

import { spawnRunnerAsync } from '@osdlc/command-seam'

const CLI = join(import.meta.dirname, '../src/cli.ts')
const dirs: string[] = []
const started: number[] = []
afterAll(async () => {
  // A failed case leaves its probe running.
  for (const pid of started) if (alive(pid)) process.kill(pid, 'SIGKILL')
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })))
})

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function until(check: () => Promise<boolean> | boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (await check()) return true
    await new Promise((r) => setTimeout(r, 50))
  }
  return false
}

describe.skipIf(process.platform === 'win32')('signals', () => {
  test.each(['SIGINT', 'SIGTERM', 'SIGHUP'] as const)(
    '%s stops a slow probe and the processes it started',
    async (signal) => {
      const base = await mkdtemp(join(tmpdir(), 'way-signals-'))
      dirs.push(base)
      const repo = join(base, 'repo')
      const bin = join(base, 'bin')
      const pids = join(base, 'pids')
      await mkdir(repo)
      await mkdir(bin)
      await writeFile(join(repo, 'justfile'), 'build:\n    echo hi\n')
      // A probe that forks and then hangs, writing its own pid and its child's.
      await writeFile(
        join(bin, 'just'),
        `#!/bin/sh\nsleep 45 &\necho $$ $! > '${pids}'\nsleep 44\n`,
      )
      await chmod(join(bin, 'just'), 0o755)

      let wayPid = 0
      const run = spawnRunnerAsync(process.execPath).run(
        [CLI, '--json', '--exec', '--only', 'just', '-C', repo],
        {
          cwd: base,
          env: {
            PATH: `${bin}:/usr/bin:/bin`,
            HOME: base,
            XDG_CONFIG_HOME: join(base, 'config'),
            XDG_STATE_HOME: join(base, 'state'),
            XDG_CACHE_HOME: join(base, 'cache'),
          },
          timeoutMs: 30_000,
          onSpawn: (pid) => {
            wayPid = pid
          },
        },
      )
      const ready = await until(async () => {
        try {
          return (await readFile(pids, 'utf-8')).trim().split(' ').length === 2
        } catch {
          return false
        }
      }, 15_000)
      expect(ready).toBe(true)
      const probe = (await readFile(pids, 'utf-8')).trim().split(' ').map(Number)
      started.push(...probe)

      process.kill(wayPid, signal)
      const res = await run
      expect(res.reason).toBeUndefined()
      expect(await until(() => probe.every((p) => !alive(p)), 5_000)).toBe(true)
    },
    40_000,
  )
})
