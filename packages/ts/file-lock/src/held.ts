/**
 * The held lock: a file whose existence means "taken", whose content names the
 * holder, and which carries a random token so only the claim that wrote it
 * can touch, rewrite or release it.
 *
 *  - Claim: the whole content, token included, is written to a temp file and
 *    hard-linked to the lock path. `link()` fails with `EEXIST` just as
 *    `O_EXCL` does, so one of several racing claimants wins, and the lock
 *    never exists empty or half written.
 *  - Reading a held lock: the path is opened without following a symlink or
 *    blocking, and must be a regular file (see `lock-file.ts`). Anything else
 *    is not a lock this package wrote: a claim throws `NotALockError`, and the
 *    token calls answer false.
 *  - Takeover of a stale lock: the caller's rule judges a held lock. One it
 *    judges stale is hard-linked to a marker named from a hash of its content
 *    (the content can be longer than a file name may be), exclusively, so one
 *    reaper wins. The winner removes the lock only if its content is still
 *    what was judged, removes the marker, and claims again. A loser claims
 *    again too. A reaper killed mid-takeover leaves its marker behind. While
 *    the stale lock is still there, the next claimant removes a marker older
 *    than {@link MARKER_STALE_MS}. A marker left after its lock was removed
 *    matches no later lock, so it blocks nothing; it is litter, safe to delete.
 *  - Release, touch and rewrite act only while the lock still holds this
 *    claim's token, so an owner whose lock was taken over never disturbs the
 *    taker's.
 */

import { createHash, randomUUID } from 'node:crypto'
import { futimesSync, linkSync, renameSync, rmSync, utimesSync } from 'node:fs'

import {
  createLockFile,
  inspectLock,
  type LockFile,
  lstatRegular,
  NotALockError,
  readLock,
} from './lock-file.ts'

/**
 * What a lock file holds: the fields its owner recorded, and the claim's token.
 * The fields are read back from disk unchecked, so a rule should check the
 * types of the ones it reads. `token` is absent in a lock that some other
 * writer created without one.
 */
export type LockContent<F extends object = Record<string, unknown>> = F & { token?: string }

/** A lock as found on disk. */
export interface HeldLock<F extends object = Record<string, unknown>> {
  /** The parsed content, or null when the file is not a JSON object. */
  content: LockContent<F> | null
  /** When the lock was last written or touched. */
  mtimeMs: number
  /** The file's text. A takeover removes the lock only while it still reads exactly this. */
  raw: string
}

/** Judges a held lock: true when its holder is gone and the lock may be taken over. */
export type StaleRule<F extends object = Record<string, unknown>> = (held: HeldLock<F>) => boolean

/** Options for {@link claimLock}. */
export interface ClaimOptions<F extends object = Record<string, unknown>> {
  /** Answers true for a held lock that may be taken over. */
  isStale: StaleRule<F>
  /**
   * Permission bits for the lock file, such as `0o600`. Set exactly: the umask
   * does not apply. The lock keeps them through `updateLock`, a takeover and a
   * release. Default: `0o666` less the umask, as for any new file.
   */
  mode?: number | undefined
}

/**
 * The outcome of {@link claimLock}. `ok: true` carries the token that touches,
 * rewrites and releases the lock. `ok: false` names the live holder, or has
 * `holder: null` when the lock could not be settled: it kept changing, or it
 * is stale and another claimant's takeover is still in progress.
 */
export type LockClaim<F extends object = Record<string, unknown>> =
  { ok: true; token: string } | { ok: false; holder: HeldLock<F> | null }

/**
 * A takeover marker older than this, in milliseconds, belongs to a reaper that
 * died mid-takeover: a live one holds its marker for microseconds. It is judged
 * by the inode's ctime. The marker is a hard link of the lock, so its mtime is
 * the lock's, but linking and unlinking both set the ctime.
 */
export const MARKER_STALE_MS = 10_000

/** Claim attempts before giving up: enough for a few reapers racing over one stale lock. */
const CLAIM_ATTEMPTS = 6

function parse<F extends object>(raw: string): LockContent<F> | null {
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const token = (value as { token?: unknown }).token
    if (token !== undefined && typeof token !== 'string') return null
    return value as LockContent<F>
  } catch {
    // Not JSON: the rule sees null.
    return null
  }
}

function tokenOf(path: string): string | undefined {
  return parse(readLock(path).raw)?.token
}

/** The lock's text and its mtime, both from one open of the file, so they describe the same inode. */
function readHeld<F extends object>(path: string): HeldLock<F> {
  const { raw, mtimeMs } = readLock(path)
  return { content: parse<F>(raw), mtimeMs, raw }
}

function serialize(content: object, token: string): string {
  return `${JSON.stringify({ ...content, token }, null, 2)}\n`
}

/** The takeover marker's name for a lock whose text is `raw`. Internal: exported for the tests. */
export function markerFor(path: string, raw: string): string {
  return `${path}.stale-${createHash('sha256').update(raw).digest('hex').slice(0, 24)}`
}

/**
 * Claim the lock at `path`, recording `content` in it as JSON with a fresh
 * token added (a `token` field in `content` is replaced). A held lock that
 * `isStale` answers true for is taken over, and one of several takers wins;
 * one it answers false for is live, and the result names it. The directory
 * must exist.
 *
 * Something other than a regular file at `path` (a symlink, a directory, a
 * FIFO) throws `NotALockError`: it is never read, and `isStale` never sees it.
 * So does one at the takeover marker's name, which would otherwise block every
 * takeover of a stale lock. Any other error but "already held" is thrown too.
 */
export function claimLock<F extends object>(
  path: string,
  content: F,
  options: ClaimOptions<F>,
): LockClaim<F> {
  const claim = prepareClaim(path, content, options)
  try {
    return claim.attempt()
  } finally {
    claim.dispose()
  }
}

/**
 * A claim whose temp file is written once and attempted as often as needed, so
 * `withLock` creates no new file on each retry. Internal: not exported from
 * the package entry.
 */
export interface PreparedClaim<F extends object> {
  attempt(): LockClaim<F>
  /** Remove the temp file. */
  dispose(): void
}

export function prepareClaim<F extends object>(
  path: string,
  content: F,
  { isStale, mode }: ClaimOptions<F>,
): PreparedClaim<F> {
  const token = randomUUID()
  const tmp = `${path}.new-${token}`
  createLockFile(tmp, serialize(content, token), mode)
  return {
    attempt: () => {
      for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
        try {
          linkSync(tmp, path)
          return { ok: true, token }
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
        }
        let held: HeldLock<F>
        try {
          held = readHeld<F>(path)
        } catch (err) {
          if (isGone(err) || isDeletePending(err)) continue // released between the link and the read: claim again
          throw err // not a lock file, or unreadable
        }
        if (!isStale(held)) return { ok: false, holder: held }
        takeOver(path, held)
      }
      // Every holder seen was stale and mid-takeover, or the lock kept changing: no live holder to name.
      return { ok: false, holder: null }
    },
    dispose: () => rmSync(tmp, { force: true }),
  }
}

/** Remove the stale lock so one of several takers can claim a new one. A loser just claims again. */
function takeOver(path: string, seen: HeldLock<object>): void {
  try {
    if (readLock(path).raw !== seen.raw) return // replaced since it was judged
  } catch {
    return // gone, or replaced by something that is not a lock: the next attempt reports it
  }
  const marker = markerFor(path, seen.raw)
  try {
    linkSync(path, marker)
  } catch (err) {
    // Another reaper holds the marker, or one died holding it. A marker that
    // old is cleared, and the caller's next attempt takes over.
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') clearDeadMarker(marker)
    return
  }
  try {
    // Still the very lock that was judged: the same bytes, and not touched since.
    const now = readLock(path)
    if (readLock(marker).raw === seen.raw && now.raw === seen.raw && now.mtimeMs === seen.mtimeMs) {
      rmSync(path, { force: true })
    }
  } catch {
    // Gone or replaced meanwhile: the next attempt sorts it out.
  } finally {
    rmSync(marker, { force: true })
  }
}

/**
 * Remove a marker left by a reaper that died. A non-file at the marker's name
 * would block every takeover of this lock for good, so it is reported as a
 * `NotALockError` rather than retried.
 */
function clearDeadMarker(marker: string): void {
  try {
    // lstat: the marker's own ctime, never a symlink target's.
    if (Date.now() - lstatRegular(marker).ctimeMs >= MARKER_STALE_MS) {
      rmSync(marker, { force: true })
    }
  } catch (err) {
    if (err instanceof NotALockError) throw err
    // Gone meanwhile.
  }
}

/** True for "the file is not there": the one error the token calls report as `false` rather than throw. */
function isGone(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === 'ENOENT'
}

/** On Windows, a lock being deleted by a release cannot be opened (`EPERM`) until the delete completes. */
function isDeletePending(err: unknown): boolean {
  return process.platform === 'win32' && (err as NodeJS.ErrnoException).code === 'EPERM'
}

/** True for an error that means "this is not your lock": gone, or not a lock file at all. */
function isNotOurs(err: unknown): boolean {
  return isGone(err) || err instanceof NotALockError
}

/**
 * Refresh the lock's mtime while it still holds `token`: the holder's sign of
 * life, for a rule such as `untouchedFor`. The time is set through the
 * descriptor the token was read from, so it lands on the file that was
 * checked. Returns false when the lock is gone, holds another token, or is not
 * a lock file. Any other error (`EACCES`, `EIO`) is thrown.
 */
export function touchLock(path: string, token: string): boolean {
  try {
    return inspectLock(path, (file, fd) => {
      if (parse(file.raw)?.token !== token) return false
      const now = new Date()
      // A read-only handle cannot set times on Windows, which has no
      // O_NOFOLLOW to protect anyway; elsewhere, touch the inode that was read.
      if (process.platform === 'win32') utimesSync(path, now, now)
      else futimesSync(fd, now, now)
      return true
    })
  } catch (err) {
    if (isNotOurs(err)) return false // the owner is finishing, or its lock was taken over
    throw err
  }
}

/**
 * Replace the content of the lock while it still holds `token`. `update` gets
 * the current content and returns the new fields; the token is kept. The new
 * content is written to a temp file with the lock's current mode and renamed
 * over the lock, so a reader never sees it half written and the mode is kept.
 * Returns false when the lock is gone, holds another token, or is not a lock
 * file, and leaves it as it was. An error thrown by `update`, or any other
 * error (`ENOSPC`, `EACCES`), is thrown.
 *
 * The token check and the rename are two steps: a takeover that lands between
 * them is overwritten. A rule that never judges a live holder stale, such as
 * `holderGone`, closes that window.
 */
export function updateLock<F extends object>(
  path: string,
  token: string,
  update: (content: LockContent<F>) => F,
): boolean {
  let file: LockFile
  try {
    file = readLock(path)
  } catch (err) {
    if (isNotOurs(err)) return false // released or taken over
    throw err
  }
  const content = parse<F>(file.raw)
  if (content === null || content.token !== token) return false
  const next = serialize(update(content), token)
  const tmp = `${path}.new-${randomUUID()}`
  try {
    createLockFile(tmp, next, file.mode)
    renameSync(tmp, path)
    return true
  } catch (err) {
    rmSync(tmp, { force: true })
    if (isGone(err)) return false // the directory went away meanwhile
    throw err
  }
}

/**
 * Remove the lock only while it holds `token`: an owner whose lock was taken
 * over must not delete the taker's. Returns whether it removed it: false when
 * the lock is gone, holds another token, or is not a lock file. Any other
 * error is thrown.
 *
 * The lock is renamed aside, which is atomic, and its token checked there, so
 * the file removed is exactly the file checked. The cheap check first means a
 * lock that is plainly someone else's is never moved. If it was taken over in
 * the instant between that check and the rename, it is linked back, unless a
 * new claim also landed in that instant.
 */
export function releaseLock(path: string, token: string): boolean {
  const aside = `${path}.release-${randomUUID()}`
  try {
    if (tokenOf(path) !== token) return false
    renameSync(path, aside)
  } catch (err) {
    if (isNotOurs(err)) return false // already released, or taken over and released
    throw err
  }
  try {
    if (asideIsOurs(aside, token)) return true
    linkSync(aside, path) // not ours: put the taker's lock back
    return false
  } catch (err) {
    // EEXIST: a new claim landed while the lock was aside, and that claimant holds it now.
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw err
  } finally {
    rmSync(aside, { force: true })
  }
}

/** Whether the file renamed aside holds `token`. Something that is not a lock file holds no token. */
function asideIsOurs(aside: string, token: string): boolean {
  try {
    return tokenOf(aside) === token
  } catch (err) {
    if (err instanceof NotALockError) return false
    throw err
  }
}
