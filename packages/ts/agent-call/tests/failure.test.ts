/**
 * Failure classification. The fixtures are strings taken from published
 * messages, not live captures, and they are the contract until a run is
 * captured. No test runs a CLI.
 */

import { describe, expect, test } from 'vitest'

import { callAgent, classifyFailure, customAdapter } from '../src/index.js'
import { classifyClaude, classifyCodex, classifyCursor } from '../src/adapters/failure.js'
import { limitLabel, parseEpochReset, parseReset } from '../src/reset.js'
import { parseRelativeReset, parseWallClockReset } from '../src/reset.js'
import type { FailureOutput } from '../src/failure.js'

const NOW = new Date('2026-10-07T12:00:00Z')

const run = (over: Partial<FailureOutput>): FailureOutput => ({
  exitCode: 1,
  stdout: '',
  stderr: '',
  ...over,
})

const envelope = (result: string, extra: object = {}, isError = true): string =>
  JSON.stringify({ type: 'result', subtype: 'success', is_error: isError, result, ...extra })

const claude = (over: Partial<FailureOutput>) => classifyFailure('claude', run(over), { now: NOW })
const codex = (over: Partial<FailureOutput>) => classifyFailure('codex', run(over), { now: NOW })
const cursor = (over: Partial<FailureOutput>) => classifyFailure('cursor', run(over), { now: NOW })

describe('claude', () => {
  test('exit 0 with a successful envelope is no failure, whatever the output says', () => {
    const stdout = envelope('usage limit reached|1791374400', {}, false)
    expect(claude({ exitCode: 0, stdout })).toBeUndefined()
  })

  test('older build: usage limit with an epoch reset', () => {
    expect(claude({ stdout: envelope('Claude AI usage limit reached|1791374400') })).toEqual({
      kind: 'rate-limit',
      resetAt: new Date(1791374400 * 1000).toISOString(),
      limit: 'usage limit',
    })
  })

  test('5-hour limit with a zoned wall-clock reset', () => {
    expect(
      claude({ stdout: envelope('5-hour limit reached ∙ resets 3pm (America/Los_Angeles)') }),
    ).toEqual({ kind: 'rate-limit', resetAt: '2026-10-07T22:00:00.000Z', limit: '5-hour limit' })
  })

  test('a limit with no parseable reset has a null reset', () => {
    expect(claude({ stdout: envelope("You've hit your limit") })).toEqual({
      kind: 'rate-limit',
      resetAt: null,
      limit: 'usage limit',
    })
  })

  test('a bare API 429 on stderr is a rate limit with no reset', () => {
    const stderr =
      'API Error: 429 {"type":"error","error":{"type":"rate_limit_error","message":"Number of request tokens has exceeded your per-minute rate limit"}}'
    expect(claude({ stderr })).toEqual({
      kind: 'rate-limit',
      resetAt: null,
      limit: 'rate limited (429)',
    })
  })

  test('auth failures are auth', () => {
    for (const text of [
      'Invalid API key · Please run /login',
      'API Error: 401 {"type":"error","error":{"type":"authentication_error"}}',
      'OAuth token has expired',
    ]) {
      expect(claude({ stdout: envelope(text) })).toEqual({ kind: 'auth' })
    }
    expect(claude({ stdout: envelope('x', { api_error_status: 401, num_turns: 1 }) })).toEqual({
      kind: 'auth',
    })
  })

  test('out of credit is quota', () => {
    for (const stdout of [
      envelope('Your credit balance is too low to access the API', {
        api_error_status: 402,
        num_turns: 1,
      }),
      envelope('x', { api_error_status: 402 }),
      envelope('billing_error: add credit', { num_turns: 1 }),
      envelope('insufficient credit', { num_turns: 1 }),
      envelope('You have reached your specified API usage limits', { api_error_status: 429 }),
      envelope('Reached the monthly limit for this workspace', { api_error_status: 429 }),
    ]) {
      expect(claude({ stdout })).toEqual({ kind: 'quota' })
    }
    expect(claude({ stderr: 'API Error: 402 credit balance is too low' })).toEqual({
      kind: 'quota',
    })
  })

  test('a subscription limit that resets is a rate limit even on a 429', () => {
    expect(
      claude({ stderr: 'API Error: 429 Claude AI usage limit reached|1791374400' }),
    ).toMatchObject({ kind: 'rate-limit', resetAt: '2026-10-07T12:00:00.000Z' })
    const hit = envelope("You've hit your usage limit ∙ resets 7pm", { api_error_status: 429 })
    expect(claude({ stdout: hit })).toMatchObject({ kind: 'rate-limit', limit: 'usage limit' })
    expect(claude({ stdout: hit })).toHaveProperty('resetAt', expect.any(String))
  })

  test("a failed stream-json run does not read the agent's answer", () => {
    const lines = [
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'credit balance is too low; invalid api key' }],
        },
      },
      { type: 'result', is_error: false, result: 'credit balance is too low' },
    ]
    expect(claude({ stdout: lines.map((l) => JSON.stringify(l)).join('\n') })).toBeUndefined()
  })

  test('a structured 429 with no wording is a rate limit', () => {
    expect(
      claude({ stdout: envelope('Request rejected', { api_error_status: 429 }) }),
    ).toMatchObject({
      kind: 'rate-limit',
    })
  })

  test('stderr auth words count on a long run, the envelope text does not', () => {
    const long = { num_turns: 5 }
    expect(claude({ stdout: envelope('', long), stderr: 'OAuth token has expired' })).toEqual({
      kind: 'auth',
    })
    expect(claude({ stdout: envelope('invalid api key', long) })).toBeUndefined()
  })

  test('a 429 with per-minute wording stays a rate limit', () => {
    const stdout = envelope('rate_limit_error: exceeded your per-minute rate limit', {
      api_error_status: 429,
      num_turns: 1,
    })
    expect(claude({ stdout })).toMatchObject({ kind: 'rate-limit', resetAt: null })
  })

  test('credit words at the end of a long run are the agent talking, not a cause', () => {
    const stdout = envelope('the credit balance is too low (quoted from a file)', { num_turns: 5 })
    expect(claude({ stdout })).toBeUndefined()
  })

  test("status and rate-limit words in a long run's answer are the agent talking", () => {
    const answer =
      'the upstream returned API Error: 401 and the client retried on 429 too many requests'
    expect(claude({ stdout: envelope(answer, { num_turns: 5 }) })).toBeUndefined()
  })

  test('a real 429 on a long run still classifies', () => {
    const stdout = envelope('Request rejected', { num_turns: 5, api_error_status: 429 })
    expect(claude({ stdout })).toMatchObject({ kind: 'rate-limit' })
  })

  test('any other failure has no cause', () => {
    expect(claude({ stdout: envelope('Error: tool crashed') })).toBeUndefined()
    expect(claude({ stderr: 'spawn claude ENOENT' })).toBeUndefined()
  })

  test('the agent talking about rate limits in a non-error result is not a cause', () => {
    const talk = envelope('I added retry logic for rate_limit_error and 429 responses.', {}, false)
    expect(claude({ stdout: talk })).toBeUndefined()
    expect(claude({ exitCode: 0, stdout: talk, stderr: 'usage limit reached' })).toBeUndefined()
  })

  test('non-JSON stdout falls back to its tail', () => {
    expect(claude({ stdout: 'Claude AI usage limit reached|1791374400\n' })).toEqual({
      kind: 'rate-limit',
      resetAt: new Date(1791374400 * 1000).toISOString(),
      limit: 'usage limit',
    })
  })

  test('the array form of the json output uses its last event', () => {
    const stdout = JSON.stringify([
      { type: 'system' },
      { type: 'result', is_error: true, result: '5-hour limit reached ∙ resets 3pm (UTC)' },
    ])
    expect(claude({ stdout })).toMatchObject({ kind: 'rate-limit', limit: '5-hour limit' })
  })

  test('a relative reset uses the given now', () => {
    expect(claude({ stderr: 'usage limit reached. Try again in 2 hours 13 minutes.' })).toEqual({
      kind: 'rate-limit',
      resetAt: '2026-10-07T14:13:00.000Z',
      limit: 'usage limit',
    })
  })
})

describe('codex', () => {
  const jsonl = (...events: object[]): string => events.map((e) => JSON.stringify(e)).join('\n')

  test('exit 0 is no failure', () => {
    expect(codex({ exitCode: 0, stderr: 'usage limit' })).toBeUndefined()
  })

  test('usage limit with a duration reset, in a turn.failed event', () => {
    const stdout = jsonl(
      { type: 'thread.started', thread_id: 't' },
      {
        type: 'turn.failed',
        error: {
          message:
            "You've hit your usage limit. Upgrade to Pro or try again in 2 hours 13 minutes.",
        },
      },
    )
    expect(codex({ stdout })).toEqual({
      kind: 'rate-limit',
      resetAt: '2026-10-07T14:13:00.000Z',
      limit: 'usage limit',
    })
  })

  test('usage limit with a wall-clock reset on stderr', () => {
    const cause = codex({ stderr: "ERROR: You've hit your usage limit. Try again at 3:45 PM." })
    expect(cause?.kind).toBe('rate-limit')
    expect(
      cause?.kind === 'rate-limit' && cause.resetAt !== null && new Date(cause.resetAt).getHours(),
    ).toBe(15)
  })

  test('a transport 429 has no reset', () => {
    const stdout = jsonl({
      type: 'error',
      message: 'stream error: exceeded retry limit, last status: 429 Too Many Requests',
    })
    expect(codex({ stdout })).toEqual({
      kind: 'rate-limit',
      resetAt: null,
      limit: 'rate limited (429)',
    })
  })

  test('auth failures are auth', () => {
    expect(codex({ stderr: 'ERROR: 401 Unauthorized: invalid token' })).toEqual({ kind: 'auth' })
    expect(codex({ stderr: 'Not logged in. Run codex login.' })).toEqual({ kind: 'auth' })
    const stdout = jsonl({
      type: 'turn.failed',
      error: { message: 'unexpected status 401 Unauthorized: Incorrect API key provided' },
    })
    expect(codex({ stdout })).toEqual({ kind: 'auth' })
  })

  test('out of quota is quota, even when the message also says 429', () => {
    for (const message of [
      'You exceeded your current quota, please check your plan and billing details.',
      'insufficient_quota',
      'Billing hard limit has been reached',
      'unexpected status 402 Payment Required',
      '429 Too Many Requests: insufficient_quota',
    ]) {
      const stdout = jsonl({ type: 'turn.failed', error: { message } })
      expect(codex({ stdout })).toEqual({ kind: 'quota' })
    }
  })

  test('the agent talking about rate limits in its own message is not a cause', () => {
    const stdout = jsonl({
      type: 'item.completed',
      item: {
        type: 'agent_message',
        text: 'Handled the 429 Too Many Requests and insufficient_quota case.',
      },
    })
    expect(codex({ stdout })).toBeUndefined()
  })

  test('a truncated line is ignored; any other failure has no cause', () => {
    expect(codex({ stdout: '{"type":"err', stderr: 'boom' })).toBeUndefined()
  })
})

test('codex: an error event retried into a completed turn is not a failure', () => {
  const stdout = [{ type: 'error', message: '429 Too Many Requests' }, { type: 'turn.completed' }]
    .map((e) => JSON.stringify(e))
    .join('\n')
  expect(codex({ exitCode: 0, stdout })).toBeUndefined()
})

describe('cursor', () => {
  test('a bad key is auth, from plain text on stderr or stdout', () => {
    expect(cursor({ stderr: 'The API key is invalid' })).toEqual({ kind: 'auth' })
    expect(cursor({ stdout: 'Authentication required. Run agent login.' })).toEqual({
      kind: 'auth',
    })
    expect(cursor({ stdout: envelope('Not logged in') })).toEqual({ kind: 'auth' })
  })

  // The out-of-credit wording is an unverified guess (see the README).
  test('the guessed out-of-credit words are quota', () => {
    expect(cursor({ stderr: 'You are out of credits' })).toEqual({ kind: 'quota' })
    expect(cursor({ stdout: envelope('usage limit reached') })).toEqual({ kind: 'quota' })
  })

  test('a bare quota, or a plain rate limit, is not quota', () => {
    expect(cursor({ stderr: 'quota' })).toBeUndefined()
    expect(cursor({ stderr: 'rate limit exceeded for this per-minute quota' })).toBeUndefined()
    expect(cursor({ stderr: 'Quota exceeded' })).toEqual({ kind: 'quota' })
  })

  test('no failure, or an unknown one, has no cause', () => {
    expect(cursor({ exitCode: 0, stdout: envelope('quota is a word', {}, false) })).toBeUndefined()
    expect(cursor({ stderr: 'boom' })).toBeUndefined()
  })
})

describe('classifyFailure', () => {
  test('takes an adapter as well as a name', () => {
    const adapter = { ...customAdapter({ name: 'stub', binary: 'x', args: () => [] }) }
    expect(classifyFailure(adapter, run({ stderr: 'usage limit reached' }))).toBeUndefined()
  })

  test('an adapter without a classifier, an unknown name and bad input give undefined', () => {
    const stderr = 'usage limit reached'
    expect(classifyFailure('qwen', run({ stderr }))).toBeUndefined()
    expect(classifyFailure('nope' as never, run({ stderr }))).toBeUndefined()
    expect(classifyFailure('claude', null as never)).toBeUndefined()
    expect(
      classifyFailure('claude', { stdout: 1, stderr: 2, exitCode: 1 } as never),
    ).toBeUndefined()
  })

  test('now defaults to the current time', () => {
    const cause = classifyFailure('codex', run({ stderr: 'usage limit. try again in 1 hour' }))
    expect(cause?.kind === 'rate-limit' && Date.parse(cause.resetAt!)).toBeGreaterThan(Date.now())
  })
})

describe('callAgent', () => {
  // A node script stands in for the CLI and prints a limit message.
  const claudeLike = (stdout: string, code: number) => {
    const adapter = customAdapter({
      name: 'stub',
      binary: 'node',
      args: () => ['-e', `console.log(${JSON.stringify(stdout)}); process.exit(${code})`],
    })
    return {
      ...adapter,
      classifyFailure: (output: FailureOutput) => classifyClaude(output, NOW),
    }
  }

  test('sets error.cause on a failed run when the adapter can tell', async () => {
    const result = await callAgent(
      claudeLike(envelope('Your credit balance is too low', { num_turns: 1 }), 1),
      { prompt: 'x' },
    )
    expect(result.ok).toBe(false)
    expect(result.error).toMatchObject({ reason: 'nonzero-exit', cause: { kind: 'quota' } })
  })

  test('leaves cause undefined on success and when the adapter has no classifier', async () => {
    const ok = await callAgent(claudeLike(envelope('hi', {}, false), 0), { prompt: 'x' })
    expect(ok.error).toBeUndefined()
    const plain = customAdapter({
      name: 'stub',
      binary: 'node',
      args: () => ['-e', 'console.error("usage limit reached"); process.exit(1)'],
    })
    const failed = await callAgent(plain, { prompt: 'x' })
    expect(failed.error?.reason).toBe('nonzero-exit')
    expect(failed.error?.cause).toBeUndefined()
  })

  test('leaves cause undefined when the classifier throws', async () => {
    const adapter = {
      ...claudeLike('boom', 1),
      classifyFailure: () => {
        throw new Error('bad')
      },
    }
    const result = await callAgent(adapter, { prompt: 'x' })
    expect(result.error?.reason).toBe('nonzero-exit')
    expect(result.error?.cause).toBeUndefined()
  })
})

describe('reset times', () => {
  test('epoch seconds after a pipe', () => {
    expect(parseEpochReset('Claude AI usage limit reached|1791374400')).toEqual(
      new Date(1791374400 * 1000),
    )
    expect(parseEpochReset('usage limit reached')).toBeNull()
  })

  test.each([
    ['try again in 2 hours 13 minutes.', 2 * 3_600_000 + 13 * 60_000],
    ['Please try again in 90s', 90_000],
    ['retry after 1.5 hours', 5_400_000],
    ['try again in 4 days 3 hours and 30 minutes', 4 * 86_400_000 + 3 * 3_600_000 + 30 * 60_000],
    ['resets in 45 min', 45 * 60_000],
  ])('duration: %s', (text, ms) => {
    expect(parseRelativeReset(text, NOW)).toEqual(new Date(NOW.getTime() + ms))
  })

  test('no duration, no reset', () => {
    expect(parseRelativeReset('try again later', NOW)).toBeNull()
  })

  test('a zoned time later today, and one already past means tomorrow', () => {
    expect(parseWallClockReset('limit reached ∙ resets 3pm (America/Los_Angeles)', NOW)).toEqual(
      new Date('2026-10-07T22:00:00Z'),
    )
    expect(parseWallClockReset('resets 4am (America/Los_Angeles)', NOW)).toEqual(
      new Date('2026-10-08T11:00:00Z'),
    )
  })

  test('minutes, a UTC zone, 12am and 12pm', () => {
    expect(parseWallClockReset('resets at 3:30 pm (UTC)', NOW)).toEqual(
      new Date('2026-10-07T15:30:00Z'),
    )
    expect(parseWallClockReset('resets 12am (UTC)', NOW)).toEqual(new Date('2026-10-08T00:00:00Z'))
    expect(parseWallClockReset('resets 12pm (UTC)', NOW)).toEqual(new Date('2026-10-08T12:00:00Z'))
  })

  test('a dated time, and a time with no zone in local time', () => {
    expect(parseWallClockReset('try again at Oct 20th, 2026 3:15 PM (UTC)', NOW)).toEqual(
      new Date('2026-10-20T15:15:00Z'),
    )
    const at = parseWallClockReset('try again at 11:59 PM', NOW)
    expect([at?.getHours(), at?.getMinutes()]).toEqual([23, 59])
  })

  test('an unknown zone, or no time, is no reset', () => {
    expect(parseWallClockReset('resets 3pm (Mars/Olympus_Mons)', NOW)).toBeNull()
    expect(parseWallClockReset('usage limit reached', NOW)).toBeNull()
  })

  test('epoch beats a duration beats a wall clock', () => {
    expect(parseReset('reached|1791374400 resets 3pm (UTC)', NOW)).toEqual(
      new Date(1791374400 * 1000),
    )
    expect(parseReset('try again in 10 minutes', NOW)).toEqual(new Date('2026-10-07T12:10:00Z'))
  })

  test.each([
    ['Your weekly limit reached ∙ resets Mon', 'weekly limit'],
    ['5-hour limit reached ∙ resets 3pm', '5-hour limit'],
    ['session limit reached', 'session limit'],
    ['Opus limit reached', 'opus limit'],
    ["You've hit your usage limit", 'usage limit'],
    ['API Error: 429 rate_limit_error', 'rate limited (429)'],
    ['something else entirely', 'rate limit'],
  ])('limit label: %s', (text, label) => {
    expect(limitLabel(text)).toBe(label)
  })
})

describe('classifiers', () => {
  test('are pure functions of the output and now', () => {
    const output = run({ stdout: envelope('5-hour limit reached ∙ resets 3pm (UTC)') })
    expect(classifyClaude(output, NOW)).toEqual(classifyClaude(output, NOW))
    expect(classifyCodex(run({}), NOW)).toBeUndefined()
    expect(classifyCursor(run({}), NOW)).toBeUndefined()
  })
})
