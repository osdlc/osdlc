/** Regression tests for leaks and data loss found by a bug scan of the redactor and its writer. */

import { describe, expect, test } from 'vitest'

import { createRedactor, LINT_COMMENT_FILTER } from '../src/redactor.ts'

const gh = 'ghp_aB3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1dE3fG5'
const gh2 = 'ghp_zY9xW7vU5tS3rQ1pO9nM7lK5jI3hG1fE9dC7'
const r = createRedactor({ env: {} })

describe('the redactor cannot be switched off or skewed by the text', () => {
  test("secretlint's comment filter, which obeys disable comments, is the rule left out", async () => {
    const { rules } = await import('@secretlint/secretlint-rule-preset-recommend')
    // If the preset renames or drops it, the exclusion would silently stop applying.
    expect(rules.map((rule) => rule.meta.id)).toContain(LINT_COMMENT_FILTER)
  })

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
