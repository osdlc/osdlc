/**
 * Small helpers the core and the plugins share: reading what a program
 * printed, wording, objections, and the check a plugin makes again right
 * before it deletes a candidate.
 */

import { realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { setTimeout as sleep } from 'node:timers/promises'

import { failureText, type CommandResult } from '@osdlc/command-seam'

import type { Candidate, Ctx, Objection, PathCandidate } from './types.ts'

/** Whether `v`, read from JSON, is an object and not a list. */
export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** `v` when it is a string, else `''`. */
export const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** `v` when it is a finite number, else 0. */
export const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** `path`'s real path as the filesystem spells it, or `path` as given when it does not resolve. */
export const realOr = (path: string): string => {
  try {
    return realpathSync.native(path)
  } catch {
    return path
  }
}

/** What was thrown, as a sentence. */
export const errorText = (err: unknown): string =>
  err instanceof Error ? err.message : String(err)

/** Why a program that did not exit 0 failed: what it printed, why it never ran, or its exit status. */
export const failureReason = (r: CommandResult): string =>
  failureText(r) || r.error || `exit ${r.exitCode}`

/** `hours` for a sentence, in tenths rounded down, so it never says more than was measured. */
export const hoursText = (hours: number): string => String(Math.floor(hours * 10) / 10)

/** Builds the objections of the plugin `by`. */
export const objector =
  (by: string) =>
  (
    c: Pick<Candidate, 'id'>,
    level: Objection['level'],
    code: string,
    reason: string,
  ): Objection => ({ by, candidate: c.id, level, code, reason })

/** Whether `c` is a git plugin's worktree row. */
export const isGitWorktree = (c: Candidate): c is PathCandidate =>
  c.kind === 'worktree' && c.owner === 'git' && c.path !== undefined

/** A candidate and what a refusal of it rests on. */
export interface Row {
  candidate: Candidate
  /** Each becomes a `refuse` objection by the owner. */
  blockers: Array<{ code: string; reason: string }>
}

export const objectionsTo = (owner: string, row: Row): Objection[] =>
  row.blockers.map((b) => objector(owner)(row.candidate, 'refuse', b.code, b.reason))

/**
 * Throws unless `c` may still be deleted as the plan ran it, judged by `now`,
 * the row its owner finds for it when it looks again right before the delete:
 * still proposed and refused by nothing, and, when the plan had it measured
 * and idle, so now. A held or unmeasured `c` ran because a person picked or
 * allowed it, so it may still be so.
 */
export function checkAgain(c: Candidate, now: Row | undefined): asserts now is Row {
  const what = c.path ?? c.ref
  if (now === undefined) throw new Error(`${what} is no longer a candidate`)
  if (now.blockers.length > 0) {
    throw new Error(`${what} is refused: ${now.blockers.map((b) => b.reason).join(', ')}`)
  }
  if (now.candidate.unmeasured === true && c.unmeasured !== true) {
    throw new Error(`${what} could not be measured idle in the time budget now`)
  }
  if (now.candidate.held === true && c.held !== true) throw new Error(`${what} is no longer idle`)
}

/** The home folder `HOME` names, or the process's, without a trailing slash, as `~` expands. */
export const homeFrom = (home: string | undefined): string =>
  (home ?? homedir()).replace(/(.)\/+$/, '$1')

/** The time limit of a `discover` that walks or asks about many folders, for a plugin's `limits`. */
export const DISCOVER_LIMIT_MS = 10 * 60_000

/**
 * For a hook that works synchronously for long: between two pieces of work,
 * lets the hook's time limit fire when it has passed, and then throws.
 */
export async function yieldToLimit({ signal }: Pick<Ctx, 'signal'>): Promise<void> {
  // A timer rather than `setImmediate`: timers run in order, so a limit already past goes first.
  await sleep(0)
  signal.throwIfAborted()
}
