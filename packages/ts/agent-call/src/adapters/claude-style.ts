/**
 * The result shape Claude Code's `--output-format json|stream-json` made
 * common: a `result` envelope with `result`, `subtype`, `is_error`,
 * `session_id` and `usage`, and a stream of `assistant`/`user` events whose
 * `message.content` holds Anthropic content blocks. claude and qwen emit it;
 * droid's json envelope and cursor's json and stream envelopes do too (cursor
 * with its own usage names). Parsing it lives here once.
 */

import {
  CONVERSATION_SCHEMA,
  type Conversation,
  type ConversationMessage,
  type Part,
  type Usage,
} from '../conversation.js'
import type { PlannedCall } from '../plan.js'
import { asNumber, asString, get, parseJsonLines, tryParseJson } from './shared.js'
import type { ParsedOutput, RawProcessOutput } from './types.js'

/** How one CLI's output departs from claude's. */
export interface ClaudeStyleOptions {
  /** How the CLI is named in error details, e.g. `qwen --output-format json`. */
  label: string
}

/**
 * Parse claude-style output for any of the three formats. The `json` format
 * may be one envelope or an array of events whose last `result` is the
 * envelope (qwen prints the whole run as an array).
 */
export function parseClaudeStyle(
  planned: PlannedCall,
  raw: RawProcessOutput,
  options: ClaudeStyleOptions,
): ParsedOutput {
  if (planned.outputFormat === 'text') {
    const parsed: ParsedOutput = { text: raw.stdout.trim() }
    if (planned.spec.output?.schema !== undefined) parsed.structured = tryParseJson(parsed.text)
    return parsed
  }

  if (planned.outputFormat === 'stream-json') {
    const events = parseJsonLines(raw.stdout)
    const result = lastResult(events)
    if (result === undefined) {
      // The stream ended without its terminal envelope (crash, kill, truncated
      // output). The events are still returned so callers can mine them, and
      // the exit code and stderr stay on the AgentResult.
      return {
        text: '',
        isError: true,
        errorDetail: `${options.label} stream-json produced no result event`,
        events,
      }
    }
    return { ...claudeStyleFields(result, planned), model: firstModel(events), events }
  }

  const envelope = tryParseJson(raw.stdout)
  if (Array.isArray(envelope)) {
    const result = lastResult(envelope)
    if (result !== undefined) {
      return {
        ...claudeStyleFields(result, planned),
        model: firstModel(envelope),
        events: envelope,
      }
    }
  } else if (envelope !== undefined) {
    return claudeStyleFields(envelope, planned)
  }
  return {
    text: raw.stdout.trim(),
    isError: true,
    errorDetail: `${options.label} json produced no parseable envelope`,
  }
}

/** The fields of one result envelope (the `json` envelope or the stream's `result` event). */
export function claudeStyleFields(envelope: unknown, planned: PlannedCall): ParsedOutput {
  const text = asString(get(envelope, 'result')) ?? ''
  const subtype = asString(get(envelope, 'subtype'))
  const isError = get(envelope, 'is_error') === true || subtype === 'error'
  const parsed: ParsedOutput = {
    text,
    sessionId: asString(get(envelope, 'session_id')),
    costUsd: asNumber(get(envelope, 'total_cost_usd')),
    usage: claudeStyleUsage(get(envelope, 'usage')),
    stopReason: subtype,
    isError,
    errorDetail: isError ? text || subtype : undefined,
  }
  if (planned.spec.output?.schema !== undefined) {
    parsed.structured = get(envelope, 'structured_output') ?? tryParseJson(text)
  }
  return parsed
}

/** Anthropic-named usage counters, as claude, qwen and droid report them. */
export function claudeStyleUsage(usage: unknown): Usage | undefined {
  if (usage === null || typeof usage !== 'object') return undefined
  return {
    inputTokens: asNumber(get(usage, 'input_tokens')),
    outputTokens: asNumber(get(usage, 'output_tokens')),
    cacheReadTokens: asNumber(get(usage, 'cache_read_input_tokens')),
    cacheWriteTokens: asNumber(get(usage, 'cache_creation_input_tokens')),
  }
}

/**
 * The conversation of a claude-style run. With events (stream-json, or a json
 * array), each `assistant` and `user` event's content becomes a message;
 * otherwise only the prompt and the final answer are known.
 */
export function claudeStyleConversation(
  agent: string,
  planned: PlannedCall,
  raw: RawProcessOutput,
  parsed: ParsedOutput,
): Conversation {
  const prompt = planned.stdin ?? planned.prompt ?? ''
  const messages: ConversationMessage[] = [
    { role: 'user', parts: [{ type: 'text', text: prompt }] },
  ]

  if (parsed.events !== undefined) {
    for (const event of parsed.events) {
      const type = get(event, 'type')
      if (type !== 'assistant' && type !== 'user') continue
      const parts = anthropicContentParts(get(event, 'message', 'content'))
      if (parts.length > 0) {
        messages.push({ role: type === 'assistant' ? 'assistant' : 'tool', parts })
      }
    }
  } else if (parsed.text !== '') {
    messages.push({ role: 'assistant', parts: [{ type: 'text', text: parsed.text }] })
  }

  return {
    schema: CONVERSATION_SCHEMA,
    agent,
    model: parsed.model,
    sessionId: parsed.sessionId,
    messages,
    usage: parsed.usage,
    costUsd: parsed.costUsd,
    stopReason: parsed.stopReason,
    raw: {
      format: `${agent}/${planned.outputFormat}`,
      data: parsed.events ?? tryParseJson(raw.stdout) ?? raw.stdout,
    },
  }
}

/** Anthropic message content blocks → normalized parts. */
export function anthropicContentParts(content: unknown): Part[] {
  if (!Array.isArray(content)) return []
  const parts: Part[] = []
  for (const block of content) {
    const type = get(block, 'type')
    if (type === 'text') {
      const text = asString(get(block, 'text'))
      if (text !== undefined && text !== '') parts.push({ type: 'text', text })
    } else if (type === 'thinking') {
      const text = asString(get(block, 'thinking'))
      if (text !== undefined) parts.push({ type: 'reasoning', text })
    } else if (type === 'tool_use') {
      parts.push({
        type: 'tool-call',
        callId: asString(get(block, 'id')),
        name: asString(get(block, 'name')) ?? 'unknown',
        input: get(block, 'input'),
      })
    } else if (type === 'tool_result') {
      parts.push({
        type: 'tool-result',
        callId: asString(get(block, 'tool_use_id')),
        output: get(block, 'content'),
        isError: get(block, 'is_error') === true,
      })
    }
  }
  return parts
}

/** The last `result` event, the run's closing envelope. */
function lastResult(events: unknown[]): unknown {
  for (let i = events.length - 1; i >= 0; i--) {
    if (get(events[i], 'type') === 'result') return events[i]
  }
  return undefined
}

/** The model the first event names, at `message.model` or `model` (an init event). */
function firstModel(events: unknown[]): string | undefined {
  for (const event of events) {
    const model = asString(get(event, 'message', 'model')) ?? asString(get(event, 'model'))
    if (model !== undefined) return model
  }
  return undefined
}
