/**
 * How a launched agent process is tagged: the environment a launcher sets on
 * every launch and resume, read back by the process scan (`./process-scan.ts`)
 * and by the agent's own tools.
 *
 * Every tag is set under its `OBSERVE_*` name and, for readers older than
 * 0.3.3, under its `SDLC_*` name too. Readers use the `SDLC_*` value when it is
 * set and differs, else the `OBSERVE_*` value (see `readTag` in `./envelope.ts`).
 */

import {
  INVOCATION_ENV_VAR,
  INVOCATION_PID_ENV_VAR,
  readTag,
  RUN_ENV_VAR,
  SESSION_ENV_VAR,
  SUBJECT_ENV_VAR,
  withLegacyNames,
} from './envelope.ts'
import { MACHINE_ENV_VAR, machineId } from './machine.ts'

/**
 * The shape `crypto.randomUUID()` produces, the only shape a session id has.
 * Check an id with it before using it as a directory name.
 */
export const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The project root a session was launched from. An installed hook has a fixed
 * command that cannot carry it, so a hook reporter reads it from here. Writers
 * also set `SDLC_PROJECT_ROOT`; readers accept either.
 */
export const PROJECT_ROOT_ENV_VAR = 'OBSERVE_PROJECT_ROOT'
/**
 * Names the task the session works on. Empty when there is none. Writers also set
 * `SDLC_TASK`; readers accept either.
 */
export const TASK_ENV_VAR = 'OBSERVE_TASK'
/**
 * The exact command the agent should run its tool as. Unset when the session
 * has no pin. Writers also set `SDLC_PINNED_CMD`; readers accept either.
 */
export const PINNED_CMD_ENV_VAR = 'OBSERVE_PINNED_CMD'
/**
 * Who runs the session's work, as the launcher's text for it (for example a
 * `harness/model@effort` reference). Empty when unknown. This package carries
 * the text and does not parse it. Writers also set `SDLC_AUTHOR`; readers
 * accept either.
 */
export const AUTHOR_ENV_VAR = 'OBSERVE_AUTHOR'

/** Environment to set on a child: a value sets the variable, `undefined` unsets it. */
export type SessionEnv = Record<string, string | undefined>

/**
 * Env tags for a session's agent process, applied on every launch and resume.
 * Each tag is set under its `OBSERVE_*` name and its legacy `SDLC_*` name, and
 * always overridden so a parent session's value does not leak through:
 *
 * - `OBSERVE_SESSION` is the session's `id`.
 * - `OBSERVE_TASK` is the given task or empty.
 * - `OBSERVE_RUN` is empty when the session has no run.
 * - `OBSERVE_SUBJECT` is the given subject, else the task, else empty.
 * - `OBSERVE_INVOCATION` and its pid are empty. The agent's own tool calls set
 *   their own, and the launching op's values must not look like theirs.
 * - `OBSERVE_AUTHOR` is the given author text or empty.
 * - `OBSERVE_PINNED_CMD` is the given `pin`, unset when there is none.
 * - `OBSERVE_PROJECT_ROOT` is the given project root, unset when there is none.
 * - `OBSERVE_MACHINE_ID` carries `machine`, so the session's hook processes do
 *   not probe the platform per tool call. Without `machine` it calls
 *   `machineId()`, with that function's side effects.
 *
 * A launcher reads the parent's session and invocation from its own environment
 * before these overwrite them for the child.
 */
export function sessionEnv(session: {
  id: string
  /** The pinned command the agent should run its tool as. */
  pin?: string | undefined
  /** The task the session works on, when the caller knows one. */
  task?: string | null | undefined
  /** The project root of the launch. When the caller does not know it, leave it unset and the tag stays unset. */
  projectRoot?: string | undefined
  /** The run the session belongs to. */
  run?: string | null | undefined
  /** What the run is about; defaults to the task. */
  subject?: string | null | undefined
  /** Who runs the work, as the launcher's text. */
  author?: string | null | undefined
  /** This machine's id; defaults to `machineId()`. */
  machine?: string | undefined
}): SessionEnv {
  const task = session.task ?? ''
  return withLegacyNames({
    [SESSION_ENV_VAR]: session.id,
    [PROJECT_ROOT_ENV_VAR]: session.projectRoot,
    [TASK_ENV_VAR]: task,
    [RUN_ENV_VAR]: session.run ?? '',
    [SUBJECT_ENV_VAR]: session.subject ?? task,
    [INVOCATION_ENV_VAR]: '',
    [INVOCATION_PID_ENV_VAR]: '',
    [AUTHOR_ENV_VAR]: session.author ?? '',
    [PINNED_CMD_ENV_VAR]: session.pin,
    [MACHINE_ENV_VAR]: session.machine ?? machineId(),
  })
}

/**
 * The author text in `env` (default `process.env`), read from
 * {@link AUTHOR_ENV_VAR} or `SDLC_AUTHOR` (the `SDLC_*` value wins when it
 * differs). `undefined` when unset or empty.
 */
export function authorFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return readTag(env, AUTHOR_ENV_VAR) || undefined
}
