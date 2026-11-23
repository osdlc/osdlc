/** The one real-path helper the update, kept-tree, prune and preflight code share. */

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
