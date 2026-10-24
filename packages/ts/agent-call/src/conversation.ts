/**
 * The normalized conversation model, an optional result of a call. An adapter
 * can convert its raw transcript into this shape for analysis after the run.
 * The raw transcript is kept in `Conversation.raw`, so normalizing loses no
 * information.
 *
 * The shape follows the common core of the OpenTelemetry GenAI conventions
 * and the Vercel AI SDK message model: role-tagged messages made of typed
 * parts (text, reasoning, tool-call, tool-result), plus run-level usage,
 * cost, and timing.
 */

/** The `Conversation.schema` value of this model. Its version is part of the string. */
export const CONVERSATION_SCHEMA = 'agent-conversation/1' as const

/** Who produced a message. Tool results travel under `tool`. */
export type Role = 'system' | 'user' | 'assistant' | 'tool'

/** One typed piece of a message: text, reasoning, a tool call, or a tool result. */
export type Part =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool-call'; callId?: string | undefined; name: string; input: unknown }
  | {
      type: 'tool-result'
      callId?: string | undefined
      name?: string | undefined
      output: unknown
      isError?: boolean | undefined
    }

/** One message of a conversation: a role and its typed parts. */
export interface ConversationMessage {
  role: Role
  parts: Part[]
  /** ISO 8601, when the source transcript carries timestamps. */
  timestamp?: string | undefined
}

/** Token counts for a run. Each field is present only when the agent reports it. */
export interface Usage {
  inputTokens?: number | undefined
  outputTokens?: number | undefined
  cacheReadTokens?: number | undefined
  cacheWriteTokens?: number | undefined
  totalTokens?: number | undefined
}

/** A run converted into the normalized model, with the untouched source kept in `raw`. */
export interface Conversation {
  schema: typeof CONVERSATION_SCHEMA
  /** Adapter name, e.g. "claude". */
  agent: string
  model?: string | undefined
  sessionId?: string | undefined
  messages: ConversationMessage[]
  usage?: Usage | undefined
  costUsd?: number | undefined
  durationMs?: number | undefined
  stopReason?: string | undefined
  /** The untouched source transcript. `format` names the source encoding. */
  raw: { format: string; data: unknown }
}

/** Concatenated text of every `text` part from assistant messages. */
export function assistantText(conversation: Conversation): string {
  const chunks: string[] = []
  for (const message of conversation.messages) {
    if (message.role !== 'assistant') continue
    for (const part of message.parts) {
      if (part.type === 'text' && part.text !== '') chunks.push(part.text)
    }
  }
  return chunks.join('\n')
}

/** Every tool call across the conversation, in order. */
export function toolCalls(conversation: Conversation): Array<Extract<Part, { type: 'tool-call' }>> {
  const calls: Array<Extract<Part, { type: 'tool-call' }>> = []
  for (const message of conversation.messages) {
    for (const part of message.parts) {
      if (part.type === 'tool-call') calls.push(part)
    }
  }
  return calls
}
