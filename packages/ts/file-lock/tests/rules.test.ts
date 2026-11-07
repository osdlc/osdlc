import { describe, expect, test } from 'vitest'

import { type HeldLock, holderGone, pidAlive, untouchedFor } from '../src/index.ts'

import { DEAD_PID } from './helpers.ts'

function held<F extends object>(content: F | null, mtimeMs = 0): HeldLock<F> {
  return { content, mtimeMs, raw: JSON.stringify(content) }
}

describe('pidAlive', () => {
  test('this process is alive; a pid past pid_max is not', () => {
    expect(pidAlive(process.pid)).toBe(true)
    expect(pidAlive(DEAD_PID)).toBe(false)
  })

  test('a pid that is not a positive integer is not alive', () => {
    // process.kill(0) would signal this process group, and a negative pid a group.
    for (const pid of [0, -1, 1.5, Number.NaN]) expect(pidAlive(pid)).toBe(false)
  })
})

describe('holderGone', () => {
  type Lease = { pid?: number; holders?: number[] }
  const rule = holderGone<Lease>((c) => [c.pid, ...(c.holders ?? [])])

  test('stale only when the owner and every holder are gone', () => {
    expect(rule(held({ pid: DEAD_PID }))).toBe(true)
    expect(rule(held({ pid: process.pid }))).toBe(false)
    expect(rule(held({ pid: DEAD_PID, holders: [process.pid] }))).toBe(false)
    expect(rule(held({ pid: DEAD_PID, holders: [DEAD_PID - 1] }))).toBe(true)
  })

  test('values that are not numbers name no holder', () => {
    expect(rule(held({ pid: 'x' as unknown as number }))).toBe(true)
    expect(rule(held({}))).toBe(true)
  })

  test('an unparseable lock is never judged gone', () => {
    expect(rule(held(null))).toBe(false)
  })

  test('the liveness probe can be replaced', () => {
    const seen: number[] = []
    const probed = holderGone<Lease>((c) => [c.pid], {
      alive: (pid) => {
        seen.push(pid)
        return false
      },
    })
    expect(probed(held({ pid: process.pid }))).toBe(true)
    expect(seen).toEqual([process.pid])
  })
})

describe('untouchedFor', () => {
  test('stale once untouched for longer than the limit', () => {
    const rule = untouchedFor(1000, () => 10_000)
    expect(rule(held({}, 9_000))).toBe(false)
    expect(rule(held({}, 8_999))).toBe(true)
  })

  test('the clock defaults to Date.now', () => {
    expect(untouchedFor(60_000)(held({}, Date.now()))).toBe(false)
    expect(untouchedFor(60_000)(held({}, Date.now() - 120_000))).toBe(true)
  })
})
