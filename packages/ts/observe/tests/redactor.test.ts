import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { describe, expect, test } from 'vitest'

import { createRedactor } from '../src/redactor.ts'

const r = createRedactor({ env: {} })

// Realistic-looking fakes. The AWS docs key AKIAIOSFODNN7EXAMPLE is allowlisted
// by secretlint, so it is deliberately not used. The fakes a code host's secret
// scanner would flag are joined at runtime, so no secret-shaped literal sits in
// the source.
const join = (...parts: string[]) => parts.join('')
const awsKey = join('AKIA', 'QWERTYUIOPASDFGH')
const awsSecret = join('wJalrXUtnFEMI/K7MDENG', '/bPxRfiCYzQ4tRuVsNe')
const ghp = 'ghp_aB3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1dE3fG5'
const pad = (n: number) => 'aZ3kQ9xLm2Tp7Vw4Yc8Bn1Dg5Fh0Jr6Su-_'.repeat(4).slice(0, n)
// Shapes the preset's own rules require: 93 chars + AA, and 58 + T3BlbkFJ + 58.
const anthropic = `sk-ant-api03-${pad(93)}AA`
const openai = `sk-proj-${pad(58)}T3BlbkFJ${pad(58)}`
const legacyOpenai = `sk-${pad(48)}`
const slack = join('xo', 'xb-123456789012-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx')

async function out(text: string): Promise<string> {
  return (await r.redact(text)).text
}

describe('secretlint pass', () => {
  for (const [name, secret] of [
    ['aws access', awsKey],
    ['github pat', ghp],
    ['anthropic', anthropic],
    ['openai', openai],
    ['legacy openai', legacyOpenai],
    ['slack', slack],
  ] as const) {
    test(`redacts a ${name} key`, async () => {
      const res = await r.redact(`using ${secret} for the call`)
      expect(res.text).not.toContain(secret)
      expect(res.text).toContain('[REDACTED:')
    })
  }

  test('redacts an aws secret key next to its access key', async () => {
    const res = await r.redact(`aws_access_key_id=${awsKey}\naws_secret_access_key=${awsSecret}`)
    expect(res.text).not.toContain(awsSecret)
    expect(res.text).not.toContain(awsKey)
  })
})

describe('in-house rules', () => {
  test('a token count keeps its number; a token value does not', async () => {
    const res = await r.redact('"input_tokens":120480 access_tokens=abc123def456 tokens: 99887766x')
    expect(res.text).toContain('"input_tokens":120480')
    expect(res.text).not.toContain('abc123def456')
    expect(res.text).not.toContain('99887766x')
  })

  test('a dotted value under token or api_key is redacted unless it is a known member chain', async () => {
    expect(await out('api_key=abcdefgh.ijklmnop')).toBe('api_key=[REDACTED:assigned-secret]')
    expect(await out('auth=abcdefgh.ijklmnop')).toBe('auth=[REDACTED:assigned-secret]')
    expect(await out('token = session.id')).toBe('token = session.id')
    expect(await out('api_key=config.apiKey')).toBe('api_key=config.apiKey')
  })

  test('a dotted passphrase under a password-like key is redacted', async () => {
    const res = await r.redact('password=correct.horse.battery DB_PASSWORD=hunter.two')
    expect(res.text).not.toContain('correct.horse.battery')
    expect(res.text).not.toContain('hunter.two')
  })

  test('redactJson redacts a short string under a secret key', async () => {
    const res = await r.redactJson({ password: 'abc', max_tokens: 5 })
    expect(res.value).toEqual({ password: '[REDACTED:assigned-secret]', max_tokens: 5 })
  })

  test('jwt', async () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    const res = await r.redact(`id_token ${jwt} end`)
    expect(res.text).not.toContain(jwt)
    expect(res.redactions['jwt']).toBe(1)
  })

  test('full-length PEM private key', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
    const res = await r.redact(`before\n${pem}\nafter`)
    expect(res.text.startsWith('before\n[REDACTED:')).toBe(true)
    expect(res.text.endsWith('\nafter')).toBe(true)
    expect(res.text).not.toContain('PRIVATE KEY')
    expect(res.text).not.toContain(pem.split('\n')[2]!)
  })

  test('short and unterminated PEM', async () => {
    expect(await out('-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY----- ok')).toBe(
      '[REDACTED:private-key] ok',
    )
    expect(await out('x -----BEGIN RSA PRIVATE KEY-----\nMIIEabc')).toBe('x [REDACTED:private-key]')
  })

  test('connection password only', async () => {
    const res = await r.redact('DATABASE_URL=postgres://app:hunter2hunter2@db.internal:5432/app')
    expect(res.text).not.toContain('hunter2hunter2')
    expect(res.text.startsWith('DATABASE_URL=[REDACTED:')).toBe(true)
  })

  test('connection password rule alone redacts only the password', async () => {
    const res = await r.redact('see amqp://app:hunter2hunter2@db.internal:5672/app')
    expect(res.text).not.toContain('hunter2hunter2')
    expect(res.text).toContain('amqp://app:')
    expect(res.text).toContain('@db.internal:5672/app')
  })

  test('assigned secret redacts the value only', async () => {
    expect(await out('password = "correct horse battery"')).toBe(
      'password = "[REDACTED:assigned-secret]"',
    )
    expect(await out('{"api_key": "abcdef123456"}')).toBe(
      '{"api_key": "[REDACTED:assigned-secret]"}',
    )
    expect(await out('export TOKEN=abc12345 && run')).toBe(
      'export TOKEN=[REDACTED:assigned-secret] && run',
    )
  })

  test('short assigned value survives', async () => {
    expect(await out('password: abc')).toBe('password: abc')
  })

  test('bearer', async () => {
    const res = await r.redact('Authorization: Bearer abcDEF123_456-xyz.q')
    expect(res.text).not.toContain('abcDEF123')
    expect(res.text).toContain('Authorization: Bearer ')
  })

  test('high-entropy only after a key-ish word', async () => {
    const blob = randomBytes(24).toString('base64url')
    const res = await r.redact(`secret ${blob} here`)
    expect(res.text).not.toContain(blob)
    expect(await out(`see ${blob} here`)).toBe(`see ${blob} here`)
  })
})

describe('negatives survive unchanged', () => {
  const samples = [
    'commit 3f786850e387550fdab836ed7e6dc881de23001b fixed it',
    'id 123e4567-e89b-12d3-a456-426614174000 done',
    'The quick brown fox jumps over the lazy dog, then reads the docs.',
    'edit /Users/someone/project/src/lib/services/log/redact.ts please',
    'image iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg== end',
    '{"usage":{"input_tokens":120480,"cache_read_input_tokens":3000000,"output_tokens":1234567}}',
    'inputTokens: 1234567 outputTokens=7654321',
  ]
  for (const s of samples) {
    test(s.slice(0, 30), async () => {
      const res = await r.redact(s)
      expect(String(res.text)).toBe(s)
      expect(res.redactions).toEqual({})
    })
  }
})

describe('env values', () => {
  const env = {
    MY_API_TOKEN: 'zq81-plainvalue-77',
    HOME: '/home/someone/long',
    PASSWORD: 'short',
    LABEL: 'visible-value-1',
  }

  test('secret-named values are scrubbed, others kept', async () => {
    const e = createRedactor({ env })
    const res = await e.redact(
      'a zq81-plainvalue-77 b /home/someone/long c visible-value-1 d short',
    )
    expect(String(res.text)).toBe(
      'a [REDACTED:env:MY_API_TOKEN] b /home/someone/long c visible-value-1 d short',
    )
    expect(res.redactions).toEqual({ 'env:MY_API_TOKEN': 1 })
  })

  test('envNames extends the set', async () => {
    const e = createRedactor({ env, envNames: ['LABEL'] })
    expect(String((await e.redact('x visible-value-1')).text)).toBe('x [REDACTED:env:LABEL]')
  })

  test('defaults to process.env', async () => {
    process.env['SDLC_TEST_SECRET_VALUE'] = 'pe-value-123456'
    try {
      const e = createRedactor()
      expect((await e.redact('v=pe-value-123456')).text).toContain(
        '[REDACTED:env:SDLC_TEST_SECRET_VALUE]',
      )
    } finally {
      delete process.env['SDLC_TEST_SECRET_VALUE']
    }
  })
})

describe('extra patterns', () => {
  test('custom pattern', async () => {
    const e = createRedactor({ env: {}, extraPatterns: [{ id: 'ticket', regex: 'ACME-\\d{4}' }] })
    const res = await e.redact('ref ACME-1234 and ACME-9999')
    expect(String(res.text)).toBe('ref [REDACTED:custom:ticket] and [REDACTED:custom:ticket]')
    expect(res.redactions).toEqual({ 'custom:ticket': 2 })
  })

  test('invalid regex is rejected at creation', () => {
    expect(() => createRedactor({ env: {}, extraPatterns: [{ id: 'bad', regex: '(' }] })).toThrow(
      /invalid redaction pattern 'bad'/,
    )
  })
})

describe('merging and counts', () => {
  test('overlapping matches become one redaction', async () => {
    const res = await r.redact(`token=${ghp}`)
    expect(Object.values(res.redactions).reduce((a, b) => a + b, 0)).toBe(1)
    expect(res.text).not.toContain('ghp_')
    expect(res.text.startsWith('token=')).toBe(true)
  })

  test('counts per rule', async () => {
    const res = await r.redact('password=abcdef1 and passwd=ghijkl2')
    expect(res.redactions).toEqual({ 'assigned-secret': 2 })
  })

  test('never echoes the secret in the result', async () => {
    const res = await r.redact(`k ${ghp}`)
    expect(JSON.stringify(res.redactions)).not.toContain('ghp_')
  })
})

describe('redactJson', () => {
  test('walks nested objects and arrays, keeps non-strings and harmless keys', async () => {
    const res = await r.redactJson({
      a: [`x ${ghp}`, 3, null, { password: 'abcdef123456', n: true }],
      ghp_key: 'ok',
    })
    const text = JSON.stringify(res.value)
    expect(text).not.toContain('ghp_aB3')
    expect(text).not.toContain('abcdef123456')
    expect(text).toContain('"ghp_key":"ok"')
    expect((res.value as { a: unknown[] }).a[1]).toBe(3)
    expect(Object.keys(res.redactions).length).toBeGreaterThan(0)
  })

  test('redacts a secret used as an object key', async () => {
    const res = await r.redactJson({ [ghp]: 'ok' })
    expect(JSON.stringify(res.value)).not.toContain('ghp_aB3')
  })
})

describe('fail closed', () => {
  test('replaces the whole text when secretlint throws', async () => {
    const e = createRedactor({
      env: {},
      lint: async () => {
        throw new Error('boom')
      },
    })
    const res = await e.redact('perfectly innocent text')
    expect(String(res.text)).toBe('[REDACTED:redactor-error]')
    expect(res.redactions).toEqual({ 'redactor-error': 1 })
  })
})

describe('adversarial timing (100 KiB)', () => {
  const size = 100 * 1024
  const fill = (unit: string) => unit.repeat(Math.ceil(size / unit.length)).slice(0, size)
  const inputs: Record<string, string> = {
    a: fill('a'),
    equals: fill('='),
    jwt: fill('eyJ'),
    jwtDots: fill('eyJabcdef.'),
    conn: fill('://x:'),
    connScheme: fill('ab://u:'),
    pemOpen: fill('-----BEGIN PRIVATE KEY-----'),
    assigned: fill('token='),
    bearer: fill('Bearer '),
    entropy: fill('key '),
    mixed: fill('password: x token=eyJ -----BEGIN ://x: Bearer key='),
    passKeys: fill('pass:'),
    spacedValue: fill('password: ' + 'a '.repeat(300) + '\n'),
    spacedIni: fill('db_pass = x '),
  }
  for (const [name, text] of Object.entries(inputs)) {
    test(`input '${name}' redacts within budget`, async () => {
      const t0 = performance.now()
      await r.redact(text)
      expect(performance.now() - t0).toBeLessThan(500)
    })
  }
})

describe('review fixes', () => {
  test('redactJson survives cycles and caps depth', async () => {
    const a: Record<string, unknown> = { name: 'x' }
    a['self'] = a
    const res = await r.redactJson(a)
    expect((res.value as { self: unknown }).self).toBe('[Circular]')
    let deep: unknown = 'leaf'
    for (let i = 0; i < 200; i++) deep = { d: deep }
    expect(JSON.stringify((await r.redactJson(deep)).value)).toContain('[MaxDepth]')
    const shared = { v: 1 }
    const twice = (await r.redactJson({ a: shared, b: shared })).value
    expect(twice).toEqual({ a: { v: 1 }, b: { v: 1 } })
  })

  test('any error inside a pass fails closed, and the lint result is not mutated', async () => {
    const fixed: [number, number, string][] = []
    const ok = createRedactor({ env: {}, lint: async () => fixed })
    await ok.redact('password=abcdef123')
    expect(fixed).toEqual([])
    const bad = createRedactor({ env: {}, lint: async () => 5 as never })
    expect(String((await bad.redact('x')).text)).toBe('[REDACTED:redactor-error]')
    const j = await bad.redactJson({ a: 'x' })
    expect(j.value).toEqual({ '[REDACTED:redactor-error]': '[REDACTED:redactor-error]' })
  })

  test('authorization schemes and cookies', async () => {
    expect(await out('Authorization: Basic dXNlcjpwYXNzd29yZDEyMw==')).toBe(
      'Authorization: Basic [REDACTED:auth-scheme]',
    )
    expect(await out('Proxy-Authorization: Digest username="a", response="abcdef0123"')).toBe(
      'Proxy-Authorization: Digest [REDACTED:auth-digest]',
    )
    expect(await out('Cookie: session=abcdef0123456789abcdef; theme=dark')).toBe(
      'Cookie: [REDACTED:cookie]',
    )
    expect(await out('Set-Cookie: sid=abcdef0123456789; HttpOnly')).toBe(
      'Set-Cookie: [REDACTED:cookie]',
    )
  })

  test('quoted values with spaces', async () => {
    expect(await out('password = "hunter 2 with space"')).toBe(
      'password = "[REDACTED:assigned-secret]"',
    )
    expect(await out("token: 'abc def'")).toBe("token: '[REDACTED:assigned-secret]'")
  })

  test('identifier tails and prefixes (.env dumps)', async () => {
    for (const line of [
      'SECRET_KEY=abcd1234efgh',
      'client_secret_key=abcd1234efgh',
      'private_key=abcd1234efgh',
      'STRIPE_SECRET_KEY=abcd1234efgh',
      'credentials=abcd1234efgh',
    ]) {
      const res = await r.redact(line)
      expect(res.text).not.toContain('abcd1234efgh')
    }
  })

  test('code that merely names a secret survives', async () => {
    for (const code of [
      'const token = getToken()',
      'auth = require("x")',
      'password: string',
      'secret = process.env.SECRET',
      'const author: Person = x',
    ]) {
      expect(await out(code)).toBe(code)
    }
  })

  test('env name matching is by segment with a deny-list', async () => {
    const e = createRedactor({
      env: {
        SSH_AUTH_SOCK: '/private/tmp/com.apple.launchd.abc/Listeners',
        MONKEY: 'banana-split-1',
        COMPASS: 'north-by-west',
        PASSENGER: 'window-seat-1',
        GITHUB_TOKEN_FILE: '/home/me/.tokenfile-path',
        STRIPE_APIKEY: 'live-value-abcd',
        DB_PASS: 'db-pass-value-1',
      },
    })
    const text = Object.values({
      a: '/private/tmp/com.apple.launchd.abc/Listeners',
      b: 'banana-split-1',
      c: 'north-by-west',
      d: 'window-seat-1',
      e: '/home/me/.tokenfile-path',
    }).join(' ')
    expect(String((await e.redact(text)).text)).toBe(text)
    const hit = await e.redact('live-value-abcd db-pass-value-1')
    expect(hit.redactions).toEqual({ 'env:STRIPE_APIKEY': 1, 'env:DB_PASS': 1 })
  })

  test('catastrophic custom patterns are rejected', () => {
    for (const regex of ['(a+)+$', '(x*)*', '(\\w+\\s?)*', '(a+){2,}']) {
      expect(() => createRedactor({ env: {}, extraPatterns: [{ id: 'bad', regex }] })).toThrow(
        /nested unbounded quantifier/,
      )
    }
    expect(() =>
      createRedactor({ env: {}, extraPatterns: [{ id: 'ok', regex: '(a|b)+x\\d{3}' }] }),
    ).not.toThrow()
  })

  test('redactJson handles Error, Date, Map, Set and secret keys of any shape', async () => {
    const err = new Error(`failed with ${ghp}`)
    const res = await r.redactJson({
      err,
      when: new Date('2026-01-02T03:04:05.000Z'),
      map: new Map([['password', 'abcdef123456']]),
      set: new Set([`k ${ghp}`]),
      cookie: { a: 'b' },
      private_key: ['line1', 'line2'],
      sessionId: 'abcdef-123456',
      [`key ${ghp}`]: 'v',
      tokens_used: 5,
    })
    const v = res.value as Record<string, unknown>
    const text = JSON.stringify(v)
    expect(text).not.toContain('ghp_aB3')
    expect(text).not.toContain('abcdef123456')
    expect((v['err'] as { name: string }).name).toBe('Error')
    expect(v['when']).toBe('2026-01-02T03:04:05.000Z')
    expect(Array.isArray(v['set'])).toBe(true)
    expect(v['cookie']).toBe('[REDACTED:assigned-secret]')
    expect(v['private_key']).toBe('[REDACTED:assigned-secret]')
    expect(v['sessionId']).toBe('abcdef-123456')
    expect(v['tokens_used']).toBe(5)
  })

  test('redactJson keeps ids and token-count objects, blanks secrets, and keeps an own __proto__ key', async () => {
    const input = JSON.parse(
      '{"sessionId":"s-1","tokenizer":"gpt","session":{"id":"s"},"input_tokens":{"n":1},"__proto__":{"x":1},"access_token":"abcdef123456"}',
    )
    const v = (await r.redactJson(input)).value as Record<string, unknown>
    expect(v['sessionId']).toBe('s-1')
    expect(v['tokenizer']).toBe('gpt')
    expect(v['session']).toEqual({ id: 's' })
    expect(v['input_tokens']).toEqual({ n: 1 })
    expect(Object.getOwnPropertyDescriptor(v, '__proto__')?.value).toEqual({ x: 1 })
    expect(v['access_token']).toBe('[REDACTED:assigned-secret]')
    expect((await r.redactJson({ session: 'abcdef0123456789' })).value).toEqual({
      session: '[REDACTED:assigned-secret]',
    })
  })

  test('splice stays linear with many redactions', async () => {
    const text = 'password=abcdef1 '.repeat(5000)
    const t0 = performance.now()
    const res = await r.redact(text)
    expect(performance.now() - t0).toBeLessThan(500)
    expect(res.redactions['assigned-secret']).toBe(5000)
  })
})
