/**
 * Who launched a session: git `user.name` first, the OS login second, `null`
 * only when neither is readable. The hostname and time zone are reported too.
 */

import { describe, expect, test } from 'vitest'

import { looseSessionModel } from '../src/model.ts'
import { resolveOriginator, type OriginatorProbe } from '../src/machine.ts'

function probe(over: Partial<OriginatorProbe>): OriginatorProbe {
  return {
    gitUserName: () => null,
    osUser: () => null,
    hostname: () => 'laptop.local',
    tz: () => 'Europe/Berlin',
    ...over,
  }
}

describe('resolveOriginator', () => {
  test('git user.name wins, read in the launch directory', () => {
    const cwds: string[] = []
    const who = resolveOriginator(
      '/work/tree',
      probe({
        gitUserName: (cwd) => (cwds.push(cwd), ' Ada Lovelace\n'),
        osUser: () => 'ada',
      }),
    )
    expect(who).toEqual({
      startedBy: 'Ada Lovelace',
      hostname: 'laptop.local',
      tz: 'Europe/Berlin',
    })
    expect(cwds).toEqual(['/work/tree'])
  })

  test('falls back to the OS login when git has no name', () => {
    expect(resolveOriginator('/w', probe({ osUser: () => 'ada' })).startedBy).toBe('ada')
    expect(
      resolveOriginator('/w', probe({ gitUserName: () => '  ', osUser: () => 'ada' })).startedBy,
    ).toBe('ada')
  })

  test('is null only when both fail', () => {
    expect(resolveOriginator('/w', probe({})).startedBy).toBeNull()
  })

  test('identity off reads neither the person nor the hostname, only the zone', () => {
    const reads: string[] = []
    const who = resolveOriginator(
      '/w',
      probe({
        gitUserName: () => (reads.push('git'), 'Ada Lovelace'),
        osUser: () => (reads.push('os'), 'ada'),
        hostname: () => (reads.push('host'), 'laptop.local'),
      }),
      false,
    )
    expect(who).toEqual({ startedBy: null, tz: 'Europe/Berlin' })
    expect(reads).toEqual([])
  })

  test('the live probe reads a hostname and an IANA zone', () => {
    const who = resolveOriginator(process.cwd())
    expect(who.hostname?.length ?? 0).toBeGreaterThan(0)
    expect(who.tz).toMatch(/^[A-Za-z_]+(\/[A-Za-z_+-]+)*$|^UTC$/)
  })
})

describe('the launched event records the originator', () => {
  const launched = {
    ts: '2026-10-09T10:00:00.000Z',
    kind: 'launched' as const,
    id: 's1',
    harness: 'aider',
    sessionKind: 'headless' as const,
    origin: { kind: 'person' as const },
    author: { tool: 'aider', requested: null, model: null, effort: null },
    host: null,
    cwd: '/w',
    branch: null,
    launched: { kind: 'prompt' as const, text: 'hi' },
    operation: null,
    machine: 'm-abc',
  }
  const reduce = (extra: object) =>
    looseSessionModel.reduceSessionEvents([
      looseSessionModel.SessionEventSchema.parse({ ...launched, ...extra }),
    ]).record!

  test('startedBy, hostname and tz land on the record', () => {
    const r = reduce({ startedBy: 'Ada Lovelace', hostname: 'laptop.local', tz: 'Europe/Berlin' })
    expect(r).toMatchObject({
      startedBy: 'Ada Lovelace',
      hostname: 'laptop.local',
      tz: 'Europe/Berlin',
    })
  })

  test('a null startedBy is kept as null (neither source was readable)', () => {
    expect(reduce({ startedBy: null }).startedBy).toBeNull()
  })

  test('a log written before originators were recorded leaves them absent', () => {
    const r = reduce({})
    expect(r.startedBy).toBeUndefined()
    expect(r.hostname).toBeUndefined()
    expect(r.tz).toBeUndefined()
  })
})
