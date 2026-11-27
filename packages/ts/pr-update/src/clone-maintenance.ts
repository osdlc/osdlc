/**
 * What more than one module needs to know about a managed clone: the marker that says pr-update
 * made it, and its git maintenance, never in the background and run in the foreground after each
 * fetch, while the clone's lock is still held. A leaf module, so `mirror.ts`, which makes the
 * clone, `survey.ts`, which fetches it, and `update/kept.ts`, which asks whether a kept tree's
 * owner is one, share it without importing each other.
 */

import type { Git } from '@osdlc/typed-git'

/** The file inside a clone that says pr-update made it. A clone without one is never used or removed. */
export const CLONE_MARKER = 'pr-update-clone.json'

/**
 * Set in a clone's own config when it is made: no git command run there starts a background
 * `git maintenance` or `gc`, which would write and remove files in it after the command returned,
 * and so without the clone's lock.
 */
export const NO_MAINTENANCE = [
  ['maintenance.auto', 'false'],
  ['gc.auto', '0'],
] as const

/**
 * Run `git maintenance run --auto` in the clone `git` is at, in the foreground, so a clone used
 * every day is still repacked. Called after a fetch, with the clone's lock held. `gc.auto` is
 * given git's default back for this one call, since the clone's own `0` would turn the `gc` task
 * off; the two `autoDetach` settings keep an older git's `gc --auto` from going to the
 * background. A failure is ignored: the fetch it follows has done its work.
 */
export function maintainClone(git: Git): void {
  try {
    // `raw`: its exit is not checked.
    git.raw([
      '-c',
      'gc.auto=6700',
      '-c',
      'gc.autoDetach=false',
      '-c',
      'maintenance.autoDetach=false',
      'maintenance',
      'run',
      '--auto',
      '--quiet',
    ])
  } catch {
    // git could not be started; the next fetch tries again.
  }
}
