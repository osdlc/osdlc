/**
 * Failure classifiers for the built-in adapters that have one. Each reads the
 * failure text only: stderr, the error events or the error envelope, and the
 * tail of stdout when it is not structured. It never reads the agent's own
 * answer, so a task that talks about rate limits is not a rate limit.
 *
 * The phrases come from published messages and issue trackers, not live
 * captures.
 */

import type { FailureCause, FailureOutput } from '../failure.js'
import { limitLabel, parseReset } from '../reset.js'
import { asNumber, asString, get, parseJsonLines, tryParseJson } from './shared.js'

type Classifier = (output: FailureOutput, now: Date) => FailureCause | undefined

/** Characters. */
const UNSTRUCTURED_STDOUT_TAIL = 2000

function rateLimit(text: string, now: Date): FailureCause {
  const at = parseReset(text, now)
  return {
    kind: 'rate-limit',
    resetAt: at === null || Number.isNaN(at.getTime()) ? null : at.toISOString(),
    limit: limitLabel(text),
  }
}

interface Envelope {
  isError: boolean
  text: string
  status: number | undefined
  turns: number | undefined
}

/** The result envelope claude and cursor print, read only when it has `is_error: true`. */
function errorEnvelope(stdout: string): Envelope {
  const parsed = tryParseJson(stdout)
  // A stream-json run prints one event per line; its last event is the result.
  const envelope = Array.isArray(parsed) ? parsed.at(-1) : (parsed ?? parseJsonLines(stdout).at(-1))
  if (get(envelope, 'is_error') !== true) {
    return { isError: false, text: '', status: undefined, turns: undefined }
  }
  return {
    isError: true,
    text: asString(get(envelope, 'result')) ?? '',
    status: asNumber(get(envelope, 'api_error_status')),
    turns: asNumber(get(envelope, 'num_turns')),
  }
}

/** Stderr (of a run that exited nonzero), the envelope's error text, and an unstructured stdout's tail. */
function failureText(output: FailureOutput, envelope: Envelope): string {
  const failedExit = output.exitCode !== 0
  const structured =
    tryParseJson(output.stdout) !== undefined || parseJsonLines(output.stdout).length > 0
  return [
    failedExit ? output.stderr : '',
    envelope.text,
    failedExit && !structured ? output.stdout.slice(-UNSTRUCTURED_STDOUT_TAIL) : '',
  ].join('\n')
}

const CLAUDE_QUOTA = /billing_error|credit balance is too low|insufficient credit/i
// Not a bare "usage limit": a subscription's "usage limit reached" resets, so it is a rate limit.
const CLAUDE_QUOTA_429 = /spend limit|monthly limit|specified API usage limit/i
const CLAUDE_RATE_LIMIT =
  /usage limit reached|hit your (?:usage |weekly |session )?limit|(?:\d+-hour|weekly|session|opus|sonnet) limit reached|rate_limit_error|API Error:?\s*429|\b429\b[^\n]{0,40}(?:rate|too many)/i
const CLAUDE_AUTH =
  /authentication_error|invalid x-api-key|invalid api key|please run \/login|not logged in|oauth token has expired|API Error:?\s*401/i

/**
 * claude: a 402 or a credit message is `quota`, and so is a 429 that names a
 * spend or monthly limit; other usage limits and 429s are `rate-limit`. On a
 * run of more than one turn the envelope's `result` is usually the agent's own
 * text, so credit and auth words in it are ignored.
 */
export const classifyClaude: Classifier = (output, now) => {
  const envelope = errorEnvelope(output.stdout)
  if (output.exitCode === 0 && !envelope.isError) return undefined
  const text = failureText(output, envelope)
  const short = envelope.turns === undefined || envelope.turns <= 1
  const outsideAnswer = short ? text : text.replace(envelope.text, '')
  const status = envelope.status ?? Number(/API Error:?\s*(\d{3})/i.exec(outsideAnswer)?.[1])
  if (status === 402 || CLAUDE_QUOTA.test(outsideAnswer)) return { kind: 'quota' }
  if (status === 429 && CLAUDE_QUOTA_429.test(outsideAnswer)) return { kind: 'quota' }
  if (CLAUDE_RATE_LIMIT.test(outsideAnswer) || status === 429) return rateLimit(text, now)
  if (status === 401 || CLAUDE_AUTH.test(outsideAnswer)) return { kind: 'auth' }
  return undefined
}

const CODEX_QUOTA =
  /insufficient_quota|exceeded your current quota|billing_hard_limit|billing hard limit|402 Payment Required/i
const CODEX_RATE_LIMIT =
  /usage limit|rate_limit_exceeded|rate limit (?:reached|exceeded)|too many requests/i
const CODEX_AUTH =
  /401 unauthorized|invalid_api_key|incorrect api key|missing bearer|not logged in|please log in|invalid api key|refresh token|authentication (?:error|failed)/i

/** Messages of the JSONL stream's `error` and `turn.failed` events. */
function codexFailureMessages(stdout: string): string[] {
  const out: string[] = []
  for (const event of parseJsonLines(stdout)) {
    const type = asString(get(event, 'type')) ?? ''
    if (!/error|fail/i.test(type)) continue
    const error = get(event, 'error')
    for (const m of [get(event, 'message'), error, get(error, 'message')]) {
      if (typeof m === 'string') out.push(m)
    }
  }
  return out
}

/** codex: reads only the stream's error events, and stderr when the run exited nonzero. */
export const classifyCodex: Classifier = (output, now) => {
  // An error event followed by a completed turn was retried and succeeded.
  if (
    output.exitCode === 0 &&
    parseJsonLines(output.stdout).some((e) => get(e, 'type') === 'turn.completed')
  ) {
    return undefined
  }
  const text = [
    output.exitCode === 0 ? '' : output.stderr,
    ...codexFailureMessages(output.stdout),
  ].join('\n')
  if (CODEX_QUOTA.test(text)) return { kind: 'quota' }
  if (CODEX_RATE_LIMIT.test(text)) return rateLimit(text, now)
  if (CODEX_AUTH.test(text)) return { kind: 'auth' }
  return undefined
}

const CURSOR_AUTH =
  /API key is invalid|invalid API key|not logged in|not authenticated|Authentication required/i
// UNVERIFIED: cursor's real out-of-credit message was not found. These words
// are a conservative guess, to be replaced when a run is captured.
const CURSOR_QUOTA = /usage limit|out of credits|quota (?:exceeded|exhausted)/i

/**
 * cursor: a bad key exits 1 with plain text ("The API key is invalid"). There
 * is no rate-limit classification.
 */
export const classifyCursor: Classifier = (output) => {
  const envelope = errorEnvelope(output.stdout)
  if (output.exitCode === 0 && !envelope.isError) return undefined
  const text = failureText(output, envelope)
  if (CURSOR_AUTH.test(text)) return { kind: 'auth' }
  if (CURSOR_QUOTA.test(text)) return { kind: 'quota' }
  return undefined
}

/** Adapts a classifier to `AgentAdapter.classifyFailure`. */
export function failureClassifier(
  classify: Classifier,
): (output: FailureOutput, options?: { now?: Date }) => FailureCause | undefined {
  return (output, options = {}) => classify(output, options.now ?? new Date())
}
