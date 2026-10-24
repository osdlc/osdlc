/**
 * The envelope every line of a log carries, and the correlation ids that fill
 * it.
 *
 * `session`, `run` and `subject` are present when known: from the caller, or
 * from the `OBSERVE_SESSION`, `OBSERVE_RUN` and `OBSERVE_SUBJECT` variables a
 * launched process tree inherits.
 *
 * For now every tag is written under two names: its `OBSERVE_*` name and the
 * `SDLC_*` name it had before 0.3.3. Readers use {@link readTag}: the `SDLC_*`
 * value when it is set and differs from the `OBSERVE_*` value, else the
 * `OBSERVE_*` value. So processes started by an older writer are still read.
 */

import { z } from 'zod'

/** The envelope version written as `v`. */
export const LOG_ENVELOPE_VERSION = 1

/**
 * Who wrote a line: a session `launcher`, a harness `hook`, a `digest` of a
 * finished session, an `op` (a unit of work a tool runs), or the `cli` itself.
 * A closed list: adding a source is a breaking change.
 */
export const LOG_SOURCES = ['launcher', 'hook', 'digest', 'op', 'cli'] as const
/** The schema of a {@link LogSource}. */
export const LogSourceSchema = z.enum(LOG_SOURCES)
/** One of {@link LOG_SOURCES}. A closed union: a new value is a breaking change. */
export type LogSource = z.infer<typeof LogSourceSchema>

/**
 * The fields every log line starts with: the envelope version `v`, the instant
 * `ts`, the event `kind`, the `writer` machine (`machineId()`), the
 * correlation ids when known, and the `source`. A log's own events extend it
 * with a literal `kind` and their fields (`LogEnvelopeSchema.extend(...)`).
 */
export const LogEnvelopeSchema = z.object({
  v: z.literal(LOG_ENVELOPE_VERSION),
  ts: z.string().describe('RFC 3339 instant the event happened.'),
  kind: z.string(),
  writer: z
    .string()
    .describe(
      'The machine that wrote the line (`machineId()`: a stable derived id, not the hostname).',
    ),
  session: z.string().optional(),
  run: z.string().optional(),
  subject: z.string().optional(),
  source: LogSourceSchema,
})
/** A parsed {@link LogEnvelopeSchema}. */
export type LogEnvelope = z.infer<typeof LogEnvelopeSchema>

/** The ids that tie a line to a session, a run (a unit of work) and the subject it is about. */
export interface Correlation {
  session?: string
  run?: string
  subject?: string
}

/** The prefix every tag had before 0.3.3; writers still set it beside the `OBSERVE_` name. */
const LEGACY_PREFIX = 'SDLC_'
const PREFIX = 'OBSERVE_'

/** The pre-0.3.3 name of tag `name`: `OBSERVE_RUN` was `SDLC_RUN`. Internal, not exported from the package entry. */
export function legacyName(name: string): string {
  return name.startsWith(PREFIX) ? LEGACY_PREFIX + name.slice(PREFIX.length) : name
}

/**
 * Tag `name` as `env` carries it. Writers set both names to one value. When they
 * differ, the legacy `SDLC_*` value was set later, by a pre-0.3.3 writer nested inside
 * a newer session, so it wins. Otherwise the `OBSERVE_*` value is used. Internal.
 */
export function readTag(env: Record<string, string | undefined>, name: string): string | undefined {
  const legacy = env[legacyName(name)]
  return legacy !== undefined && legacy !== env[name] ? legacy : env[name]
}

/** `tags` with each name also set under its legacy `SDLC_*` name, for readers older than 0.3.3. Internal. */
export function withLegacyNames(
  tags: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const [name, value] of Object.entries(tags)) {
    out[name] = value
    out[legacyName(name)] = value
  }
  return out
}

/**
 * Names the run (the unit of work) a process belongs to, so every line it
 * writes joins that run. Writers also set `SDLC_RUN`; readers accept either.
 */
export const RUN_ENV_VAR = 'OBSERVE_RUN'
/**
 * Names what the run is about (an issue, a pull request), free text. Writers
 * also set `SDLC_SUBJECT`; readers accept either.
 */
export const SUBJECT_ENV_VAR = 'OBSERVE_SUBJECT'
/**
 * The id of the top-level op invocation in progress, exported for the op's
 * duration. A session that op launches records it as its parent invocation; the
 * session's own process tree clears it. Writers also set `SDLC_INVOCATION`;
 * readers accept either.
 */
export const INVOCATION_ENV_VAR = 'OBSERVE_INVOCATION'
/**
 * The pid of the process that exported {@link INVOCATION_ENV_VAR}.
 * {@link correlationFromEnv} does not check it. The lifecycle's lineage check
 * drops an invocation id whose pid is gone, so a leaked id is not recorded as a
 * session's parent. Writers also set `SDLC_INVOCATION_PID`; readers accept
 * either.
 */
export const INVOCATION_PID_ENV_VAR = 'OBSERVE_INVOCATION_PID'
/**
 * Names the session a launched agent belongs to. The process scan reads it
 * back. Writers also set `SDLC_SESSION`; readers accept either.
 */
export const SESSION_ENV_VAR = 'OBSERVE_SESSION'

/**
 * The correlation ids in `env` (default `process.env`). Each tag is read under
 * its `OBSERVE_*` and `SDLC_*` names. The `SDLC_*` value wins when it is set and
 * differs. An unset or empty variable is left out.
 */
export function correlationFromEnv(
  env: Record<string, string | undefined> = process.env,
): Correlation {
  const out: Correlation = {}
  const session = readTag(env, SESSION_ENV_VAR)
  const run = readTag(env, RUN_ENV_VAR)
  const subject = readTag(env, SUBJECT_ENV_VAR)
  if (session) out.session = session
  if (run) out.run = run
  if (subject) out.subject = subject
  return out
}

// Crockford base32 has no I, L, O or U, so an id is easy to read aloud and copy.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/**
 * A sortable id: `prefix`, 10 base32 characters of the millisecond time `now`
 * (default `Date.now()`), then 16 of randomness. This is the ULID layout with a
 * prefix, written here so the package needs no ULID dependency. Ids created
 * later sort later as strings. Within one millisecond the order is random.
 */
export function newSortableId(prefix: string, now: number = Date.now()): string {
  let time = ''
  let rest = now
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[rest % 32]! + time
    rest = Math.floor(rest / 32)
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let random = ''
  for (const b of bytes) random += CROCKFORD[b % 32]!
  return `${prefix}${time}${random}`
}

/**
 * The session and op invocation that started a session, read from `env`.
 * `null` when neither is set. `selfSession` is the session's own id, which is
 * never its own parent. Internal, not exported from the package entry.
 * `resolveLineage` is the public reader.
 */
export function lineageFromEnv(
  env: Record<string, string | undefined> = process.env,
  selfSession?: string,
): { session: string | null; invocation: string | null } | null {
  const session = readTag(env, SESSION_ENV_VAR)
  const invocation = readTag(env, INVOCATION_ENV_VAR)
  const parentSession = session && session !== selfSession ? session : null
  const parentInvocation = invocation || null
  return parentSession === null && parentInvocation === null
    ? null
    : { session: parentSession, invocation: parentInvocation }
}

/** A run id: `r-` and a {@link newSortableId}, created at `now` (default `Date.now()`). */
export function newRunId(now?: number): string {
  return newSortableId('r-', now)
}
