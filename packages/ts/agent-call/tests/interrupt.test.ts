/**
 * With command-seam's signal forwarding installed in the host, a signal to the
 * host kills the agent's process group. The host runs as a child node process,
 * so the signal does not reach the test runner.
 */

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, expect, test } from 'vitest'

const posix = process.platform !== 'win32'
const dir = mkdtempSync(join(tmpdir(), 'agent-call-interrupt-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const PACKAGE_DIR = join(import.meta.dirname, '..')
const HOST = join(import.meta.dirname, 'support', 'interrupt-host.mjs')
// The host runs the emitted JavaScript: the sources use syntax that Node's
// type stripping does not run. It sits under node_modules/.cache, so the
// package's dependencies resolve from it.
const EMITTED = join(PACKAGE_DIR, 'node_modules', '.cache', 'interrupt-host')

beforeAll(() => {
  execFileSync(
    join(PACKAGE_DIR, 'node_modules', '.bin', 'tsc'),
    ['-p', 'tsconfig.build.json', '--outDir', EMITTED, '--incremental', 'false'],
    { cwd: PACKAGE_DIR, stdio: 'inherit' },
  )
}, 60_000)

/** A fake agent that writes its pid, starts a grandchild, and stays alive. */
function fakeAgent(name: string): { binary: string; pidFile: string } {
  const bin = join(dir, name)
  mkdirSync(bin, { recursive: true })
  const pidFile = join(dir, `${name}.pid`)
  const binary = join(bin, 'agent')
  writeFileSync(binary, `#!/bin/sh\necho $$ > '${pidFile}'\nexec sleep 30\n`, { mode: 0o755 })
  return { binary, pidFile }
}

async function readPid(pidFile: string): Promise<number> {
  while (!existsSync(pidFile) || readFileSync(pidFile, 'utf8').trim() === '') {
    await new Promise((r) => setTimeout(r, 20))
  }
  return Number(readFileSync(pidFile, 'utf8').trim())
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function gone(pid: number): Promise<boolean> {
  const end = performance.now() + 3_000
  while (performance.now() < end) {
    if (!alive(pid)) return true
    await new Promise((r) => setTimeout(r, 25))
  }
  return false
}

function startHost(binary: string, extra: string[] = []) {
  const host = spawn(process.execPath, [HOST, EMITTED, binary, ...extra], {
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  let out = ''
  host.stdout.on('data', (d: Buffer) => (out += d.toString()))
  const exited = new Promise<number | null>((res) => host.on('exit', (code) => res(code)))
  return { host, exited, output: () => out }
}

test.skipIf(!posix)(
  'SIGINT to a host with forwarding installed kills the agent group and exits 130',
  async () => {
    const { binary, pidFile } = fakeAgent('sigint')
    const { host, exited } = startHost(binary)
    let pid = 0
    try {
      pid = await readPid(pidFile)
      expect(alive(pid)).toBe(true)
      host.kill('SIGINT')
      expect(await exited).toBe(130)
      expect(await gone(pid)).toBe(true)
    } finally {
      if (pid > 0 && alive(pid)) process.kill(pid, 'SIGKILL')
      host.kill('SIGKILL')
    }
  },
  20_000,
)

test.skipIf(!posix)(
  'SIGTERM to the host kills the agent group and exits 143',
  async () => {
    const { binary, pidFile } = fakeAgent('sigterm')
    const { host, exited } = startHost(binary)
    let pid = 0
    try {
      pid = await readPid(pidFile)
      host.kill('SIGTERM')
      expect(await exited).toBe(143)
      expect(await gone(pid)).toBe(true)
    } finally {
      if (pid > 0 && alive(pid)) process.kill(pid, 'SIGKILL')
      host.kill('SIGKILL')
    }
  },
  20_000,
)

test.skipIf(!posix)(
  'a host that already got the signal starts no agent: the call fails with spawn-failed',
  async () => {
    const { binary, pidFile } = fakeAgent('refused')
    const { host, exited, output } = startHost(binary, ['--again'])
    let pid = 0
    try {
      pid = await readPid(pidFile)
      rmSync(pidFile)
      host.kill('SIGTERM')
      expect(await exited).toBe(143)
      expect(await gone(pid)).toBe(true)
      const second = /second=(.*)/.exec(output())?.[1]
      expect(second).toBeDefined()
      expect(JSON.parse(second!)).toMatchObject({ reason: 'spawn-failed' })
      expect(second).toContain('SIGTERM')
      // The second call started nothing: the fake agent never wrote its pid.
      expect(existsSync(pidFile)).toBe(false)
    } finally {
      if (pid > 0 && alive(pid)) process.kill(pid, 'SIGKILL')
      host.kill('SIGKILL')
    }
  },
  20_000,
)
