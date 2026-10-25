/**
 * The session model: the state machine as a table, the `done`, `resumed` and
 * `pid_recorded` events, the task a session works on, the read functions over a
 * session directory, a log that never stops growing, and two processes appending
 * to one log.
 */

import { appendFileSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { spawnRunnerAsync } from '@osdlc/command-seam'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { z } from 'zod'

import {
  defineSessionModel,
  EVENTS_FILE,
  isLegalTransition,
  looseSessionModel,
  RECORD_FILE,
  SESSION_DONE_OUTCOMES,
  SESSION_OUTCOMES,
  SESSION_RUN_STATES,
  SessionDoneOutcomeSchema,
  SessionDoneSchema,
  sessionEventsPath,
  SessionLogError,
  type NewSessionEventOfModel,
  type SessionEventOfModel,
  type SessionRecordOfModel,
  type SessionRunState,
} from '../src/model.ts'

const model = defineSessionModel({
  harness: z.enum(['aider', 'goose']),
  host: z.enum(['terminal', 'tmux']),
  launchFlags: z.object({ verbose: z.boolean() }),
})
type Event = SessionEventOfModel<typeof model>
type NewEvent = NewSessionEventOfModel<typeof model>
type SessionRecord = SessionRecordOfModel<typeof model>

const launched: NewEvent = {
  kind: 'launched',
  id: 's1',
  harness: 'aider',
  sessionKind: 'interactive',
  origin: { kind: 'person' },
  author: { tool: 'aider', requested: null, model: null, effort: null },
  host: 'tmux',
  cwd: '/work',
  branch: null,
  launched: { kind: 'prompt', text: 'hi' },
  operation: null,
  machine: 'm-1',
}

/** `events` stamped one second apart. */
function stamp(...events: NewEvent[]): Event[] {
  return events.map(
    (e, i) => ({ ...e, ts: `2026-10-09T10:00:${String(i).padStart(2, '0')}.000Z` }) as Event,
  )
}

const to = (state: SessionRunState): NewEvent => ({
  kind: 'state_changed',
  from: null,
  to: state,
  cause: 'test',
})

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'observe-model-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('the state machine', () => {
  const table: { [S in SessionRunState]: SessionRunState[] } = {
    starting: ['running', 'idle', 'ended'],
    running: ['waiting_for_input', 'idle', 'done', 'ended'],
    waiting_for_input: ['running', 'idle', 'done', 'ended'],
    idle: ['running', 'waiting_for_input', 'done', 'ended'],
    done: ['running', 'done', 'ended'],
    ended: [],
  }

  test('allows exactly the moves the module header lists', () => {
    for (const from of SESSION_RUN_STATES) {
      for (const next of SESSION_RUN_STATES) {
        expect([from, next, isLegalTransition(from, next)]).toEqual([
          from,
          next,
          table[from].includes(next),
        ])
      }
    }
  })

  test('the reducer applies a legal move and ignores an illegal one', () => {
    const r = model.reduceSessionEvents(stamp(launched, to('running'), to('starting')))
    expect(r.state).toBe('running')
    expect(r.ignored.map((i) => [i.index, i.reason])).toEqual([[2, 'illegal_transition']])
  })

  test('a second launched is ignored and the first launch stands', () => {
    const r = model.reduceSessionEvents(
      stamp(launched, to('running'), { ...launched, id: 's2', cwd: '/other' }),
    )
    expect(r.ignored.map((i) => [i.index, i.reason])).toEqual([[2, 'repeated_launched']])
    expect(r.record).toMatchObject({ id: 's1', cwd: '/work', state: 'running' })
  })

  test('a second outcome is ignored: the first outcome and exit code stand', () => {
    const r = model.reduceSessionEvents(
      stamp(
        launched,
        to('running'),
        { kind: 'outcome', outcome: 'ok', exitCode: 0 },
        { kind: 'outcome', outcome: 'failed', exitCode: 1 },
      ),
    )
    expect(r.outcome).toBe('ok')
    expect(r.record?.exitCode).toBe(0)
    expect(r.ignored.map((i) => [i.index, i.reason])).toEqual([[3, 'repeated_outcome']])
  })

  test('a state_changed to ended with no ended event still stamps endedAt', () => {
    const r = model.reduceSessionEvents(stamp(launched, to('running'), to('ended')))
    expect(r.state).toBe('ended')
    expect(r.record?.endedAt).toBe('2026-10-09T10:00:02.000Z')
  })

  test('the outcomes and states are the closed lists', () => {
    expect(SESSION_RUN_STATES).toEqual([
      'starting',
      'running',
      'waiting_for_input',
      'idle',
      'done',
      'ended',
    ])
    expect(SESSION_OUTCOMES).toEqual(['ok', 'failed', 'cancelled', 'timeout', 'lost'])
  })
})

describe('the done event', () => {
  const done: NewEvent = { kind: 'done', outcome: 'ok', note: 'tests pass' }

  test('moves a running session to done and records the declaration', () => {
    const r = model.reduceSessionEvents(stamp(launched, to('running'), done))
    expect(r.state).toBe('done')
    expect(r.record?.done).toEqual({
      at: '2026-10-09T10:00:02.000Z',
      outcome: 'ok',
      note: 'tests pass',
    })
  })

  test('a new prompt clears it; a session that ends done keeps it', () => {
    const reopened = model.reduceSessionEvents(stamp(launched, to('running'), done, to('running')))
    expect(reopened.state).toBe('running')
    expect(reopened.record?.done).toBeUndefined()
    const ended = model.reduceSessionEvents(stamp(launched, to('running'), done, { kind: 'ended' }))
    expect(ended.state).toBe('ended')
    expect(ended.record?.done?.outcome).toBe('ok')
  })

  test('is ignored before the session runs, and after it ended', () => {
    expect(model.reduceSessionEvents(stamp(launched, done)).ignored[0]?.reason).toBe(
      'illegal_transition',
    )
    expect(
      model.reduceSessionEvents(stamp(launched, { kind: 'ended' }, done)).ignored[0]?.reason,
    ).toBe('after_ended')
  })

  test('its schemas accept ok and failed with a note or null', () => {
    expect(SESSION_DONE_OUTCOMES).toEqual(['ok', 'failed'])
    expect(SessionDoneOutcomeSchema.safeParse('timeout').success).toBe(false)
    expect(SessionDoneSchema.parse({ at: 't', outcome: 'failed', note: null })).toEqual({
      at: 't',
      outcome: 'failed',
      note: null,
    })
    expect(SessionDoneSchema.safeParse({ at: 't', outcome: 'ok' }).success).toBe(false)
  })
})

describe('the resumed event', () => {
  const ended: NewEvent[] = [
    launched,
    { kind: 'host_attached', host: 'tmux', harnessSessionId: 'h1', pid: 10 },
    to('running'),
    { kind: 'outcome', outcome: 'ok', exitCode: 0 },
    { kind: 'ended' },
  ]
  const resumed: NewEvent = { kind: 'resumed', host: 'terminal', pid: 20 }

  test('reopens an ended session: starting, end cleared, host and pid refreshed', () => {
    const r = model.reduceSessionEvents(stamp(...ended, resumed))
    expect(r.state).toBe('starting')
    expect(r.outcome).toBeNull()
    expect(r.record).toMatchObject({
      state: 'starting',
      outcome: null,
      endedAt: null,
      exitCode: null,
      host: 'terminal',
      pid: 20,
      harnessSessionId: 'h1',
    })
  })

  test('the reopened session can run and end again', () => {
    const r = model.reduceSessionEvents(
      stamp(
        ...ended,
        resumed,
        to('running'),
        { kind: 'outcome', outcome: 'failed', exitCode: 1 },
        {
          kind: 'ended',
        },
      ),
    )
    expect(r.ignored).toEqual([])
    expect(r.record).toMatchObject({ state: 'ended', outcome: 'failed', exitCode: 1 })
  })

  test('is ignored on a session that has not ended', () => {
    const r = model.reduceSessionEvents(stamp(launched, to('running'), resumed))
    expect(r.state).toBe('running')
    expect(r.ignored.map((i) => i.reason)).toEqual(['illegal_transition'])
  })
})

describe('the pid_recorded event', () => {
  const pid: NewEvent = { kind: 'pid_recorded', pid: 4242 }

  test('sets the pid, and a later attach with no pid keeps it', () => {
    const r = model.reduceSessionEvents(
      stamp(launched, pid, {
        kind: 'host_attached',
        host: 'tmux',
        harnessSessionId: null,
        pid: null,
      }),
    )
    expect(r.record?.pid).toBe(4242)
  })

  test('is ignored after the session ended', () => {
    const r = model.reduceSessionEvents(stamp(launched, { kind: 'ended' }, pid))
    expect(r.record?.pid).toBeNull()
    expect(r.ignored.map((i) => i.reason)).toEqual(['after_ended'])
  })
})

describe('the task a session serves', () => {
  test('the launched event carries it onto the record and record.json', () => {
    const record = model.recordSessionEventIn(
      dir,
      { ...launched, task: 'fix-login' },
      '2026-10-09T10:00:00.000Z',
    )
    expect(record?.task).toBe('fix-login')
    expect(model.readSessionRecordIn(dir)?.task).toBe('fix-login')
    expect(JSON.parse(readFileSync(join(dir, RECORD_FILE), 'utf-8')).task).toBe('fix-login')
  })

  test('a null task, or a log written before tasks were recorded, leaves it absent', () => {
    for (const event of [{ ...launched, task: null }, launched]) {
      const { record } = model.reduceSessionEvents(stamp(event))
      expect(record).not.toBeNull()
      expect(record && 'task' in record).toBe(false)
    }
  })
})

describe('reading a session directory', () => {
  test('the file names and the log path', () => {
    expect([EVENTS_FILE, RECORD_FILE]).toEqual(['events.jsonl', 'record.json'])
    expect(sessionEventsPath('/s/1')).toBe(join('/s/1', 'events.jsonl'))
  })

  test('readSessionEvents reads every event, and [] with no log', () => {
    expect(model.readSessionEvents(dir)).toEqual([])
    model.recordSessionEventIn(dir, launched, '2026-10-09T10:00:00.000Z')
    model.recordSessionEventIn(dir, to('running'), '2026-10-09T10:00:01.000Z')
    expect(model.readSessionEvents(dir).map((e) => e.kind)).toEqual(['launched', 'state_changed'])
  })

  test('tailSessionEvents reads what was appended after an offset', () => {
    model.recordSessionEventIn(dir, launched, '2026-10-09T10:00:00.000Z')
    const first = model.tailSessionEvents(dir, 0)
    expect(first.events.map((e) => e.kind)).toEqual(['launched'])
    model.recordSessionEventIn(dir, to('running'), '2026-10-09T10:00:01.000Z')
    appendFileSync(sessionEventsPath(dir), '{"ts":"x","kind":"later_kind"}\n')
    const next = model.tailSessionEvents(dir, first.offset)
    expect(next.events.map((e) => e.kind)).toEqual(['state_changed'])
    expect(next.offset).toBe(statSync(sessionEventsPath(dir)).size)
  })

  test('readSessionRecordIn reads the projection, or reduces the log when it grew', () => {
    expect(model.readSessionRecordIn(dir)).toBeNull()
    model.recordSessionEventIn(dir, launched, '2026-10-09T10:00:00.000Z')
    expect(model.readSessionRecordIn(dir)?.state).toBe('starting')
    // Appended without updating record.json, so it is stale. The reader reduces the log instead.
    model.appendSessionEvent(dir, { ...to('running'), ts: '2026-10-09T10:00:01.000Z' } as Event)
    const record: SessionRecord | null = model.readSessionRecordIn(dir)
    expect(record?.state).toBe('running')
    expect(JSON.parse(readFileSync(join(dir, RECORD_FILE), 'utf-8')).state).toBe('starting')
  })

  test('appendSessionEvent refuses an event that does not match the schema', () => {
    expect(() => model.appendSessionEvent(dir, { kind: 'pr_linked', ts: 't' } as never)).toThrow()
  })

  test('recordSessionEventAppliedIn says whether the reducer applied the event', () => {
    model.recordSessionEventIn(dir, launched, '2026-10-09T10:00:00.000Z')
    expect(
      model.recordSessionEventAppliedIn(dir, { kind: 'ended' }, '2026-10-09T10:00:01.000Z')
        ?.applied,
    ).toBe(true)
    expect(
      model.recordSessionEventAppliedIn(dir, { kind: 'ended' }, '2026-10-09T10:00:02.000Z')
        ?.applied,
    ).toBe(false)
  })

  test('a log with no launched event has no record', () => {
    expect(model.recordSessionEventIn(dir, to('running'), '2026-10-09T10:00:00.000Z')).toBeNull()
  })
})

describe('a log that keeps growing', () => {
  test('throws SessionLogError rather than write a projection it cannot vouch for', () => {
    const log = sessionEventsPath(dir)
    // A harness schema that appends a blank line each time it validates: the
    // log grows during every reduction, as if another writer never stopped.
    const growing = defineSessionModel({
      harness: z.string().refine((h) => (appendFileSync(log, '\n'), h.length > 0)),
      host: z.string(),
      launchFlags: z.unknown(),
    })
    let thrown: unknown
    try {
      growing.recordSessionEventIn(dir, launched as never, '2026-10-09T10:00:00.000Z')
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(SessionLogError)
    expect((thrown as Error).name).toBe('SessionLogError')
  })
})

describe('two processes appending to one log', () => {
  // Two tight loops can keep the log growing during one writer's reduction. That
  // call throws SessionLogError after its line is appended, so the writers count
  // it and go on. The next append, once the log is quiet, writes record.json.
  test('lose no line, and the next append settles record.json over the whole log', async () => {
    looseSessionModel.recordSessionEventIn(dir, launched as never, '2026-10-09T10:00:00.000Z')
    const flags = ['--experimental-strip-types', '--no-warnings']
    const script = (writer: number) =>
      `import('./src/model.ts').then((m) => { for (let i = 0; i < 40; i++) { try { ` +
      `m.looseSessionModel.recordSessionEventIn(${JSON.stringify(dir)}, ` +
      `{ kind: 'pr_linked', prNumber: ${writer} * 1000 + i }, new Date().toISOString()) ` +
      `} catch (e) { if (!(e instanceof m.SessionLogError)) throw e } } })`
    const results = await Promise.all(
      [1, 2].map((w) =>
        spawnRunnerAsync(process.execPath).run([...flags, '-e', script(w)], {
          cwd: join(import.meta.dirname, '..'),
          timeoutMs: 60_000,
        }),
      ),
    )
    expect(results.map((r) => [r.exitCode, r.stderr])).toEqual([
      [0, ''],
      [0, ''],
    ])
    const events = looseSessionModel.readSessionEvents(dir)
    expect(events).toHaveLength(81)
    const numbers = events.flatMap((e) => (e.kind === 'pr_linked' ? [e.prNumber] : []))
    expect(numbers.filter((n) => n < 2000)).toEqual([...Array(40).keys()].map((i) => 1000 + i))
    expect(numbers.filter((n) => n >= 2000)).toEqual([...Array(40).keys()].map((i) => 2000 + i))

    looseSessionModel.recordSessionEventIn(
      dir,
      { kind: 'pr_linked', prNumber: 7 } as never,
      '2026-10-09T11:00:00.000Z',
    )
    const projected = JSON.parse(readFileSync(join(dir, RECORD_FILE), 'utf-8')) as {
      logBytes: number
      prNumber: number
    }
    expect(projected.logBytes).toBe(statSync(sessionEventsPath(dir)).size)
    expect(projected.prNumber).toBe(7)
  }, 60_000)
})
