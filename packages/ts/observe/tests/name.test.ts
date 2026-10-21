/**
 * A session's name: the latest `person` rename, else the launcher's explicit
 * name, else the latest `harness` title. Folded from events, so order of the
 * log (not of the kinds) decides within a source.
 */

import { describe, expect, test } from 'vitest'

import { looseSessionModel } from '../src/model.ts'

const model = looseSessionModel

const launched = (name?: string) => ({
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
  machine: 'm',
  ...(name === undefined ? {} : { name }),
})

const named = (name: string, source: 'person' | 'harness') => ({
  ts: '2026-10-09T10:01:00.000Z',
  kind: 'named' as const,
  name,
  source,
})

function nameOf(...events: Parameters<typeof model.reduceSessionEvents>[0][number][]) {
  const r = model.reduceSessionEvents(events).record
  return r === null ? null : { name: r.name, source: r.nameSource }
}

describe('session name precedence', () => {
  test('no name event leaves the name unset', () => {
    expect(nameOf(launched())).toEqual({ name: null, source: null })
  })

  test('the launch name has source launch', () => {
    expect(nameOf(launched('fix the build'))).toEqual({ name: 'fix the build', source: 'launch' })
  })

  test('a harness title names a session that has no other name', () => {
    expect(nameOf(launched(), named('First', 'harness'), named('Second', 'harness'))).toEqual({
      name: 'Second',
      source: 'harness',
    })
  })

  test('a harness title never displaces the launch name, whichever came last', () => {
    expect(nameOf(launched('launch'), named('title', 'harness'))).toEqual({
      name: 'launch',
      source: 'launch',
    })
  })

  test('the latest person rename beats the launch name and any harness title', () => {
    expect(
      nameOf(
        launched('launch'),
        named('one', 'person'),
        named('title', 'harness'),
        named('two', 'person'),
        named('later title', 'harness'),
      ),
    ).toEqual({ name: 'two', source: 'person' })
  })

  test('a person rename lands on a session that has ended', () => {
    const ended = { ts: '2026-10-09T10:00:30.000Z', kind: 'ended' as const }
    expect(nameOf(launched(), ended, named('late', 'person'))).toEqual({
      name: 'late',
      source: 'person',
    })
  })

  test('a named event before launched is ignored', () => {
    const r = model.reduceSessionEvents([named('early', 'person'), launched()])
    expect(r.record?.name).toBeNull()
    expect(r.ignored.map((i) => i.reason)).toEqual(['before_launched'])
  })

  test('a record without the name fields reads with them null', () => {
    const r = model.reduceSessionEvents([launched('x')]).record
    const { name: _n, nameSource: _s, ...old } = r!
    const parsed = model.SessionRecordSchema.parse(old)
    expect(parsed.name).toBeNull()
    expect(parsed.nameSource).toBeNull()
  })
})
