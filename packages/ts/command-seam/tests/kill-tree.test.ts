/**
 * `killTree`: a stopped async run kills the processes its child started,
 * not only the child. The child is a node script, so the test runs on every
 * OS: process groups on POSIX, `taskkill /t` on Windows.
 */

import { afterEach, describe, expect, test } from 'vitest'

import { spawnRunnerAsync } from '../src/index.ts'
import { taskkillPath, treeKillArgv } from '../src/async.ts'
import { alive, gone, reap } from './support/procs.ts'

// Starts a grandchild that holds no pipe, prints its pid, then waits.
const PARENT = `
const { spawn } = require('node:child_process')
const c = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' })
console.log(c.pid)
setTimeout(() => {}, 60000)
`

const node = spawnRunnerAsync(process.execPath)
const leftovers: number[] = []
afterEach(() => {
  for (const pid of leftovers.splice(0)) reap(pid)
})

/** Run PARENT until it is stopped, and return the grandchild's pid. */
async function stopped(opts: { killTree?: boolean; abort?: boolean }): Promise<number> {
  const ac = new AbortController()
  const pending = node.run(['-e', PARENT], {
    cwd: process.cwd(),
    ...(opts.abort === true ? { signal: ac.signal } : { timeoutMs: 1_500 }),
    ...(opts.killTree === true ? { killTree: true } : {}),
  })
  if (opts.abort === true) setTimeout(() => ac.abort(), 1_500)
  const r = await pending
  expect(r.neverExited).toBe(true)
  const pid = Number(r.stdout.trim())
  leftovers.push(pid)
  return pid
}

describe('killTree', () => {
  // POSIX only: on Windows a Node parent kills its children when it dies (libuv job object), so nothing survives.
  test.skipIf(process.platform === 'win32')(
    'a timeout without it leaves the grandchild running',
    async () => {
      const pid = await stopped({})
      await new Promise((res) => setTimeout(res, 300))
      expect(alive(pid)).toBe(true)
    },
    15_000,
  )

  test('a timeout with it kills the grandchild', async () => {
    const pid = await stopped({ killTree: true })
    expect(await gone(pid, 5_000)).toBe(true)
  }, 15_000)

  test('an abort with it kills the grandchild', async () => {
    const pid = await stopped({ killTree: true, abort: true })
    expect(await gone(pid, 5_000)).toBe(true)
  }, 15_000)

  test('taskkill is an absolute path under SystemRoot, not found on PATH', () => {
    const saved = process.env['SystemRoot']
    process.env['SystemRoot'] = 'D:\\Win'
    try {
      expect(taskkillPath()).toBe('D:\\Win\\System32\\taskkill.exe')
    } finally {
      if (saved === undefined) delete process.env['SystemRoot']
      else process.env['SystemRoot'] = saved
    }
  })

  test('taskkill gets the pid, the tree flag and force', () => {
    expect(treeKillArgv(42)).toEqual(['/pid', '42', '/t', '/f'])
  })
})
