import type { z } from 'zod'

import type { changeSchema } from './report/schema.ts'

/** A file's content as read, or why it was not. */
export type FileContent =
  | { kind: 'text'; text: string }
  | { kind: 'binary'; bytes: number }
  | { kind: 'too-large'; bytes: number }
  | { kind: 'missing' }

export const UNREAD_KINDS = ['binary', 'too-large', 'missing'] as const

/** What `.gitattributes` says about a file through GitHub linguist's attributes. */
export interface LinguistAttributes {
  generated?: boolean
  vendored?: boolean
  documentation?: boolean
}

/**
 * The four kinds of {@link ChangeSpec}: `pr`, `range`, `merge-base` and `worktree`.
 *
 * @experimental
 */
export const CHANGE_KINDS = ['pr', 'range', 'merge-base', 'worktree'] as const

/**
 * How a person names a change:
 *
 * - `pr`: a pull request, from the merge-base of its base and head to its head.
 * - `range` (`a..b`): exactly `a` to `b`, so commits the base gained since show as reversals.
 * - `merge-base` (`a...b`, or a lone ref meaning `ref...HEAD`): what `b` added since it left `a`.
 * - `worktree`: HEAD to the working tree, untracked files included; with `base`, the merge base of
 *   `base` and HEAD instead, so a branch's commits and its uncommitted edits read as one change.
 */
export type ChangeSpec =
  | { kind: 'pr'; number: number }
  | { kind: 'range'; base: string; head: string }
  | { kind: 'merge-base'; base: string; head: string }
  | { kind: 'worktree'; base?: string }

/** A change resolved to commits. */
export type Change = z.infer<typeof changeSchema>
