/**
 * On-disk compatibility.
 *
 * `fixtures/session/` holds an `events.jsonl`, the `record.json` the writer
 * projects from it (as `record.json.golden`, so a formatter leaves its bytes
 * alone), and `reduction.json`, the reducer's verdict once a line of an unknown
 * kind is appended. Replaying the events must reproduce both files byte for
 * byte, so an existing store reads and keeps growing unchanged.
 *
 * `fixtures/legacy-session/` is the same session as written before 0.3.3, with
 * the old keys `engine`, `claudeFlags` and `sdlcPin`, and the record the writer
 * of that time projected. It must load as the current format.
 */

import { cpSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'
import { z } from 'zod'

import { defineSessionModel, looseSessionModel } from '../model.ts'

const fixtures = join(import.meta.dirname, 'fixtures')
const read = (name: string) => readFileSync(join(fixtures, name), 'utf-8')

const model = defineSessionModel({
  harness: z.enum(['aider', 'goose']),
  host: z.enum(['terminal', 'tmux']),
  launchFlags: z.object({}).passthrough(),
})

/** A scratch directory, removed after `body`. */
function inTemp(body: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'observe-compat-'))
  try {
    body(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function replay(dir: string, log: string): void {
  for (const line of log.trim().split('\n')) {
    const { ts, ...event } = JSON.parse(line) as { ts: string }
    model.recordSessionEventIn(dir, event as never, ts)
  }
}

describe('on-disk compatibility', () => {
  test('replaying the events reproduces events.jsonl and record.json byte for byte', () => {
    inTemp((dir) => {
      replay(dir, read('session/events.jsonl'))
      expect(readFileSync(join(dir, 'events.jsonl'), 'utf-8')).toBe(read('session/events.jsonl'))
      expect(readFileSync(join(dir, 'record.json'), 'utf-8')).toBe(
        read('session/record.json.golden'),
      )
    })
  })

  test('record.json is owner-only', () => {
    inTemp((dir) => {
      replay(dir, read('session/events.jsonl'))
      expect(statSync(join(dir, 'record.json')).mode & 0o777).toBe(0o600)
    })
  })

  test('the reducer skips an unknown kind and ignores what it ignored before', () => {
    const later = '{"ts":"2026-10-09T10:09:02.000Z","kind":"later_kind"}\n'
    const expected = JSON.parse(read('session/reduction.json')) as unknown
    const verdict = (r: {
      state: unknown
      outcome: unknown
      ignored: { index: number; reason: string }[]
    }) => ({
      state: r.state,
      outcome: r.outcome,
      ignored: r.ignored.map((i) => ({ index: i.index, reason: i.reason })),
    })
    for (const log of [read('session/events.jsonl'), read('legacy-session/events.jsonl')]) {
      const strict = model.reduceSessionEvents(model.parseSessionEvents(log + later))
      const loose = looseSessionModel.reduceSessionEvents(
        looseSessionModel.parseSessionEvents(log + later),
      )
      expect(verdict(strict)).toEqual(expected)
      expect(verdict(loose)).toEqual(expected)
    }
  })

  test('the recorded projection reads back through the record schema', () => {
    const r = model.reduceSessionEvents(model.parseSessionEvents(read('session/events.jsonl')))
    const golden = JSON.parse(read('session/record.json.golden')) as { logBytes: number }
    expect(model.SessionRecordSchema.parse(golden)).toEqual(golden)
    expect({ ...r.record, logBytes: golden.logBytes }).toEqual(golden)
  })
})

describe('a store written before 0.3.3', () => {
  const current = JSON.parse(read('session/record.json.golden')) as Record<string, unknown>
  const { logBytes: _bytes, ...currentRecord } = current

  test('its events reduce to the current record, with the renamed keys', () => {
    const r = model.reduceSessionEvents(
      model.parseSessionEvents(read('legacy-session/events.jsonl')),
    )
    expect(r.record).toEqual(currentRecord)
    expect(r.record).toMatchObject({
      harness: 'aider',
      launchFlags: { verbose: true },
      pin: 'agent-tool@1.2.0',
    })
    expect(r.record).not.toHaveProperty('engine')
  })

  test('its record.json reads as the current record', () => {
    const legacy = JSON.parse(read('legacy-session/record.json.golden')) as Record<string, unknown>
    expect(Object.keys(legacy)).toEqual(
      expect.arrayContaining(['engine', 'claudeFlags', 'sdlcPin']),
    )
    const { logBytes, ...parsed } = model.SessionRecordSchema.parse(legacy)
    expect(logBytes).toBe(legacy['logBytes'])
    expect(parsed).toEqual(currentRecord)
  })

  test('readSessionRecordIn reads its directory, by the projection and by the log', () => {
    inTemp((dir) => {
      cpSync(join(fixtures, 'legacy-session', 'events.jsonl'), join(dir, 'events.jsonl'))
      cpSync(join(fixtures, 'legacy-session', 'record.json.golden'), join(dir, 'record.json'))
      // The projection covers the whole log, so it is read as it stands.
      expect(model.readSessionRecordIn(dir)).toMatchObject({ ...currentRecord, harness: 'aider' })
      expect(looseSessionModel.readSessionRecordIn(dir)).toMatchObject({ pin: 'agent-tool@1.2.0' })
    })
  })

  test('appending to it keeps the old lines and writes the new keys', () => {
    inTemp((dir) => {
      cpSync(join(fixtures, 'legacy-session', 'events.jsonl'), join(dir, 'events.jsonl'))
      const record = model.recordSessionEventIn(
        dir,
        { kind: 'pr_linked', prNumber: 18 },
        '2026-10-09T10:10:00.000Z',
      )
      expect(record).toMatchObject({ harness: 'aider', prNumber: 18 })
      expect(readFileSync(join(dir, 'events.jsonl'), 'utf-8')).toBe(
        read('legacy-session/events.jsonl') +
          '{"ts":"2026-10-09T10:10:00.000Z","kind":"pr_linked","prNumber":18}\n',
      )
      const written = JSON.parse(readFileSync(join(dir, 'record.json'), 'utf-8')) as object
      expect(written).toHaveProperty('harness', 'aider')
      expect(written).not.toHaveProperty('engine')
      expect(written).not.toHaveProperty('claudeFlags')
      expect(written).not.toHaveProperty('sdlcPin')
    })
  })

  test('a line carrying both an old and a new key keeps the new one', () => {
    const [first] = model.parseSessionEvents(
      read('session/events.jsonl')
        .split('\n')[0]!
        .replace('"harness":"aider"', '"engine":"goose","harness":"aider"') + '\n',
    )
    expect(first).toMatchObject({ kind: 'launched', harness: 'aider' })
  })
})
