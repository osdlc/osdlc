/** Small helpers every module of the package shares. */

import { statSync } from 'node:fs'

import { CommandFailed } from '@osdlc/typed-git'

/** True when `path` is a directory; false for anything else, or when it cannot be read. */
export function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** An error as one line for a person: a failed git call's own output, or the message. */
export function errorText(err: unknown): string {
  if (err instanceof CommandFailed) return err.detail.trim() || err.message
  return err instanceof Error ? err.message : String(err)
}

/** `1 commit`, `3 commits`. */
export const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`
