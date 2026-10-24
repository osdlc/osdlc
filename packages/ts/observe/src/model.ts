/**
 * The session model: the event log that is a session's source of truth, the
 * state machine, and the record that log reduces to. Each session directory
 * holds an append-only `events.jsonl`, one `{ts, kind, ...}` object per line,
 * and `record.json` is only the projection {@link SessionModel.reduceSessionEvents}
 * computes from it. A writer appends an event and reduces the whole log again,
 * never a read-modify-write of the last projection. So two processes on one
 * machine cannot overwrite each other's newer state with older state.
 *
 * The consumer defines the harness, host and launch-flag vocabularies.
 * {@link defineSessionModel} builds the model from the schemas that validate
 * them. {@link looseSessionModel} accepts any string, for a reader
 * that must stay able to read a log after a harness or host is added or removed.
 *
 * Kinds: `launched`, `host_attached`, `pid_recorded`, `harness_session_resolved`,
 * `state_changed`, `usage_sample`, `output`, `outcome`, `pr_linked`, `named`,
 * `done`, `ended` and `resumed`. A reader skips a line whose kind it does not
 * know.
 *
 * State machine: `starting` to `running`, `idle` or `ended`; `running` to
 * `waiting_for_input`, `idle`, `done` or `ended`; `waiting_for_input` to `running`,
 * `idle`, `done` or `ended`; `idle` to `running`, `waiting_for_input`, `done` or
 * `ended`; `done` (the agent declared its task finished, by a `done` event) to
 * `done` (declared again), `running` (a new prompt) or `ended`. `ended` takes no
 * `state_changed`. Only a `resumed` event leaves it, back to `starting`, for a
 * new run of the same harness session. Any other `state_changed` is ignored by
 * the reducer (reported in `ignored`, still present in the log). A repeated
 * `ended`, a `resumed` on a session that has not ended, or a `host_attached` on
 * an ended session, is ignored the same way. `output`, `outcome`, `pr_linked`,
 * `named` and `harness_session_resolved` still apply after the end, since each
 * describes the session, not its state.
 *
 * Keys renamed in 0.3.3: the `launched` event and the record write `harness`,
 * `launchFlags` and `pin`. Logs and records written before carry `engine`,
 * `claudeFlags` and `sdlcPin`. The schemas read those as the new keys, so an
 * existing store loads unchanged.
 *
 * Name: the record's `name` is the latest `named` event from a `person`, else
 * the name the `launched` event carried (`nameSource` `launch`), else the
 * latest `named` event from the `harness`. A title the harness generated never
 * replaces a name a person or the launcher chose.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { z } from 'zod'

import { LogSourceSchema } from './envelope.ts'
import { appendJsonl, parseJsonl, readJsonlFrom } from './writer.ts'

// ── Vocabulary ───────────────────────────────────────────────────────────

/**
 * A session's current state. The module header lists the legal moves. A
 * closed list: adding a state is a breaking change.
 */
export const SESSION_RUN_STATES = [
  'starting',
  'running',
  'waiting_for_input',
  'idle',
  'done',
  'ended',
] as const
/** The schema of a {@link SessionRunState}. */
export const SessionRunStateSchema = z.enum(SESSION_RUN_STATES)
/** One of {@link SESSION_RUN_STATES}. A closed union: a new value is a breaking change. */
export type SessionRunState = z.infer<typeof SessionRunStateSchema>

/**
 * How a session ended: `ok`, `failed`, `cancelled`, `timeout` (killed at its
 * time limit) or `lost` (reconcile found it gone). A closed list: adding an
 * outcome is a breaking change.
 */
export const SESSION_OUTCOMES = ['ok', 'failed', 'cancelled', 'timeout', 'lost'] as const
/** The schema of a {@link SessionOutcome}. */
export const SessionOutcomeSchema = z.enum(SESSION_OUTCOMES)
/** One of {@link SESSION_OUTCOMES}. A closed union: a new value is a breaking change. */
export type SessionOutcome = z.infer<typeof SessionOutcomeSchema>

/**
 * How much of a session's activity the writer can see: `hooks` when the harness
 * reports to a hook reporter, `launch-only` when only the launch and, for a
 * headless run, its exit are known.
 */
export const SESSION_CAPTURES = ['hooks', 'launch-only'] as const
/** The schema of a {@link SessionCapture}. */
export const SessionCaptureSchema = z.enum(SESSION_CAPTURES)
/** One of {@link SESSION_CAPTURES}. */
export type SessionCapture = z.infer<typeof SessionCaptureSchema>

/** What a session's first message was derived from. */
export const SessionLaunchedSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('workflow'), name: z.string() }),
  z.object({ kind: z.literal('skill'), name: z.string() }),
  z.object({ kind: z.literal('prompt'), text: z.string() }),
])
/** What a session's first message was: a named `workflow` or `skill`, or a `prompt` text. */
export type SessionLaunched = z.infer<typeof SessionLaunchedSchema>

/** Who chose a session's name: a `person` (a rename), the `launch` (an explicit name), or the `harness` (a title it generated). */
export const SessionNameSourceSchema = z.enum(['person', 'launch', 'harness'])
/** One of `person`, `launch` or `harness`. See {@link SessionNameSourceSchema}. */
export type SessionNameSource = z.infer<typeof SessionNameSourceSchema>

/** Whether a session ran with no terminal (`headless`) or in a host's terminal (`interactive`). */
export const SessionKindSchema = z.enum(['headless', 'interactive'])
/** `headless` or `interactive`. See {@link SessionKindSchema}. */
export type SessionKind = z.infer<typeof SessionKindSchema>

/**
 * What started the session: a `task` (with the lease that holds it), a pull
 * request (`pr`), a `wizard` step, a `person`, an `orchestrator` tick, or
 * `spawned`. `lease` and `tick` are `null` until the caller that knows them
 * passes them in. `spawned` is a session no launcher made: a hook reported a
 * harness session that a tagged session's agent started directly (one agent
 * CLI running another), and the hook reporter filed a record for it. A closed
 * union: a new kind is a breaking change.
 */
export const SessionOriginSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('task'), lease: z.string().nullable() }),
  z.object({ kind: z.literal('pr'), number: z.number().int() }),
  z.object({ kind: z.literal('wizard'), step: z.string() }),
  z.object({ kind: z.literal('person') }),
  z.object({ kind: z.literal('orchestrator'), tick: z.string().nullable() }),
  z.object({ kind: z.literal('spawned') }),
])
/** A parsed {@link SessionOriginSchema}. A closed union: a new kind is a breaking change. */
export type SessionOrigin = z.infer<typeof SessionOriginSchema>

/** Who started a session: the agent session and/or the op invocation it was launched from, each `null` when there was none. */
export const SessionParentSchema = z.object({
  session: z.string().nullable(),
  invocation: z.string().nullable(),
})
/** A parsed {@link SessionParentSchema}. */
export type SessionParent = z.infer<typeof SessionParentSchema>

/** The token and cost counts a `usage_sample` event carries. */
export const UsageSampleSchema = z.object({
  model: z.string().nullable(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  cacheReadTokens: z.number().nullable(),
  cacheWriteTokens: z.number().nullable(),
  totalTokens: z.number().nullable(),
  costUsd: z.number().nullable(),
})
/** A parsed {@link UsageSampleSchema}. Each count is `null` when the harness did not report it. */
export type UsageSample = z.infer<typeof UsageSampleSchema>

/** What an agent declares with a `done` event: the work it was given succeeded or failed. */
export const SESSION_DONE_OUTCOMES = ['ok', 'failed'] as const
/** The schema of a {@link SessionDoneOutcome}. */
export const SessionDoneOutcomeSchema = z.enum(SESSION_DONE_OUTCOMES)
/** One of {@link SESSION_DONE_OUTCOMES}. */
export type SessionDoneOutcome = z.infer<typeof SessionDoneOutcomeSchema>

/** The agent's own statement that it finished its task ({@link SessionRecordOf.done}). This differs from the session's `outcome`, which is how the session ended. */
export const SessionDoneSchema = z.object({
  at: z.string(),
  outcome: SessionDoneOutcomeSchema,
  note: z.string().nullable(),
})
/** A parsed {@link SessionDoneSchema}: when the agent declared done, the outcome, and its note or `null`. */
export type SessionDone = z.infer<typeof SessionDoneSchema>

const LEGAL_TRANSITIONS: Record<SessionRunState, readonly SessionRunState[]> = {
  starting: ['running', 'idle', 'ended'],
  running: ['waiting_for_input', 'idle', 'done', 'ended'],
  waiting_for_input: ['running', 'idle', 'done', 'ended'],
  idle: ['running', 'waiting_for_input', 'done', 'ended'],
  // Only a new prompt leaves `done` (the hook reporter keeps every other hook out of it).
  // `done` again restates the declaration (outcome, note).
  done: ['running', 'done', 'ended'],
  ended: [],
}

/**
 * Whether `from` to `to` is a `state_changed` the machine allows. Leaving
 * `ended` takes a `resumed` event, not a `state_changed`, so every move from
 * `ended` is `false` here.
 */
export function isLegalTransition(from: SessionRunState, to: SessionRunState): boolean {
  return LEGAL_TRANSITIONS[from].includes(to)
}

// ── Record ───────────────────────────────────────────────────────────────

/** Who ran the session, written once at launch: the harness, the reference as requested, and the model and effort the launch named. */
export interface SessionAuthorOf<H extends string> {
  tool: H
  requested: string | null
  model: string | null
  effort: string | null
}

/**
 * A session's record, the projection of its event log. `H` is the harness
 * vocabulary, `Ho` the host vocabulary and `F` the launch flags a resume
 * replays.
 */
export interface SessionRecordOf<H extends string, Ho extends string, F> {
  id: string
  /** The harness (the agent CLI) the session runs. Written as `engine` before 0.3.3. */
  harness: H
  /** `headless` or `interactive`. `host === null` exactly when headless. */
  kind: SessionKind
  origin: SessionOrigin
  author: SessionAuthorOf<H>
  /** The session's current state. `ended` is final. */
  state: SessionRunState
  /** How it ended. `null` until an `outcome` event arrives. */
  outcome: SessionOutcome | null
  /** `null` for a headless run (no host is involved). */
  host: Ho | null
  cwd: string
  launched: SessionLaunched
  /** The session's chosen name, by the order in the module header. `null` when none was chosen (a reader derives one from `launched`). */
  name: string | null
  /** Who chose `name`. `null` exactly when `name` is. */
  nameSource: SessionNameSource | null
  startedAt: string
  /** `null` while the session is still running, or when nothing observed its end. */
  endedAt: string | null
  /** `null` while the child is still running. */
  exitCode: number | null
  /** The harness's own id for the session, once known. */
  harnessSessionId: string | null
  /** Where the harness keeps its transcript, once a hook reported it. */
  transcriptPath?: string | undefined
  /** Where a headless run's captured output was written. `null` for an interactive run. */
  logPath: string | null
  /** The git branch checked out in `cwd` at launch, if it could be read. */
  branch: string | null
  /** A PR number cached once something resolved the session for a PR. */
  prNumber: number | null
  /** The caller's limit key this dispatch counts against, stored as given. */
  operation: string | null
  /**
   * The spawned harness process's pid. For a headless launch, its own pid. For
   * an interactive launch on a host that does not wait, the pid a wrapper
   * process recorded (`pid_recorded`). A reader uses it to tell a live session
   * from an orphan.
   */
  pid: number | null
  /**
   * The agent's own `done` declaration. Set by the `done` event and cleared when a new
   * prompt moves the session back to `running`. A session that ends while done keeps it.
   */
  done?: SessionDone | undefined
  /** The launch flags, replayed on resume. Written as `claudeFlags` before 0.3.3. */
  launchFlags?: F | undefined
  /** Pinned command the agent should run, replayed on resume. Written as `sdlcPin` before 0.3.3. */
  pin?: string | undefined
  /** How the session is observed. Absent for a session launched before hooks existed. */
  capture?: SessionCapture | undefined
  /** The derived `machineId()` of the machine that launched the session. Liveness checks ignore another machine's records. */
  machine: string
  /** Who launched it: git `user.name` at launch, else the OS login. Absent on a log written before originators were recorded, and `null` when neither could be read or identity capture is off. */
  startedBy?: string | null | undefined
  /** The launching machine's readable name (`os.hostname()`). `machine` is still its identity. Absent on an older log or with identity capture off. */
  hostname?: string | undefined
  /** The IANA zone of the launching machine's clock. Absent on an older log. */
  tz?: string | undefined
  /** The run (correlation id) the session belongs to. */
  run?: string | undefined
  /** The task or PR the session is about. */
  subject?: string | undefined
  /** The basename of the task the session works on. Absent when there is none (or on a log written before tasks were recorded). */
  task?: string | undefined
  /** The session and op invocation that launched this one. Absent for a root session. */
  parent?: SessionParent | undefined
  /** Length in bytes of the event log this record was projected from. Readers reduce the log again when its length differs. */
  logBytes?: number | undefined
}

/** A record of any vocabulary. Functions that do not depend on the vocabulary (liveness, reconcile) take it. */
export type AnySessionRecord = SessionRecordOf<string, string, unknown>

/** An event the reducer skipped: its index in the log, the event, and why. */
export interface IgnoredEventOf<E> {
  /** Index into the event list. */
  index: number
  event: E
  reason:
    | 'before_launched'
    | 'repeated_launched'
    | 'repeated_outcome'
    | 'illegal_transition'
    | 'after_ended'
}

/** What a reducer computed from a log: the record, its state and outcome, and the events it skipped. */
export interface SessionReductionOf<E, R> {
  /** `null` until a `launched` event is seen. */
  record: R | null
  /** `null` until a `launched` event is seen. */
  state: SessionRunState | null
  /** `null` until an `outcome` event arrives. */
  outcome: SessionOutcome | null
  ignored: IgnoredEventOf<E>[]
}

/**
 * Thrown by a model's `recordSessionEventIn` when other writers kept appending
 * to the log while it was reduced, so no stable projection could be written.
 */
export class SessionLogError extends Error {
  override name = 'SessionLogError'
}

/** The schemas a model validates its consumer's vocabulary with. */
export interface SessionVocabulary<H extends string, Ho extends string, F> {
  harness: z.ZodType<H>
  host: z.ZodType<Ho>
  launchFlags: z.ZodType<F>
}

// ── Files ────────────────────────────────────────────────────────────────

/** The name of a session's append-only event log inside its directory. */
export const EVENTS_FILE = 'events.jsonl'
/** The name of a session's projected record inside its directory. */
export const RECORD_FILE = 'record.json'

/** The path of the event log in session directory `sessionDirectory`. */
export function sessionEventsPath(sessionDirectory: string): string {
  return join(sessionDirectory, EVENTS_FILE)
}

/** Write `value` as JSON through a temp file and a rename, so a reader never sees half a file. */
function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  // 0o600 like `events.jsonl`, which the record projects.
  writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 })
  renameSync(tmp, path)
}

/** The parsed JSON at `path`, or `null` when it is absent or not JSON. */
function readJsonOrNull(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

const PROJECTION_ATTEMPTS = 5

/** On-disk keys renamed in 0.3.3, old to new. */
const RENAMED_KEYS = new Map([
  ['engine', 'harness'],
  ['claudeFlags', 'launchFlags'],
  ['sdlcPin', 'pin'],
])

/**
 * `value` with each key renamed in 0.3.3 under its new name, in the same place.
 * Where both names are present the new one wins. Anything that is not a plain
 * object is returned as it is.
 */
function withCurrentKeys(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value
  const entries = Object.entries(value)
  if (!entries.some(([key]) => RENAMED_KEYS.has(key))) return value
  return Object.fromEntries(
    entries
      .filter(([key]) => {
        const renamed = RENAMED_KEYS.get(key)
        return renamed === undefined || !Object.hasOwn(value, renamed)
      })
      .map(([key, v]) => [RENAMED_KEYS.get(key) ?? key, v]),
  )
}

// ── The model ────────────────────────────────────────────────────────────

/**
 * Build the session model for a vocabulary: the event and record schemas that
 * validate it, the reducer, and the file functions for a session directory.
 * Name the model's types with {@link SessionEventOfModel},
 * {@link NewSessionEventOfModel} and {@link SessionRecordOfModel}.
 *
 * The event and record schemas read the keys renamed in 0.3.3 (`engine`,
 * `claudeFlags`, `sdlcPin`) as their new names, so a log or record written
 * before loads unchanged. What they write uses the new names.
 */
export function defineSessionModel<H extends string, Ho extends string, F>(
  v: SessionVocabulary<H, Ho, F>,
) {
  type Record = SessionRecordOf<H, Ho, F>

  const SessionAuthorSchema = z.object({
    tool: v.harness,
    requested: z.string().nullable(),
    model: z.string().nullable(),
    effort: z.string().nullable(),
  })

  const ts = z.string().describe('RFC 3339 instant the event happened.')
  /**
   * Who wrote the event, when it was not the launcher (`hook` for a hook
   * reporter). Absent reads as `launcher`. Not `source`: `usage_sample`
   * already has one with another meaning.
   */
  const via = LogSourceSchema.optional()

  const SessionEventSchema = z.preprocess(
    withCurrentKeys,
    z.discriminatedUnion('kind', [
      z.object({
        ts,
        via,
        kind: z.literal('launched'),
        id: z.string(),
        harness: v.harness,
        sessionKind: SessionKindSchema,
        origin: SessionOriginSchema,
        author: SessionAuthorSchema,
        host: v.host.nullable(),
        cwd: z.string(),
        branch: z.string().nullable(),
        launched: SessionLaunchedSchema,
        /** An explicit name the launcher passed (an op, or `--name`). Absent when it passed none. */
        name: z.string().optional(),
        operation: z.string().nullable(),
        launchFlags: v.launchFlags.optional(),
        pin: z.string().optional(),
        /** How the session is observed. Absent on a log written before hooks existed. */
        capture: SessionCaptureSchema.optional(),
        machine: z.string(),
        /** Who launched it (git `user.name`, else the OS login). `null` when neither was readable. Absent on an older log. */
        startedBy: z.string().nullable().optional(),
        /** The launching machine's `os.hostname()`. Absent on an older log. */
        hostname: z.string().optional(),
        /** The launching machine's IANA time zone. Absent on an older log. */
        tz: z.string().optional(),
        /** The run (correlation id) the session belongs to. Absent on a log written before runs existed. */
        run: z.string().nullable().optional(),
        /** The task or PR the run is about. Absent when none was known. */
        subject: z.string().nullable().optional(),
        /** The basename of the task the session works on. Absent when there is none. */
        task: z.string().nullable().optional(),
        /** The machine that wrote the log, as the journal's `writer`. Absent on an older log. */
        writer: z.string().optional(),
        /** The session and op invocation that launched this one. `null` or absent for a root session. */
        parent: SessionParentSchema.nullable().optional(),
      }),
      z.object({
        ts,
        via,
        kind: z.literal('host_attached'),
        host: v.host.nullable(),
        harnessSessionId: z.string().nullable(),
        pid: z.number().int().nullable(),
      }),
      z.object({
        ts,
        via,
        kind: z.literal('pid_recorded'),
        /** The pid of the harness process, as a wrapper process spawned it. */
        pid: z.number().int(),
      }),
      z.object({
        ts,
        via,
        kind: z.literal('done'),
        outcome: SessionDoneOutcomeSchema,
        note: z.string().nullable(),
      }),
      z.object({
        ts,
        via,
        kind: z.literal('harness_session_resolved'),
        harnessSessionId: z.string(),
        how: z.string(),
        /** Where the harness keeps its transcript, when it reported one. */
        transcriptPath: z.string().optional(),
      }),
      z.object({
        ts,
        via,
        kind: z.literal('state_changed'),
        from: SessionRunStateSchema.nullable(),
        to: SessionRunStateSchema,
        cause: z.string(),
      }),
      z.object({
        ts,
        via,
        kind: z.literal('usage_sample'),
        source: z.enum(['headless', 'interactive']),
        usage: UsageSampleSchema,
      }),
      z.object({ ts, via, kind: z.literal('output'), logPath: z.string().nullable() }),
      z.object({
        ts,
        via,
        kind: z.literal('outcome'),
        outcome: SessionOutcomeSchema,
        exitCode: z.number().int().nullable(),
      }),
      z.object({ ts, via, kind: z.literal('pr_linked'), prNumber: z.number().int() }),
      z.object({
        ts,
        via,
        kind: z.literal('named'),
        name: z.string(),
        /** `person` for a rename, `harness` for a title the harness generated. */
        source: z.enum(['person', 'harness']),
      }),
      z.object({ ts, via, kind: z.literal('ended') }),
      z.object({
        ts,
        via,
        kind: z.literal('resumed'),
        /** The host the resumed process runs in. */
        host: v.host.nullable(),
        pid: z.number().int().nullable(),
      }),
    ]),
  )
  type Event = z.infer<typeof SessionEventSchema>
  type NewEvent = Event extends infer E ? (E extends Event ? Omit<E, 'ts'> : never) : never

  /**
   * Runtime shape check for a `record.json`, field for field with the record.
   * `harnessSessionId`/`name`/`nameSource`/`branch`/`prNumber`/`operation`/`pid` default to `null`
   * when absent. Any other mismatch fails the parse, which a reader treats as
   * unreadable, not a crash. A record written before 0.3.3 reads with its keys
   * renamed.
   */
  const SessionRecordSchema = z.preprocess(
    withCurrentKeys,
    z.object({
      id: z.string(),
      harness: v.harness,
      kind: SessionKindSchema,
      origin: SessionOriginSchema,
      author: SessionAuthorSchema,
      state: SessionRunStateSchema,
      outcome: SessionOutcomeSchema.nullable(),
      host: v.host.nullable(),
      cwd: z.string(),
      launched: SessionLaunchedSchema,
      name: z.string().nullable().default(null),
      nameSource: SessionNameSourceSchema.nullable().default(null),
      startedAt: z.string(),
      endedAt: z.string().nullable(),
      exitCode: z.number().int().nullable(),
      harnessSessionId: z.string().nullable().default(null),
      transcriptPath: z.string().optional(),
      logPath: z.string().nullable(),
      branch: z.string().nullable().default(null),
      prNumber: z.number().int().nullable().default(null),
      operation: z.string().nullable().default(null),
      pid: z.number().int().nullable().default(null),
      done: SessionDoneSchema.optional(),
      launchFlags: v.launchFlags.optional(),
      pin: z.string().optional(),
      capture: SessionCaptureSchema.optional(),
      machine: z.string(),
      startedBy: z.string().nullable().optional(),
      hostname: z.string().optional(),
      tz: z.string().optional(),
      run: z.string().optional(),
      subject: z.string().optional(),
      task: z.string().optional(),
      parent: SessionParentSchema.optional(),
      logBytes: z.number().int().optional(),
    }),
  )

  /**
   * Reduce `events`, in file order, to the session's record. File order, not
   * `ts` order, decides. A line is appended when the event happens on the
   * writing machine, so clock skew between a launcher and a hook process
   * cannot reorder events.
   */
  function reduceSessionEvents(events: readonly Event[]): SessionReductionOf<Event, Record> {
    let record: Record | null = null
    let state: SessionRunState | null = null
    let outcome: SessionOutcome | null = null
    let endedSeen = false
    let launchName: string | null = null
    let personName: string | null = null
    let harnessName: string | null = null
    const ignored: IgnoredEventOf<Event>[] = []

    events.forEach((event, index) => {
      const skip = (reason: IgnoredEventOf<Event>['reason']): void => {
        ignored.push({ index, event, reason })
      }
      if (event.kind === 'launched') {
        if (record !== null) return skip('repeated_launched')
        record = {
          id: event.id,
          harness: event.harness,
          host: event.host,
          cwd: event.cwd,
          kind: event.sessionKind,
          origin: event.origin,
          author: event.author,
          state: 'starting',
          outcome: null,
          launched: event.launched,
          name: null,
          nameSource: null,
          startedAt: event.ts,
          endedAt: null,
          exitCode: null,
          harnessSessionId: null,
          logPath: null,
          branch: event.branch,
          prNumber: null,
          operation: event.operation,
          pid: null,
          machine: event.machine,
          ...(event.startedBy !== undefined ? { startedBy: event.startedBy } : {}),
          ...(event.hostname !== undefined ? { hostname: event.hostname } : {}),
          ...(event.tz !== undefined ? { tz: event.tz } : {}),
          ...(event.run != null ? { run: event.run } : {}),
          ...(event.subject != null ? { subject: event.subject } : {}),
          ...(event.task != null ? { task: event.task } : {}),
          ...(event.parent != null ? { parent: event.parent } : {}),
          ...(event.launchFlags !== undefined ? { launchFlags: event.launchFlags } : {}),
          ...(event.pin !== undefined ? { pin: event.pin } : {}),
          ...(event.capture !== undefined ? { capture: event.capture } : {}),
        } as Record
        state = 'starting'
        launchName = event.name ?? null
        return
      }
      if (record === null || state === null) return skip('before_launched')
      const current: Record = record

      switch (event.kind) {
        case 'host_attached':
          if (state === 'ended') return skip('after_ended')
          record = {
            ...current,
            host: event.host,
            // A resolved harness id is not erased by a later attach that has none.
            harnessSessionId: event.harnessSessionId ?? current.harnessSessionId,
            // A wrapper process may have recorded the pid before the launcher
            // attaches. For a host that does not wait, the launcher knows no pid.
            pid: event.pid ?? current.pid,
          }
          return
        case 'pid_recorded':
          if (state === 'ended') return skip('after_ended')
          record = { ...current, pid: event.pid }
          return
        case 'done': {
          if (!isLegalTransition(state, 'done')) {
            return skip(state === 'ended' ? 'after_ended' : 'illegal_transition')
          }
          state = 'done'
          record = {
            ...current,
            done: { at: event.ts, outcome: event.outcome, note: event.note },
          }
          return
        }
        case 'harness_session_resolved':
          record = {
            ...current,
            harnessSessionId: event.harnessSessionId,
            ...(event.transcriptPath !== undefined ? { transcriptPath: event.transcriptPath } : {}),
          }
          return
        case 'state_changed':
          if (!isLegalTransition(state, event.to)) {
            return skip(state === 'ended' ? 'after_ended' : 'illegal_transition')
          }
          // `from` is the writer's view when it planned the event and may be stale (hooks run
          // concurrently). Only whether `to` is legal from the current state matters.
          state = event.to
          // A new prompt reopens a done session. `done` stays on a session that ends while done.
          if (event.to === 'running' && current.done !== undefined) {
            const { done: _cleared, ...rest } = current
            record = rest as Record
          }
          // The launcher pairs this with an `ended` event, which stamps the same instant.
          // A log with only this half must still read as over to the liveness checks.
          if (event.to === 'ended' && current.endedAt === null)
            record = { ...current, endedAt: event.ts }
          return
        case 'output':
          record = { ...current, logPath: event.logPath }
          return
        case 'outcome':
          // The outcome may arrive after `ended` (it describes how the session ended), but only once.
          if (outcome !== null) return skip('repeated_outcome')
          outcome = event.outcome
          record = { ...current, exitCode: event.exitCode }
          return
        case 'pr_linked':
          record = { ...current, prNumber: event.prNumber }
          return
        case 'named':
          if (event.source === 'person') personName = event.name
          else harnessName = event.name
          return
        case 'ended':
          if (endedSeen) return skip('after_ended')
          endedSeen = true
          state = 'ended'
          // A `state_changed` to `ended` may already have stamped it. Keep the first instant.
          record = { ...current, endedAt: current.endedAt ?? event.ts }
          return
        case 'resumed':
          // Reopens an ended session for a new run of the same harness session. A live one
          // has nothing to reopen.
          if (state !== 'ended') return skip('illegal_transition')
          state = 'starting'
          endedSeen = false
          outcome = null
          record = { ...current, host: event.host, pid: event.pid, endedAt: null, exitCode: null }
          return
        case 'usage_sample':
          // Tokens and cost are not record fields. A usage ledger keeps its own rows.
          return
      }
    })

    // `record` is typed `null` here: TypeScript does not see the closure assign it.
    const settled = record as Record | null
    const [name, nameSource]: [string | null, SessionNameSource | null] =
      personName !== null
        ? [personName, 'person']
        : launchName !== null
          ? [launchName, 'launch']
          : harnessName !== null
            ? [harnessName, 'harness']
            : [null, null]
    return {
      record:
        settled === null
          ? null
          : { ...settled, name, nameSource, state: state ?? 'starting', outcome },
      state,
      outcome,
      ignored,
    }
  }

  /**
   * Append one event as one line (a single `O_APPEND` write, synced, so a
   * crash leaves the whole line or a torn tail that {@link parseSessionEvents}
   * drops). Keep lines under 4 KiB by convention. `launched` carries a
   * prompt's text and is the one kind that can exceed it. Does not update
   * `record.json`. {@link recordSessionEventIn} does both.
   *
   * @throws A `ZodError` when `event` does not match the event schema.
   */
  function appendSessionEvent(sessionDirectory: string, event: Event): void {
    appendJsonl(sessionEventsPath(sessionDirectory), SessionEventSchema.parse(event))
  }

  /**
   * Events in `text`, in order. A final line with no newline is a torn write
   * and is not an event. A complete line that is not JSON, or not a known
   * event, is skipped, so a kind a later writer adds does not break an older reader.
   */
  function parseSessionEvents(text: string): Event[] {
    const out: Event[] = []
    for (const parsed of parseJsonl(text)) {
      const result = SessionEventSchema.safeParse(parsed)
      if (result.success) out.push(result.data)
    }
    return out
  }

  /** The events in a session directory. `[]` when there is no log. */
  function readSessionEvents(sessionDirectory: string): Event[] {
    const path = sessionEventsPath(sessionDirectory)
    if (!existsSync(path)) return []
    return parseSessionEvents(readFileSync(path, 'utf-8'))
  }

  /** The events appended after byte `offset` of a session's log, with the offset to resume from. */
  function tailSessionEvents(
    sessionDirectory: string,
    offset: number,
  ): { events: Event[]; offset: number } {
    const tail = readJsonlFrom(sessionEventsPath(sessionDirectory), offset)
    const events: Event[] = []
    for (const raw of tail.values) {
      const parsed = SessionEventSchema.safeParse(raw)
      if (parsed.success) events.push(parsed.data)
    }
    return { events, offset: tail.offset }
  }

  /**
   * Append `event` (stamped `ts`) to the session in `dir`, reduce the whole log
   * again and rewrite `record.json` from it, with the log length the projection
   * covers (`logBytes`). The log can grow while this process reduces it (a hook
   * process appending). So the length is checked again after the write and the
   * reduction is repeated. If the log never stops growing, the call throws
   * {@link SessionLogError} and does not leave a projection it cannot trust.
   * Returns `null` when the log has no usable `launched` event yet.
   *
   * @throws {@link SessionLogError} when the log keeps growing, or a `ZodError`
   * when `event` does not match the event schema.
   */
  function recordSessionEventIn(dir: string, event: NewEvent, ts: string): Record | null {
    return recordSessionEventAppliedIn(dir, event, ts)?.record ?? null
  }

  /**
   * {@link recordSessionEventIn}, also reporting whether the reducer applied the
   * appended event. `applied: false` means it was ignored, for example an `ended`
   * that lost a race to another writer's. A caller that mirrors events elsewhere mirrors
   * only the applied ones, so the mirror cannot disagree with the record.
   *
   * @throws As {@link recordSessionEventIn}.
   */
  function recordSessionEventAppliedIn(
    dir: string,
    event: NewEvent,
    ts: string,
  ): { record: Record; applied: boolean } | null {
    const stamped = { ...event, ts } as Event
    appendSessionEvent(dir, stamped)
    // Both sides went through the schema, so equal events serialize alike.
    const appended = JSON.stringify(SessionEventSchema.parse(stamped))
    const logPath = sessionEventsPath(dir)
    for (let attempt = 0; attempt < PROJECTION_ATTEMPTS; attempt++) {
      const bytes = readFileSync(logPath)
      const reduction = reduceSessionEvents(parseSessionEvents(bytes.toString('utf-8')))
      if (reduction.record === null) return null
      const projected: Record = { ...reduction.record, logBytes: bytes.length }
      writeJsonAtomic(join(dir, RECORD_FILE), projected)
      if (statSync(logPath).size === bytes.length) {
        const applied = !reduction.ignored.some((i) => JSON.stringify(i.event) === appended)
        return { record: projected, applied }
      }
    }
    throw new SessionLogError(
      `session log ${logPath} kept growing while it was being projected; record.json was not settled`,
    )
  }

  /**
   * The record in session directory `dir`: `record.json`, unless
   * `events.jsonl` has a different length than the one the projection covers
   * or `record.json` is missing, in which case the log is reduced in memory.
   * A reader never writes. A `record.json` with no `events.jsonl` beside it is
   * returned as it stands. `null` for an absent or malformed record.
   */
  function readSessionRecordIn(dir: string): Record | null {
    const logPath = sessionEventsPath(dir)
    const projection = readJsonOrNull(join(dir, RECORD_FILE))
    const covered =
      typeof projection === 'object' && projection !== null && 'logBytes' in projection
        ? projection.logBytes
        : undefined
    const logStale = existsSync(logPath) && covered !== statSync(logPath).size
    const parsed = logStale
      ? reduceSessionEvents(parseSessionEvents(readFileSync(logPath, 'utf-8'))).record
      : projection
    const result = SessionRecordSchema.safeParse(parsed)
    return result.success ? (result.data as Record) : null
  }

  return {
    SessionAuthorSchema,
    SessionEventSchema,
    SessionRecordSchema,
    reduceSessionEvents,
    appendSessionEvent,
    parseSessionEvents,
    readSessionEvents,
    tailSessionEvents,
    recordSessionEventIn,
    recordSessionEventAppliedIn,
    readSessionRecordIn,
  }
}

/** A model built by {@link defineSessionModel}. */
export type SessionModel<H extends string, Ho extends string, F> = ReturnType<
  typeof defineSessionModel<H, Ho, F>
>

/**
 * The event type of a model: `SessionEventOfModel<typeof model>` for a model
 * from {@link defineSessionModel}. Every kind, with its `ts`.
 */
export type SessionEventOfModel<M> = M extends {
  parseSessionEvents: (text: string) => (infer E)[]
}
  ? E
  : never

/**
 * An event of a model before it is stamped, as `recordSessionEventIn` takes
 * it: every kind, without `ts`.
 */
export type NewSessionEventOfModel<M> = M extends {
  recordSessionEventIn: (dir: string, event: infer N, ts: string) => unknown
}
  ? N
  : never

/** The record type of a model: what its reducer and `readSessionRecordIn` return. */
export type SessionRecordOfModel<M> = M extends {
  readSessionRecordIn: (dir: string) => infer R | null
}
  ? R
  : never

/**
 * The model with no vocabulary of its own: any harness or host string, any
 * launch-flag object. For a reader that must keep reading a log written by a
 * newer or older writer.
 */
export const looseSessionModel = defineSessionModel({
  harness: z.string().min(1),
  host: z.string().min(1),
  launchFlags: z.record(z.string(), z.unknown()),
})
