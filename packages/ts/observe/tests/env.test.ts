import { describe, expect, test } from 'vitest'

import {
  AUTHOR_ENV_VAR,
  authorFromEnv,
  PINNED_CMD_ENV_VAR,
  PROJECT_ROOT_ENV_VAR,
  SESSION_ID_RE,
  sessionEnv,
  TASK_ENV_VAR,
} from '../env.ts'
import {
  INVOCATION_ENV_VAR,
  INVOCATION_PID_ENV_VAR,
  RUN_ENV_VAR,
  SESSION_ENV_VAR,
  SUBJECT_ENV_VAR,
} from '../envelope.ts'
import { MACHINE_ENV_VAR } from '../machine.ts'

describe('the tag names', () => {
  test('every tag is an OBSERVE_ name', () => {
    expect([
      SESSION_ENV_VAR,
      RUN_ENV_VAR,
      SUBJECT_ENV_VAR,
      INVOCATION_ENV_VAR,
      INVOCATION_PID_ENV_VAR,
      PROJECT_ROOT_ENV_VAR,
      TASK_ENV_VAR,
      PINNED_CMD_ENV_VAR,
      AUTHOR_ENV_VAR,
      MACHINE_ENV_VAR,
    ]).toEqual([
      'OBSERVE_SESSION',
      'OBSERVE_RUN',
      'OBSERVE_SUBJECT',
      'OBSERVE_INVOCATION',
      'OBSERVE_INVOCATION_PID',
      'OBSERVE_PROJECT_ROOT',
      'OBSERVE_TASK',
      'OBSERVE_PINNED_CMD',
      'OBSERVE_AUTHOR',
      'OBSERVE_MACHINE_ID',
    ])
  })
})

describe('sessionEnv', () => {
  test('sets every tag under its OBSERVE_ name and its legacy SDLC_ name', () => {
    const env = sessionEnv({
      id: 's1',
      pin: 'tool@1',
      task: 'issue-7',
      projectRoot: '/work/repo',
      run: 'r-1',
      author: 'aider/model-a@high',
      machine: 'm-0123456789abcdef',
    })
    const expected = {
      SESSION: 's1',
      PROJECT_ROOT: '/work/repo',
      TASK: 'issue-7',
      RUN: 'r-1',
      SUBJECT: 'issue-7',
      INVOCATION: '',
      INVOCATION_PID: '',
      AUTHOR: 'aider/model-a@high',
      PINNED_CMD: 'tool@1',
      MACHINE_ID: 'm-0123456789abcdef',
    }
    for (const [tag, value] of Object.entries(expected)) {
      expect([tag, env[`OBSERVE_${tag}`], env[`SDLC_${tag}`]]).toEqual([tag, value, value])
    }
    expect(Object.keys(env)).toHaveLength(20)
  })

  test('clears what a parent set, and leaves the pin and project root unset when absent', () => {
    const env = sessionEnv({ id: 's1', machine: 'm-x' })
    expect(env[TASK_ENV_VAR]).toBe('')
    expect(env[RUN_ENV_VAR]).toBe('')
    expect(env[SUBJECT_ENV_VAR]).toBe('')
    expect(env[AUTHOR_ENV_VAR]).toBe('')
    expect(env[PINNED_CMD_ENV_VAR]).toBeUndefined()
    expect(env['SDLC_PINNED_CMD']).toBeUndefined()
    expect(PROJECT_ROOT_ENV_VAR in env).toBe(true)
    expect(env[PROJECT_ROOT_ENV_VAR]).toBeUndefined()
  })

  test('the subject defaults to the task, and a given subject wins', () => {
    expect(sessionEnv({ id: 's', task: 't', machine: 'm' })[SUBJECT_ENV_VAR]).toBe('t')
    expect(sessionEnv({ id: 's', task: 't', subject: 'pr-9', machine: 'm' })[SUBJECT_ENV_VAR]).toBe(
      'pr-9',
    )
  })

  test('sets the author text, else empty so a parent value does not leak', () => {
    expect(
      sessionEnv({ id: 's1', author: 'aider/model-a@high', machine: 'm' })[AUTHOR_ENV_VAR],
    ).toBe('aider/model-a@high')
    expect(sessionEnv({ id: 's1', machine: 'm' })[AUTHOR_ENV_VAR]).toBe('')
    expect(sessionEnv({ id: 's1', author: null, machine: 'm' })[AUTHOR_ENV_VAR]).toBe('')
  })

  test('without a machine id it uses this machine id', () => {
    expect(sessionEnv({ id: 's1' })[MACHINE_ENV_VAR]).toMatch(/\S/)
  })
})

describe('authorFromEnv', () => {
  test('reads either name, the legacy one when they differ; unset or empty is undefined', () => {
    expect(authorFromEnv({ OBSERVE_AUTHOR: 'goose/m@low' })).toBe('goose/m@low')
    expect(authorFromEnv({ SDLC_AUTHOR: 'goose/m@low' })).toBe('goose/m@low')
    expect(authorFromEnv({ OBSERVE_AUTHOR: 'new', SDLC_AUTHOR: 'old' })).toBe('old')
    expect(authorFromEnv({ OBSERVE_AUTHOR: 'same', SDLC_AUTHOR: 'same' })).toBe('same')
    expect(authorFromEnv({ OBSERVE_AUTHOR: '' })).toBeUndefined()
    expect(authorFromEnv({})).toBeUndefined()
  })
})

describe('SESSION_ID_RE', () => {
  test('accepts a random UUID and nothing else', () => {
    expect(SESSION_ID_RE.test(crypto.randomUUID())).toBe(true)
    expect(SESSION_ID_RE.test('0B6F2C8E-6A51-4C1E-9D55-2F0F6F3F8A11')).toBe(true)
    for (const bad of ['', '../etc', 'abc-123', `${crypto.randomUUID()}x`]) {
      expect([bad, SESSION_ID_RE.test(bad)]).toEqual([bad, false])
    }
  })
})
