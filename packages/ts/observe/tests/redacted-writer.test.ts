import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { createRedactor, type Redactor } from '../src/redactor.ts'
import { appendRedactedJsonl } from '../src/redacted-writer.ts'
import { readJsonl } from '../src/writer.ts'

const ghp = 'ghp_aB3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1dE3fG5'
const r = createRedactor({ env: {} })

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'observe-redacted-'))
  file = join(dir, 'nested', 'log.jsonl')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const envelope = {
  v: 1,
  ts: '2026-11-07T10:00:00.000Z',
  kind: 'tool.output',
  writer: 'm-0123456789abcdef',
  source: 'hook',
  session: 's-01JABCDEFGHJKMNPQRSTVWXYZ0',
  run: 'r-01JABCDEFGHJKMNPQRSTVWXYZ0',
  subject: 'issue-42',
}

describe('appendRedactedJsonl', () => {
  test('keeps the envelope keys and redacts every other field', async () => {
    const redactions = await appendRedactedJsonl(
      file,
      {
        ...envelope,
        output: `pushed with ${ghp}`,
        nested: { password: 'hunter2hunter2', count: 3 },
      },
      r,
    )
    expect(redactions).toEqual({ github: 1, 'assigned-secret': 1 })
    const [line] = readJsonl(file) as Record<string, unknown>[]
    expect(line).toMatchObject(envelope)
    expect(line!['output']).toBe('pushed with [REDACTED:github]')
    expect(line!['nested']).toEqual({ password: '[REDACTED:assigned-secret]', count: 3 })
  })

  test('a `session` id in the envelope is not blanked, though redactJson blanks it elsewhere', async () => {
    await appendRedactedJsonl(file, { ...envelope, data: { session: 'abc' } }, r)
    const [line] = readJsonl(file) as Record<string, unknown>[]
    expect(line!['session']).toBe(envelope.session)
    expect(line!['data']).toEqual({ session: '[REDACTED:assigned-secret]' })
  })

  test('an envelope key holding an object is redacted like any other field', async () => {
    await appendRedactedJsonl(file, { ...envelope, subject: { token: 'abcdefghij' } }, r)
    const [line] = readJsonl(file) as Record<string, unknown>[]
    expect(line!['subject']).toEqual({ token: '[REDACTED:assigned-secret]' })
  })

  test('a value that is not a plain object is redacted whole', async () => {
    await appendRedactedJsonl(file, `token ${ghp}`, r)
    await appendRedactedJsonl(file, [`${ghp}`], r)
    expect(readJsonl(file)).toEqual(['token [REDACTED:github]', ['[REDACTED:github]']])
  })

  test('a failed pass keeps the envelope alone and counts the error', async () => {
    const failing: Redactor = {
      redact: r.redact,
      redactJson: async () => ({
        value: '[REDACTED:redactor-error]',
        redactions: { 'redactor-error': 1 },
      }),
    }
    const redactions = await appendRedactedJsonl(file, { ...envelope, output: ghp }, failing)
    expect(redactions).toEqual({ 'redactor-error': 1 })
    expect(readJsonl(file)).toEqual([envelope])
  })

  test('a `__proto__` field is written as a key, not as the prototype', async () => {
    const line = JSON.parse('{"kind":"x","__proto__":{"polluted":true}}') as object
    await appendRedactedJsonl(file, line, r)
    const [read] = readJsonl(file) as Record<string, unknown>[]
    expect(Object.keys(read!)).toEqual(['kind', '__proto__'])
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
  })

  test('the file is created with mode 0600, as appendJsonl creates it', async () => {
    await appendRedactedJsonl(file, envelope, r, { sync: false })
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600)
  })

  test('a top-level toJSON does not replace the line', async () => {
    await appendRedactedJsonl(file, { kind: 'x', toJSON: () => ({ secret: ghp }) }, r)
    expect(readJsonl(file)).toEqual([{ kind: 'x' }])
  })

  test('an envelope key holding a function or a BigInt is not written as is', async () => {
    const kind = Object.assign(() => 'x', { toJSON: () => ghp })
    await appendRedactedJsonl(file, { kind, run: 12n }, r)
    expect(readJsonl(file)).toEqual([{ run: '12' }])
  })

  test('an Error, a Map or a class instance is redacted whole, not emptied', async () => {
    await appendRedactedJsonl(file, new Error(`failed with ${ghp}`), r)
    await appendRedactedJsonl(file, new Map([['prompt', 'hi']]), r)
    const lines = readJsonl(file) as Record<string, unknown>[]
    expect(lines[0]!['message']).toBe('failed with [REDACTED:github]')
    expect(lines[1]).toEqual({ prompt: 'hi' })
  })
})
