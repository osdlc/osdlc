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
  test('a toJSON runs before the pass and its result is redacted; other functions are dropped', async () => {
    let calls = 0
    const data = {
      toJSON: () => {
        calls++
        return { leaked: gh }
      },
    }
    const { value } = await r.redactJson({ data, f: [() => gh] })
    expect(JSON.stringify(value)).toBe('{"data":{"leaked":"[REDACTED:github]"},"f":[null]}')
    expect(calls).toBe(1) // JSON.stringify above found no toJSON left to call
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

describe('found by code review', () => {
  test('a PGP private key block is redacted', async () => {
    const pgp = `-----BEGIN PGP PRIVATE KEY BLOCK-----\nlQOYBGVhZXhhbXBsZQ\n-----END PGP PRIVATE KEY BLOCK-----`
    expect((await r.redact(`key:\n${pgp}\nend`)).text).toBe('key:\n[REDACTED:private-key]\nend')
  })

  test('a quoted value with an escaped quote is redacted to its real end', async () => {
    const { text } = await r.redact('{"password":"ab\\"cdTAILSECRET"}')
    expect(text).toBe('{"password":"[REDACTED:assigned-secret]"}')
  })

  test('a quoted passphrase longer than 200 characters is redacted', async () => {
    const phrase = 'correct horse battery staple '.repeat(8)
    const { text } = await r.redact(`password: "${phrase}"`)
    expect(text).toBe('password: "[REDACTED:assigned-secret]"')
  })

  test('a number under a secret-named key is blanked; a count under a token key is kept', async () => {
    const { value } = await r.redactJson({
      password: 123456,
      pin_secret: 42,
      token_count: 100,
      ok: true,
    })
    expect(value).toEqual({
      password: '[REDACTED:assigned-secret]',
      pin_secret: '[REDACTED:assigned-secret]',
      token_count: 100,
      ok: true,
    })
  })

  test('a password starting with $ is redacted; a shell variable reference is not', async () => {
    expect((await r.redact('password=$ecretPa55')).text).toBe('password=[REDACTED:assigned-secret]')
    expect((await r.redact('password=$DB_PASSWORD')).text).toBe('password=$DB_PASSWORD')
    expect((await r.redact('password=${DB_PASSWORD}')).text).toBe('password=${DB_PASSWORD}')
  })

  test('usage details, a tokenizer name and the working directory are not secrets', async () => {
    const usage = { completion_tokens_details: { reasoning_tokens: 0 } }
    expect((await r.redactJson(usage)).value).toEqual(usage)
    expect((await r.redact('tokenizer_name=cl100k_base')).text).toBe('tokenizer_name=cl100k_base')
    expect((await r.redact('PWD=/home/ada/app OLDPWD=~/src')).text).toBe(
      'PWD=/home/ada/app OLDPWD=~/src',
    )
    expect((await r.redact('pwd=hunter2hunter2')).text).toBe('pwd=[REDACTED:assigned-secret]')
  })

  test('a URL and a Buffer are written as JSON would write them', async () => {
    const { value } = await r.redactJson({
      url: new URL('https://example.com/x'),
      buf: Buffer.from('hi'),
    })
    expect(value).toEqual({
      url: 'https://example.com/x',
      buf: { type: 'Buffer', data: [104, 105] },
    })
  })

  test('an Error keeps its own fields and cause, redacted', async () => {
    const cause = new Error(`token=${gh}`)
    const e = Object.assign(new Error('open failed', { cause }), { code: 'ENOENT' })
    const { value } = await r.redactJson(e)
    const out = value as Record<string, unknown>
    expect(out['code']).toBe('ENOENT')
    expect((out['cause'] as Record<string, unknown>)['message']).toBe('token=[REDACTED:github]')
    expect(JSON.stringify(value)).not.toContain(gh)
  })
})
