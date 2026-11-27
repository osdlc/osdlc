/**
 * The real-path helper for comparing paths that may not exist, shared by the update, kept-tree,
 * prune and preflight code. Code that must tell a path that cannot be resolved apart (a kept
 * folder that must resolve to its place, a git directory that must exist) calls
 * `realpathSync.native` itself and handles the failure; `registrations.ts` resolves the part of a
 * path that exists.
 */

import { realpathSync } from 'node:fs'

/**
 * `path` through its symlinks and any Windows short name (`RUNNER~1`), or `path` as given when it
 * cannot be resolved, as when it does not exist. Two paths compared through it are equal when they
 * name the same existing file, and otherwise only when they are spelled the same.
 */
export function realOr(path: string): string {
  try {
    return realpathSync.native(path)
  } catch {
    return path
  }
}
