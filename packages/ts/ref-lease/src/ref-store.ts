/**
 * `refStore`: a keyed store of JSON records on refs, one ref per key under a prefix.
 *
 * Built from the five operations and the helpers: names come from `refKey`, writes from
 * `updateWithRetry`, deletes from `release`. The store never reads a payload (D-04): `decode`
 * turns the parsed JSON into the caller's type, and `change` and `isStale` are the caller's rules.
 * Everything under `prefix` is the store's, so it must not share a prefix with other refs.
 */

import { PayloadUnreadable, RefNotFound } from './errors.ts'
import { client, type GitOptions } from './git.ts'
import { DEFAULT_PAYLOAD_FILE, fetchNamespace, fetchRef } from './primitives.ts'
import { refKey } from './ref-key.ts'
import { release, updateWithRetry, type UpdateOutcome } from './recipes.ts'

export interface RefStoreOptions<T> extends GitOptions {
  /** The git remote (name or URL) that holds the refs. */
  remote: string
  /** The namespace the store owns, such as `refs/my-tool/records/`. */
  prefix: string
  /** Turns the parsed payload into `T`; see `fetchRef`. */
  decode: (value: unknown) => T
  /** Passes through to `updateWithRetry`. Default 5. */
  attempts?: number
  backoffMs?: (attempt: number) => number
  /** The readable part of a key's ref name. Default: the key. The ref is still unique per key. */
  label?: (key: string) => string
}

/** One record, as the store last saw it. */
export interface StoredRef<T> {
  ref: string
  sha: string
  payload: T
}

export interface RefStore<T> {
  /** Fetch every ref under the prefix once. Later calls return the same view, kept in sync by this store's own writes. */
  load: () => ReadonlyMap<string, StoredRef<T>>
  /** The record for `key`, from the loaded view; `null` when absent. */
  get: (key: string) => T | null
  /** Every loaded record. */
  entries: () => StoredRef<T>[]
  /**
   * Read-modify-write the record for `key`; see `updateWithRetry`. `current` is the record as it
   * is at the remote now, not as loaded. Returning `null` deletes it.
   */
  update: (key: string, change: (current: T | null) => T | null) => UpdateOutcome<T>
  /**
   * Delete each loaded record that `isStale` says is stale, after reading it again: a record that
   * was refreshed since it was loaded is kept, and one that changes between that read and the
   * delete is kept too (the delete is pinned to the sha read). Returns how many were deleted.
   */
  prune: (isStale: (payload: T) => boolean) => number
}

export function refStore<T>(opts: RefStoreOptions<T>): RefStore<T> {
  const { remote, decode } = opts
  const prefix = opts.prefix
  const git: GitOptions = {
    ...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
    ...(opts.env === undefined ? {} : { env: opts.env }),
  }
  const retry = {
    ...git,
    decode,
    ...(opts.attempts === undefined ? {} : { attempts: opts.attempts }),
    ...(opts.backoffMs === undefined ? {} : { backoffMs: opts.backoffMs }),
  }
  const refOf = (key: string): string =>
    refKey(prefix, key, opts.label === undefined ? key : opts.label(key))
  let cache: Map<string, StoredRef<T>> | null = null

  const load = (): Map<string, StoredRef<T>> => {
    if (cache !== null) return cache
    const loaded = new Map<string, StoredRef<T>>()
    const repo = client(git)
    for (const [ref, sha] of Object.entries(fetchNamespace(remote, prefix, git))) {
      const shown = repo.try.showAtRev(sha, DEFAULT_PAYLOAD_FILE)
      if (!shown.ok || shown.value === null) continue
      let parsed: unknown
      try {
        parsed = JSON.parse(shown.value)
      } catch {
        continue // not a record of this store
      }
      loaded.set(ref, { ref, sha, payload: decode(parsed) })
    }
    cache = loaded
    return loaded
  }

  return {
    load,
    get: (key) => load().get(refOf(key))?.payload ?? null,
    entries: () => [...load().values()],
    update(key, change) {
      const view = load()
      const ref = refOf(key)
      const out = updateWithRetry<T>(remote, ref, (cur) => change(cur?.payload ?? null), retry)
      if (out.kind === 'written') view.set(ref, { ref, sha: out.sha, payload: out.payload })
      else view.delete(ref)
      return out
    },
    prune(isStale) {
      const view = load()
      let deleted = 0
      for (const loaded of [...view.values()]) {
        for (let pass = 1; pass <= (opts.attempts ?? 5); pass++) {
          let now
          try {
            now = fetchRef<T>(remote, loaded.ref, { ...git, decode })
          } catch (e) {
            if (e instanceof RefNotFound || e instanceof PayloadUnreadable) {
              view.delete(loaded.ref)
              break
            }
            throw e
          }
          if (!isStale(now.payload)) {
            view.set(loaded.ref, { ref: loaded.ref, sha: now.sha, payload: now.payload })
            break
          }
          if (release(remote, loaded.ref, now.sha, git)) {
            view.delete(loaded.ref)
            deleted += 1
            break
          }
          // Lost the swap: read again.
        }
      }
      return deleted
    },
  }
}
