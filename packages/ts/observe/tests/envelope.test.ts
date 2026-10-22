import { describe, expect, test } from 'vitest'

import {
  correlationFromEnv,
  LOG_SOURCES,
  LogEnvelopeSchema,
  LogSourceSchema,
  newRunId,
  newSortableId,
} from '../src/envelope.ts'

describe('LogEnvelopeSchema', () => {
  const base = { v: 1, ts: '2026-10-08T20:11:03.120Z', kind: 'x', writer: 'm', source: 'cli' }

  test('accepts the envelope with and without the correlation ids', () => {
    expect(LogEnvelopeSchema.safeParse(base).success).toBe(true)
    expect(
      LogEnvelopeSchema.safeParse({ ...base, session: 's', run: 'r-1', subject: 'issue-1' })
        .success,
    ).toBe(true)
  })

  test('refuses another version or an unknown source', () => {
    expect(LogEnvelopeSchema.safeParse({ ...base, v: 2 }).success).toBe(false)
    expect(LogEnvelopeSchema.safeParse({ ...base, source: 'elsewhere' }).success).toBe(false)
  })
})

describe('correlationFromEnv', () => {
  test('reads the three variables', () => {
    expect(
      correlationFromEnv({ OBSERVE_SESSION: 's1', OBSERVE_RUN: 'r-1', OBSERVE_SUBJECT: 'issue-1' }),
    ).toEqual({ session: 's1', run: 'r-1', subject: 'issue-1' })
  })

  test('reads the legacy SDLC_ names; when the two names differ the legacy one wins', () => {
    expect(
      correlationFromEnv({ SDLC_SESSION: 's1', SDLC_RUN: 'r-1', SDLC_SUBJECT: 'issue-1' }),
    ).toEqual({ session: 's1', run: 'r-1', subject: 'issue-1' })
    // A pre-0.3.3 launcher nested in a newer session sets only SDLC_*; the inherited
    // OBSERVE_* value is stale.
    expect(correlationFromEnv({ OBSERVE_SESSION: 'A', SDLC_SESSION: 'B' })).toEqual({
      session: 'B',
    })
    expect(correlationFromEnv({ OBSERVE_RUN: 'r-new', SDLC_RUN: 'r-old' })).toEqual({
      run: 'r-old',
    })
    // Equal values, or an OBSERVE_ name with no legacy one, read as that value.
    expect(correlationFromEnv({ OBSERVE_SESSION: 'A', SDLC_SESSION: 'A' })).toEqual({
      session: 'A',
    })
    expect(correlationFromEnv({ OBSERVE_SESSION: 'A' })).toEqual({ session: 'A' })
  })

  test('an unset or empty variable is absent', () => {
    expect(correlationFromEnv({ OBSERVE_SESSION: '', OBSERVE_RUN: undefined })).toEqual({})
  })
})

describe('LOG_SOURCES', () => {
  test('is the closed list the schema accepts', () => {
    expect(LOG_SOURCES).toEqual(['launcher', 'hook', 'digest', 'op', 'cli'])
    for (const source of LOG_SOURCES) expect(LogSourceSchema.parse(source)).toBe(source)
    expect(LogSourceSchema.safeParse('other').success).toBe(false)
  })
})

describe('ids', () => {
  test('a run id is r- and 26 Crockford base32 characters', () => {
    expect(newRunId()).toMatch(/^r-[0-9A-HJKMNP-TV-Z]{26}$/)
  })

  test('ids minted at later times sort later', () => {
    const ids = [1_000, 2_000, 60_000, 1_790_000_000_000].map((t) => newRunId(t))
    expect([...ids].sort()).toEqual(ids)
  })

  test('ids minted in the same millisecond differ', () => {
    expect(newSortableId('i-', 5)).not.toBe(newSortableId('i-', 5))
  })
})
