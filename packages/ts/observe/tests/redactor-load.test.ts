import { expect, test, vi } from 'vitest'

const gh = 'ghp_aB3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1dE3fG5'

test('a failed secretlint load fails that call closed and is retried on the next', async () => {
  let fail = true
  vi.doMock('@secretlint/core', async (importOriginal) => {
    if (fail) throw new Error('EMFILE: too many open files')
    return importOriginal()
  })
  vi.resetModules()
  const { createRedactor } = await import('../src/redactor.ts')
  const r = createRedactor({ env: {} })

  expect(await r.redact(`see ${gh}`)).toEqual({
    text: '[REDACTED:redactor-error]',
    redactions: { 'redactor-error': 1 },
  })
  fail = false
  expect((await r.redact(`see ${gh}`)).text).toBe('see [REDACTED:github]')
  vi.doUnmock('@secretlint/core')
})
