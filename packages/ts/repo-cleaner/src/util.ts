/** Small helpers every module of the package shares. */

import { statSync } from 'node:fs'

import { failureOf } from '@osdlc/cli-tool'
import { CommandFailed } from '@osdlc/typed-git'

/** True when `path` is a directory; false for anything else, or when it cannot be read. */
export function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/**
 * An error as one line for a person: a failed git call's own output, or the
 * message. Takes a thrown error or a `try` door's failure, which is a
 * `Failure` rather than an `Error`.
 */
export function errorText(err: unknown): string {
  if (err instanceof CommandFailed) return err.detail.trim() || err.message
  if (err instanceof Error) return err.message
  const failure = failureOf(err)
  if (failure !== null) return failure.detail?.trim() || failure.message
  return String(err)
}

/** `1 commit`, `3 commits`. */
export const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`
