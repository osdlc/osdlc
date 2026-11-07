/** Regression tests for leaks and data loss found by a bug scan of the redactor and its writer. */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { createRedactor } from '../src/redactor.ts'
import { appendRedactedJsonl } from '../src/redacted-writer.ts'
import { readJsonl } from '../src/writer.ts'

const gh = 'ghp_aB3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1dE3fG5'
const gh2 = 'ghp_zY9xW7vU5tS3rQ1pO9nM7lK5jI3hG1fE9dC7'
const r = createRedactor({ env: {} })

describe('the redactor cannot be switched off or skewed by the text', () => {
  test.each([
    '// secretlint-disable',
    '/* secretlint-disable-next-line */',
    '# SECRETLINT-DISABLE',
  ])('a %s directive in the text is ignored', async (directive) => {
    const { text } = await r.redact(`${directive}\nsee ${gh}`)
    expect(text).not.toContain(gh)
    expect(text).toContain('[REDACTED:github]')
  })

  test('a leading byte-order mark does not shift the ranges', async () => {
    const { text } = await r.redact(`\uFEFFxx ${gh} tail`)
    expect(text).toBe('\uFEFFxx [REDACTED:github] tail')
  })

  test('a quoted value keeps its own trailing punctuation inside the redaction', async () => {
    expect((await r.redact('password="hunter2!;)"')).text).toBe(
      'password="[REDACTED:assigned-secret]"',
    )
    expect((await r.redact('password: "));;"')).text).toBe('password: "[REDACTED:assigned-secret]"')
  })

  test('an unquoted value still drops trailing punctuation that is not its own', async () => {
    expect((await r.redact('f(password=hunter2hunter2);')).text).toBe(
      'f(password=[REDACTED:assigned-secret]);',
    )
  })
})

describe('redactJson leaves nothing to run or lose at write time', () => {
  test('an own toJSON, and any function, is dropped', async () => {
    const { value } = await r.redactJson({
      data: { toJSON: () => ({ leaked: gh }) },
      f: [() => gh],
    })
    expect(JSON.stringify(value)).toBe('{"data":{},"f":[null]}')
  })

  test("an Error's name is redacted", async () => {
    const e = new Error('boom')
    e.name = `token=${gh}`
    const { value } = await r.redactJson(e)
    expect(JSON.stringify(value)).not.toContain(gh)
  })

  test('a BigInt becomes its decimal string', async () => {
    const { value } = await r.redactJson({ n: 12n })
    expect(JSON.stringify(value)).toBe('{"n":"12"}')
  })

  test('keys that redact to the same text are kept apart', async () => {
    const { value, redactions } = await r.redactJson({ [gh]: 1, [gh2]: 2 })
    expect(value).toEqual({ '[REDACTED:github]': 1, '[REDACTED:github]#2': 2 })
    expect(redactions).toEqual({ github: 2 })
  })
})

describe('appendRedactedJsonl', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'observe-bugscan-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  test('a top-level toJSON does not replace the line', async () => {
    const file = join(dir, 'a.jsonl')
    await appendRedactedJsonl(file, { kind: 'x', toJSON: () => ({ secret: gh }) }, r)
    expect(readJsonl(file)).toEqual([{ kind: 'x' }])
  })

  test('an envelope key holding a function is not written as is', async () => {
    const file = join(dir, 'b.jsonl')
    const kind = Object.assign(() => 'x', { toJSON: () => gh })
    await appendRedactedJsonl(file, { kind }, r)
    expect(JSON.stringify(readJsonl(file))).not.toContain(gh)
  })

  test('an Error, a Map or a class instance is redacted whole, not emptied', async () => {
    const file = join(dir, 'c.jsonl')
    await appendRedactedJsonl(file, new Error(`failed with ${gh}`), r)
    await appendRedactedJsonl(file, new Map([['prompt', 'hi']]), r)
    const lines = readJsonl(file) as Record<string, unknown>[]
    expect(lines[0]!['message']).toBe('failed with [REDACTED:github]')
    expect(lines[1]).toEqual({ prompt: 'hi' })
  })
})

describe('a lint pass that throws', () => {
  test('fails that call closed, and the next call runs again', async () => {
    let fail = true
    const lint = async () => {
      if (fail) throw new Error('EMFILE')
      return []
    }
    const flaky = createRedactor({ env: {}, lint })
    expect((await flaky.redact('hello')).text).toBe('[REDACTED:redactor-error]')
    fail = false
    expect((await flaky.redact('hello')).text).toBe('hello')
  })
})
