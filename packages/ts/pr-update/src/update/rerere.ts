/**
 * A managed clone's rerere cache, owned by one run at a time.
 *
 * A run that wants rerere in a clone takes the clone's rerere lock, `pr-update-rerere.lock` in
 * the clone's git directory, without waiting. Holding it, the run empties `rr-cache/` first, and
 * keeps the lock until its last integration in the clone is done; then it empties `rr-cache/`
 * again and lets go. So every resolution git replays was recorded by this run, while it held the
 * lock. A run that cannot get the lock (another live run holds it) works without rerere. A lock
 * whose holder was killed is taken over by file-lock's dead-holder rule (`./process-lock.ts`), and
 * the new holder empties the cache before anything else, so a killed run's resolutions are never
 * replayed.
 *
 * Emptying fails closed: when the clone's git directory cannot be found, or `rr-cache/` cannot be
 * removed, the run uses no rerere from then on.
 */

import { rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { releaseLock } from '@osdlc/file-lock'
import type { Git } from '@osdlc/typed-git'

import { claimProcessLock } from '../process-lock.ts'

/** The rerere lock's name, in the clone's git directory. */
export const RERERE_LOCK = 'pr-update-rerere.lock'

/** How the cache is removed. Default `rmSync`; a test makes it fail. */
export type RemoveDir = (path: string) => void

const removeDir: RemoveDir = (path) => rmSync(path, { recursive: true, force: true })

/** The git directory `git`'s repository keeps `rr-cache/` in, or null when it cannot be found. */
function commonDir(git: Git): string | null {
  const found = git.try.gitCommonDir()
  if (!found.ok || found.value === null) return null
  return resolve(git.cwd, found.value)
}

/**
 * Empty the `rr-cache/` of `git`'s repository, every resolution in it. True when it is gone
 * (or was never there); false when the git directory cannot be found or the removal fails.
 */
export function clearRerere(git: Git, remove: RemoveDir = removeDir): boolean {
  const common = commonDir(git)
  if (common === null) return false
  try {
    remove(join(common, 'rr-cache'))
    return true
  } catch {
    return false
  }
}

/** One run's hold on a clone's rerere cache. */
export interface RerereCache {
  /** Whether rerere may be used now: false once an emptying has failed. */
  readonly on: boolean
  /**
   * Empty the cache, as after a PR that was not pushed. A failure turns rerere off for the rest
   * of the run.
   */
  clear(): void
  /** Empty the cache a last time and let go of the lock. */
  release(): void
}

/**
 * Take the rerere cache of the clone `git` serves, for this run: the lock, then an empty cache.
 * Null, with no lock held, when another live run holds the lock, when the lock cannot be taken
 * or read, or when the cache cannot be emptied.
 */
export function takeRerere(git: Git, remove: RemoveDir = removeDir): RerereCache | null {
  const common = commonDir(git)
  if (common === null) return null
  const lock = join(common, RERERE_LOCK)
  let token: string | null
  try {
    token = claimProcessLock(lock, 0)
  } catch {
    return null
  }
  if (token === null) return null
  const held = token
  if (!clearRerere(git, remove)) {
    releaseLock(lock, held)
    return null
  }
  let on = true
  return {
    get on() {
      return on
    },
    clear() {
      if (!clearRerere(git, remove)) on = false
    },
    release() {
      clearRerere(git, remove)
      on = false
      releaseLock(lock, held)
    },
  }
}
