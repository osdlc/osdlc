/**
 * The README quick start, run. The examples use the package the way a consumer
 * does, through its name: `@osdlc/observe` and `@osdlc/observe/session`.
 * `tests/exports.test.ts` checks that every README code block appears in this
 * directory and that every export is used here.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { z } from 'zod'

import {
  appendJsonl,
  correlationFromEnv,
  LogEnvelopeSchema,
  machineId,
  readJsonl,
} from '@osdlc/observe'
import { defineSessionModel, sessionEnv } from '@osdlc/observe/session'

let store: string
beforeEach(() => {
  store = mkdtempSync(join(tmpdir(), 'observe-quick-start-'))
})
afterEach(() => rmSync(store, { recursive: true, force: true }))

describe('quick start', () => {
  test('log a line that joins the run in its environment', () => {
    // A child process launched inside a run inherits its tags.
    const env = { OBSERVE_RUN: 'r-01JABCDEFGHJKMNPQRSTVWXYZ0', OBSERVE_SUBJECT: 'issue-42' }

    const line = LogEnvelopeSchema.extend({ kind: z.literal('build.done'), ok: z.boolean() }).parse(
      {
        v: 1,
        ts: new Date().toISOString(),
        kind: 'build.done',
        writer: machineId(),
        source: 'op',
        ...correlationFromEnv(env),
        ok: true,
      },
    )
    appendJsonl(join(store, 'ops.jsonl'), line)

    expect(readJsonl(join(store, 'ops.jsonl'))).toEqual([
      expect.objectContaining({ run: 'r-01JABCDEFGHJKMNPQRSTVWXYZ0', subject: 'issue-42' }),
    ])
  })

  test('keep a record of an agent session', () => {
    const model = defineSessionModel({
      harness: z.enum(['aider', 'goose']),
      host: z.enum(['terminal', 'tmux']),
      launchFlags: z.object({ yolo: z.boolean() }),
    })

    const id = crypto.randomUUID()
    const dir = join(store, id)
    model.recordSessionEventIn(
      dir,
      {
        kind: 'launched',
        id,
        harness: 'aider',
        sessionKind: 'headless',
        origin: { kind: 'person' },
        author: { tool: 'aider', requested: null, model: null, effort: null },
        host: null,
        cwd: '/work/repo',
        branch: 'main',
        launched: { kind: 'prompt', text: 'Fix the failing test.' },
        operation: null,
        machine: machineId(),
      },
      new Date().toISOString(),
    )

    // The environment the agent process runs with: its tools and the process
    // scan read the session id back from it.
    const childEnv = { ...process.env, ...sessionEnv({ id }) }

    model.recordSessionEventIn(
      dir,
      { kind: 'state_changed', from: 'starting', to: 'running', cause: 'spawn' },
      new Date().toISOString(),
    )
    const record = model.readSessionRecordIn(dir)

    expect(childEnv['OBSERVE_SESSION']).toBe(id)
    expect(record).toMatchObject({ id, harness: 'aider', state: 'running', outcome: null })
  })
})
