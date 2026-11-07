/**
 * The held lock: a file whose existence means "taken", whose content names the
 * holder, and which carries a random token so only the claim that wrote it
 * can touch, rewrite or release it.
 *
 *  - Claim: the whole content, token included, is written to a temp file and
 *    hard-linked to the lock path. `link()` fails with `EEXIST` just as
 *    `O_EXCL` does, so one of several racing claimants wins, and the lock
 *    never exists empty or half written.
 *  - Takeover of a stale lock: the caller's rule judges a held lock. One it
 *    judges stale is hard-linked to a marker named from a hash of its content
 *    (the content can be longer than a file name may be), exclusively, so one
 *    reaper wins. The winner removes the lock only if its content is still
 *    what was judged, removes the marker, and claims again. A loser claims
 *    again too. A reaper killed mid-takeover leaves its marker behind; a
 *    marker older than {@link MARKER_STALE_MS} is a dead reaper's and is
 *    removed.
 *  - Release, touch and rewrite act only while the lock still holds this
 *    claim's token, so an owner whose lock was taken over never disturbs the
 *    taker's.
 */

import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  fstatSync,
  linkSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'

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
  return parse(readFileSync(path, 'utf-8'))?.token
}

/** The lock's text and its mtime, both from one open of the file, so they describe the same inode. */
function readHeld<F extends object>(path: string): HeldLock<F> {
  const fd = openSync(path, 'r')
  try {
    const mtimeMs = fstatSync(fd).mtimeMs
    const raw = readFileSync(fd, 'utf-8')
    return { content: parse<F>(raw), mtimeMs, raw }
  } finally {
    closeSync(fd)
  }
}

function serialize(content: object, token: string): string {
  return `${JSON.stringify({ ...content, token }, null, 2)}\n`
}

function markerFor(path: string, raw: string): string {
  return `${path}.stale-${createHash('sha256').update(raw).digest('hex').slice(0, 24)}`
}

/**
 * Claim the lock at `path`, recording `content` in it as JSON with a fresh
 * token added (a `token` field in `content` is replaced). A held lock that
 * `isStale` answers true for is taken over, and one of several takers wins;
 * one it answers false for is live, and the result names it. The directory
 * must exist. Errors other than "already held" are thrown.
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
  { isStale }: ClaimOptions<F>,
): PreparedClaim<F> {
  const token = randomUUID()
  const tmp = `${path}.new-${token}`
  writeFileSync(tmp, serialize(content, token))
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
        } catch {
          continue // released between the link and the read: claim again
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
    if (readFileSync(path, 'utf-8') !== seen.raw) return // replaced since it was judged
  } catch {
    return
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
    const now = readHeld(path)
    if (
      readFileSync(marker, 'utf-8') === seen.raw &&
      now.raw === seen.raw &&
      now.mtimeMs === seen.mtimeMs
    ) {
      rmSync(path, { force: true })
    }
  } catch {
    // Gone meanwhile: the next attempt sorts it out.
  } finally {
    rmSync(marker, { force: true })
  }
}

function clearDeadMarker(marker: string): void {
  try {
    if (Date.now() - statSync(marker).ctimeMs >= MARKER_STALE_MS) rmSync(marker, { force: true })
  } catch {
    // Gone meanwhile.
  }
}

/**
 * Refresh the lock's mtime while it still holds `token`: the holder's sign of
 * life, for a rule such as `untouchedFor`. Returns whether it touched.
 */
export function touchLock(path: string, token: string): boolean {
  try {
    if (tokenOf(path) !== token) return false
    const now = new Date()
    utimesSync(path, now, now)
    return true
  } catch {
    return false // gone: the owner is finishing, or its lock was taken over
  }
}

/**
 * Replace the content of the lock while it still holds `token`. `update` gets
 * the current content and returns the new fields; the token is kept. The new
 * content is written to a temp file and renamed over the lock, so a reader
 * never sees it half written. Returns whether it rewrote. An error thrown by
 * `update` is thrown to the caller.
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
  let content: LockContent<F> | null
  try {
    content = parse<F>(readFileSync(path, 'utf-8'))
  } catch {
    return false // gone: the lock was released or taken over
  }
  if (content === null || content.token !== token) return false
  const next = serialize(update(content), token) // outside any catch, so the caller sees its own error
  const tmp = `${path}.new-${randomUUID()}`
  try {
    writeFileSync(tmp, next)
    renameSync(tmp, path)
    return true
  } catch {
    rmSync(tmp, { force: true })
    return false // the directory went away meanwhile: the lock stays as it was
  }
}

/**
 * Remove the lock only while it holds `token`: an owner whose lock was taken
 * over must not delete the taker's. Returns whether it removed it.
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
  } catch {
    return false // already gone
  }
  try {
    if (tokenOf(aside) === token) return true
    linkSync(aside, path)
  } catch {
    // Unreadable, or a new claim landed while the lock was aside: that claimant holds it now.
  } finally {
    rmSync(aside, { force: true })
  }
  return false
}
