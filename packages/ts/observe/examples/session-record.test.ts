/**
 * The session record: a model over your own vocabulary, the event log, the
 * state machine, the record it reduces to, and the shared vocabulary schemas.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { z } from 'zod'

import {
  defineSessionModel,
  EVENTS_FILE,
  isLegalTransition,
  looseSessionModel,
  RECORD_FILE,
  SESSION_CAPTURES,
  SESSION_DONE_OUTCOMES,
  SESSION_OUTCOMES,
  SESSION_RUN_STATES,
  SessionCaptureSchema,
  SessionDoneOutcomeSchema,
  SessionDoneSchema,
  sessionEventsPath,
  SessionKindSchema,
  SessionLaunchedSchema,
  SessionLogError,
  SessionNameSourceSchema,
  SessionOriginSchema,
  SessionOutcomeSchema,
  SessionParentSchema,
  SessionRunStateSchema,
  UsageSampleSchema,
  type AnySessionRecord,
  type IgnoredEventOf,
  type NewSessionEventOfModel,
  type SessionAuthorOf,
  type SessionCapture,
  type SessionDone,
  type SessionDoneOutcome,
  type SessionEventOfModel,
  type SessionKind,
  type SessionLaunched,
  type SessionModel,
  type SessionNameSource,
  type SessionOrigin,
  type SessionOutcome,
  type SessionParent,
  type SessionRecordOf,
  type SessionRecordOfModel,
  type SessionReductionOf,
  type SessionRunState,
  type SessionVocabulary,
  type UsageSample,
} from '@osdlc/observe/session'

const Harness = z.enum(['aider', 'goose'])
const Host = z.enum(['terminal', 'tmux'])
const LaunchFlags = z.object({ yolo: z.boolean() })

const vocabulary: SessionVocabulary<
  z.infer<typeof Harness>,
  z.infer<typeof Host>,
  z.infer<typeof LaunchFlags>
> = { harness: Harness, host: Host, launchFlags: LaunchFlags }
const model = defineSessionModel(vocabulary)

type SessionEvent = SessionEventOfModel<typeof model>
type NewSessionEvent = NewSessionEventOfModel<typeof model>
type SessionRecord = SessionRecordOfModel<typeof model>

const author: SessionAuthorOf<'aider'> = {
  tool: 'aider',
  requested: 'fast',
  model: 'model-a',
  effort: null,
}

function launch(id: string): NewSessionEvent {
  return {
    kind: 'launched',
    id,
    harness: 'aider',
    sessionKind: 'interactive',
    origin: { kind: 'person' },
    author,
    host: 'tmux',
    cwd: '/work/repo',
    branch: 'main',
    launched: { kind: 'skill', name: 'fix-tests' },
    name: 'fix the flaky test',
    operation: null,
    launchFlags: { yolo: false },
    pin: 'tool@1.2.0',
    capture: 'hooks',
    machine: 'm-0123456789abcdef',
  }
}

let store: string
beforeEach(() => {
  store = mkdtempSync(join(tmpdir(), 'observe-session-'))
})
afterEach(() => rmSync(store, { recursive: true, force: true }))

describe('the event log and the record', () => {
  test('each append re-reduces the whole log into record.json', () => {
    const dir = join(store, crypto.randomUUID())
    model.recordSessionEventIn(dir, launch('s1'), '2026-10-17T09:00:00.000Z')
    model.recordSessionEventIn(
      dir,
      { kind: 'host_attached', host: 'tmux', harnessSessionId: 'h-1', pid: 4242 },
      '2026-10-17T09:00:01.000Z',
    )
    model.recordSessionEventIn(
      dir,
      { kind: 'state_changed', from: 'starting', to: 'running', cause: 'spawn' },
      '2026-10-17T09:00:01.000Z',
    )
    model.recordSessionEventIn(
      dir,
      { kind: 'done', outcome: 'ok', note: 'the test passes' },
      '2026-10-17T09:10:00.000Z',
    )

    const record: SessionRecord | null = model.readSessionRecordIn(dir)
    const done: SessionDone | undefined = record?.done

    expect(record).toMatchObject({
      state: 'done',
      name: 'fix the flaky test',
      nameSource: 'launch',
      pid: 4242,
    })
    expect(done).toEqual({ at: '2026-10-17T09:10:00.000Z', outcome: 'ok', note: 'the test passes' })
    expect(readFileSync(join(dir, RECORD_FILE), 'utf-8')).toContain('"state": "done"')
    expect(sessionEventsPath(dir)).toBe(join(dir, EVENTS_FILE))
  })

  test('the reducer skips what the state machine does not allow, and says why', () => {
    const events: SessionEvent[] = [
      { ...launch('s1'), ts: '2026-10-17T09:00:00.000Z' } as SessionEvent,
      { kind: 'ended', ts: '2026-10-17T09:05:00.000Z' },
      {
        kind: 'state_changed',
        from: 'ended',
        to: 'running',
        cause: 'late hook',
        ts: '2026-10-17T09:06:00.000Z',
      },
    ]

    const reduction: SessionReductionOf<SessionEvent, SessionRecord> =
      model.reduceSessionEvents(events)
    const skipped: IgnoredEventOf<SessionEvent>[] = reduction.ignored

    expect(reduction.state).toBe('ended')
    expect(skipped.map((i) => [i.index, i.reason])).toEqual([[2, 'after_ended']])
    expect(isLegalTransition('ended', 'running')).toBe(false)
    expect(isLegalTransition('running', 'waiting_for_input')).toBe(true)
  })

  test('a reader that must accept any vocabulary uses the loose model', () => {
    const dir = join(store, 's2')
    model.recordSessionEventIn(dir, launch('s2'), '2026-10-17T09:00:00.000Z')

    const any: AnySessionRecord | null = looseSessionModel.readSessionRecordIn(dir)
    const typed: SessionRecordOf<string, string, unknown> | null = any
    const loose: SessionModel<string, string, Record<string, unknown>> = looseSessionModel

    expect(typed?.harness).toBe('aider')
    expect(loose.readSessionEvents(dir)).toHaveLength(1)
  })

  test('a log that keeps growing while it is projected throws SessionLogError', () => {
    const error = new SessionLogError('session log kept growing')

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('SessionLogError')
  })
})

describe('the vocabulary every model shares', () => {
  test('states, outcomes and captures are closed lists', () => {
    const state: SessionRunState = SessionRunStateSchema.parse('waiting_for_input')
    const outcome: SessionOutcome = SessionOutcomeSchema.parse('lost')
    const capture: SessionCapture = SessionCaptureSchema.parse('launch-only')
    const declared: SessionDoneOutcome = SessionDoneOutcomeSchema.parse('failed')

    expect(SESSION_RUN_STATES).toContain(state)
    expect(SESSION_OUTCOMES).toContain(outcome)
    expect(SESSION_CAPTURES).toContain(capture)
    expect(SESSION_DONE_OUTCOMES).toContain(declared)
  })

  test('what launched a session, and who started it', () => {
    const kind: SessionKind = SessionKindSchema.parse('headless')
    const launched: SessionLaunched = SessionLaunchedSchema.parse({ kind: 'prompt', text: 'hi' })
    const origin: SessionOrigin = SessionOriginSchema.parse({ kind: 'pr', number: 7 })
    const parent: SessionParent = SessionParentSchema.parse({ session: null, invocation: 'i-1' })
    const nameSource: SessionNameSource = SessionNameSourceSchema.parse('person')

    expect([kind, launched.kind, origin.kind, parent.invocation, nameSource]).toEqual([
      'headless',
      'prompt',
      'pr',
      'i-1',
      'person',
    ])
  })

  test('a usage sample and a done declaration', () => {
    const usage: UsageSample = UsageSampleSchema.parse({
      model: 'model-a',
      inputTokens: 1200,
      outputTokens: 300,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      totalTokens: 1500,
      costUsd: 0.02,
    })
    const done = SessionDoneSchema.parse({
      at: '2026-10-17T09:10:00.000Z',
      outcome: 'ok',
      note: null,
    })

    expect(usage.totalTokens).toBe(1500)
    expect(done.outcome).toBe('ok')
  })
})
