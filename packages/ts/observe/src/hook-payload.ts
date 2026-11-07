/**
 * One shape for the payload a coding-agent harness sends on a hook's stdin.
 *
 * Each harness sends its own JSON. This module reads the envelope every hook
 * needs out of it: the `harness`, the `event`, the `sessionId`, the `cwd` and
 * the `transcriptPath`, and the per-prompt id when there is one. The body is
 * kept whole in `raw`, and `missing` names the envelope fields the payload did
 * not carry. Only the envelope is normalised: an event's body stays in `raw` as
 * the harness sent it, and the typed readers below take fields from it.
 *
 * Parsing is tolerant. A payload that is not an object, or an event this
 * version does not know, still produces an envelope, because a hook must never
 * fail on a shape a newer harness adds.
 */

import { z } from 'zod'

/**
 * The harness ids whose payloads {@link normalizeHook} reads without help: the
 * ids `@osdlc/detect-harness` uses for Claude Code, Codex, Cursor, pi and
 * opencode, so an envelope joins a harness report by id. Claude Code and Codex
 * send the envelope keys natively. Cursor's payload must be re-keyed first
 * (`conversation_id` to `session_id`, `generation_id` to `prompt_id` and so
 * on), and pi and opencode have no hooks of their own: an extension or plugin
 * forwards their events in Claude Code's vocabulary.
 *
 * @experimental
 */
export const HOOK_HARNESSES = ['claude', 'codex', 'cursor', 'pi', 'opencode'] as const

/**
 * One of {@link HOOK_HARNESSES}.
 *
 * @experimental
 */
export type HookHarness = (typeof HOOK_HARNESSES)[number]

/**
 * The envelope fields a payload can lack, in the order `missing` lists them.
 *
 * @experimental
 */
export const HOOK_ENVELOPE_FIELDS = ['event', 'session_id', 'cwd', 'transcript_path'] as const

/**
 * One of {@link HOOK_ENVELOPE_FIELDS}.
 *
 * @experimental
 */
export type HookEnvelopeField = (typeof HOOK_ENVELOPE_FIELDS)[number]

/**
 * The normalised envelope of one hook payload. See {@link HookEnvelope}.
 *
 * @experimental
 */
export const HookEnvelopeSchema = z.object({
  harness: z.enum(HOOK_HARNESSES),
  /** The harness's own event name (`hook_event_name`), or `unknown` when the payload has none. */
  event: z.string(),
  sessionId: z.string().nullable(),
  cwd: z.string().nullable(),
  transcriptPath: z.string().nullable(),
  /** The harness's per-prompt id (Claude Code `prompt_id`, Codex `turn_id`), when the payload carries one. */
  promptId: z.string().optional(),
  /** The payload as the harness sent it. `null` when it was not a JSON object. */
  raw: z.record(z.string(), z.unknown()).nullable(),
  missing: z.array(z.enum(HOOK_ENVELOPE_FIELDS)),
})

/**
 * The envelope of one hook payload: who sent it, which event, for which
 * session and directory, and the body as sent. A field the payload lacks is
 * `null` and named in `missing`.
 *
 * @experimental
 */
export type HookEnvelope = z.infer<typeof HookEnvelopeSchema>

/** The payload key holding each harness's per-prompt id. */
const PROMPT_ID_KEY: Readonly<Record<HookHarness, string>> = {
  claude: 'prompt_id',
  codex: 'turn_id',
  cursor: 'prompt_id',
  pi: 'prompt_id',
  opencode: 'prompt_id',
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function nonEmptyString(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null
}

/**
 * The envelope of `payload`, a `harness` hook's stdin as parsed JSON. The
 * payload must already be in the shape Claude Code and Codex share
 * (`hook_event_name`, `session_id`, `cwd`, `transcript_path`); see
 * {@link HOOK_HARNESSES} for the harnesses that need re-keying first. An
 * empty string counts as missing. Never throws: a non-object payload yields
 * `event: 'unknown'` with every field missing and `raw: null`.
 *
 * @example
 * ```ts
 * const envelope = normalizeHook('claude', { hook_event_name: 'Stop', session_id: 's-1' })
 * envelope.event // 'Stop'
 * envelope.missing // ['cwd', 'transcript_path']
 * ```
 *
 * @experimental
 */
export function normalizeHook(harness: HookHarness, payload: unknown): HookEnvelope {
  const raw = isRecord(payload) ? payload : null
  const event = nonEmptyString(raw?.['hook_event_name'])
  const sessionId = nonEmptyString(raw?.['session_id'])
  const cwd = nonEmptyString(raw?.['cwd'])
  const transcriptPath = nonEmptyString(raw?.['transcript_path'])
  const promptId = nonEmptyString(raw?.[PROMPT_ID_KEY[harness]])
  const missing: HookEnvelopeField[] = []
  if (event === null) missing.push('event')
  if (sessionId === null) missing.push('session_id')
  if (cwd === null) missing.push('cwd')
  if (transcriptPath === null) missing.push('transcript_path')
  return {
    harness,
    event: event ?? 'unknown',
    sessionId,
    cwd,
    transcriptPath,
    ...(promptId !== null ? { promptId } : {}),
    raw,
    missing,
  }
}

/**
 * Parse hook stdin `text` and normalise it with {@link normalizeHook}. Text
 * that is not JSON is a payload-less envelope. Never throws.
 *
 * @experimental
 */
export function normalizeHookText(harness: HookHarness, text: string): HookEnvelope {
  let payload: unknown = null
  try {
    payload = JSON.parse(text)
  } catch {
    // Not JSON: the envelope says so through `raw: null` and `missing`.
  }
  return normalizeHook(harness, payload)
}

/** The `Notification` types that mean the agent is waiting on a person. */
const PERMISSION_NOTIFICATIONS: ReadonlySet<string> = new Set([
  'permission_prompt',
  'elicitation_dialog',
])

/**
 * Whether a `Notification` event's `notification_type` means the agent waits
 * on a person: a permission prompt or an elicitation dialog.
 *
 * @experimental
 */
export function isPermissionNotification(notificationType: string | undefined): boolean {
  return notificationType !== undefined && PERMISSION_NOTIFICATIONS.has(notificationType)
}

// ── Event bodies ─────────────────────────────────────────────────────────

/**
 * A string field of the payload's body, or `undefined` when it is absent or not a string.
 *
 * @experimental
 */
export function rawString(envelope: HookEnvelope, key: string): string | undefined {
  const value = rawValue(envelope, key)
  return typeof value === 'string' ? value : undefined
}

/**
 * A finite number field of the payload's body, or `undefined` when it is absent or not one.
 *
 * @experimental
 */
export function rawNumber(envelope: HookEnvelope, key: string): number | undefined {
  const value = rawValue(envelope, key)
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * A field of the payload's body, whatever its type; `undefined` when it is absent.
 *
 * @experimental
 */
export function rawValue(envelope: HookEnvelope, key: string): unknown {
  // Own fields only: an inherited one (`constructor`, `toString`) is absent.
  const raw = envelope.raw
  return raw !== null && Object.hasOwn(raw, key) ? raw[key] : undefined
}
