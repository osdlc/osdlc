/**
 * The core entry: the envelope, correlation through the environment, sortable
 * ids, and the JSONL writer and readers.
 */

import { appendFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  appendJsonl,
  correlationFromEnv,
  INVOCATION_ENV_VAR,
  INVOCATION_PID_ENV_VAR,
  jsonlSize,
  LOG_ENVELOPE_VERSION,
  LOG_SOURCES,
  LogEnvelopeSchema,
  LogSourceSchema,
  newRunId,
  newSortableId,
  parseJsonl,
  readJsonl,
  readJsonlFrom,
  RUN_ENV_VAR,
  SESSION_ENV_VAR,
  SUBJECT_ENV_VAR,
  type AppendOptions,
  type Correlation,
  type JsonlTail,
  type LogEnvelope,
  type LogSource,
} from '@osdlc/observe'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'observe-log-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('the envelope', () => {
  test('every line starts with the same fields', () => {
    const line: LogEnvelope = {
      v: LOG_ENVELOPE_VERSION,
      ts: '2026-10-17T09:00:00.000Z',
      kind: 'op.start',
      writer: 'm-0123456789abcdef',
      source: 'op',
      run: 'r-01JABCDEFGHJKMNPQRSTVWXYZ0',
    }

    expect(LogEnvelopeSchema.parse(line)).toEqual(line)
    expect(LogEnvelopeSchema.safeParse({ ...line, source: 'cron' }).success).toBe(false)
  })

  test('the sources are a closed list', () => {
    const source: LogSource = LogSourceSchema.parse('hook')

    expect(LOG_SOURCES).toContain(source)
  })
})

describe('correlation', () => {
  test('a child reads the ids its parent handed down', () => {
    const parentRun = newRunId()
    const childEnv = {
      [RUN_ENV_VAR]: parentRun,
      [SUBJECT_ENV_VAR]: 'issue-42',
      [SESSION_ENV_VAR]: '',
    }

    const ids: Correlation = correlationFromEnv(childEnv)

    expect(ids).toEqual({ run: parentRun, subject: 'issue-42' })
  })

  test('a process started by an older writer carries the legacy SDLC_ names', () => {
    expect(correlationFromEnv({ SDLC_RUN: 'r-OLD' })).toEqual({ run: 'r-OLD' })
  })

  test('an op names itself to the sessions it launches', () => {
    const invocation = newSortableId('i-')
    const env = {
      [INVOCATION_ENV_VAR]: invocation,
      [INVOCATION_PID_ENV_VAR]: String(process.pid),
    }

    expect(env).toEqual({
      OBSERVE_INVOCATION: invocation,
      OBSERVE_INVOCATION_PID: String(process.pid),
    })
  })

  test('ids sort by the time they were minted', () => {
    const earlier = newSortableId('i-', Date.parse('2026-10-17T09:00:00Z'))
    const later = newSortableId('i-', Date.parse('2026-10-17T09:00:01Z'))

    expect(earlier < later).toBe(true)
    expect(earlier).toMatch(/^i-[0-9A-HJKMNP-TV-Z]{26}$/)
  })
})

describe('the JSONL writer and readers', () => {
  test('append, then read the whole file', () => {
    const path = join(dir, 'activity.jsonl')
    const trace: AppendOptions = { sync: false }

    appendJsonl(path, { n: 1 })
    appendJsonl(path, { n: 2 }, trace)

    expect(readJsonl(path)).toEqual([{ n: 1 }, { n: 2 }])
  })

  test('a torn last line is dropped, and the next append starts on a fresh line', () => {
    const path = join(dir, 'torn.jsonl')
    appendJsonl(path, { n: 1 })
    appendFileSync(path, '{"n":2,"tor') // a writer that crashed mid-line

    expect(parseJsonl('{"n":1}\n{"n":2,"tor')).toEqual([{ n: 1 }])
    appendJsonl(path, { n: 3 })
    expect(readJsonl(path)).toEqual([{ n: 1 }, { n: 3 }])
  })

  test('tail a log: read only what was appended since the last offset', () => {
    const path = join(dir, 'events.jsonl')
    let offset = jsonlSize(path) // 0: the file does not exist yet

    appendJsonl(path, { kind: 'a' })
    const first: JsonlTail = readJsonlFrom(path, offset)
    offset = first.offset
    appendJsonl(path, { kind: 'b' })
    const next = readJsonlFrom(path, offset)

    expect(first.values).toEqual([{ kind: 'a' }])
    expect(next.values).toEqual([{ kind: 'b' }])
    expect(next.offset).toBe(jsonlSize(path))
  })
})
